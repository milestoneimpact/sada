-- ── المرحلةُ ٢ من خارطة الطريق الثانية (D-270) ────────────────────────
--
-- ١ · `alert_outbox.tries`: كانت القناةُ تردّ 5xx فيُكتب الرمزُ ولا يُعاد
-- أبدا، خلافا لما يعد به تعليقُ `alertTick`. العدُّ هنا يجعل الإعادةَ
-- محدودةً بثلاث، لا صفرا ولا بلا سقف.
ALTER TABLE alert_outbox ADD COLUMN tries INTEGER NOT NULL DEFAULT 0;

-- ٢ · حجزٌ قبل دفع التحليل (كما `media_claims` للصور — D-068): رسالتان
-- للمصدر نفسِه (مسحٌ مرّتين، أو يدٌ وآليّ) كانتا تدفعان لـ Anthropic
-- مرّتين، و`content_items` بلا قيدٍ على (المصدر، البصمة).
-- والحجزُ بالمصدر وحدَه: بصمةٌ جديدةٌ تأخذ الحجزَ من القديمة بعد أن تشيخ.
CREATE TABLE analysis_claims (
  source_id  TEXT PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  claimed_at TEXT NOT NULL DEFAULT (datetime('now')),
  org_id     TEXT NOT NULL DEFAULT 'org_owner'
);
