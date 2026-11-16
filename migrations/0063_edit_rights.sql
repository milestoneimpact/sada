-- الخطّةُ الموحَّدة، المرحلة ٧: التعديلُ والصلاحيات (D-383 · docs/plan-unified/DESIGN.md «التعديل والصلاحيات»).
--
-- ## ما يُضاف
--
-- - `posts.rev`: رقمُ نسخة المنشور لحماية التصادم. تعديلان متزامنان يحملان الرقمَ نفسَه، فيُقبل الأوّلُ ويُكشف الثاني
--   ولا يمحو الأوّل.
-- - `posts.edited_in_sada`: المنشورُ عدّله أحدٌ في صدى، فاستيرادٌ لاحقٌ يخالفه لا يدهسه.
-- - `plan_items.incoming_json`: ما جاء به استيرادٌ لاحقٌ لبندٍ «عُدِّل في صدى»، ينتظر قرارَ المالك بالنسختين.
--   والفارغُ لا تصادمَ فيه.
--
-- لا يتغيّر عمودٌ قائمٌ ولا قيمتُه، والقيمُ الافتراضيّة تملأ الصفوفَ القائمة.

ALTER TABLE posts ADD COLUMN rev INTEGER NOT NULL DEFAULT 1;
ALTER TABLE posts ADD COLUMN edited_in_sada INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plan_items ADD COLUMN incoming_json TEXT;
