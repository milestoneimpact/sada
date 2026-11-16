-- مقطعُ الحزمة على X وLinkedIn (D-374): **الرفعُ لا يُعاد إن بدأ، والمعالجةُ تُسأل ولا تُرفع ثانيةً**.
--
-- `media.platform_media_state` أين بلغ رفعُ المقطع إلى المنصّة: `processing` (رُفع ويُعالَج عندها، فالإعادةُ تسأل عن
-- حالته بمعرّفه في `platform_media_id` ولا ترفع ثانيةً)، أو `ready` (جاهزٌ يُلحَق بالمنشور)، أو `failed` (ردّته المنصّة).
-- و`platform_media_error` سببُ الردّ كما قالته المنصّة، فيُقرأ في رحلة المنشور.
--
-- **إضافيٌّ خالص**: عمودان يقبلان الفراغ، ولا يتغيّر عمودٌ قائم. والصفُّ بلا حالةٍ صورةٌ كما كان.
ALTER TABLE media ADD COLUMN platform_media_state TEXT;
ALTER TABLE media ADD COLUMN platform_media_error TEXT;
