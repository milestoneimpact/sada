-- «حزمةُ المحتوى»: المراجعةُ المتعثّرة تُعاد، والتغييرُ القديم يُطوى بأحدثَ منه (D-373).
--
-- `package_revisions.attempts` كم مرّةً حاولنا قراءةَ الالتزام، و`retryable` هل العطلُ عابرٌ (مهلة، 5xx، 429) فيُعاد في
-- الويب هوك أو الفحص الساعيّ التالي، أم دائمٌ (401، 404، ملفٌّ تالف) فيبقى سببُه ولا يُعاد.
-- `package_changes.superseded_by` المراجعةُ الأحدثُ التي مسّت المنشورَ نفسَه بالنوع نفسِه، فلا يكتب القديمُ فوقها.
--
-- **إضافيٌّ خالص**: أعمدةٌ بقيمٍ افتراضيّة أو تقبل الفراغ، ولا يتغيّر عمودٌ قائم.
ALTER TABLE package_revisions ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE package_revisions ADD COLUMN retryable INTEGER NOT NULL DEFAULT 0;
ALTER TABLE package_changes ADD COLUMN superseded_by TEXT;
-- `claimed_at` متى حجز نداءٌ الصفَّ آخرَ مرّة: التعثّرُ يُقاس منه لا من `created_at` الذي يُحفظ للترتيب.
ALTER TABLE package_revisions ADD COLUMN claimed_at TEXT;
