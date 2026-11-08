-- الاعتماديّة (D-320): ثلاثةٌ يحرسها المخطَّط بعد اليوم لا الشيفرةُ وحدها.
--
-- ## ١ · D-004 في القاعدة: لا محاولتان مفتوحتان ولا ناجحتان بمفتاحٍ واحد
--
-- كان «لا نشرَ مرّتين» فحصًا ثمّ إدخالًا في `publisher.ts`: يُسأل عن `succeeded` ثمّ عن `sent`، ثمّ تُكتب `sent` بعد
-- خطواتٍ أخرى. وتسليمان متزامنان للرسالة نفسِها (الطابورُ «مرّةً على الأقلّ») يمرّان من السؤالين معًا قبل أن يكتب أيٌّ
-- منهما، فيُرسَل المنشورُ مرّتين ويُدفع مرّتين. **فالمحفّزُ يردّ ما لم يمنعه الفحص**:
--
-- - صفٌّ `sent` جديدٌ ومفتاحُه له صفٌّ `sent` أو `succeeded` ← يُردّ. فالإدخالُ نفسُه حجزٌ، ومن سبق حجز.
-- - صفٌّ `succeeded` ثانٍ بالمفتاح نفسِه، بإدخالٍ أو بتحديث ← يُردّ.
--
-- **محفّزٌ لا فهرسٌ فريد**: `CREATE UNIQUE INDEX … WHERE status IN (…)` يسقط إن كان على staging صفّان كهذين من قبل،
-- والترحيلُ كلُّه معه (D1 يطبّق الملفّ في معاملة). والمحفّزُ يحرس ما يُكتب بعده، ولا يقرأ ما قبله.
-- والمفتاحُ وحدَه شرطُ المحفّز: `idx_attempts_key` يحمله، والمفتاحُ لمنشورٍ واحدٍ في منظّمةٍ واحدة.
CREATE TRIGGER publish_attempts_once_insert
BEFORE INSERT ON publish_attempts
WHEN (NEW.status = 'sent' AND EXISTS (
        SELECT 1 FROM publish_attempts
         WHERE idempotency_key = NEW.idempotency_key AND status IN ('sent', 'succeeded')))
  OR (NEW.status = 'succeeded' AND EXISTS (
        SELECT 1 FROM publish_attempts
         WHERE idempotency_key = NEW.idempotency_key AND status = 'succeeded'))
BEGIN
  SELECT RAISE(ABORT, 'd004_once: an open or succeeded attempt already holds this idempotency_key');
END;

CREATE TRIGGER publish_attempts_once_update
BEFORE UPDATE OF status ON publish_attempts
WHEN NEW.status = 'succeeded' AND OLD.status != 'succeeded' AND EXISTS (
        SELECT 1 FROM publish_attempts
         WHERE idempotency_key = NEW.idempotency_key AND id != NEW.id AND status = 'succeeded')
BEGIN
  SELECT RAISE(ABORT, 'd004_once: a succeeded attempt already holds this idempotency_key');
END;

-- ## ٢ · تجديدٌ لا يجوّع: ما يُرفَض يتباعد، وما يسقط يتأخّر
--
-- كانت الدورةُ تأخذ أقدمَ خمسةٍ وعشرين رمزًا يقترب انتهاؤها. والحسابُ الذي لا يتجدّد أبدًا (ردّ المزوّدُ إذنَه، أو انتهى
-- إذنُ تجديده) أقدمُها انتهاءً، فيُعاد في كلّ دورة ستًّا وتسعين مرّةً في اليوم، **وخمسةٌ وعشرون منها تملأ الدفعةَ فلا يصل
-- الحسابَ السليمَ دورُه** حتّى يموت رمزُه. فلكلّ رمزٍ عددُ ما سقط متتاليًا وموعدُ محاولته التالية: السليمُ (صفر) يتقدّم دائمًا،
-- والمرفوضُ ينتظر ضعفَ ما انتظر قبله حتّى يوم، **والعابرُ (عطلٌ عند المزوّد، أو سرُّ التطبيق ناقص) يُعدّ ولا ينتظر** (مراجعة
-- D-320). ويُصفَّران مع كلّ حفظٍ للرمز (`saveTokens`: تجديدٌ نجح، أو ربطٌ من جديد)، ومع حفظ التطبيق أو فحصه الناجح لمنصّته.
ALTER TABLE tokens ADD COLUMN renew_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tokens ADD COLUMN renew_retry_at TEXT;

-- ## ٣ · النشرُ في دقيقته: رسالةٌ مؤجَّلةٌ لما يحلّ قبل الدورة التالية
--
-- كانت الدورةُ (كلَّ ربع ساعة، ومعها ‏:07) ترسل ما حلّ موعدُه وحدَه، فمنشورٌ موعدُه ‏:16 يخرج ‏:30 — أربعَ عشرةَ دقيقةً
-- بعد ما وُعد. فصارت ترسل ما يحلّ قبل الدورة التالية برسالةٍ مؤجَّلةٍ إلى دقيقته (`delaySeconds`)، **ولا تختمه «أُرسل»**:
-- الختمُ (`dispatched_at`) يقع عند وصول الرسالة في موعدها، فيبقى المنشورُ يُسحب ويُغيَّر موعدُه حتّى دقيقته كما كان.
-- و`enqueued_for` هو الموعدُ الذي أُرسلت له الرسالة: ما دام يساوي `scheduled_at` فلا تُرسَل له ثانية، وموعدٌ تغيّر بعدها
-- يُرسَل له من جديد والرسالةُ القديمة تصل فتجده غيرَ موعدها فلا تفعل شيئًا.
ALTER TABLE posts ADD COLUMN enqueued_for TEXT;
