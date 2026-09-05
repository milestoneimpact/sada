-- ── مزوّدون يُضافون من اللوحة ─────────────────────────────────────────
--
-- كان الافتراض «لكلّ مزوّدٍ سائق». والصحيح **لكلّ لهجةٍ سائق**: أكثر
-- مزوّدي الذكاء اليوم يتكلّمون لهجة `chat/completions` المتوافقة مع
-- OpenAI — DeepSeek و Groq و Mistral و OpenRouter و xAI وغيرهم. وسائقٌ
-- واحد يكفيهم. و Anthropic استثناءٌ بواجهتها الخاصّة، لا قاعدة.
--
-- فالجدول يحمل ما يلزم لنداء مزوّدٍ لم نسمع به: لهجتُه وعنوانُه ونموذجُه
-- وسعرُه. ومزوّدٌ يظهر بعد سنة يُضاف بلا نشرٍ ولا شيفرة.

CREATE TABLE providers (
  name        TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  -- اللهجة، لا الشركة. `anthropic` واجهتها الخاصّة، و`openai_compat` هي
  -- ما يتكلّمه الباقون.
  kind        TEXT NOT NULL CHECK (kind IN ('anthropic', 'openai_compat')),
  -- عنوان القاعدة. NULL للمدمَجين — عناوينهم في الشيفرة لا تُبدَّل.
  base_url    TEXT,
  model       TEXT,

  key_enc     TEXT,
  key_iv      TEXT,
  hint        TEXT,
  fingerprint TEXT,

  enabled     INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  daily_cap   REAL,

  -- سعر المليون رمزٍ دخولا وخروجا. NULL = غير مضبوط، فتُسجَّل الكلفة
  -- صفرا **وتُعلَّم** — ولا يُخمَّن رقمٌ يُظنّ حقيقة.
  price_in    REAL,
  price_out   REAL,

  -- مدمَجٌ في الشيفرة: لا يُحذف من اللوحة، ولا يُبدَّل عنوانه
  builtin     INTEGER NOT NULL DEFAULT 0 CHECK (builtin IN (0, 1)),

  verified_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by  TEXT
);

-- ينتقل ما في خزانة 0004 بلا فقد
INSERT INTO providers (name, label, kind, key_enc, key_iv, hint, fingerprint,
                       enabled, daily_cap, builtin, verified_at, created_at, updated_at, updated_by)
SELECT
  provider,
  CASE provider WHEN 'anthropic' THEN 'Anthropic' WHEN 'gemini' THEN 'Gemini' ELSE provider END,
  CASE provider WHEN 'anthropic' THEN 'anthropic' ELSE 'openai_compat' END,
  key_enc, key_iv, hint, fingerprint, enabled, daily_cap, 1,
  verified_at, created_at, updated_at, updated_by
FROM provider_keys;

DROP TABLE provider_keys;

-- المدمَجان يوجدان دائما وإن لم يُضبط لهما مفتاح: اللوحة تعرضهما،
-- والتوجيه يشير إليهما. و OR IGNORE يحفظ ما انتقل من الخزانة أعلاه.
INSERT OR IGNORE INTO providers (name, label, kind, model, price_in, price_out, builtin) VALUES
  ('anthropic', 'Anthropic', 'anthropic', 'claude-opus-5', 5.0, 25.0, 1),
  ('gemini',    'Gemini',    'openai_compat', 'gemini-2.5-flash', NULL, NULL, 1);

-- ولمن انتقل من الخزانة بلا هذه الحقول: تُملأ
UPDATE providers SET base_url = 'https://generativelanguage.googleapis.com/v1beta/openai',
                     model = coalesce(model, 'gemini-2.5-flash')
 WHERE name = 'gemini';
UPDATE providers SET model = coalesce(model, 'claude-opus-5'),
                     price_in = coalesce(price_in, 5.0),
                     price_out = coalesce(price_out, 25.0)
 WHERE name = 'anthropic';

-- ── توجيه المهامّ يصير للمالك ─────────────────────────────────────────
--
-- كان في الشيفرة ثابتا. وصار جدولا: يجرّب المالك الرخيص في الفهم ويُبقي
-- الغالي في الكتابة — بلا نشرٍ ولا شيفرة. والشيفرة تبقى مرجعا للافتراض
-- حين لا صفّ.

CREATE TABLE task_routes (
  task       TEXT PRIMARY KEY,
  provider   TEXT NOT NULL,
  model      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT
);

-- ── توسعة قيد الدفتر ─────────────────────────────────────────────────
--
-- `CHECK (provider IN (...))` كان صحيحا حين كان المزوّدون معدودين في
-- الشيفرة. وصاروا يُضافون من اللوحة، فقائمةٌ مغلقة تمنع تسجيل كلفةِ
-- مزوّدٍ أضافه المالك — **ودفترٌ يرفض قيدا أسوأ من دفترٍ يقبل اسما لم
-- نتوقّعه** (D-008: السجلّ الناقص يُطمئن كذبا).
--
-- والقيد يبقى على ألّا يكون فارغا: اسمٌ فارغ خطأُ برمجةٍ لا اسمُ مزوّد.

CREATE TABLE cost_ledger_new (
  id        TEXT PRIMARY KEY,
  provider  TEXT NOT NULL CHECK (length(provider) > 0),
  operation TEXT NOT NULL,
  units     REAL NOT NULL,
  unit_cost REAL NOT NULL,
  total     REAL NOT NULL,
  currency  TEXT NOT NULL DEFAULT 'USD',
  ref_id    TEXT,
  at        TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO cost_ledger_new SELECT id, provider, operation, units, unit_cost, total, currency, ref_id, at FROM cost_ledger;
DROP TABLE cost_ledger;
ALTER TABLE cost_ledger_new RENAME TO cost_ledger;

CREATE INDEX idx_cost_at       ON cost_ledger (at);
CREATE INDEX idx_cost_provider ON cost_ledger (provider, at);
