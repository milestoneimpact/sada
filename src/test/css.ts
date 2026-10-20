/**
 * ورقةُ الأنماط مقروءةً قواعدَ لا نصًّا (N-13 · D-165). للاختبار وحدَه، ولا
 * تُستورَد من شيفرة Worker.
 *
 * كانت اختباراتُ الورقة تسأل النصَّ: «أفيه هذا المقتطَف؟». **فتعليقٌ يُضاف
 * أو سطرٌ يُعاد لفُّه يُسقطها والـCSS لم يتغيّر، وقاعدةٌ تخرج من كتلة
 * الوسائط أو قائمةٌ لاحقةٌ تغلب تجتازها خضراء** — والمقتطَفُ ما زال في
 * موضعه. فهنا تُحلَّل الورقةُ قواعدَ، ويُسأل المحدّدُ في سياقه عن قيمته.
 *
 * ## وهذا ليس `getComputedStyle`
 *
 * `rule(sel, at)` تعطي القيمَ **المعلنة** لهذا المحدّد بعينه في هذا السياق،
 * مدموجةً بترتيب المصدر: الأخيرُ يغلب، و`!important` يثبت أمام ما بعده.
 * **ولا خصوصيّةَ بين محدّدين مختلفين** (المحدّدُ الأثقل في قاعدةٍ أخرى لا
 * يُرى من سؤال الأخفّ)، ولا حلَّ لـ var()، ولا وراثة، ولا تقييمَ لشرط
 * الوسائط. **والمحسوبُ يقيسه `scripts/snapshot_styles` في المتصفّح** (D-148)،
 * ويبقى حَكَمَ إعادة الترتيب.
 *
 * ## وما يُطبَّع — فلا يُسقط الاختبارَ فراغٌ
 *
 * | ما يُكتب | ما يُقرأ |
 * |---|---|
 * | الفراغُ المتتالي والسطرُ الجديد | فراغٌ واحد |
 * | الفراغُ حول الفاصلة، وحول «!» في `!important` | يُحذف |
 * | الفراغُ حول «>» و«+» و«~» في المحدّد | يُحذف |
 * | الفراغُ بعد اسم الكتلة وداخل قوسَي شرطها | يُحذف: «@media (x: 1)» هي «@media(x:1)» |
 * | ما بين علامتَي اقتباس | **كما هو** |
 *
 * والكتلُ المتداخلة سياقُها أسماؤها مضمومةً بفراغ، من الخارج إلى الداخل.
 * وكتلةٌ تحمل تصريحاتٍ لا قواعد (`@page` وأخواتُها) تُقرأ قاعدةً محدّدُها
 * اسمُها.
 *
 * ## ويرمي ولا يسكت
 *
 * قوسٌ ناقصٌ لا يمسكه شيءٌ آخرُ في `npm run ci`، **والمتصفّحُ الحديث يقرأ
 * ما بعده قواعدَ متداخلةً بلا خطأ** — فتذوب القواعدُ التالية صامتة. فالمحلِّلُ
 * يرمي بخطأٍ يسمّي القاعدة: كتلةٌ داخل قاعدة، وقوسُ إغلاقٍ بلا فتح، وكتلٌ
 * لم تُغلَق، وتصريحٌ بلا نقطتين، ومحدّدٌ فارغ، ونصٌّ خارج أيّ قاعدة، وتعليقٌ
 * أو اقتباسٌ لم يُغلَق. **وتداخلُ CSS مرفوضٌ هنا بقصد**: إن اعتُمد يومًا
 * بقرارٍ وُسِّع المحلِّل.
 *
 * ولا اسمَ رمزٍ ولا عيّنةَ أنماطٍ في هذا الملفّ: `audit_tokens` يقرؤه
 * بوصفه شيفرةً لا اختبارًا، فعيّنةٌ هنا تُعدّ استعمالًا يُحيي رمزًا ميّتًا.
 * والعيّناتُ في `css.test.ts`.
 */

export interface Rule {
  /** السياق: '' للمستوى الأعلى، وإلّا أسماءُ الكتل مطبَّعةً مضمومةً بفراغ. */
  readonly at: string
  readonly selectors: readonly string[]
  /** التصريحاتُ بترتيب سريانها داخل القاعدة: المكرَّرُ يُحذف ثمّ يُعاد في موضعه الأخير. */
  readonly decls: Readonly<Record<string, string>>
}

