-- الخطّةُ لكلّ عميل، أسبوعًا أو شهرًا (D-256 · AGENCY-PLAN و-١).
--
-- ## ما كان
--
-- `plans.week_start` فريدٌ في القاعدة كلّها، والخطّةُ تُكتب لـ`org_owner` دائمًا (0031 أضاف العمودَ ولم يُفرده).
-- فعميلان لا يملكان خطّتين لأسبوعٍ واحد، والثاني يمحو الأوّل. **ولا شهر**: المدى أسبوعٌ مكتوبٌ في القيد.
--
-- ## ما صار
--
-- `span` (`week` · `month`)، **والفرادةُ على `(org_id, week_start, span)`**: لكلّ عميلٍ خطّةُ أسبوعه وخطّةُ شهره.
-- و`week_start` اسمُه باقٍ وهو بدايةُ المدى — أوّلُ اثنينٍ في الشهر للشهريّة — فلا يُكسر قارئٌ قديم.
--
-- ## و SQLite لا يبدّل قيدًا
--
-- فيُعاد بناءُ الجدول (كـ 0022). **والمخطَّطُ من الحال لا من 0001**: قُرئ `sqlite_master` بعد 0031،
-- ففيه `org_id` و`brand_id`. و`posts.plan_id` يشير إلى `plans(id)` بالاسم، فيبقى صحيحًا بعد إعادة التسمية.
PRAGMA foreign_keys = OFF;

CREATE TABLE plans_new (
  id         TEXT PRIMARY KEY,
  week_start TEXT NOT NULL,
  plan_json  TEXT NOT NULL,
  model      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'approved', 'superseded')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  org_id     TEXT NOT NULL DEFAULT 'org_owner',
  brand_id   TEXT NOT NULL DEFAULT 'brand_owner',
  span       TEXT NOT NULL DEFAULT 'week' CHECK (span IN ('week', 'month')),
  UNIQUE (org_id, week_start, span)
);

INSERT INTO plans_new (id, week_start, plan_json, model, status, created_at, org_id, brand_id, span)
  SELECT id, week_start, plan_json, model, status, created_at, org_id, brand_id, 'week' FROM plans;

DROP TABLE plans;
ALTER TABLE plans_new RENAME TO plans;

CREATE INDEX idx_plans_org ON plans (org_id, span, week_start DESC);

PRAGMA foreign_keys = ON;
