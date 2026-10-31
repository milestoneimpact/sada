-- الخطّةُ محورَ المنصّة (D-282 · AGENCY-PLAN): مدًى من أربعة، واختياراتُ المالك معها.
--
-- ## ما كان
--
-- `plans.span` أسبوعٌ أو شهر (0032)، والخطّةُ تُبنى من كلّ المصادر لمنصّتين مكتوبتين في الموجّه، ولا تذكر
-- ما اختاره المالك: لا قنواتِه ولا إيقاعَه ولا أفكارَه ولا أيرسم لها صورةً أم لا.
--
-- ## ما صار
--
-- `span` من أربعة (`week` · `2weeks` · `month` · `2months`)، و`choices_json` يحفظ اختياراتِ المالك كما ضغطها:
-- القنواتُ وإيقاعُ كلٍّ في الأسبوع، والمصادرُ المختارة أو «الكلّ»، والأفكارُ بكلماته، والأصولُ، وقرارُ الصورة الآليّة،
-- ويومُ البداية. **فتبقى الخطّةُ قابلةً للتعديل بعد أن تُبنى**: ما اختير يُقرأ ويُعاد لا يُستنتَج.
--
-- والفرادةُ على `(org_id, week_start, span)` كما كانت، والصفوفُ القديمة تُنقل بمداها كما هو.
--
-- ## و SQLite لا يبدّل قيدًا
--
-- فيُعاد بناءُ الجدول (كـ 0032)، والمخطَّطُ من الحال بعد 0032. و`posts.plan_id` يشير إلى `plans(id)` بالاسم فيبقى صحيحًا.
PRAGMA foreign_keys = OFF;

CREATE TABLE plans_new (
  id           TEXT PRIMARY KEY,
  week_start   TEXT NOT NULL,
  plan_json    TEXT NOT NULL,
  model        TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'approved', 'superseded')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  org_id       TEXT NOT NULL DEFAULT 'org_owner',
  brand_id     TEXT NOT NULL DEFAULT 'brand_owner',
  span         TEXT NOT NULL DEFAULT 'week' CHECK (span IN ('week', '2weeks', 'month', '2months')),
  choices_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE (org_id, week_start, span)
);

INSERT INTO plans_new (id, week_start, plan_json, model, status, created_at, org_id, brand_id, span)
  SELECT id, week_start, plan_json, model, status, created_at, org_id, brand_id, span FROM plans;

DROP TABLE plans;
ALTER TABLE plans_new RENAME TO plans;

CREATE INDEX idx_plans_org ON plans (org_id, span, week_start DESC);

PRAGMA foreign_keys = ON;
