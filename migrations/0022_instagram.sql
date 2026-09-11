-- Instagram — **والقيدُ يُوسَّع في ترحيل سائقه** (D-121).
--
-- وهي القاعدةُ المكتوبةُ في 0013 ومطبَّقةٌ في 0019 و0020: «يُترك القيدُ
-- حارسا حتّى يُبنى السائقُ، **ويُوسَّع في ترحيله هو**». وقال 0020 بنصّه
-- إنّ «Instagram تبقى خارجَه حتّى يُبنى سائقُها» — **وقد بُني**، فيُفتَح
-- الحارسُ بقدر ما بُني.
--
-- ## وثلاثةُ جداولَ لا اثنان
--
-- `accounts.platform` و `oauth_apps.platform` للربط، **و`posts.platform`
-- للنشر** — والثلاثةُ تُوسَّع معا لأنّ السائقَ ينشر لا يربط وحدَه.
--
-- ## وطريقان إلى الحساب نفسِه، ومنصّةٌ واحدةٌ في القاعدة
--
-- Instagram تُربَط بوجهين: **بتسجيل دخولٍ مباشرٍ بحساب احترافيّ**
-- (Instagram Business Login)، **أو عبر صفحة فيسبوك** (Facebook Login
-- for Business). والمنصّةُ هنا **واحدةٌ** — `instagram` — لأنّ المنشورَ
-- يقع في المكان نفسِه، **والطريقُ اختلافُ إذنٍ لا اختلافُ وجهة**.
--
-- ولو فُصلا صفّين لانقسم كلُّ تقريرٍ ولوحٍ محوريٍّ على منصّةٍ واحدة.
--
-- ## و SQLite لا يبدّل قيدا
--
-- فيُعاد بناءُ الجدول. **والمخطَّطُ يُنسَخ من الحال لا من ترحيلٍ سابق**:
-- قُرئ `sqlite_master` بعد تطبيق الواحدِ والعشرين، فظهر فيه ما ليس في
-- 0008 ولا 0020 — **`dispatched_at` من 0009، و`verified_at` و
-- `verified_kind` على `oauth_apps`، و`kind` في `accounts` قيمتاه
-- `member` و`org` لا ثلاث، وقيودُ D-009 أربعةٌ لا اثنان، و`scheduled_at`
-- صار يقبل الفراغ**.
--
-- **وأوّلُ صياغةٍ لهذا الملفّ نُسخت من 0020 فأسقطت خمسةً منها**، وسقط
-- الاختبارُ عند أوّل مسوّدةٍ بلا موعد. وهو ما حذّر منه 0020 بنفسه:
-- «بناءٌ جديدٌ ينسى عمودا أُضيف لاحقا يمحوه».
PRAGMA foreign_keys = OFF;

-- ── الحسابات ─────────────────────────────────────────────────────────
CREATE TABLE accounts_new (
  id            TEXT PRIMARY KEY,
  -- خمسٌ تُربَط. **وثلاثٌ منها تنشر اليوم**، والباقيتان تنتظران —
  -- والفرقُ يُقال في الواجهة نصّا، لا يُخفى خلف بطاقةٍ تبدو كاملة
  platform      TEXT NOT NULL
                  CHECK (platform IN ('linkedin', 'x', 'youtube', 'tiktok', 'instagram')),
  kind          TEXT NOT NULL CHECK (kind IN ('member', 'org')),
  external_id   TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'needs_reauth', 'revoked')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (platform, kind, external_id)
);

INSERT INTO accounts_new (id, platform, kind, external_id, display_name, status, created_at)
SELECT id, platform, kind, external_id, display_name, status, created_at FROM accounts;

DROP TABLE accounts;
ALTER TABLE accounts_new RENAME TO accounts;

-- ── أسرارُ التطبيقات ──────────────────────────────────────────────────
-- و`verified_at` و`verified_kind` يُنقَلان: أُضيفا بعد 0013، **وبناءٌ
-- ينساهما يمحو أثرَ كلّ تحقّقٍ وقع**
CREATE TABLE oauth_apps_new (
  platform      TEXT PRIMARY KEY
                  CHECK (platform IN ('linkedin', 'x', 'youtube', 'tiktok', 'instagram')),
  client_id     TEXT NOT NULL,
  secret_enc    TEXT NOT NULL,
  secret_iv     TEXT NOT NULL,
  hint          TEXT NOT NULL,
  fingerprint   TEXT NOT NULL,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by    TEXT,
  verified_at   TEXT,
  verified_kind TEXT
);

