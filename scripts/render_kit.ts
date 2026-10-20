/**
 * كتالوجُ المكوّنات — **المكتبةُ الحيّة** (Atomic Design · Pattern Lab).
 *
 * لكلّ نظام تصميمٍ كبيرٍ صفحةٌ تعرض مكوّناته بكلّ حالاتها: Polaris وCarbon وGOV.UK
 * Frontend. وفي صدى عشرةُ مكوّناتٍ في `src/routes/ui/components/` **بلا صفحةٍ تجمعها**،
 * فمن يكتب شاشةً جديدة يقرأ الشيفرةَ ليعرف ما عنده، وحالٌ لا تظهر في شاشةٍ مرسومة
 * (زرٌّ معطَّل، حقلٌ بخطأ) لا يمرّ بمدقّق.
 *
 * **والكتالوجُ من الدوالّ نفسِها لا نسخةٌ منها** (D-140 · D-151): كلُّ ما هنا نداءُ
 * المكوّن الذي يُخدَم، في القالب الذي يُخدَم (`soloPage`). فيُرسَم بـ`npm run render`،
 * ويمرّ بـ`audit_a11y` و`audit_mobile` و`audit_csp` كأيّ شاشة. **ولكلّ قسمٍ `data-screen`**
 * فتُعدّ ميزانيّةُ الذهب لكلّ قسمٍ وحده كما في عيّنة المعالج.
 *
 *     tsx scripts/render_kit.ts /tmp/screen-kit.html
 */
import { writeAudited } from './writeAudited'
import { soloPage } from '../src/routes/ui/shell'
import { soloNav } from '../src/routes/ui/rail'
import { buildCommands } from '../src/routes/ui/command'
import { pageHead } from '../src/routes/ui/parts'
import { button } from '../src/routes/ui/components/button'
import { statusBadge, count } from '../src/routes/ui/components/badge'
import { card } from '../src/routes/ui/components/card'
import { field } from '../src/routes/ui/components/field'
import { tabs, segmented } from '../src/routes/ui/components/tabs'
import { notice } from '../src/routes/ui/components/toast'
import { emptyState } from '../src/routes/ui/components/empty'
import { menu, menuItem } from '../src/routes/ui/components/menu'
import { ICON } from '../src/routes/ui/icons'

const out = process.argv[2] ?? '/tmp/screen-kit.html'

const section = (n: number, title: string, body: string): string =>
  `<section data-screen="kit-${n}"><h2 class="sec">${title}</h2>${body}</section>`

const buttons = section(1, 'الأزرار', `<div class="row">
  ${button({ label: 'اعتمد', variant: 'primary', type: 'button' })}
  ${button({ label: 'معاينة', variant: 'secondary', type: 'button' })}
  ${button({ label: 'اعرض الكلّ', variant: 'quiet', href: '#kit' })}
  ${button({ label: 'احذف', variant: 'danger', type: 'button' })}
  ${button({ label: 'أغلق', variant: 'icon', type: 'button', icon: ICON.close })}
</div>
<div class="row">
  ${button({ label: 'معاينة', variant: 'secondary', size: 'sm', type: 'button' })}
  ${button({ label: 'انشر الآن', variant: 'secondary', size: 'sm', type: 'button', disabled: { id: 'kit-off', reason: 'اربط الحساب أوّلًا.' } })}
</div>`)

const status = section(2, 'الحال والأعداد', `<div class="row">
  ${statusBadge('ok', '✓', 'نُشر')}
  ${statusBadge('warn', '!', 'ينتظر قرارك')}
  ${statusBadge('bad', '▲', 'لم يُنشر')}
  ${statusBadge('pending', '◍', 'مجدول')}
  ${statusBadge('idle', '○', 'مسوّدة')}
  ${count(3, { label: '3 تنتظرك' })}
  ${count('!', { tone: 'bad', label: 'إعداد سقط' })}
</div>`)

const cards = section(3, 'البطاقات', `<div class="grid">
  ${card({ title: 'بطاقة', desc: 'سطح وحدّ وظلّ خفيف.', body: '<p class="hint">جسد البطاقة.</p>' })}
  ${card({ variant: 'interactive', href: '#kit', title: 'بطاقة رابط', body: '<p class="hint">البطاقة كلُّها رابط واحد.</p>' })}
  ${card({ variant: 'inset', title: 'بطاقة داخليّة', body: '<p class="hint">داخل بطاقة أخرى.</p>' })}
  ${card({ variant: 'alert', tone: 'warn', title: 'بطاقة تنبيه', body: '<p class="hint">حافّتُها بنغمة الحال.</p>' })}
</div>`)

const fields = section(4, 'الحقول', `<div class="card">
  ${field({ id: 'kit-a', label: 'اسم الحساب', control: '<input type="text" name="a">' })}
  ${field({ id: 'kit-b', label: 'الوصف', optional: true, hint: 'جملة واحدة تظهر تحت الاسم.', control: '<input type="text" name="b">' })}
  ${field({ id: 'kit-c', label: 'المعرّف', error: 'المعرّف لا تعرفه المنصّة.', control: '<input type="text" name="c" dir="ltr" value="abc">' })}
</div>`)

const choice = section(5, 'التبويبات والمقطع', `${tabs('حال المسوّدات', [
  { label: 'تنتظر', href: '#kit', current: true, count: 3 },
  { label: 'مجدولة', href: '#kit' },
  { label: 'فشلت', href: '#kit', count: 1, bad: true },
])}
<div class="row">${segmented('المظهر', 'kit-theme', [
  { value: 'light', label: 'فاتح', pressed: true },
  { value: 'dark', label: 'داكن' },
  { value: 'auto', label: 'تلقائيّ' },
])}</div>`)

const notices = section(6, 'الإشعارات', `${notice({ tone: 'ok', html: 'حُفظت المسوّدة.' })}
${notice({ tone: 'warn', html: 'الرمز ينتهي بعد يومين.' })}
${notice({ tone: 'bad', html: 'لم يُنشر المنشور: انتهى الإذن.' })}`)

const empty = section(7, 'الحالة الفارغة', emptyState({
  title: 'لا مسوّدات بعد',
  html: 'اكتب من فكرتك أو من ملفّ في Drive.',
}))

const menus = section(8, 'القائمة', `<div class="row">${menu({
  label: 'المزيد',
  items: [
    menuItem({ label: 'افتح في المحرّر', href: '#kit' }),
    menuItem({ label: 'انسخ الرابط', href: '#kit', note: 'رابط المنشور على المنصّة' }),
  ],
})}</div>`)

const body = `${pageHead('للمطوّر', 'كتالوج المكوّنات', 'كلّ مكوّن في صدى بحالاته، من الدالّة التي تُخدَم.')}
<div id="kit">${buttons}${status}${cards}${fields}${choice}${notices}${empty}${menus}</div>`

writeAudited(out, soloPage('صدى — كتالوج المكوّنات', { href: '/panel', label: 'اللوحة' }, body, 'n', '',
  buildCommands({ onPanel: false }), soloNav('settings')))
console.log(`رُسم ${out}`)
