-- العاملُ الثاني: مفاتيح المرور، ورمزُ التطبيق، ورموزُ الاسترداد.
--
-- وثلاثةُ جداولَ لا واحد، لأنّ لكلٍّ عمرا مختلفا: مفتاحُ المرور يُضاف
-- ويُحذف فرادى، وسرُّ TOTP واحدٌ يُبدَّل كلُّه، ورموزُ الاسترداد تُستهلك
-- صفّا صفّا. وجدولٌ واحد لثلاثتها يعني عمودا فارغا في كلّ صفّ.

-- ── مفاتيح المرور ───────────────────────────────────────────────────
CREATE TABLE passkeys (
  id             TEXT PRIMARY KEY,
  -- معرّف الاعتماد كما يعطيه المتصفّح، base64url. فريدٌ عالميّا
  credential_id  TEXT NOT NULL UNIQUE,
  -- المفتاح العامّ بصيغة SPKI، base64url. **عامٌّ لا يُشفَّر**: نشرُه
  -- لا يضرّ، وتشفيرُه يوهم بسرّيّةٍ ليست فيه
  public_key     TEXT NOT NULL,
  -- -7 لـ ES256 و -257 لـ RS256
  alg            INTEGER NOT NULL,
  -- عدّادُ التوقيع: تراجعُه يكشف استنساخ المتوثِّق
  sign_count     INTEGER NOT NULL DEFAULT 0,
  -- اسمٌ يكتبه المالك ليميّز جهازا من جهاز
  label          TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at   TEXT,
  -- النطاق الذي سُجّل عليه. مفتاحُ التجريب لا يفتح الإنتاج
  rp_id          TEXT NOT NULL
);
CREATE INDEX idx_passkeys_rp ON passkeys (rp_id);

-- ── العاملُ الثاني بالرمز ────────────────────────────────────────────
-- صفٌّ واحدٌ أبدا: `CHECK (id = 1)` يجعل الجدول خانةً لا قائمة، فلا
-- يُسأل «أيُّ صفٍّ هو الصحيح؟» حين يظهر صفّان.
CREATE TABLE totp (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  -- السرّ مشفَّرٌ بـ TOKEN_ENC_KEY بربطٍ سياقيّ. **لا يوجد مقروءا قطّ**
  secret_cipher  TEXT NOT NULL,
  secret_iv      TEXT NOT NULL,
  -- حتّى يُؤكَّد برمزٍ صحيح، السرُّ موجودٌ ولا يُعتدّ به
  confirmed_at   TEXT,
  -- آخرُ خطوةٍ قُبلت: رمزٌ استُعمل لا يُقبل ثانية
  last_step      TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── رموز الاسترداد ──────────────────────────────────────────────────
-- **مهشَّمةٌ لا مخزَّنةٌ نصّا.** تُعرض مرّةً واحدةً حين تُولَّد، ثمّ لا
-- سبيل إلى قراءتها من القاعدة — لا لنا ولا لمن قرأ نسخةً منها.
CREATE TABLE recovery_codes (
  hash       TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  used_at    TEXT
);
CREATE INDEX idx_recovery_unused ON recovery_codes (used_at);
