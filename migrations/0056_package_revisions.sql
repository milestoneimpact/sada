-- «حزمةُ المحتوى»: الخطّةُ والنصوصُ والتحديثُ الحيّ (D-368) — **كلُّ دفعٍ مراجعةٌ برقمه، والمعتمدُ لا يُمسّ بصمت**.
--
-- `package_revisions`: صفٌّ لكلّ التزامٍ رأته صدى، ومفتاحُه (org_id, commit_sha): الويب هوكُ المكرَّر والفحصُ الساعيّ بعده
-- ينتهيان إلى INSERT OR IGNORE واحد. و`snapshot_json` لقطةُ الحزمة كما فُهمت (مادّةٌ × منصّة)، فالفرقُ التالي يُحسب منها لا من GitHub.
-- `package_changes`: ما تغيّر لكلّ (مادّة، منصّة، نوع) وما حُكم فيه — والقيدُ الفريدُ يمنع تطبيقَ التغيير نفسِه مرّتين.
-- وعلى `posts` أعمدةُ الأصل: رقمُ المادّة، والمراجعةُ التي كتبته، ومن أين جاء نصُّه، وبصمةُ ملفّ النصّ، وموعدُه في الحزمة.
-- وعلى `package_sources` لونا المنصّتين، تعدّلهما المالك من بطاقة الإعدادات.
--
-- **إضافيٌّ خالص**: جدولان جديدان وأعمدةٌ تقبل الفراغ، ولا يتغيّر عمودٌ قائم.
CREATE TABLE package_revisions (
  id                TEXT PRIMARY KEY,
  org_id            TEXT NOT NULL,
  source_id         TEXT NOT NULL,
  commit_sha        TEXT NOT NULL,
  parent_commit_sha TEXT,
  commit_message    TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'analysed', 'applied', 'failed')),
  -- ‏لقطةُ الحزمة كما فُهمت: { entries: [...], plan, copy, problems }
  snapshot_json     TEXT NOT NULL DEFAULT '{}',
  diff_json         TEXT NOT NULL DEFAULT '[]',
  -- ‏{ added, removed, changed, awaiting }
  summary_counts    TEXT NOT NULL DEFAULT '{}',
  error_reason      TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  applied_at        TEXT,
  UNIQUE (org_id, commit_sha)
);
CREATE INDEX idx_package_revisions_org ON package_revisions (org_id, created_at);

CREATE TABLE package_changes (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL,
  revision_id  TEXT NOT NULL,
  item_no      TEXT NOT NULL,
  platform     TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('added', 'removed', 'text', 'time', 'format', 'media')),
  before_json  TEXT,
  after_json   TEXT,
  post_id      TEXT,
  disposition  TEXT NOT NULL CHECK (disposition IN ('auto_applied', 'awaiting_owner', 'kept_old', 'accepted', 'frozen_published')),
  decided_at   TEXT,
  UNIQUE (revision_id, item_no, platform, kind)
);
CREATE INDEX idx_package_changes_waiting ON package_changes (org_id, disposition);

ALTER TABLE posts ADD COLUMN package_item_no TEXT;
ALTER TABLE posts ADD COLUMN source_revision_id TEXT;
ALTER TABLE posts ADD COLUMN copy_origin TEXT CHECK (copy_origin IS NULL OR copy_origin IN ('package', 'written', 'manual'));
ALTER TABLE posts ADD COLUMN copy_blob_sha TEXT;
-- ‏موعدُ المنشور في الحزمة («2026-11-22 09:30» بمنطقة المنظّمة) — الجدولةُ تبقى بيد المالك
ALTER TABLE posts ADD COLUMN package_due TEXT;
CREATE INDEX idx_posts_package ON posts (org_id, package_item_no, platform);

ALTER TABLE package_sources ADD COLUMN x_variant TEXT NOT NULL DEFAULT 'dark' CHECK (x_variant IN ('dark', 'light'));
ALTER TABLE package_sources ADD COLUMN linkedin_variant TEXT NOT NULL DEFAULT 'light' CHECK (linkedin_variant IN ('dark', 'light'));
