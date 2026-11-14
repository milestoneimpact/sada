-- سلسلةُ المفاتيح لكلّ مهمّة (D-348 · D-349) — ترتيبُ المزوّدين الذين تُجرَّب بهم المهمّة، وحالُ كلّ مفتاح.
--
-- `chain`: مصفوفةُ JSON بأسماء المزوّدين بعد الأوّل (`provider`)، بترتيبها. وفراغُها: الأوّلُ وحدَه كما كان.
-- `order_mode`: `mine` (بالترتيب المكتوب) أو `cheap` (الأرخصُ أوّلًا بسعر المزوّد المحفوظ). وفراغُه: افتراضُ المهمّة في الشيفرة.
-- `provider_health`: مفتاحٌ تعذّر يُتخطّى إلى `down_until` بسببه — فلا يُجرَّب في كلّ نداءٍ من جديد.
--
-- **إضافيٌّ خالص**: عمودان يقبلان الفراغ وجدولٌ جديد، والشيفرةُ تقرأ كلًّا منها بـ`catch` — فقاعدةٌ لم تُرحَّل تعمل بمزوّدها الأوّل وحدَه.
ALTER TABLE task_routes ADD COLUMN chain TEXT;
ALTER TABLE task_routes ADD COLUMN order_mode TEXT CHECK (order_mode IS NULL OR order_mode IN ('mine', 'cheap'));

CREATE TABLE provider_health (
  org_id     TEXT NOT NULL DEFAULT 'org_owner',
  provider   TEXT NOT NULL,
  -- key: مفتاحٌ مرفوض · limit: حدُّ المزوّد · busy: انشغالٌ أو تعطّل · cap: سقفُه اليوميّ · nokey: لا مفتاح
  why        TEXT NOT NULL CHECK (why IN ('key', 'limit', 'busy', 'cap', 'nokey')),
  down_until TEXT NOT NULL,
  detail     TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org_id, provider)
);
