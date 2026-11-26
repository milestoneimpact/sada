-- إعادةُ رفع الملفّ نفسِه تُرى في سجلّ الاستيرادات (D-406).
--
-- ## ما يُضاف (إضافيٌّ خالص)
--
-- - `import_jobs.seen_count`: كم مرّةً رُفعت هذه البصمةُ من المصدر نفسِه. القيدُ `(org_id, source_kind, content_hash)`
--   يمنع صفًّا ثانيًا، فكانت إعادةُ الرفع بلا تغيير لا تترك أثرًا.
-- - `import_jobs.last_seen_at`: آخرُ مرّةٍ رُفعت فيها، والسجلُّ يُرتَّب بها.
--
-- يُطبَّق قبل نشر الشيفرة: `seatPlan` يكتب العمودين حين لا يتغيّر شيء، و`readImports` يقرأهما.

ALTER TABLE import_jobs ADD COLUMN seen_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE import_jobs ADD COLUMN last_seen_at TEXT;
