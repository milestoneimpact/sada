-- الخطّةُ الموحَّدة، المرحلة ٢: النموذج (D-383 · docs/plan-unified/DESIGN.md).
--
-- ## ما يُضاف
--
-- - `import_jobs`: مهمّةُ استيرادٍ لكلّ مصدر (github · csv · text · wizard) ببصمة محتواها، والقيدُ الفريد على
--   `(org_id, source_kind, content_hash)` يجعل إعادةَ الاستيراد نفسِه بلا أثر.
-- - `plans.period` («YYYY-MM») و`plans.source_kinds` (مصفوفةُ JSON). والفرادةُ على `(org_id, period)` فهرسٌ جزئيّ
--   لما له شهر، والخططُ الأسبوعيّة تبقى بـ`span` كما هي. و`current_version` لا يُضاف: `plans.version` قائمٌ منذ 0039.
-- - `plan_items`: بندُ الخطّة صفًّا، بقيدٍ فريد على `(plan_id, item_key, platform)`، و`rev` لحماية التصادم (ifRev)،
--   و`edited_in_sada` لما عدّله المالك في صدى.
-- - `posts.plan_item_id`: المنشورُ يشير إلى بنده.
-- - `schedule_rules`: عتباتُ الفحص لكلّ منظّمة، وغيابُ الصفّ يعني الافتراضيّات المكتوبة هنا.
-- - `plan_versions.import_job_id`: أيُّ استيرادٍ صنع الإصدار.
-- - `plan_edits`: سجلُّ التعديل (من، متى، ما قبله) لبنود الخطّة والمنشورات. **يُكتب ولا يُعدَّل**.
--
-- ## والتعبئةُ الرجعيّة
--
-- 1. الخطّةُ الشهريّة الأحدث لكلّ شهرٍ تأخذ `period` من `week_start`.
-- 2. بنودُ `plan_json.items` لكلّ خطّةٍ تُنسخ إلى `plan_items`، ومفتاحُ البند معرّفُه (D-329) أو «#» ورقمُه.
-- 3. منشوراتُ الحزمة (`package_item_no`) تُجمع بشهر `package_due` في خطّةٍ شهريّةٍ واحدة لكلّ منظّمة
--    (`model = 'package'`)، ما لم تكن للمنظّمة خطّةٌ لذلك الشهر فتُضاف بنودُها إليها.
--    و`week_start` لهذه الخطّة الشهرُ نفسُه («2026-11») فلا يصطدم ببداية أسبوعٍ تحذفها `seatPlan` أو بناءُ الخطّة.
-- 4. `posts.plan_item_id` يُملأ: منشورُ الحزمة ببند رقمه ومنصّته في شهره، ومسوّدةُ الخطّة بمرجعها `item:<id>`.
--
-- **إضافيٌّ خالص**: جداولُ جديدة وأعمدةٌ تقبل الفراغ أو بقيمةٍ افتراضيّة، ولا يتغيّر عمودٌ قائمٌ ولا قيمتُه.
-- وحذفُ خطّةٍ (`seatPlan` · بناءُ الخطّة) يحذف بنودَها معها (`ON DELETE CASCADE`) ويُفرغ إشارةَ منشوراتها، فلا ينكسر.

CREATE TABLE import_jobs (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL,
  source_kind   TEXT NOT NULL CHECK (source_kind IN ('github', 'csv', 'text', 'wizard')),
  -- ‏التزامٌ أو اسمُ ملف
  source_ref    TEXT,
  -- ‏SHA-256 للصفوف بعد التطبيع
  content_hash  TEXT NOT NULL,
  period        TEXT CHECK (period IS NULL OR period GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'normalized', 'unchanged', 'applied', 'failed')),
  report_json   TEXT NOT NULL DEFAULT '{}',
  plan_id       TEXT REFERENCES plans(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (org_id, source_kind, content_hash)
);
CREATE INDEX idx_import_jobs_org ON import_jobs (org_id, created_at DESC);

