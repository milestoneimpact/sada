/**
 * شاشةُ التقرير الأسبوعيّ.
 *
 * ## ما تعرضه وما ترفض أن تعرضه
 *
 * كلُّ رقمٍ هنا **له صفٌّ في `metrics` أو في `cost_ledger`**. ولا رقمَ
 * محسوبٌ على تقديرٍ ولا نسبةَ نموٍّ بين أسبوعين قِيس أحدُهما نصفَ قياس.
 *
 * **والفراغُ يُعرَض فراغا.** «—» تعني «لا تعطيه المنصّة»، والصفرُ يعني
 * «قِيس فكان لا شيء». وخلطُهما يجعل صمتَ الواجهة يُقرأ فشلَ محتوى —
 * وهو أسوأُ ما يفعله تقرير: **يوجّه قرارا صحيحا بمعلومةٍ كاذبة**.
 *
 * ## ولا مقارنةَ بين نافذتين
 *
 * التفاعلُ يتراكم. فالشاشةُ تقول **في أيّ نافذةٍ وقع الترتيب** وكم كان
 * عددُ من فيها — فقارئٌ يرى «الأوّلُ من ثلاثة في نافذة ٢٤س» يعرف حدَّ
 * ما بين يديه.
 */
import { escapeHtml } from './shell'
import { money, relativeTime } from '../../lib/format'
import type { PlatformSlice, StoredReport, WeeklyReport } from '../../lib/report/weekly'
import type { OpenSuggestion } from '../../lib/report/promote'
import { LOGOS } from './logos'

const LABEL: Readonly<Record<string, string>> = { linkedin: 'LinkedIn', x: 'X' }

/** رقمٌ ومعه من كم صفٍّ جُمع — والفراغُ يُقال ولا يُصفَّر. */
function sum(label: string, value: number | null, from: number, of: number): string {
  if (value === null) {
    return `<span class="stat"><b><span class="na"
      title="لا تعطيه المنصّة لهذا الحساب">—</span></b>${escapeHtml(label)}</span>`
  }
  const partial = from < of ? `<span class="ago"> من ${from} من ${of}</span>` : ''
  return `<span class="stat"><b>${value}</b>${escapeHtml(label)}${partial}</span>`
}

function sliceCard(s: PlatformSlice): string {
  const logo = LOGOS[s.platform] ?? ''
  return `<div class="card" style="margin-bottom:var(--s-3)">
    <div class="card-head">
      <div class="plat-logo">${logo}</div>
      <h2>${escapeHtml(LABEL[s.platform] ?? s.platform)}</h2>
      <div class="grow"></div>
      <span class="chip">${s.published} منشورا · قِيس ${s.measured}</span>
    </div>
    <div class="stats">
      ${sum('ظهور', s.impressions, s.impressionsFrom, s.published)}
      ${sum('تفاعل', s.interactions, s.interactionsFrom, s.published)}
    </div>
  </div>`
}

/** جسدُ تقريرٍ واحد. */
export function reportBody(r: WeeklyReport, now: Date): string {
  const span =
    `${escapeHtml(r.from.slice(0, 10))} — ${escapeHtml(r.to.slice(0, 10))}`

  const top =
    r.top === null
      ? `<p class="hint"><b>لا ترتيبَ في هذا الأسبوع.</b> الترتيبُ يقع داخل نافذةٍ
         واحدة، ويحتاج <b>اثنين فأكثر</b> فيها — وواحدٌ وحده ليس ترتيبا.</p>`
      : `<div class="outcome ok">
          <span class="k">الأوّلُ في نافذة ${escapeHtml(r.top.window)}</span>
          <span class="v">${escapeHtml(r.top.post.text.slice(0, 160))}${
            r.top.post.text.length > 160 ? '…' : ''
          }</span>
        </div>
        <p class="hint">رُتِّب <b>${
          r.top.basis === 'rate' ? 'بنسبة التفاعل إلى الظهور' : 'بعدد التفاعل'
        }</b> بين <b>${r.top.cohort}</b> منشورات في النافذة نفسِها.${
          r.top.basis === 'count'
            ? ' <b>والنسبةُ لم تُستعمَل</b> لأنّ الظهورَ ناقصٌ عند بعضهم، ' +
              'ونسبةٌ على ظهورٍ ناقصٍ تكافئ من لم يُقَس.'
            : ''
        }</p>`

  const notes = r.notes
    .map((n) => `<div class="outcome warn"><span class="k">يُقال</span>
      <span class="v">${escapeHtml(n)}</span></div>`)
    .join('')

  return `<div class="page-head">
    <div class="txt">
      <div class="eyebrow"><span class="ln"></span>تقريرٌ أسبوعيّ</div>
      <h1>${span}</h1>
      <p class="lede">${
        r.published === 0
          ? 'لا منشورَ خرج في هذه المدّة.'
          : `${r.published} منشورا خرجت، قِيس منها <b>${r.measured}</b>.`
      }</p>
    </div>
  </div>

  <div class="card">
    <div class="card-head">
      <h2>ما خرج</h2>
      <div class="grow"></div>
      <span class="chip" title="من دفتر التكلفة في هذه المدّة وحدها">
        أُنفق ${escapeHtml(money(r.spendUsd))}</span>
    </div>
    ${r.platforms.map(sliceCard).join('')}
    ${r.platforms.length === 0 ? '<p class="hint">لا شيءَ يُعرَض — ولا أصفارَ تُختلَق.</p>' : ''}
  </div>

  <div class="card">
    <h2>الأفضلُ داخل نافذته</h2>
    ${top}
  </div>

  ${notes === '' ? '' : `<div class="card"><h2>ما لا يقوله الرقمُ وحده</h2>${notes}</div>`}

  <p class="hint" style="margin:var(--s-4) 0 0">
    هذا التقريرُ <b>كُتب مرّةً ولا يُعاد حسابُه</b>: المقاييسُ تتراكم بعد الأسبوع،
    وإعادةُ الحساب تبدّل رقمَه بأثرٍ رجعيّ — فلا يُعرَف أنَما الحصادُ أم أُعيد الحساب.
    ${
      r.version === 1 ? '' : `<b>نسخةُ البنية ${r.version}.</b>`
    }
  </p>`
}

