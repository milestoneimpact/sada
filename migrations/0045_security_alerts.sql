-- أحداثُ الأمان في قناة التنبيهات (D-317).
--
-- ## ما كان
--
-- دخولٌ جديد، أو عاملٌ ثانٍ أُضيف أو أُزيل، أو رمزُ استردادٍ استُعمل، أو «أخرِج الأجهزة الأخرى» — كلُّها تُكتب في
-- `audit_log` وحده، **في القاعدة نفسِها التي يقرؤها من سرق الجلسة**. ولا يخرج منها شيءٌ إلى قناة المالك (D-109)، لأنّ
-- `alert_outbox.kind` مقيَّدٌ بثلاثة: `token` و`publish` و`budget`.
--
-- ## ما صار
--
-- النوعُ الرابع `security`: يُكتب الصفُّ عند الحدث بحالٍ فارغة (`status IS NULL`)، وتُرسله دورةُ التنبيهات كما ترسل
-- الثلاثة. **ولا يحمل المتنُ سرًّا ولا رمزًا** (CLAUDE.md · D-005): ما وقع ومتى ومن أيّ جهاز.
--
-- ## ولماذا إعادةُ بناء
--
-- قيدُ `CHECK` لا يُعدَّل في SQLite إلّا بإعادة بناء الجدول. **و`alert_outbox` بلا أبناء** (لا مفتاحَ أجنبيًّا يشير
-- إليه، ولا قادحَ عليه)، فإسقاطُه لا يُطلق محوًا على جدولٍ آخر (D-316 · `npm run migrations` يفحصه). والصفوفُ تُنسَخ
-- كلُّها قبل الإسقاط بأعمدتها الثمانية، والفهرسُ يُعاد باسمه.
CREATE TABLE alert_outbox_next (
  ref        TEXT PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('token', 'publish', 'budget', 'security')),
  body       TEXT NOT NULL,
  status     INTEGER,
  error      TEXT,
  at         TEXT NOT NULL DEFAULT (datetime('now')),
  org_id     TEXT NOT NULL DEFAULT 'org_owner',
  tries      INTEGER NOT NULL DEFAULT 0
);
INSERT INTO alert_outbox_next (ref, kind, body, status, error, at, org_id, tries)
  SELECT ref, kind, body, status, error, at, org_id, tries FROM alert_outbox;
DROP TABLE alert_outbox;
ALTER TABLE alert_outbox_next RENAME TO alert_outbox;
CREATE INDEX idx_alert_outbox_at ON alert_outbox (at);
