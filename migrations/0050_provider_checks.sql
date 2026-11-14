-- «حراسةُ المفاتيح» (D-348).
--
-- ## ما كان
--
-- اختبارُ مفتاح المزوّد يكتب «نجح» في `providers.verified_at` وحدَه، ولا يكتب فشلًا ولا زمنَ ردّ ولا تاريخًا. فمفتاحٌ يُرفض
-- غدًا يبقى «اختُبر قبل يوم» حتّى تفشل به مهمّةٌ حقيقيّة: ملفٌّ لا يُحلَّل، أو خطّةٌ لا تُبنى. وهذا ما وقع بـ401 من Anthropic.
--
-- ## ما صار
--
-- `provider_checks`: صفٌّ لكلّ اختبار — يدويٍّ من اللوحة أو يوميٍّ من الدورة — بنتيجته ورمزه وزمنه. منه تُرسَم أعمدةُ
-- «آخر سبعة اختبارات»، ومنه يُشتقّ الإشعار: **آخرُ اختبارٍ لمزوّدٍ مفعَّلٍ فشل** ← إشعارٌ في «ما عليك» يزول بأوّل نجاح.
-- ولا تفصيلَ من جواب المزوّد يُحفظ: نصُّ `detail` من شرحنا نحن (`explain`)، فلا سرَّ ولا نصَّ خارجيًّا في القاعدة.
CREATE TABLE provider_checks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  provider    TEXT NOT NULL,
  ok          INTEGER NOT NULL CHECK (ok IN (0, 1)),
  status      INTEGER,
  ms          INTEGER,
  detail      TEXT NOT NULL,
  source      TEXT NOT NULL CHECK (source IN ('panel', 'daily')),
  at          TEXT NOT NULL DEFAULT (datetime('now')),
  org_id      TEXT NOT NULL DEFAULT 'org_owner'
);
CREATE INDEX idx_provider_checks_recent ON provider_checks (org_id, provider, at);

-- ## والتنبيهُ إلى القناة: النوعُ السادس `provider`
--
-- كما في 0048: قيدُ `CHECK` لا يُعدَّل إلّا بإعادة البناء، و`alert_outbox` بلا أبناء (لا مفتاحَ أجنبيًّا يشير إليه، ولا
-- محفّزَ عليه)، فإسقاطُه لا يمحو جدولًا آخر. والصفوفُ تُنسَخ بأعمدتها الثمانية.
CREATE TABLE alert_outbox_next (
  ref        TEXT PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('token', 'publish', 'budget', 'security', 'heartbeat', 'provider')),
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
