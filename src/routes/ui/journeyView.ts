/**
 * شاشةُ الرحلة (D-104) — **خطٌّ واحدٌ يُقرأ نازلا**.
 *
 * ## ولماذا خطٌّ لا جدول
 *
 * الجدولُ يُقرأ صفّا صفّا **ولا يقول إنّ صفّا سبب الذي بعده**. والرحلةُ
 * سببيّة: الملفُّ حُلّل، فكُتبت منه مسوّدة، فاعتُمدت، فنُشرت. **والخيطُ
 * الواصلُ هو المعلومة** — لا الصفوف.
 *
 * ## والمحطّةُ الغائبة تُقرأ بغيابها
 *
 * منشورٌ لم يُنشَر **ليس له محطّةُ نشرٍ فارغة** — له غيابُها، والخطُّ
 * ينتهي عند آخرِ ما وقع. **وصفٌّ يقول «لم يُنشَر بعد» يُقرأ عطلا**، وهو
 * حالٌ طبيعيّ.
 */
import { escapeHtml } from './shell'
import { money, relativeTime } from '../../lib/format'
import { ICON } from './icons'
import { platformLabel } from '../../lib/oauth/providers'
import type { Journey, Station } from '../../lib/journey'

/**
 * رمزُ المحطّة — **من المصدر الواحد** (D-103).
 *
 * وأربعةٌ تشترك في رمز: الصورةُ والقياسُ لهما رمزُ التقرير، لأنّ الرمزَ
 * هنا **علامةُ نوعٍ لا صورةُ فعل**. ورسمُ رمزٍ لكلّ محطّةٍ يجعل الخطَّ
 * معرضَ أيقونات.
 */
const MARK: Readonly<Record<Station['kind'], string>> = {
  source: ICON.sources,
  analysis: ICON.providers,
  draft: ICON.posts,
  image: ICON.report,
  decision: ICON.tasks,
  schedule: ICON.settings,
  publish: ICON.channels,
  metrics: ICON.report,
}

/**
 * **من المحطّة إلى موضعها** (D-126).
 *
 * الرحلةُ تقرأ ما وقع، **والفعلُ يقع في موضعه لا هنا**: المصدرُ في لوح
 * المصادر، والمسوّدةُ والقرارُ والموعدُ في لوح المنشورات، والنشرُ والقياسُ
 * في شاشة المنصّة. فكلُّ محطّةٍ تحمل رابطًا إلى حيث يُفعَل بها شيء —
 * **ولا زرَّ يفعل من هنا** (سنّةُ ‏⌘K في D-105).
 */
export function stationHref(kind: Station['kind'], platform: string): { href: string; label: string } {
  switch (kind) {
    case 'source':
    case 'analysis':
      return { href: '/panel#sources', label: 'المصادر' }
    case 'publish':
    case 'metrics':
      return { href: `/panel/channels/${encodeURIComponent(platform)}`, label: `شاشةُ ${platformLabel(platform)}` }
    default:
      return { href: '/panel#posts', label: 'المنشورات' }
  }
}

function stationRow(s: Station, now: Date, platform: string): string {
  const when = s.at === null
    ? '<span class="ago">بلا وقتٍ مسجَّل</span>'
    : `<span class="ago when">${escapeHtml(relativeTime(s.at, now))}</span>`

  /*
   * **والكلفةُ `null` تختلف عن صفر.**
   *
   * `null` أنّ المحطّةَ لا تكلّف أصلا (قرارُ المالك مثلا)، والصفرُ أنّها
   * كلّفت شيئا لم يُسجَّل بعد أو سعرٌ لم يُؤكَّد (D-040). **فالأولى تُخفى
   * والثانيةُ تُعرَض** — وإخفاءُ الصفر يجعل الدفترَ يبدو أنقصَ ممّا هو.
   */
  const go = stationHref(s.kind, platform)
  const cost = s.cost === null
    ? ''
    : `<span class="chip mono" title="ما دُفع في هذه المحطّة">${escapeHtml(money(s.cost))}</span>`

  return `<li class="stop ${s.state}">
    <span class="stop-mark" aria-hidden="true">${MARK[s.kind]}</span>
    <div class="stop-body">
      <b class="stop-t">${escapeHtml(s.title)}</b>
      <p class="stop-d">${escapeHtml(s.detail)}</p>
      <div class="stop-meta">${when}${cost}${
        s.model === null ? '' : `<span class="chip mono">${escapeHtml(s.model)}</span>`
      }<a class="btn g sm stop-go" href="${escapeHtml(go.href)}">${escapeHtml(go.label)} ←</a></div>
    </div>
  </li>`
}

export function journeyBody(j: Journey, now: Date): string {
  /*
   * **ومجموعُ الدفتر يُعرَض ولو خالف جمعَ المحطّات.**
   *
   * `cost_ledger` يُكتَب قبل أن يُعدّ النداءُ ناجحا (D-008)، فنداءٌ دُفع
   * ثمنُه ثمّ فشل يبقى فيه **ولا محطّةَ له**. والفرقُ بين الرقمين ليس
   * خطأً — **هو ما دُفع بلا أثر**، وهو أنفعُ ما في الشاشة.
   */
  const stops = j.stations.map((s) => stationRow(s, now, j.platform)).join('')

  return `<div class="page-head">
    <div class="txt">
      <div class="eyebrow"><span class="ln"></span>رحلةُ منشور</div>
      <h1>من الملفّ إلى الأثر</h1>
      <p class="lede">كلُّ محطّةٍ هنا <b>مشتقّةٌ من صفٍّ في القاعدة</b> — ولا
        محطّةَ تُخترَع لتكتمل الصورة. وما لم يقع لا يُرسَم له مكانٌ فارغ.</p>
    </div>
    <div class="aside">
      <span class="pill"><i class="led"></i>${escapeHtml(platformLabel(j.platform))}</span>
      <span class="pill">أُنفق ${escapeHtml(money(j.spent))}</span>
    </div>
  </div>

  <div class="card">
    <h2>النصّ</h2>
    <p class="post-text">${escapeHtml(j.text)}</p>
  </div>

  <h3 class="sec">المحطّات</h3>
  ${j.stations.length === 0
    ? '<div class="empty"><b>لا محطّاتٍ بعد</b><p>لم يُسجَّل لهذا المنشور شيءٌ في القاعدة.</p></div>'
    : `<ol class="journey">${stops}</ol>`}

  <div class="split" style="margin-top:var(--s-5)">
    <p><b>ومجموعُ الدفتر ${escapeHtml(money(j.spent))}</b> — من
      <span class="mono">cost_ledger</span> لا من جمع المحطّات. والدفترُ يُكتَب
      <b>قبل</b> أن يُعدّ النداءُ ناجحا (D-008)، فنداءٌ دُفع ثمنُه ثمّ فشل يبقى
      فيه ولا محطّةَ له. <b>والفرقُ بين الرقمين هو ما دُفع بلا أثر.</b></p>
  </div>`
}
