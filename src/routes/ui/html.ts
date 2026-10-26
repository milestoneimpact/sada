/**
 * قالبُ `html` — **التهريبُ هو الأصل، والخامُ استثناءٌ يُسمَّى** (D-281).
 *
 * كانت كلُّ شاشةٍ قالبًا نصّيًّا عاديًّا يُكتب فيه `${escapeHtml(x)}` يدًا، **وما نُسي
 * تهريبُه عمل عملًا صحيحًا فلا يلحظ أحدٌ نقصَه** — وهي علّةُ D-019 نفسُها: حارسٌ يُنسى
 * نسخُه. فيُقلَب الافتراض: كلُّ قيمةٍ تُقحَم في `html\`…\`` تُهرَّب، إلّا ما كان
 * **`Html`** — أي خرج من هذا القالب نفسِه أو مرّ بـ`raw()` عن قصد.
 *
 * **والوسمُ كائنٌ لا نصّ**: النصُّ قيمةٌ أوّليّةٌ لا تحمل علامةً عند التشغيل، وأيُّ سجلٍّ
 * يحفظ «ما وُثق به» بالمطابقة يُمرّر نصَّ مستخدمٍ طابق جزءًا موثوقًا، ويشيخ ويُهرِّب ما وُثق
 * به. فـ`Html` صنفٌ يحمل النصَّ في `value`، والقالبُ يسأل `instanceof` لا غير. وما يخرج إلى
 * وحدةٍ لم تُحوَّل بعدُ (تستقبل `string`) يُعطى `.value` عند الحدّ.
 *
 * والمخرَجُ **بايتًا بايتًا** ما كان يُخرجه القالبُ العاديُّ مع `escapeHtml`: الأرقامُ كما هي،
 * و`null`/`undefined` فراغ، والمصفوفةُ تُضَمّ بلا فاصل.
 *
 * ‏**ولا يستورد إلّا `escape.ts`**: ما لا يستورد لا يدخل حلقة (D-160).
 */
import { escapeHtml } from './escape'

/** نصٌّ يُوثَق بأنّه HTML سليم — لا يُبنى إلّا هنا: من `html` أو `raw` أو `join`. */
export class Html {
  constructor(readonly value: string) {
    Object.freeze(this)
  }
  toString(): string {
    return this.value
  }
}

/** ما يُقحَم في القالب: نصٌّ يُهرَّب، أو `Html` يمرّ، أو رقم، أو فراغ، أو مصفوفةٌ من ذلك. */
export type HtmlValue = Html | string | number | null | undefined | readonly HtmlValue[]

function render(v: HtmlValue): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Html) return v.value
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return escapeHtml(v)
  return v.map(render).join('')
}

/** القالب: الأجزاءُ الثابتة تمرّ، والمقحَماتُ تُهرَّب إلّا ما كان `Html`. */
export function html(strings: TemplateStringsArray, ...values: readonly HtmlValue[]): Html {
  let out = strings[0] ?? ''
  for (let i = 0; i < values.length; i += 1) out += render(values[i]) + (strings[i + 1] ?? '')
  return new Html(out)
}

/**
 * `raw` — **يُسمَح به في موضعين لا ثالثَ لهما**:
 *
 * ١ · ثابتٌ مكتوبٌ في الشيفرة (رمزُ SVG، وسمٌ ثابت) لا يحمل شيئًا من المالك ولا من الشبكة.
 * ٢ · مخرَجُ دالّةٍ ترسم HTML ولم تُحوَّل بعدُ إلى هذا القالب — عند الحدّ بين الوحدتين،
 *     **وبتعليقٍ يسمّي المصدر**، حتى يزول حين تُحوَّل الدالّة (سقّاطةُ `audit_html`).
 *
 * وما جاء من قاعدةٍ أو طلبٍ أو مستخدِمٍ **لا يمرّ من هنا أبدًا**.
 */
export function raw(s: string): Html {
  return new Html(s)
}

/** ضمُّ أجزاءٍ موسومة — والفاصلُ موسومٌ كذلك، أو فراغ. */
export function join(parts: readonly Html[], sep: Html | '' = ''): Html {
  return new Html(parts.map((p) => p.value).join(sep === '' ? '' : sep.value))
}
