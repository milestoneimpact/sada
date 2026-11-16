-- الخطّةُ الموحَّدة، المرحلة ٤: الحزمةُ محوِّلٌ إلى خطّة الشهر (D-383 · docs/plan-unified/DESIGN.md).
--
-- ## ما يُضاف
--
-- - `posts.package_period` («YYYY-MM»): شهرُ منشور الحزمة. والمفتاحُ الطبيعيّ لمنشور الحزمة صار
--   `(org_id, package_period, package_item_no, platform)`، فالمادّةُ «01» في نوفمبر غيرُ «01» في ديسمبر.
--   والفهرسُ على `(org_id, package_period)` يجعل «حُذف من الخطّة» محصورًا في شهره.
-- - `package_changes.period`: شهرُ التغيير. والقيدُ الفريد صار `(revision_id, period, item_no, platform, kind)`،
--   فدفعةٌ واحدة فيها نوفمبر وديسمبر لا يصطدم فيها تغييرا المادّة نفسِها. ولا يُغيَّر قيدٌ في SQLite إلّا بإعادة
--   بناء الجدول، فيُبنى من جديد وتُنسخ صفوفُه كما هي.
--
-- ## والتعبئةُ الرجعيّة
--
-- 1. `posts.package_period` من أوّل سبعة أحرف في `package_due`.
-- 2. `package_changes.period` من تاريخ ما بعد التغيير أو ما قبله.
--
-- لا يتغيّر عمودٌ قائمٌ ولا قيمتُه، ولا جدولَ يشير إلى `package_changes`.

ALTER TABLE posts ADD COLUMN package_period TEXT;

UPDATE posts SET package_period = substr(package_due, 1, 7)
 WHERE package_item_no IS NOT NULL AND package_due GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-*';

CREATE INDEX idx_posts_package_period ON posts (org_id, package_period, package_item_no, platform);

CREATE TABLE package_changes_new (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL,
  revision_id   TEXT NOT NULL,
  -- ‏«YYYY-MM»، والفارغُ لتغييرٍ بلا تاريخ
  period        TEXT NOT NULL DEFAULT '',
  item_no       TEXT NOT NULL,
  platform      TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('added', 'removed', 'text', 'time', 'format', 'media')),
  before_json   TEXT,
  after_json    TEXT,
  post_id       TEXT,
  disposition   TEXT NOT NULL CHECK (disposition IN ('auto_applied', 'awaiting_owner', 'kept_old', 'accepted', 'frozen_published')),
  decided_at    TEXT,
  superseded_by TEXT,
  UNIQUE (revision_id, period, item_no, platform, kind)
);

INSERT INTO package_changes_new (id, org_id, revision_id, period, item_no, platform, kind, before_json, after_json, post_id, disposition, decided_at, superseded_by)
SELECT id, org_id, revision_id,
       coalesce(substr(coalesce(json_extract(after_json, '$.date'), json_extract(before_json, '$.date')), 1, 7), ''),
       item_no, platform, kind, before_json, after_json, post_id, disposition, decided_at, superseded_by
  FROM package_changes;

DROP TABLE package_changes;
ALTER TABLE package_changes_new RENAME TO package_changes;
CREATE INDEX idx_package_changes_waiting ON package_changes (org_id, disposition);
CREATE INDEX idx_package_changes_key ON package_changes (org_id, period, item_no, platform, kind);
