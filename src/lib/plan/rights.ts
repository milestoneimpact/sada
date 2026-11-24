/**
 * **من يعدّل ماذا، ومتى** (D-383 المرحلة ٧ · DESIGN «التعديل والصلاحيات») — جدولا التصميم كما هما، دالّةً خالصة.
 *
 * - **المرحلة** تُحسب من حال المنشور وموعده: مسوّدة، معتمَد لم يُجدوَل، مجدوَل، آخر 15 دقيقة، منشور.
 * - **الدور** يُقرأ بـ`allows()`: المحرّر يعدّل، والناشر يعتمد ويجدول، والمدير يستورد ويضبط القواعد، والقارئ يعلّق فقط.
 * - **والخادم يسأل `mayDo` قبل كلّ كتابة**، والواجهة تسأله لتخفي الزرّ أو تكتب سببه. فزرٌّ يُخفى ويبقى مساره مفتوحًا لا يقع.
 */
import { allows } from '../access'
import type { Role } from '../ownerEmail'

/** آخرُ ربع ساعةٍ قبل النشر: «أوقف» أو «أجّل» فقط. */
export const FREEZE_MINUTES = 15

/** والمعرّفاتُ غيرُ معرّفات حال المنشور عمدًا: المرحلةُ تُحسب من الحال والموعد معًا. */
export type EditStage = 'draft' | 'approved' | 'scheduled' | 'frozen' | 'posted'

/** ما يُطلب فعلُه على بندٍ أو منشور. */
export type EditAction =
  /** النصّ أو الموعد أو الوسيط */
  | 'edit'
  /** إضافةُ بندٍ أو حذفُه */
  | 'add_remove'
  /** «أوقف» أو «أجّل» */
  | 'pause'
  /** «انسخه مسوّدةً» */
  | 'copy'
  /** «استعد هذه النسخة» */
  | 'restore'
  | 'approve'
  | 'import'
  /** «صحّح المنشور» (D-391): تعديلٌ على LinkedIn، أو ردٌّ تصحيحيّ أو «احذف وأعد النشر» على X — للمنشور وحده */
  | 'correct'

export const STAGE_LABEL: Readonly<Record<EditStage, string>> = {
  draft: 'مسوّدة الخطّة',
  approved: 'معتمَد لم يُجدوَل',
  scheduled: 'مجدوَل',
  frozen: 'آخر 15 دقيقة قبل النشر',
  posted: 'منشور',
}

/** مرحلةُ المنشور من حاله وموعده. وما أُرسل إلى الطابور يُعامَل كآخر ربع ساعة: لا يُستردّ نصُّه. */
export function stageOf(post: { readonly status: string; readonly scheduled_at?: string | null; readonly dispatched_at?: string | null }, now: Date): EditStage {
  if (post.status === 'published') return 'posted'
  if (post.status === 'queued') {
    if (post.dispatched_at) return 'frozen'
    const at = post.scheduled_at ? Date.parse(post.scheduled_at) : NaN
    return Number.isFinite(at) && at - now.getTime() <= FREEZE_MINUTES * 60_000 ? 'frozen' : 'scheduled'
  }
  // ‏و«edited» حالٌ معتمَدةٌ يجدولها `schedulePlan`، فتُعامَل معاملةَ المعتمَد: تعديلُ المحرّر عليها يرجعها «ينتظر الاعتماد»
  if (post.status === 'approved' || post.status === 'edited') return 'approved'
  return 'draft'
}

export type Verdict = { readonly ok: true } | { readonly ok: false; readonly reason: string }

const NO = (reason: string): Verdict => ({ ok: false, reason })
const YES: Verdict = { ok: true }

/** جدولُ المراحل: ما يُعدَّل في كلّ مرحلة. */
function stageAllows(stage: EditStage, action: EditAction): Verdict {
  if (action === 'copy') return stage === 'posted' ? YES : NO('النسخ مسوّدةً للمنشور وحده، وما سواه يُعدَّل في مكانه.')
  if (action === 'correct') return stage === 'posted' ? YES : NO('التصحيحُ للمنشور الذي نُشر وحده، وما سواه يُعدَّل في مكانه.')
  if (action === 'pause') return stage === 'scheduled' || stage === 'frozen' ? YES : NO('لا يُوقف إلّا ما جُدوِل.')
  if (stage === 'posted') return NO('منشورٌ لا يُعدَّل. انسخه مسوّدةً وعدّل النسخة.')
  if (stage === 'frozen') return NO('بقي أقلّ من 15 دقيقة على النشر: أوقفه أو أجّله، ولا تعديل للنصّ.')
  if (action === 'add_remove' && stage !== 'draft') return NO('الإضافة والحذف في مسوّدة الخطّة وحدها.')
  return YES
}

/** جدولُ الأدوار: أدنى دورٍ لكلّ فعل. */
const ROLE_NEED: Readonly<Record<EditAction, Role>> = {
  edit: 'editor',
  add_remove: 'editor',
  restore: 'editor',
  copy: 'editor',
  correct: 'editor',
  pause: 'publisher',
  approve: 'publisher',
  import: 'admin',
}

const ROLE_SAY: Readonly<Record<Role, string>> = {
  viewer: 'القارئ يعلّق فقط ولا يعدّل.',
  editor: 'الاعتماد والجدولة والإيقاف للناشر أو المدير أو المالك.',
  publisher: 'الاستيراد وضبط القواعد للمدير أو المالك.',
  admin: 'هذا للمالك وحده.',
  owner: '',
}

/** أيفعل هذا الدورُ هذا الفعلَ في هذه المرحلة؟ والسببُ بالعربيّة حين لا. */
export function mayDo(role: Role, action: EditAction, stage: EditStage = 'draft'): Verdict {
  if (!allows(role, ROLE_NEED[action])) return NO(ROLE_SAY[role])
  return stageAllows(stage, action)
}

/**
 * ما يقع بعد الحفظ (الجدول الأوّل، العمود الثالث):
 * - `recheck`: مسوّدة، يُعاد الفحص وحده.
 * - `await`: يرجع البند وحده «ينتظر الاعتماد». وهذا لتعديل المحرّر على معتمَد أو مجدوَل، ولكلّ تعديلٍ على معتمَد.
 * - `pull_reapprove`: مجدوَلٌ يُسحب من الطابور ويُعتمد من جديد باسم من عدّله (ناشرٌ فما فوق).
 */
export type AfterSave = 'recheck' | 'await' | 'pull_reapprove'

export function afterSave(role: Role, stage: EditStage): AfterSave {
  if (stage === 'draft') return 'recheck'
  if (stage === 'scheduled' && allows(role, 'publisher')) return 'pull_reapprove'
  return 'await'
}

export const AFTER_SAY: Readonly<Record<AfterSave, string>> = {
  recheck: 'حُفظ، وأُعيد الفحص.',
  await: 'حُفظ، ورجع البند ينتظر الاعتماد.',
  pull_reapprove: 'حُفظ، وسُحب من الطابور واعتُمد من جديد. جدوِله ليعود إلى موعده.',
}

/** رسالةُ التصادم: تعديلٌ متزامن يُكشف ولا يمحو الأوّل. */
export const CONFLICT_SAY = 'عدّله غيرك قبل لحظات، فلم يُحفظ تعديلك حتّى لا يمحو تعديله. افتح النسخة الأحدث وأعد التعديل عليها.'

/** علامةُ البند المعدَّل يدويًّا. */
export const EDITED_MARK = 'عُدِّل في صدى'
