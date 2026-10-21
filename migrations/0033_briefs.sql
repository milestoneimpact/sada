-- موجزُ العميل (D-257 · AGENCY-PLAN و-٢).
--
-- ماذا يريد العميل، ولمن، وبأيّ نبرة، وعلى أيّ قنوات، وكم مرّةً في الأسبوع، وما لا يُقال.
-- **صفٌّ لكلّ منظّمة**: يقرؤه مخطِّطُ الخطّة وكاتبُ المسوّدة، فيكتب صدى بصوت العميل لا بصوتٍ عامّ.
-- والحقولُ نصوصٌ يكتبها المالك، وتُقصّ عند الكتابة (`lib/brief.ts`)، ولا شيءَ فيها يُنفَّذ.
CREATE TABLE briefs (
  org_id     TEXT PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  goal       TEXT NOT NULL DEFAULT '',
  audience   TEXT NOT NULL DEFAULT '',
  tone       TEXT NOT NULL DEFAULT '',
  channels   TEXT NOT NULL DEFAULT '',
  per_week   INTEGER NOT NULL DEFAULT 3 CHECK (per_week BETWEEN 0 AND 28),
  avoid      TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
