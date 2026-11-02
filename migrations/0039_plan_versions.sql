-- «ثبّت الخطّة» بإصدار (D-286) — الطلبُ ب من «الخطّةُ محورَ المنصّة».
--
-- ## ما كان
--
-- الخطّةُ صفٌّ واحدٌ يُعدَّل في مكانه (`plan_json`)، و«اعتمد» إقرارٌ بالمنطق لا تثبيت: لا يُعرف ما الذي جُدوِل
-- ولا كيف كانت الخطّةُ حين جُدولت، وتعديلٌ بعد الجدولة يمحو صورتَها السابقة.
--
-- ## ما صار — بقرار المالك: «تعديلٌ بإصدارٍ جديد، والأصلُ لا يُمسح»
--
-- - `plans.version`: رقمُ الإصدار الذي يُعمَل عليه، يبدأ واحدًا.
-- - `plans.locked_at`: متى ثُبّت هذا الإصدار — و`NULL` مسوّدةٌ أو عُدّلت بعد التثبيت.
-- - `plan_versions`: صورةُ كلِّ إصدارٍ لحظةَ تثبيته (البنودُ وعددُ ما جُدوِل ومن ثبّته). وأوّلُ تعديلٍ بعد التثبيت يرفع
--   `plans.version` ويُفرغ `locked_at`، **وصورةُ الإصدار المثبَّت باقيةٌ هنا لا تُمسّ**.
ALTER TABLE plans ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE plans ADD COLUMN locked_at TEXT;

CREATE TABLE plan_versions (
  id         TEXT PRIMARY KEY,
  plan_id    TEXT NOT NULL REFERENCES plans(id),
  version    INTEGER NOT NULL,
  plan_json  TEXT NOT NULL,
  scheduled  INTEGER NOT NULL DEFAULT 0,
  locked_by  TEXT,
  locked_at  TEXT NOT NULL DEFAULT (datetime('now')),
  org_id     TEXT NOT NULL DEFAULT 'org_owner',
  UNIQUE (plan_id, version)
);
CREATE INDEX plan_versions_plan ON plan_versions (org_id, plan_id);
