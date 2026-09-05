-- سجلّ التدقيق.
--
-- كان في اللوحة أزرارٌ تُوقف النظام وترفع السقوف وتحذف مزوّدين، ولا أثرَ
-- لشيءٍ منها. و`settings.updated_by` عمودٌ يُكتب فيه «panel» — يقول أين
-- وقع الفعل، ولا يقول متى ولا من أيّ عنوان ولا ما كانت القيمة قبله.
--
-- والسجلّ **يُكتب ولا يُعدَّل**: لا مسار في اللوحة يحذف منه صفّا. سجلٌّ
-- يُمحى منه ما يُحرج ليس سجلّا.
CREATE TABLE audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         TEXT NOT NULL DEFAULT (datetime('now')),
  -- كيف دخل الفاعل: جلسةُ لوحةٍ أم رمزٌ في ترويسة
  actor      TEXT NOT NULL,
  -- ما فعل: اسمٌ ثابت يُبحث به (settings.write · provider.delete …)
  action     TEXT NOT NULL,
  -- على ماذا: اسمُ إعدادٍ أو مزوّدٍ أو معرّف مصدر
  target     TEXT,
  -- تفصيلٌ للقراءة. **لا يُكتب فيه سرٌّ ولا مفتاح** — تلميحٌ أو بصمة فقط
  detail     TEXT,
  ip         TEXT,
  ua         TEXT
);

-- الاستعلامُ الغالب: آخرُ ما وقع. والفهرس عليه وحده لأنّه وحده يُقرأ.
CREATE INDEX idx_audit_at ON audit_log (at DESC);
CREATE INDEX idx_audit_action ON audit_log (action, at DESC);