export interface ReportScreenData {
  readonly reports: readonly StoredReport[]
  readonly current: StoredReport | null
  readonly suggestions: readonly OpenSuggestion[]
  readonly promoCapUsd: number
  readonly now: Date
}

/** بطاقةُ توصيةٍ — **ومعها المبلغُ ومصدرُه، وزرّان لا زرُّ إنفاق.** */
function suggestionCard(s: OpenSuggestion): string {
  return `<div class="card" style="margin-bottom:var(--s-3)">
    <div class="card-head">
      <div class="plat-logo">${LOGOS[s.platform] ?? ''}</div>
      <h2>${escapeHtml(money(s.budgetUsd))}</h2>
      <div class="grow"></div>
      <span class="ago">اقتُرح منذ ${escapeHtml(relativeTime(s.createdAt))}</span>
    </div>
    <p class="nm">${escapeHtml(s.text.slice(0, 200))}${s.text.length > 200 ? '…' : ''}</p>
    <div class="outcome"><span class="k">لماذا</span>
      <span class="v">${escapeHtml(s.reason)}</span></div>
    <form method="post" action="/panel/report/promote" class="row">
      <input type="hidden" name="post_id" value="${escapeHtml(s.postId)}">
      <button type="submit" name="decision" value="accepted">أقبل</button>
      <button type="submit" name="decision" value="rejected" class="ghost">أرفض</button>
      <span class="grow"></span>
      <span class="ago">وقبولُك <b>تسجيلُ رأيٍ لا أمرُ إنفاق</b> — لا مسارَ
        إعلاناتٍ في صدى أصلا (D-006).</span>
    </form>
  </div>`
}

/** الشاشةُ كاملةً: تقريرُ الأسبوع، ثمّ التوصيات، ثمّ ما مضى. */
export function reportScreen(d: ReportScreenData): string {
  const head =
    d.current === null
      ? `<div class="page-head"><div class="txt">
          <div class="eyebrow"><span class="ln"></span>تقريرٌ أسبوعيّ</div>
          <h1>لا تقريرَ بعد</h1>
          <p class="lede">يُكتب <b>فجرَ كلّ اثنين</b> عن الأسبوع الذي سبقه.
            ولا يُحسَب عند الفتح: هو <b>شهادةٌ على وقتٍ مضى</b>.</p>
        </div></div>`
      : reportBody(d.current.body, d.now)

  const promo =
    d.promoCapUsd <= 0
      ? `<div class="card">
          <h2>توصيةُ الترويج</h2>
          <div class="outcome warn"><span class="k">لا سقفَ موضوع</span>
            <span class="v"><b>ولا مبلغَ يُقترَح بلا سقفٍ تضعه.</b>
              رقمٌ نؤلّفه نحن رقمٌ بلا مصدر — وهذه تقترح مالا لا كتابة.
              ضع <span class="mono">سقفَ الترويج الأسبوعيّ</span> في الإعدادات
              لتُكتَب التوصيات.</span></div>
        </div>`
      : d.suggestions.length === 0
        ? `<div class="card">
            <h2>توصيةُ الترويج</h2>
            <p class="hint">لا توصيةَ تنتظر. والسقفُ الموضوع
              <b>${escapeHtml(money(d.promoCapUsd))}</b> أسبوعيّا، ولا يُنفَق منه
              شيءٌ بلا قبولك.</p>
          </div>`
        : `<div class="card">
            <div class="card-head"><h2>توصيةُ الترويج</h2><div class="grow"></div>
              <span class="chip">${d.suggestions.length} تنتظر بتّك</span></div>
            ${d.suggestions.map(suggestionCard).join('')}
          </div>`

  const past =
    d.reports.length <= 1
      ? ''
      : `<div class="card">
          <h2>ما مضى</h2>
          <div class="scroll"><table>
            <thead><tr><th>الأسبوع</th><th>خرج</th><th>قِيس</th><th>أُنفق</th></tr></thead>
            <tbody>${d.reports
              .map(
                (r) => `<tr>
                  <td data-label="الأسبوع"><a href="/panel/report/${escapeHtml(
                    r.id,
                  )}">${escapeHtml(r.id)}</a></td>
                  <td data-label="خرج">${r.body.published}</td>
                  <td data-label="قِيس">${r.body.measured}</td>
                  <td data-label="أُنفق">${escapeHtml(money(r.body.spendUsd))}</td>
                </tr>`,
              )
              .join('')}</tbody></table></div>
        </div>`

  return `${head}${promo}${past}`
}
