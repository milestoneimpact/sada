-- مكتبةُ العميل (D-260 · AGENCY-PLAN و-٤) — **صورُ المالك المرفوعة**، والباقي يُقرأ من موضعه.
--
-- المكتبةُ أربعةُ أنهار: الصورُ المولَّدة (`media`)، ومقاطعُ المالك (`uploads`)، ومصادرُ Drive (`sources`)،
-- **وصورُ المالك** — ولا موضعَ لها: `uploads` مقصورٌ على المقاطع بقيده (0030)، و`media` صفٌّ لمنشورٍ بعينه.
-- فهذا الجدولُ وحده جديد، والتصنيفُ يُشتقّ عند القراءة (العميل · النوع · المنشأ · الشهر) فلا يتباعد عن أصله.
--
-- **ولا يُكتب في Drive** (D-017): المكتبةُ في R2 بمنظّمتها، ونسخُها إلى مجلّدٍ في Drive قرارٌ للمالك (D-260).
CREATE TABLE library_files (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL DEFAULT 'org_owner',
  brand_id   TEXT NOT NULL DEFAULT 'brand_owner',
  r2_key     TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  mime       TEXT NOT NULL CHECK (mime LIKE 'image/%'),
  bytes      INTEGER NOT NULL CHECK (bytes > 0),
  width      INTEGER,
  height     INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_library_org ON library_files (org_id, created_at DESC);
