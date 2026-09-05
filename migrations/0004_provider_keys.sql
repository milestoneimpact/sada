-- ── خزانة مفاتيح المزوّدين ────────────────────────────────────────────
--
-- المفتاح مشفَّر بـ AES-GCM بربطٍ سياقيّ (`provider:<name>:key`)، فنصٌّ
-- مشفَّر لا يُنقل من مزوّدٍ إلى آخر ولو نُسخ الصفّ. نفس آليّة D-005.
--
-- **وأسرار Worker تغلب هذا الجدول دائما.** فهو للتجريب والتبديل السريع،
-- والمفتاح الأساسيّ يبقى حيث لا يُقرأ من شيفرتنا.
--
-- ولا يُخزَّن المفتاح مقروءا في أيّ عمود: `hint` أوّلُه وآخرُه فقط، وهو
-- ما يُعرض. والوسط لا يوجد إلا مشفَّرا.

CREATE TABLE provider_keys (
  provider    TEXT PRIMARY KEY,
  key_enc     TEXT NOT NULL,
  key_iv      TEXT NOT NULL,
  -- ما يُعرض في اللوحة: «AIzaSy…7f2a». لا يكفي لإعادة بناء المفتاح
  hint        TEXT NOT NULL,
  -- بصمة SHA-256 مقتطعة: تُقارَن نسختان بلا كشف أيّهما
  fingerprint TEXT NOT NULL,
  -- تعطيلٌ مؤقّت بالمفتاح محفوظا — يُطفأ ولا يُفقَد
  enabled     INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  -- سقف إنفاقٍ يوميّ لهذا المزوّد وحده. NULL = لا سقف خاصّ به
  daily_cap   REAL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by  TEXT,
  -- آخر اختبارٍ نجح: مفتاحٌ لم يُختبر قطّ يُعلَّم في اللوحة
  verified_at TEXT
);
