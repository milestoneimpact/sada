-- ما بقي من البند ١٣ في خارطة الطريق الثانية (D-291).
--
-- ## رقمُ المحاولة من الطابور عمودًا لا نصًّا داخل JSON
--
-- D-270 كتب `queue_attempt` داخل `request_json` في المحاولة التي تُرسَل، ولم يكتبه في
-- سقوطٍ قبل الإرسال ولا في طابور الأعطال (`queue_attempts` باسمٍ آخر)، ولا قرأه شيء.
-- فصار عمودًا يُكتب في المواضع الثلاثة ويُقرأ في سلّم الجاهزيّة: «المحاولة ٣ من الطابور».
-- و`NULL` لمحاولةٍ من اللوحة لا من الطابور.
ALTER TABLE publish_attempts ADD COLUMN queue_attempt INTEGER;

-- ## سببُ آخر تجديدٍ وآخر قياسٍ لكلّ حساب
--
-- `renewOne` يعيد `why` و`pullOne` يعيد `reason`، والدورتان تعدّان ولا تحفظان: فالمالكُ
-- يرى «يحتاج تجديدًا» ولا يعرف لماذا، ويرى منشورًا بلا قياسٍ ولا يعرف لماذا. صفٌّ لكلّ
-- دورةٍ ضجيجٌ (٩٦ في اليوم لكلّ حساب)، فالسببُ الأخيرُ وحدَه على صفّ الحساب، يُمحى حين ينجح.
ALTER TABLE accounts ADD COLUMN renew_note TEXT;
ALTER TABLE accounts ADD COLUMN renew_noted_at TEXT;
ALTER TABLE accounts ADD COLUMN metrics_note TEXT;
ALTER TABLE accounts ADD COLUMN metrics_noted_at TEXT;
