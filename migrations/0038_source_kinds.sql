-- مصادرُ من غير Drive (D-284): ملفٌّ يُرفع الآن، ورابطُ صفحة.
--
-- ## ما كان
--
-- `sources` صفٌّ لكلّ ملفٍّ في مجلّد Drive، و`drive_file_id` فريدٌ لا يُترك فارغًا. فمن أراد أن يبني خطّةً من ملفٍّ
-- على جهازه ذهب إلى Drive ورفعه ثمّ انتظر المسح، ومن أراد مقالًا على موقعٍ نسخه في مستندٍ أوّلًا.
--
-- ## ما صار
--
-- - `kind`: `drive` (افتراضُ كلّ صفٍّ قائم) · `upload` · `url`.
-- - `origin_url`: عنوانُ الصفحة لمصدر الرابط — يُعرَض ويُعاد قراءتُه منه.
-- - `file_key`: الملفُّ المرفوعُ كما هو في R2 (`MEDIA`)، فيُنزَّل من المكتبة.
-- - `text_key`: النصُّ المستخرَج في R2 — **يُستخرج عند الاستلام لا عند التحليل**، فيرى المالكُ «لا نصّ فيه» في لحظته،
--   والتحليلُ يقرأ نصًّا جاهزًا بالطريق نفسِه لكلّ نوع.
--
-- و`drive_file_id` يبقى `NOT NULL UNIQUE` بلا إعادة بناء: يحمل `upload:<uuid>` أو `url:<بصمة العنوان>`، وهي صيغٌ
-- لا تمرّ بـ `driveFileUrl` (فيها نقطتان) فلا يُرسَم لها رابطُ Drive. **والمسحُ يقرأ `kind = 'drive'` وحدَه**،
-- فلا يُبلَّغ عن مرفوعٍ أنّه «غاب من Drive».
ALTER TABLE sources ADD COLUMN kind TEXT NOT NULL DEFAULT 'drive';
ALTER TABLE sources ADD COLUMN origin_url TEXT;
ALTER TABLE sources ADD COLUMN file_key TEXT;
ALTER TABLE sources ADD COLUMN text_key TEXT;
