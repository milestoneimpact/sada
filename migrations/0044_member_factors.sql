-- العاملُ الثاني لكلّ حساب (D-317) — لا للمالك وحدَه.
--
-- ## ما كان
--
-- جداولُ 0007 للمالك الواحد: مفاتيحُ المرور بلا صاحب، و`totp` خانةٌ واحدة (`CHECK (id = 1)`)، ورموزُ الاسترداد
-- مجموعةٌ واحدة. فلم يكن للمدعوّ (D-272) عاملٌ ثانٍ يُلزَم به، و**الدخولُ بمفتاح مرورٍ كان يفتح جلسةَ مالكٍ أيًّا كان
-- من سجّله**.
--
-- ## ما صار
--
-- - `passkeys.email` و`recovery_codes.email`: صاحبُ الصفّ. **والغائبُ (`NULL`) صفٌّ للمالك** كُتب قبل هذا الترحيل —
--   فلا يُحدَّث صفٌّ قائم ولا يُفترض بريدٌ في الترحيل.
-- - `member_totp`: رمزُ التطبيق للمدعوّين، صفٌّ لكلّ بريد. **ورمزُ المالك باقٍ في `totp` كما هو** (خانتُه وتشفيرُه
--   بسياقه)، فلا يُنقَل سرٌّ مشفَّرٌ بين جدولين.
-- - وعدُّ إخفاقات رمز التطبيق لكلّ حساب في `auth_attempts` نفسِه (دلوٌ باسم الحساب)، فلا جدولَ هنا له.
--
-- **إضافةُ أعمدةٍ وجدولٍ جديد فقط**: لا إسقاطَ ولا إعادةَ بناء (D-316)، ولا قيدَ فريدٍ على صفوفٍ قائمة.
-- **والترحيلُ قبل الدالّة** (CLAUDE.md): الشيفرةُ التي تقرأ `email` تُنشر بعده.
ALTER TABLE passkeys ADD COLUMN email TEXT;
ALTER TABLE recovery_codes ADD COLUMN email TEXT;
CREATE INDEX idx_passkeys_email ON passkeys (email);
CREATE INDEX idx_recovery_email ON recovery_codes (email, used_at);

CREATE TABLE member_totp (
  -- بريدُ المدعوّ مطبَّعًا كما في `members` — والمالكُ ليس صفًّا هنا
  email          TEXT PRIMARY KEY CHECK (email = lower(trim(email)) AND email LIKE '%_@_%'),
  -- السرُّ مشفَّرٌ بـ TOKEN_ENC_KEY بسياقٍ يحمل البريد: صفٌّ يُنقَل إلى بريدٍ آخر لا يُفكّ
  secret_cipher  TEXT NOT NULL,
  secret_iv      TEXT NOT NULL,
  confirmed_at   TEXT,
  last_step      TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
