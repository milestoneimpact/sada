/**
 * جُمل الخطّة كما تُقرأ في الإشعار (D-282) — **نصٌّ لا HTML**، في موضع واحد يُختبَر وحده.
 *
 * الإشعار يقول ما وقع بعدده وكلفته: كم بندًا، وما أُسقط ولماذا، وكم دُفع في كم نداء، وما سيُكتب ويُرسم قبل «ابدأ».
 * و«وحدة» لا «رمز» (D-155)، وصفر مع وحدات ليس مجّانًا بل سعر لم يُضبط (D-008).
 */
import { counted, NOUNS, money } from '../format'
import { SPAN_LABEL, type PlanSpan } from './prompt'
import type { PlanOutcome } from './job'

export function sayPlanned(outcome: Extract<PlanOutcome, { kind: 'planned' }>, span: PlanSpan, estimate: string): string {
  const dropped = outcome.dropped === 0 ? '' : ' (وأُسقط ' + outcome.dropped + ': ' + outcome.droppedWhy + ')'
  const cost = outcome.cost === 0 && outcome.units > 0
    ? 'و' + outcome.units + ' وحدةً بلا سعر مضبوط للمزوّد — سُجّلت صفرا موسوما'
    : 'الكلفة ' + money(outcome.cost) + (outcome.calls > 1 ? ' في ' + outcome.calls + ' نداءين' : '')
  return 'خطّة ' + SPAN_LABEL[span] + ' يبدأ ' + outcome.week + ': ' + outcome.items + ' بندا' + dropped + '، ' + cost + '. وقبل «ابدأ»: ' + estimate + '.'
}

export function sayUnlinked(names: readonly string[]): string {
  return 'لا حسابَ مربوطًا على ' + names.join(' و') + ' — اربطه أوّلًا أو أزل القناة من الخطّة.'
}

/** «ابدأ»: كم تُكتب، وأمع صورها، وكم بند مقطع ينتظر مقطعًا يرفعه المالك. */
export function sayStarted(n: number, images: boolean, clips: number): string {
  const wait = clips === 0 ? '' : ' و' + clips + (clips === 1 ? ' بندُ مقطعٍ ينتظر' : ' بنودُ مقاطعَ تنتظر') + ' مقطعًا ترفعه قبل الجدولة.'
  return 'بدأ العمل: ' + n + (n === 1 ? ' مسوّدة تُكتب' : ' مسوّدات تُكتب') + ' في الخلفيّة' + (images ? ' مع صورها' : '')
    + '، وتظهر في «تنتظر قرارك» خلال دقائق.' + wait + ' ولا يُنشر منها شيءٌ قبل اعتمادك.'
}

/** «اعتمد الخطّة كاملة»: العدد، وأنّ شيئًا لا يُنشر حتّى يُجدوَل، والمتعثّر بسببه. */
export function sayApprovedAll(done: number, failed: readonly string[]): string {
  if (done === 0 && failed.length === 0) return 'لا مسوّدةَ من هذه الخطّة تنتظر قرارك.'
  if (failed.length === 0) return 'اعتُمدت ' + counted(done, NOUNS.draft) + ' من الخطّة كما كُتبت — ولا يُنشر منها شيءٌ حتّى تضغط «جدول المعتمَد».'
  return 'اعتُمدت ' + done + '، وتعثّرت ' + failed.length + ': ' + failed.slice(0, 3).join(' · ')
}
