/**
 * **«منشورات جديدة»** (D-387 · المرحلة ٢ من ٣): بابٌ واحدٌ يسأل «من أين تأتي المنشورات؟» — ثلاثُ بطاقاتٍ كبيرة، كلٌّ منها
 * جملةٌ تقول ما يفعله الطريق، ومتى يُختار، وما كلفتُه، وزرٌّ واحد. والطرقُ الثلاثةُ قائمةٌ لم تُمسّ: المعالجُ (`/panel/plan/new`)
 * والاستيرادُ (`/panel/plan/import`) والحزمةُ (`/panel/package`) — هنا البابُ وحدَه، وبلا سكربت.
 */
import { pageHead } from './parts'
import { ICON } from './icons'
import { button } from './components/button'
import { cardClass } from './components/card'
import { html, raw, type Html } from './html'

export interface NewView {
  /** حزمةُ GitHub مربوطة: «يكتبها المساعد» يفتح المعالجَ بطلبه صراحةً (D-377)، و«من GitHub» الطريقُ الافتراضيّ. */
  readonly hasPackage: boolean
}

interface Way {
  readonly id: string
  readonly icon: string
  readonly title: string
  readonly what: string
  readonly when: string
  readonly cost: string
  readonly href: string
  readonly label: string
  /** روابطُ ضبطٍ صغيرة تحت الزرّ (D-388): الاستيراداتُ وقواعدُ الجدولة من بطاقة GitHub — وفي الإعدادات «المصادر والقواعد». */
  readonly links?: readonly { readonly href: string; readonly label: string }[]
}

/** الطرقُ الثلاثة كما تُقرأ — والكلفةُ كما تقولها شاشةُ كلّ طريق (D-006 · D-008)، لا وعدٌ جديد. */
export function newWays(hasPackage: boolean): readonly Way[] {
  return [
    {
      id: 'assistant', icon: ICON.plan, title: 'يكتبها المساعد',
      what: 'صدى يقرأ ما حُلّل من مصادرك ويقترح خطّةَ أسبوعٍ أو شهر، ثمّ يكتب كلَّ منشورٍ فيها وتراجعه قبل أن يُنشر شيء.',
      when: 'حين عندك مصادرُ محلَّلة ولا خطّةَ مكتوبة.',
      cost: 'مدفوع: نداءُ تخطيطٍ واحد ثمّ نداءٌ لكلّ منشور، والعددُ والكلفةُ يُعرضان قبل البناء.',
      href: hasPackage ? '/panel/plan/new?way=build' : '/panel/plan/new', label: 'ابنِ لي خطّة',
    },
    {
      id: 'file', icon: ICON.sources, title: 'من ملفّ',
      what: 'جدولُك كما هو: CSV أو Excel أو PDF أو Word، يُقرأ ويُسكَّن بنودًا في مواعيدها، وما لا نصَّ له يُكتب.',
      when: 'حين عندك خطّةٌ جاهزة في ملفّ.',
      cost: 'الجدولُ يُقرأ بلا كلفة، وPDF وWord بنداءٍ واحد؛ وكتابةُ ما لا نصَّ له مدفوعة.',
      href: '/panel/plan/import', label: 'ارفع الملفّ',
    },
    {
      id: 'github', icon: ICON.package, title: 'من GitHub',
      what: 'حزمةُ المحتوى في مستودعك: الخطّةُ والنصوصُ والوسائط تُزامَن نسخةً نسخة، وما تغيّر يهبط في خطّة شهره.',
      when: 'حين تُدار المادّةُ في مستودع ' + (hasPackage ? '— وحزمتُك مربوطة.' : 'ولم تُربط حزمةٌ بعد.'),
      cost: 'المزامنةُ بلا كلفة؛ وما لا نصَّ له يُكتب بنداءٍ لكلّ منشور.',
      href: '/panel/package', label: hasPackage ? 'زامن الحزمة' : 'اربط الحزمة',
      links: [{ href: '/panel/plan/month-template?f=md', label: 'نزّل قالب الشهر القادم' }, { href: '/panel/plan/month-template?f=readme', label: 'README القالب' },
        { href: '/panel/plan/imports', label: 'الاستيرادات' }, { href: '/panel/plan-rules', label: 'قواعد الجدولة' }],
    },
  ]
}

function way(w: Way): Html {
  return html`<li class="${cardClass()} nw-way" id="nw-${w.id}">
    <span class="nw-ico" aria-hidden="true">${raw(w.icon)}</span>
    <h2 class="nw-t">${w.title}</h2>
    <p class="m-0">${w.what}</p>
    <p class="hint m-0">${w.when}</p>
    <p class="nw-cost m-0">${w.cost}</p>
    <div class="row mt-3">${raw(button({ label: w.label, variant: 'primary', href: w.href }))}</div>
    ${w.links === undefined ? html`` : html`<p class="hint m-0 mt-2">${w.links.map((l, i) => html`${i === 0 ? '' : ' · '}<a class="tap" href="${l.href}">${l.label}</a>`)}</p>`}
  </li>`
}

export function newScreen(v: NewView): string {
  const head = pageHead('', 'منشورات جديدة', 'من أين تأتي المنشورات؟ طريقٌ واحد من ثلاثة — وبعده المراجعةُ والاعتمادُ في التيّار.')
  return head + html`<ol class="plain nw-ways" aria-label="طرق المنشورات الجديدة">${newWays(v.hasPackage).map(way)}</ol>`.value
}