ALTER TABLE plans ADD COLUMN period TEXT CHECK (period IS NULL OR period GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]');
ALTER TABLE plans ADD COLUMN source_kinds TEXT NOT NULL DEFAULT '[]';

CREATE TABLE plan_items (
  id                 TEXT PRIMARY KEY,
  org_id             TEXT NOT NULL,
  plan_id            TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  item_key           TEXT NOT NULL,
  platform           TEXT NOT NULL,
  -- ‏«YYYY-MM-DD HH:MM» بمنطقة المالك (D-383 المرحلة ١)
  due_local          TEXT,
  kind               TEXT,
  angle              TEXT,
  copy               TEXT,
  media_ref          TEXT,
  content_hash       TEXT,
  source_id          TEXT,
  source_kind        TEXT NOT NULL CHECK (source_kind IN ('github', 'csv', 'text', 'wizard')),
  package_item_no    TEXT,
  source_revision_id TEXT,
  rev                INTEGER NOT NULL DEFAULT 1,
  edited_in_sada     INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (plan_id, item_key, platform)
);
CREATE INDEX idx_plan_items_org ON plan_items (org_id, due_local);

ALTER TABLE posts ADD COLUMN plan_item_id TEXT REFERENCES plan_items(id) ON DELETE SET NULL;
CREATE INDEX idx_posts_plan_item ON posts (plan_item_id);

CREATE TABLE schedule_rules (
  org_id              TEXT PRIMARY KEY,
  -- ‏سقفُ كلّ منصّةٍ في اليوم: {"x":3,"linkedin":2}
  platform_caps_json  TEXT NOT NULL DEFAULT '{"x":3,"linkedin":2}',
  daily_total_cap     INTEGER NOT NULL DEFAULT 5 CHECK (daily_total_cap > 0),
  min_gap_minutes     INTEGER NOT NULL DEFAULT 90 CHECK (min_gap_minutes >= 0),
  quiet_start         TEXT NOT NULL DEFAULT '23:00' CHECK (quiet_start GLOB '[0-2][0-9]:[0-5][0-9]'),
  quiet_end           TEXT NOT NULL DEFAULT '07:00' CHECK (quiet_end GLOB '[0-2][0-9]:[0-5][0-9]'),
  jitter_minutes      INTEGER NOT NULL DEFAULT 7 CHECK (jitter_minutes BETWEEN 0 AND 30),
  updated_by          TEXT,
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE plan_versions ADD COLUMN import_job_id TEXT REFERENCES import_jobs(id) ON DELETE SET NULL;

CREATE TABLE plan_edits (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL,
  target_kind  TEXT NOT NULL CHECK (target_kind IN ('plan_item', 'post')),
  target_id    TEXT NOT NULL,
  -- ‏رقمُ النسخة قبل التعديل، فـ«استعد هذه النسخة» يعرف ما يعيد
  rev          INTEGER NOT NULL,
  actor        TEXT NOT NULL,
  at           TEXT NOT NULL DEFAULT (datetime('now')),
  before_json  TEXT NOT NULL,
  after_json   TEXT,
  reason       TEXT
);
CREATE INDEX idx_plan_edits_target ON plan_edits (org_id, target_kind, target_id, at DESC);

-- ١) شهرُ الخطّة الشهريّة: الأحدثُ لكلّ (منظّمة، شهر) وحده، فلا يصطدم القيدُ الفريد
UPDATE plans SET period = substr(week_start, 1, 7)
 WHERE span = 'month'
   AND id = (SELECT p2.id FROM plans p2
              WHERE p2.org_id = plans.org_id AND p2.span = 'month'
                AND substr(p2.week_start, 1, 7) = substr(plans.week_start, 1, 7)
              ORDER BY (p2.status = 'superseded'), p2.created_at DESC, p2.id DESC LIMIT 1);

UPDATE plans SET source_kinds = CASE WHEN model = 'import' THEN '["csv"]' ELSE '["wizard"]' END;