INSERT INTO oauth_apps_new
  (platform, client_id, secret_enc, secret_iv, hint, fingerprint,
   updated_at, updated_by, verified_at, verified_kind)
SELECT platform, client_id, secret_enc, secret_iv, hint, fingerprint,
       updated_at, updated_by, verified_at, verified_kind
  FROM oauth_apps;

DROP TABLE oauth_apps;
ALTER TABLE oauth_apps_new RENAME TO oauth_apps;

-- ── المنشورات ────────────────────────────────────────────────────────
CREATE TABLE posts_new (
  id              TEXT PRIMARY KEY,
  plan_id         TEXT REFERENCES plans(id) ON DELETE SET NULL,
  account_id      TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  -- خمسٌ في القيد. **وInstagram توجب وسيطا**: لا منشورَ نصّيٌّ فيها،
  -- وذلك يُحرَس في السائق لا هنا — القاعدةُ تحرس الوجهةَ لا الشكل
  platform        TEXT NOT NULL
                    CHECK (platform IN ('linkedin', 'x', 'tiktok', 'youtube', 'instagram')),
  source_id       TEXT REFERENCES sources(id) ON DELETE SET NULL,
  source_hash     TEXT,
  model           TEXT,
  cost_usd        REAL NOT NULL DEFAULT 0,
  thread_id       TEXT,
  thread_order    INTEGER,
  type            TEXT NOT NULL
                    CHECK (type IN ('text', 'image', 'document', 'thread')),
  text            TEXT NOT NULL,
  media_json      TEXT NOT NULL DEFAULT '[]',
  source_refs     TEXT NOT NULL DEFAULT '[]',
  rationale       TEXT,
  has_url         INTEGER NOT NULL DEFAULT 0 CHECK (has_url IN (0, 1)),
  -- **يقبل الفراغ**: المسوّدةُ تُكتب قبل أن تُجدوَل
  scheduled_at    TEXT,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'approved', 'edited', 'rejected',
                                      'queued', 'published', 'failed')),
  idempotency_key TEXT NOT NULL UNIQUE,
  approved_by     TEXT,
  approved_at     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  -- وعمودُ 0009 يُنقَل معه: بناءٌ جديدٌ ينسى عمودا أُضيف لاحقا يمحوه
  dispatched_at   TEXT,
  -- D-009 وما لزم منه — **الأربعةُ كما هي، لم يُمسّ منها حرف**
  CHECK (status NOT IN ('queued', 'published') OR approved_at IS NOT NULL),
  CHECK (status NOT IN ('queued', 'published') OR account_id IS NOT NULL),
  CHECK (status NOT IN ('queued', 'published') OR scheduled_at IS NOT NULL),
  CHECK ((thread_id IS NULL) = (thread_order IS NULL))
);

INSERT INTO posts_new (
  id, plan_id, account_id, platform, source_id, source_hash, model, cost_usd,
  thread_id, thread_order, type, text, media_json, source_refs, rationale,
  has_url, scheduled_at, status, idempotency_key, approved_by, approved_at,
  created_at, dispatched_at
)
SELECT id, plan_id, account_id, platform, source_id, source_hash, model, cost_usd,
       thread_id, thread_order, type, text, media_json, source_refs, rationale,
       has_url, scheduled_at, status, idempotency_key, approved_by, approved_at,
       created_at, dispatched_at
  FROM posts;

DROP TABLE posts;
ALTER TABLE posts_new RENAME TO posts;

-- والفهارسُ تُعاد كما كانت **لا كما في 0001**: `DROP TABLE` يأخذها معه.
-- وثلاثٌ هي القائمةُ فعلا — وإعادةُ ما سقط قبلها تُغيِّر المخطّطَ خِلسةً
CREATE INDEX idx_posts_status ON posts (status, created_at DESC);
CREATE INDEX idx_posts_source ON posts (source_id, platform);
CREATE INDEX idx_posts_due    ON posts (status, scheduled_at);

PRAGMA foreign_keys = ON;
