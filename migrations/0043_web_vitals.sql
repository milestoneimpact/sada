-- القياسُ الميدانيّ لسرعة اللوحة (D-299) — خطّةُ السهولة ٢، الأفقُ ١ · ١.
--
-- ## ما كان
--
-- السرعةُ تُقاس في المختبر وحدَه (Playwright على نسخةٍ محلّيّة)، ولا رقمَ واحدًا عن اللوحة على هاتف المالك.
-- والمختبرُ يقول «سريع» والميدانُ لم يُسأل.
--
-- ## ما صار
--
-- كلُّ فتحةٍ للّوحة من جلسةٍ تُرسل ثلاثةَ أرقامٍ لا غير (LCP وINP وCLS كما تعرّفها web.dev) بـ `sendBeacon` إلى
-- `POST /panel/vitals`، فتُحفَظ هنا **بلا هويّةٍ ولا عنوانٍ ولا وكيلِ مستخدم**: المنظّمةُ والمقياسُ والقيمةُ والصفحةُ
-- (مسارٌ مطبَّعٌ بلا معرّفات) ونوعُ الجهاز (هاتفٌ أو حاسوب) والوقت. والحكمُ (جيّد/يحتاج تحسينًا/ضعيف) يُحسَب عند
-- القراءة من حدود web.dev لا يُخزَّن، فلا عمودَ لا يُقرأ. وما فوق ثلاثين يومًا يُمحى عند كلّ كتابة.
CREATE TABLE web_vitals (
  org_id TEXT NOT NULL DEFAULT 'org_owner',
  metric TEXT NOT NULL CHECK (metric IN ('LCP', 'INP', 'CLS')),
  value  REAL NOT NULL CHECK (value >= 0),
  page   TEXT NOT NULL,
  device TEXT NOT NULL CHECK (device IN ('phone', 'desktop')),
  at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX web_vitals_at ON web_vitals (org_id, at);
