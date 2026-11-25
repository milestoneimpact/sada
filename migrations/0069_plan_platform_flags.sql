-- TikTok وInstagram في الخطّة خلف بوّابة (D-399 · ROADMAP-3 §4 البند ٧ · M-14 · M-24).
--
-- ## ما يُضاف (إضافيٌّ خالص)
--
-- - `plan_platform_flags`: علمٌ صريحٌ لكلّ منظّمةٍ ومنصّةٍ مبوَّبة (`instagram` · `tiktok`). المنصّةُ تدخل `PLAN_NOW`
--   لمنظّمتها إن كان لها حسابٌ نشط **أو** كان علمُها `enabled = 1`. وغيابُ الصفّ يعني «مغلق»، فلا يتغيّر شيءٌ لمنظّمةٍ قائمة.
--
-- يُطبَّق قبل نشر الشيفرة: `readPlanFlags` يقرأ الجدول، وغيابُه يُقرأ «لا علم» فلا ينكسر شيء.

CREATE TABLE plan_platform_flags (
  org_id     TEXT NOT NULL,
  platform   TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok')),
  enabled    INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org_id, platform)
);
