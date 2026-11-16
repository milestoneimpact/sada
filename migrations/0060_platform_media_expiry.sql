-- صلاحيّةُ معرّف المقطع عند المنصّة، وإعادةُ رفعه مرّةً لا أكثر (D-379).
--
-- `media.platform_media_expires_at` متى ينتهي معرّفُ المقطع عند X (`expires_after_secs` من FINALIZE وSTATUS)، بصيغة القاعدة
-- (UTC). إعادةٌ بعده لا تُلحق المعرّفَ المنتهي بالتغريدة: يُرفع المقطعُ من جديد. والفراغُ «لم تقل المنصّة» (LinkedIn وما قبل 0060).
-- `media.platform_media_resets` كم مرّةً أُعيد رفعُ المقطع لانتهاء معرّفه أو ردّه: مرّةٌ واحدة، وما بعدها ردٌّ نهائيٌّ بسببه فلا دوران.
--
-- **إضافيٌّ خالص**: عمودٌ يقبل الفراغ وعمودٌ بقيمةٍ افتراضيّة، ولا يتغيّر عمودٌ قائم.
ALTER TABLE media ADD COLUMN platform_media_expires_at TEXT;
ALTER TABLE media ADD COLUMN platform_media_resets INTEGER NOT NULL DEFAULT 0;
