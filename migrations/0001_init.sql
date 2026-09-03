-- صدى · الترحيل ٠٠٠١ — الجداول الأساسية
-- المرجع: docs/ARCHITECTURE.md §٣ · القرارات D-004 · D-005 · D-006 · D-008
--
-- قاعدة CLAUDE.md: الترحيل قبل الدالّة. لا يقرأ Worker عموداً لم يُضَف هنا.

-- ── الحسابات المربوطة ────────────────────────────────────────────────
CREATE TABLE accounts (
  id            TEXT PRIMARY KEY,
  platform      TEXT NOT NULL CHECK (platform IN ('linkedin', 'x')),
  kind          TEXT NOT NULL CHECK (kind IN ('member', 'org')),
  external_id   TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'needs_reauth', 'revoked')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (platform, kind, external_id)
);

-- ── الرموز — مشفّرة دائماً (D-005) ───────────────────────────────────
-- access_enc و refresh_enc نصّ base64 لناتج AES-GCM. لا يُخزَّن رمز خام.
CREATE TABLE tokens (
  account_id          TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  access_enc          TEXT NOT NULL,
  access_iv           TEXT NOT NULL,
  refresh_enc         TEXT,
  refresh_iv          TEXT,
  expires_at          TEXT NOT NULL,
  refresh_expires_at  TEXT,
  scopes              TEXT NOT NULL,
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((refresh_enc IS NULL) = (refresh_iv IS NULL))
);

CREATE INDEX idx_tokens_expires ON tokens (expires_at);

-- ── المصادر في Drive ─────────────────────────────────────────────────
CREATE TABLE sources (
  id            TEXT PRIMARY KEY,
  drive_file_id TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  mime          TEXT NOT NULL,
  content_hash  TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── ما فهمه Claude من كلّ مصدر ───────────────────────────────────────
CREATE TABLE content_items (
  id           TEXT PRIMARY KEY,
  source_id    TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  summary      TEXT NOT NULL,
  themes_json  TEXT NOT NULL DEFAULT '[]',
  worth_score  REAL NOT NULL DEFAULT 0,
  extracted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_content_items_source ON content_items (source_id);

-- ── الخطّة الأسبوعية ─────────────────────────────────────────────────
CREATE TABLE plans (
  id         TEXT PRIMARY KEY,
  week_start TEXT NOT NULL UNIQUE,
  plan_json  TEXT NOT NULL,
  model      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'approved', 'superseded')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── المنشورات — عقد المنشور في ARCHITECTURE.md §٤ ────────────────────
-- has_url يُحسَب بالشيفرة لا بالنموذج (D-003).
-- idempotency_key يُثبَّت قبل أوّل طلب ولا يتغيّر بعده (D-004).
CREATE TABLE posts (
  id              TEXT PRIMARY KEY,
  plan_id         TEXT REFERENCES plans(id) ON DELETE SET NULL,
  account_id      TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  thread_id       TEXT,
  thread_order    INTEGER,
  type            TEXT NOT NULL
                    CHECK (type IN ('text', 'image', 'document', 'thread')),
  text            TEXT NOT NULL,
  media_json      TEXT NOT NULL DEFAULT '[]',
  source_refs     TEXT NOT NULL DEFAULT '[]',
  rationale       TEXT,
  has_url         INTEGER NOT NULL DEFAULT 0 CHECK (has_url IN (0, 1)),
  scheduled_at    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'approved', 'edited', 'rejected',
                                      'queued', 'published', 'failed')),
  idempotency_key TEXT NOT NULL UNIQUE,
  approved_by     TEXT,
  approved_at     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  -- D-009: لا نشر بلا اعتماد بشريّ في المراحل ٠ إلى ٢
  CHECK (status NOT IN ('queued', 'published') OR approved_at IS NOT NULL),
  CHECK ((thread_id IS NULL) = (thread_order IS NULL))
);

CREATE INDEX idx_posts_due     ON posts (status, scheduled_at);
CREATE INDEX idx_posts_account ON posts (account_id);
CREATE INDEX idx_posts_thread  ON posts (thread_id, thread_order);

-- ── كلّ محاولة نشر، ناجحةً أو فاشلة (D-004) ──────────────────────────
CREATE TABLE publish_attempts (
  id               TEXT PRIMARY KEY,
  post_id          TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  idempotency_key  TEXT NOT NULL,
  attempt_no       INTEGER NOT NULL,
  request_json     TEXT NOT NULL,
  response_json    TEXT,
  platform_post_id TEXT,
  status           TEXT NOT NULL
                     CHECK (status IN ('sent', 'succeeded', 'failed', 'skipped_duplicate')),
  at               TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (post_id, attempt_no)
);

CREATE INDEX idx_attempts_key ON publish_attempts (idempotency_key);

-- ── المقاييس ─────────────────────────────────────────────────────────
CREATE TABLE metrics (
  post_id     TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  window      TEXT NOT NULL CHECK (window IN ('24h', '72h', '7d')),
  impressions INTEGER,
  reactions   INTEGER,
  comments    INTEGER,
  shares      INTEGER,
  clicks      INTEGER,
  pulled_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (post_id, window)
);

-- ── توصيات الترويج — توصية فقط، لا إنفاق آليّ (D-006) ────────────────
CREATE TABLE promotion_suggestions (
  post_id          TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  suggested_budget REAL NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'USD',
  reason           TEXT NOT NULL,
  human_decision   TEXT CHECK (human_decision IN ('accepted', 'rejected', 'ignored')),
  decided_at       TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── سجلّ التكلفة — كلّ طلب مدفوع قبل أن يُعدّ ناجحاً (D-008) ─────────
CREATE TABLE cost_ledger (
  id        TEXT PRIMARY KEY,
  provider  TEXT NOT NULL CHECK (provider IN ('x', 'linkedin', 'anthropic', 'gemini', 'google')),
  operation TEXT NOT NULL,
  units     REAL NOT NULL,
  unit_cost REAL NOT NULL,
  total     REAL NOT NULL,
  currency  TEXT NOT NULL DEFAULT 'USD',
  ref_id    TEXT,
  at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_cost_at       ON cost_ledger (at);
CREATE INDEX idx_cost_provider ON cost_ledger (provider, at);