-- ٢) بنودُ كلّ خطّة
INSERT OR IGNORE INTO plan_items (id, org_id, plan_id, item_key, platform, due_local, kind, angle, media_ref, source_id, source_kind)
SELECT 'pi_' || p.id || '_' || j.key,
       p.org_id, p.id,
       coalesce(json_extract(j.value, '$.id'), '#' || j.key),
       json_extract(j.value, '$.platform'),
       json_extract(j.value, '$.day') || ' ' || json_extract(j.value, '$.time'),
       coalesce(json_extract(j.value, '$.kind'), 'text'),
       json_extract(j.value, '$.angle'),
       json_extract(j.value, '$.asset'),
       json_extract(j.value, '$.sourceId'),
       CASE WHEN p.model = 'import' THEN 'csv' ELSE 'wizard' END
  FROM plans p, json_each(p.plan_json, '$.items') j
 WHERE json_valid(p.plan_json) AND json_extract(j.value, '$.platform') IS NOT NULL;

-- ٣) خطّةٌ شهريّةٌ للحزمة حيث لا خطّةَ للشهر، ثمّ بنودُها: أوّلُ منشورٍ لكلّ (مادّة، منصّة) في الشهر
INSERT OR IGNORE INTO plans (id, week_start, plan_json, model, status, org_id, span, period, source_kinds)
SELECT 'plan_pkg_' || org_id || '_' || ym, ym, '{"rationale":"حزمة المحتوى","items":[]}', 'package', 'draft', org_id, 'month', ym, '["github"]'
  FROM (SELECT DISTINCT org_id, substr(package_due, 1, 7) AS ym FROM posts
         WHERE package_item_no IS NOT NULL AND package_due GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-*') m
 WHERE NOT EXISTS (SELECT 1 FROM plans x WHERE x.org_id = m.org_id AND x.period = m.ym);

UPDATE plans SET source_kinds = json_insert(source_kinds, '$[#]', 'github')
 WHERE model <> 'package' AND period IS NOT NULL
   AND EXISTS (SELECT 1 FROM posts s WHERE s.org_id = plans.org_id AND s.package_item_no IS NOT NULL
                 AND substr(s.package_due, 1, 7) = plans.period);

INSERT OR IGNORE INTO plan_items (id, org_id, plan_id, item_key, platform, due_local, kind, copy, content_hash, source_kind, package_item_no, source_revision_id)
SELECT 'pi_' || pl.id || '_pkg_' || s.package_item_no || '_' || s.platform,
       s.org_id, pl.id, 'pkg:' || s.package_item_no, s.platform, s.package_due,
       CASE WHEN s.type = 'thread' THEN 'thread' ELSE 'text' END,
       s.text, s.copy_blob_sha, 'github', s.package_item_no, s.source_revision_id
  FROM posts s
  JOIN plans pl ON pl.org_id = s.org_id AND pl.period = substr(s.package_due, 1, 7)
 WHERE s.package_item_no IS NOT NULL
   AND s.package_due GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-*'
 ORDER BY s.created_at, s.id;

CREATE UNIQUE INDEX idx_plans_period ON plans (org_id, period) WHERE period IS NOT NULL;

-- ٤) إشارةُ المنشور إلى بنده
UPDATE posts SET plan_item_id = (
  SELECT i.id FROM plan_items i
   WHERE i.org_id = posts.org_id AND i.package_item_no = posts.package_item_no AND i.platform = posts.platform
     AND i.source_kind = 'github'
     AND i.plan_id = (SELECT pl.id FROM plans pl WHERE pl.org_id = posts.org_id AND pl.period = substr(posts.package_due, 1, 7)))
 WHERE package_item_no IS NOT NULL AND plan_item_id IS NULL;

UPDATE posts SET plan_item_id = (
  SELECT i.id FROM plan_items i
   WHERE i.plan_id = posts.plan_id AND i.platform = posts.platform AND i.item_key NOT LIKE '#%'
     AND posts.source_refs LIKE '%"item:' || i.item_key || '"%' LIMIT 1)
 WHERE plan_id IS NOT NULL AND plan_item_id IS NULL;
