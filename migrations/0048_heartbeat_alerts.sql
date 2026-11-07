-- «نبضٌ تأخّر» في قناة التنبيهات (D-320).
--
-- ## ما كان
--
-- نبضُ الدورات (D-158) يُحكَم عليه حين يفتح المالكُ اللوحة وحدَها: «إرسال المجدول» لم يدُر منذ ساعة، أو طابورُ النشر لم
-- يأخذ ما سُلّم إليه — ولا يخرج من ذلك شيءٌ إلى قناته، لأنّ `alert_outbox.kind` مقيَّدٌ بأربعة.
--
-- ## ما صار
--
-- النوعُ الخامس `heartbeat`: تكتبه دورةُ التنبيهات الساعيّة حين يتأخّر نبضُ الإرسال أو التجديد أو مستهلكِ النشر، مرّةً لكلّ
-- تأخّر (`ref` من آخر نبضٍ رآه، فلا يُعاد كلَّ ساعة). **وما يقف معه Cron كلُّه لا يقوله هذا**: ذاك لمراقبٍ من خارج
-- Cloudflare على `/pulse` (M-47).
--
-- ## ولماذا إعادةُ بناء
--
-- كما في 0045: قيدُ `CHECK` لا يُعدَّل إلّا بإعادة البناء، **و`alert_outbox` بلا أبناء** (لا مفتاحَ أجنبيًّا يشير إليه، ولا
-- محفّزَ عليه)، فإسقاطُه لا يُطلق محوًا على جدولٍ آخر (D-316 · `npm run migrations`). والصفوفُ تُنسَخ بأعمدتها الثمانية.
CREATE TABLE alert_outbox_next (
  ref        TEXT PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('token', 'publish', 'budget', 'security', 'heartbeat')),
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
