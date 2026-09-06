-- جاهزيةُ YouTube و TikTok — **الربطُ يُفتَح، والنشرُ لا يُدَّعى.**
--
-- ## ما يُوسَّع وما لا يُوسَّع
--
-- `accounts.platform` و `oauth_apps.platform` يُوسَّعان: **الربطُ مبنيٌّ
-- فعلا** — دورةُ OAuth واحدةٌ بمعاملات (D-002)، والنطاقاتُ سجلٌّ
-- (D-045)، والأسرارُ خزانةٌ (D-042). فما يمنع الربطَ اليوم قيدٌ في
-- المخطّط لا نقصٌ في الشيفرة.
--
-- **و `posts.platform` يبقى كما هو**: لا سائقَ نشرٍ لهما بعد. ومسوّدةٌ
-- تُكتب لمنصّةٍ لا تنشر هي **وعدٌ يُخلَف عند الجدولة** — والقاعدةُ هي
-- التي تمنعه، لا الشيفرة (D-009). فيُترك القيدُ حارسا حتّى يُبنى
-- السائقُ، ويُوسَّع في ترحيله هو.
--
-- **الترحيلُ قبل الدالّة** (CLAUDE.md): Worker يكتب صفَّ حسابٍ لمنصّةٍ
-- يردّها القيدُ ينكسر على أوّل ربط.
--
-- و SQLite لا يبدّل قيدا، فيُعاد بناءُ الجدولين. والصفوفُ تُنقل كما هي.

PRAGMA foreign_keys = OFF;

-- ── الحسابات ─────────────────────────────────────────────────────────
CREATE TABLE accounts_new (
  id            TEXT PRIMARY KEY,
  -- أربعٌ تُربَط. واثنتان منها تنشران اليوم، والأخريان تنتظران سائقا —
  -- **والفرقُ يُقال في الواجهة نصّا**، لا يُخفى خلف بطاقةٍ تبدو كاملة
  platform      TEXT NOT NULL
                  CHECK (platform IN ('linkedin', 'x', 'youtube', 'tiktok')),
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

-- ── خزانةُ أسرار التطبيقات ───────────────────────────────────────────
CREATE TABLE oauth_apps_new (
  platform    TEXT PRIMARY KEY
                CHECK (platform IN ('linkedin', 'x', 'youtube', 'tiktok')),
  client_id   TEXT NOT NULL,
  secret_enc  TEXT NOT NULL,
  secret_iv   TEXT NOT NULL,
  hint        TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by  TEXT
);

INSERT INTO oauth_apps_new
  (platform, client_id, secret_enc, secret_iv, hint, fingerprint, updated_at, updated_by)
SELECT platform, client_id, secret_enc, secret_iv, hint, fingerprint, updated_at, updated_by
  FROM oauth_apps;

DROP TABLE oauth_apps;
ALTER TABLE oauth_apps_new RENAME TO oauth_apps;

PRAGMA foreign_keys = ON;
