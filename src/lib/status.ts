/**
 * **حالُ المنشور — مصدرٌ واحد** (D-340، المرحلةُ الأولى من `docs/FLOW-PLAN.md`).
 *
 * كانت كلُّ شاشةٍ تعرّف نصَّ الحال ولونَها بيدها: «تنتظر قرارك» في المنشورات و«تنتظر اعتمادك» في الخطّة و«تنتظر الاعتماد» في عرض
 * الطباعة، و«مجدولة» كهرمانيّةً هنا وخضراءَ هناك. فالمالكُ يقرأ المنشورَ نفسَه بثلاث حالاتٍ في ثلاث شاشات.
 *
 * - **النصُّ والنغمةُ والعلامةُ من هنا وحدَه**، وكلُّ شارةِ حالٍ في اللوحة تقرؤه. والحارسُ `status.test.ts` يفشل إن عُرّفت خريطةٌ ثانية.
 * - **النغمةُ تقول ما يلزم المالك**: الكهرمانيُّ «ينتظرك»، والأخضرُ «يمضي وحدَه أو تمّ»، والأحمرُ «انكسر»، والمحايدُ «انتهى بلا أثر».
 * - **ما ليس هنا عمدًا**: ترميزُ الرسوم (لغةُ رسمٍ تفرّق المجدولَ عن المنشور)، والجملُ
 *   التي تحكي ما وقع («اعتُمدت من قبل»، «اعتمدتَها بعد تعديل») — تلك أخبارٌ لا شارات.
 */
export type StatusTone = 'ok' | 'warn' | 'bad' | 'idle'

export interface StatusFace {
  /** النصُّ على الشارة — بصيغة «المنشورات» (مؤنّث). */
  readonly label: string
  readonly tone: StatusTone
  /** علامةٌ تُقرأ بلا لون (D-198): الحالُ لا تُعرَف باللون وحدَه. */
  readonly glyph: string
}

export const POST_STATUS: Readonly<Record<string, StatusFace>> = {
  draft: { label: 'تنتظر قرارك', tone: 'warn', glyph: '○' },
  approved: { label: 'معتمَدة بلا موعد', tone: 'warn', glyph: '●' },
  edited: { label: 'معتمَدة بعد تعديل', tone: 'warn', glyph: '●' },
  queued: { label: 'مجدولة', tone: 'ok', glyph: '◔' },
  published: { label: 'نُشرت', tone: 'ok', glyph: '✓' },
  failed: { label: 'فشل النشر', tone: 'bad', glyph: '▲' },
  rejected: { label: 'مرفوضة', tone: 'idle', glyph: '✕' },
}

/** وجهُ الحال — وما لا يُعرَف محايدٌ باسمه لا أحمر: حالٌ جديدةٌ في القاعدة لا تُقرأ عطلًا. */
export function postStatus(status: string): StatusFace {
  return POST_STATUS[status] ?? { label: status, tone: 'idle', glyph: '○' }
}
