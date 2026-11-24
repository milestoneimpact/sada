-- ملفُّ حال الخطّة في مستودع المالك (D-390): `plans/YYYY-MM.status.json`.
--
-- ## لماذا
--
-- قرّر المالك «ملفَّ حالٍ لا وسمًا»: صدى تكتب في المستودع ما جرى لخطّة كلّ شهر (استُورد ← فُحص ← اعتُمد ← جُدول ← نُشر أو
-- تعثّر). والكتابةُ مجمَّعةٌ لا لكلّ حدث: الدورةُ تبني الحالَ من القاعدة، وتكتبه إن تغيّرت بصمتُه ومضت على آخر كتابةٍ
-- دقائقُ (`MIN_GAP_MINUTES`). وهذا الجدولُ ذاكرةُ الكتابة لكلّ (منظّمة، شهر).
--
-- ## الأعمدة
--
-- - `last_sha`: بصمةُ git للملفّ بعد آخر كتابة — يُرسَل في `PUT` فلا يُدهس تعديلٌ لم نره.
-- - `last_hash`: SHA-256 لمحتوى الحال الأخير المكتوب — فالحالُ نفسُه لا يُكتب مرّتين.
-- - `dirty`: تغيّر الحالُ ولم يُكتب بعد (ينتظر انقضاء الفاصل، أو فشلت الكتابة).
-- - `last_written_at` و`last_attempt_at` و`attempts`: سجلُّ المحاولات.
-- - `last_error`: سببٌ بالعربيّة بلا رمزٍ ولا عنوان، و`needs_write` = 1 حين ردّ GitHub بأنّ الإذنَ للقراءة وحدها.
--
-- إضافيٌّ خالص: جدولٌ جديد، ولا عمودَ يتغيّر في جدولٍ قائم، ولا مفتاحَ أجنبيّ.
CREATE TABLE repo_status_sync (
  org_id          TEXT NOT NULL,
  period          TEXT NOT NULL CHECK (period GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
  last_sha        TEXT,
  last_hash       TEXT,
  dirty           INTEGER NOT NULL DEFAULT 1 CHECK (dirty IN (0, 1)),
  last_written_at TEXT,
  last_attempt_at TEXT,
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  needs_write     INTEGER NOT NULL DEFAULT 0 CHECK (needs_write IN (0, 1)),
  PRIMARY KEY (org_id, period)
);
