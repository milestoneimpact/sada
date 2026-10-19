-- أساسُ تعدّد المستأجرين (D-224) — **المرحلةُ الأولى من خطّة صدى متعدّدة المستأجرين**.
--
-- كان كلُّ صفٍّ في القاعدة لمالكٍ واحدٍ ضمنًا: لا عمودَ يقول لمن هو. والمنصّةُ
-- التي تخدم جهاتٍ كثيرةً تحتاج أن يقول كلُّ صفٍّ ذلك صراحةً، **وإلّا فالعزلُ
-- وعدٌ في الشيفرة لا قيدٌ في البيانات**.
--
-- مستويان: **المنظّمة** وحدةُ العزل والفوترة، و**العلامة** وحدةُ العمل اليوميّ
-- تحتها. وكلُّ ما في القاعدة اليوم يُنسَب إلى منظّمةٍ واحدةٍ وعلامةٍ واحدة هما
-- المالكُ الحاليّ، **فلا يتغيّر شيءٌ يراه**.
--
-- والعمودان يُضافان بلا `REFERENCES`: SQLite يرفض إضافةَ عمودٍ مرجعيٍّ بقيمةٍ
-- افتراضيّةٍ غير فارغة. والقيدُ الفعليّ حارسُ `npm run tenancy` وطبقةُ الاستعلام.
--
-- **ولا تُمَسّ** جداولُ الهويّة (`passkeys` · `totp` · `recovery_codes`): هي
-- للمستخدم لا للمنظّمة، وتُبنى في المرحلة الثانية. ولا `heartbeats` ولا
-- `auth_attempts`: هما للمنصّة كلّها.

CREATE TABLE orgs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'individual'
    CHECK (kind IN ('individual', 'team', 'agency', 'enterprise')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE brands (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_brands_org ON brands (org_id);

-- المالكُ الحاليّ: منظّمتُه الأولى وعلامتُه الأولى. والمعرّفان ثابتان لأنّهما
-- القيمةُ الافتراضيّةُ في كلّ عمودٍ أدناه.
INSERT INTO orgs (id, name, kind) VALUES ('org_owner', 'منظّمتي', 'individual');
INSERT INTO brands (id, org_id, name) VALUES ('brand_owner', 'org_owner', 'علامتي');

-- المنظّمةُ على كلّ جدول عمل.
ALTER TABLE accounts ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_owner';
ALTER TABLE tokens ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_owner';
ALTER TABLE sources ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_owner';
ALTER TABLE content_items ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_owner';
ALTER TABLE plans ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_owner';
ALTER TABLE posts ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_owner';
ALTER TABLE publish_attempts ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_owner';
ALTER TABLE metrics ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_owner';
ALTER TABLE promotion_suggestions ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_owner';
ALTER TABLE settings ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_owner';
ALTER TABLE providers ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_owner';
ALTER TABLE task_routes ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_owner';
ALTER TABLE cost_ledger ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_owner';
ALTER TABLE audit_log ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_owner';
ALTER TABLE reports ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_owner';
ALTER TABLE token_alerts ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_owner';
ALTER TABLE media_claims ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_owner';
ALTER TABLE alert_outbox ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_owner';
ALTER TABLE oauth_apps ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_owner';
ALTER TABLE uploads ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_owner';
ALTER TABLE media ADD COLUMN org_id TEXT NOT NULL DEFAULT 'org_owner';

-- والعلامةُ على ما يُعمَل فيه لعلامةٍ بعينها.
ALTER TABLE accounts ADD COLUMN brand_id TEXT NOT NULL DEFAULT 'brand_owner';
ALTER TABLE sources ADD COLUMN brand_id TEXT NOT NULL DEFAULT 'brand_owner';
ALTER TABLE content_items ADD COLUMN brand_id TEXT NOT NULL DEFAULT 'brand_owner';
ALTER TABLE plans ADD COLUMN brand_id TEXT NOT NULL DEFAULT 'brand_owner';
ALTER TABLE posts ADD COLUMN brand_id TEXT NOT NULL DEFAULT 'brand_owner';
ALTER TABLE reports ADD COLUMN brand_id TEXT NOT NULL DEFAULT 'brand_owner';
ALTER TABLE uploads ADD COLUMN brand_id TEXT NOT NULL DEFAULT 'brand_owner';
ALTER TABLE media ADD COLUMN brand_id TEXT NOT NULL DEFAULT 'brand_owner';

-- فهارسُ لأكثر ما يُسأل عنه بالمنظّمة والعلامة.
CREATE INDEX idx_accounts_org ON accounts (org_id, brand_id);
CREATE INDEX idx_posts_org ON posts (org_id, brand_id, status);
CREATE INDEX idx_media_org ON media (org_id, brand_id);
CREATE INDEX idx_cost_ledger_org ON cost_ledger (org_id, at);
CREATE INDEX idx_audit_log_org ON audit_log (org_id);