export interface Decl {
  readonly at: string
  readonly selectors: readonly string[]
  readonly prop: string
  readonly value: string
}

/**
 * يطوي الفراغَ خارج الاقتباس، ويحذفه كلَّه حول ما في `tight`.
 * والاقتباسُ يُنسَخ حرفًا: `content:' ('` تبقى فراغًا ثمّ قوسًا.
 */
function squeeze(s: string, tight: string): string {
  let out = ''
  let quote = ''
  let gap = false
  for (const c of s) {
    if (quote !== '') {
      out += c
      if (c === quote) quote = ''
      continue
    }
    if (/\s/.test(c)) {
      gap = out !== ''
      continue
    }
    if (gap && !tight.includes(c) && !tight.includes(out.at(-1) ?? '')) out += ' '
    gap = false
    if (c === '"' || c === "'") quote = c
    out += c
  }
  return out
}

const valueKey = (s: string): string => squeeze(s, ',!')
const selKey = (s: string): string => squeeze(s, ',>+~')
const atKey = (s: string): string =>
  squeeze(s, ',<>=')
    .replace(/(@[\w-]+) \(/g, '$1(')
    .replace(/\( /g, '(')
    .replace(/ \)/g, ')')
    .replace(/ ?: ?/g, ':')

/** تقسيمٌ على الفاصل في العمق صفر: لا داخل () ولا [] ولا اقتباس. */
function splitTop(s: string, sep: string): string[] {
  const out: string[] = []
  let depth = 0
  let quote = ''
  let cur = ''
  for (const c of s) {
    if (quote !== '') {
      if (c === quote) quote = ''
    } else if (c === '"' || c === "'") {
      quote = c
    } else if (c === '(' || c === '[') {
      depth += 1
    } else if (c === ')' || c === ']') {
      depth -= 1
    } else if (c === sep && depth === 0) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  out.push(cur)
  return out.filter((x) => x.trim() !== '')
}

/** كتلٌ تحمل تصريحاتٍ لا قواعد — فتُقرأ قاعدةً محدّدُها اسمُها. */
const DECL_AT = /^@(page|font-face|property|counter-style)\b/

const isGroup = (head: string): boolean => head.startsWith('@') && !DECL_AT.test(head)

const important = (v: string | undefined): boolean => v !== undefined && /!important$/i.test(v)

/** يدمج تصريحًا في ما قبله: الأخيرُ يغلب إلّا أن يثبت ما قبله بـ`!important`. */
function merge(into: Record<string, string>, prop: string, value: string): void {
  if (important(into[prop]) && !important(value)) return
  delete into[prop]
  into[prop] = value
}

const excerpt = (s: string): string => {
  const one = squeeze(s, '')
  return one.length > 60 ? `${one.slice(0, 57)}…` : one
}

/** قواعدُ الورقة بترتيب المصدر. يرمي بخطأٍ عربيٍّ يسمّي موضعَ العيب. */
export function parseCss(src: string): Rule[] {
  const out: Rule[] = []
  const stack: string[] = []
  const top = (): string | undefined => stack.at(-1)
  let buf = ''
  let quote = ''
  let last = '(أوّل الورقة)'

  const close = (head: string): void => {
    const context = stack.map(atKey).join(' ')
    if (isGroup(head)) {
      if (buf.trim() !== '') throw new Error(`نصّ بلا قاعدة داخل «${atKey(head)}»: «${excerpt(buf)}»`)
      return
    }
    const decls: Record<string, string> = {}
    for (const d of splitTop(buf, ';')) {
      const i = d.indexOf(':')
      if (i <= 0) throw new Error(`تصريح بلا نقطتين في «${excerpt(head)}»: «${excerpt(d)}»`)
      merge(decls, d.slice(0, i).trim(), valueKey(d.slice(i + 1)))
    }
    const selectors = head.startsWith('@') ? [atKey(head)] : splitTop(head, ',').map(selKey)
    out.push({ at: context, selectors, decls })
    last = head
  }

  for (let i = 0; i < src.length; i++) {
    const c = src[i] as string
    if (quote !== '') {
      if (c === quote) quote = ''
      buf += c
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2)
      if (end === -1) throw new Error(`تعليق لم يُغلَق بعد «${excerpt(last)}»`)
      buf += ' '
      i = end + 1
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      buf += c
      continue
    }
    if (c === '{') {
      const holder = top()
      const head = buf.trim()
      if (holder !== undefined && !isGroup(holder)) {
        throw new Error(`كتلة داخل قاعدة «${excerpt(holder)}»: قوس لم يُغلَق قبل «${excerpt(head)}»`)
      }
      if (head === '') throw new Error(`قاعدة بلا محدّد بعد «${excerpt(last)}»`)
      if (!head.startsWith('@') && head.includes(';')) {
        throw new Error(`محدّد فيه «;» فيُسقطه المتصفّح: «${excerpt(head)}»`)
      }
      stack.push(head)
      buf = ''
      continue
    }
    if (c === '}') {
      const head = stack.pop()
      if (head === undefined) throw new Error(`قوس إغلاق بلا فتح بعد «${excerpt(last)}»`)
      close(head)
      buf = ''
      continue
    }
    // ‏«@import …;» وأخواتُها في المستوى الأعلى أو داخل كتلة: عبارةٌ لا قاعدة
    if (c === ';' && buf.trim().startsWith('@')) {
      const holder = top()
      if (holder === undefined || isGroup(holder)) {
        buf = ''
        continue
      }
    }
    buf += c
  }
  if (quote !== '') throw new Error(`اقتباس لم يُغلَق بعد «${excerpt(last)}»`)
  const open = top()
  if (open !== undefined) throw new Error(`${stack.length} كتلةً لم تُغلَق، آخرُها «${excerpt(open)}»`)
  if (buf.trim() !== '') throw new Error(`نصّ بعد آخر قاعدة: «${excerpt(buf)}»`)
  return out
}

export interface Sheet {
  /** كلُّ القواعد بترتيب المصدر. */
  rules(): readonly Rule[]
  /**
   * القيمُ المعلنةُ لهذا المحدّد بعينه في سياقٍ أو أكثر، مدموجةً بترتيب
   * المصدر. '' = المستوى الأعلى. وسياقان معًا يعنيان أنّ الشرطين صادقان:
   * `['', '@media print']` = الطباعةُ فوق ما في المستوى الأعلى.
   * وترتيبُ المفاتيح ترتيبُ السريان، فيُعرف منه تقديمُ المختصَر على المفصَّل.
   */
  rule(selector: string, at?: string | readonly string[]): Record<string, string>
  /** السياقاتُ التي يُعلَن فيها المحدّد بلا تكرار — و[] إن لم يُعلَن في موضع. */
  where(selector: string): string[]
  /** كلُّ تصريحٍ في الورقة، للفحص الشامل: «لا قيمةَ فيها كذا في موضع». */
  decls(): Decl[]
}

/**
 * الورقةُ للسؤال. **ولا تُحلَّل حتى تُسأل**: قوسٌ ناقصٌ يُسقط كلَّ اختبارٍ
 * سأل باسمه وبرسالة المحلِّل، ولا يُسقط الملفَّ كلَّه عند التحميل فتضيع
 * معه الاختباراتُ التي لا شأنَ لها بالورقة.
 */
export function sheet(src: string): Sheet {
  let parsed: Rule[] | Error | undefined
  const rules = (): Rule[] => {
    if (parsed === undefined) {
      try {
        parsed = parseCss(src)
      } catch (e) {
        parsed = e instanceof Error ? e : new Error(String(e))
      }
    }
    if (parsed instanceof Error) throw parsed
    return parsed
  }
  return {
    rules,
    rule(selector, at = '') {
      const s = selKey(selector)
      const ats = (typeof at === 'string' ? [at] : at).map(atKey)
      const out: Record<string, string> = {}
      for (const r of rules()) {
        if (!ats.includes(r.at) || !r.selectors.includes(s)) continue
        for (const [p, v] of Object.entries(r.decls)) merge(out, p, v)
      }
      return out
    },
    where(selector) {
      const s = selKey(selector)
      return [...new Set(rules().filter((r) => r.selectors.includes(s)).map((r) => r.at))]
    },
    decls() {
      return rules().flatMap((r) =>
        Object.entries(r.decls).map(([prop, value]) => ({ at: r.at, selectors: r.selectors, prop, value })))
    },
  }
}
