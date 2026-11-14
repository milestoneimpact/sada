-- «رابطُ موافقة العميل» (D-353).
--
-- ## ما كان
--
-- العميلُ يرى الخطّةَ صورًا تُرسَل إليه في محادثة، ويردّ بكلامٍ يُنقل يدًا إلى البطاقات. فلا أثرَ لقراره في صدى، ولا يُعرَف
-- أيُّ منشورٍ وافق عليه وأيُّه طلب تعديلَه.
--
-- ## ما صار
--
-- `review_links`: رابطٌ لخطّةٍ بعينها، **تُحفظ بصمتُه (SHA-256) لا رمزُه** — فمن قرأ القاعدةَ لم يقرأ رابطًا يفتح شيئًا.
-- له مدّة، ويُلغى. و`review_verdicts`: قرارُ العميل على كلّ بند (بصمةُ البند `item_key` كما في المراجعة)، آخرُ قرارٍ يغلب.
-- والعميلُ لا ينشر ولا يعتمد: قرارُه رأيٌ يُرى على البطاقة وفي الإشعارات، والاعتمادُ للمالك.
CREATE TABLE review_links (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL,
  plan_id     TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  revoked_at  TEXT
);
CREATE INDEX idx_review_links_plan ON review_links (org_id, plan_id);

CREATE TABLE review_verdicts (
  link_id     TEXT NOT NULL REFERENCES review_links(id) ON DELETE CASCADE,
  org_id      TEXT NOT NULL,
  plan_id     TEXT NOT NULL,
  item_key    TEXT NOT NULL,
  verdict     TEXT NOT NULL CHECK (verdict IN ('approve', 'changes')),
  note        TEXT NOT NULL DEFAULT '',
  at          TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (link_id, item_key)
);
CREATE INDEX idx_review_verdicts_plan ON review_verdicts (org_id, plan_id, at);
