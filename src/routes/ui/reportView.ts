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
import { platformLabel } from '../../lib/oauth/providers'
import { historyBars } from './chart'
import { toHijri } from '../../lib/analyze/hijri'
import { counted, money, NOUNS, relativeTime } from '../../lib/format'
import type { PlatformSlice, ReportPost, StoredReport, WeeklyReport } from '../../lib/report/weekly'
import type { OpenSuggestion } from '../../lib/report/promote'
import { LOGOS } from './logos'
import { windowLabel } from '../../lib/metrics/job'
import { dayMonth, dayRange } from '../../lib/time/zone'
import { ON_TIME_MINUTES, type SuccessMetrics } from '../../lib/report/success'
import { html } from './html'


/** رقمٌ ومعه من كم صفٍّ جُمع — والفراغُ يُقال ولا يُصفَّر. */
function sum(label: string, value: number | null, from: number, of: number): string {
  if (value === null) {
    return `<span class="stat"><b><span class="na" tabindex="0"
      data-tip="لا تعطيه المنصّة لهذا الحساب">—</span></b><span class="vh">لا تعطيه المنصّة لهذا الحساب</span>${escapeHtml(label)}</span>`
  }
  const partial = from < of ? `<span class="ago"> من ${from} من ${of}</span>` : ''
  return `<span class="stat"><b>${value}</b>${escapeHtml(label)}${partial}</span>`
}

/**
 * «21 إلى 27 سبتمبر» — **والحدُّ الأعلى الاثنينُ التالي، فآخرُ يومٍ قبله** (خطّة
 * التصميم ٥٫٨). كان العنوانُ «2026-09-21 — 2026-09-28» بحجم العنوان، فيُقرأ أسبوعٌ
 * ثمانيةَ أيّام. والأسبوعُ أيّامٌ بـ UTC كما حدّه `weekBounds`، فلا منطقةَ تُزيحه.
 */
function weekOf(from: string, to: string, now: Date): string {
  const a = Date.parse(from)
  const b = Date.parse(to)
  if (Number.isNaN(a) || Number.isNaN(b)) return `${from.slice(0, 10)} — ${to.slice(0, 10)}`
  return dayRange(new Date(a), new Date(Math.max(a, b - 86_400_000)), null, now)
}

/** «21 سبتمبر» — أوّلُ الأسبوع وحده، لعمودٍ في «ما مضى» تبدأ مقاييسُه من خطٍّ واحد. */
function weekStart(from: string, now: Date): string {
  const a = Date.parse(from)
  return Number.isNaN(a) ? '' : dayMonth(new Date(a), null, now)
}

/** رابطُ المنشور إلى سجلّه — **فرقمٌ في التقرير يوصل إلى صاحبه** (D-104). */
function recordLink(post: ReportPost): string {
  return `<a class="tap" href="/panel/journey/${escapeHtml(encodeURIComponent(post.id))}">سجلُّه</a>`
}

/** أوّلُ سطرٍ من المنشور، مقصوصًا — ما يكفي ليُعرَف أيُّها هو. */
function firstLine(text: string): string {
  const line = text.split('\n').find((l) => l.trim() !== '')?.trim() ?? ''
  return line.length > 160 ? `${line.slice(0, 160)}…` : line
}

/**
 * صفُّ منصّةٍ في «ما خرج» — **صفٌّ لا بطاقةٌ في بطاقة** (D-140).
 *
 * كانت كلُّ منصّةٍ بطاقةً داخل البطاقة: شعارٌ واسمٌ في سطر، ورقاقةٌ في طرفه
 * البعيد، والأرقامُ في سطرٍ ثانٍ تحت خيط — **وثلاثةُ أرباع الصفّ بيضاء**.
 * فالشعارُ والاسمُ والعدُّ والأرقامُ في سطرٍ واحدٍ يلتفّ على الضيق.
 */
function sliceCard(s: PlatformSlice): string {
  const logo = LOGOS[s.platform] ?? ''
  // ‏والصفُّ يوصل إلى شاشة المنصّة (ر-7): مقاييسُ كلِّ منشورٍ هناك، وكان التقريرُ بلا رابطٍ واحد
  return `<div class="slice">
    <div class="plat-logo">${logo}</div>
    <div class="slice-id"><h3>${escapeHtml(platformLabel(s.platform))}</h3>
      <span class="chip">${escapeHtml(counted(s.published, NOUNS.post))} · قِيس ${s.measured}</span>
      <a class="tap" href="/panel/channels/${escapeHtml(s.platform)}">اعرض منشوراتها</a></div>
    <div class="stats">
      ${sum('ظهور', s.impressions, s.impressionsFrom, s.published)}
      ${sum('تفاعل', s.interactions, s.interactionsFrom, s.published)}
    </div>
  </div>`
}

/**
 * «هذا الشهر حتّى اليوم» تحت رأس النتائج (ر-10) — **حيٌّ لا من التقرير**: التقريرُ
 * شهادةٌ على أسبوعٍ مضى، وهذا ما في الدفتر الآن. والرقمُ يفتح حدودَ الإنفاق.
 */
export interface MonthSpend {
  readonly total: number
  /** تقديرُ المقاطع خارجَ المجموع الحقيقيّ (D-415). */
  readonly estimated?: number
  /** حُسب الشهرُ بتوقيت الرياض لأنّ منطقةَ المالك لم تصل، فيُقال (D-201). */
  readonly utc: boolean
}

function monthLine(m: MonthSpend | undefined): string {
  if (m === undefined) return ''
  return `<div class="sub">هذا الشهر حتّى اليوم:
    <a class="tap" href="/panel/settings#c2">${escapeHtml(money(m.total))}</a>${m.utc ? ' بتوقيت الرياض' : ''}${
      (m.estimated ?? 0) > 0 ? ' · ومقاطع بالتقدير: ' + escapeHtml(money(m.estimated ?? 0)) + ' (تقدير)' : ''}</div>`
}

/** جسدُ تقريرٍ واحد. */
export function reportBody(r: WeeklyReport, now: Date, month?: MonthSpend, kpis = ''): string {
  const span = `أسبوع ${escapeHtml(weekOf(r.from, r.to, now))}`

  /*
   * **والهجريُّ حيث الموسمُ معنًى — لا في كلّ تاريخ** (D-106).
   *
   * `analyze/hijri.ts` مبنيٌّ منذ المرحلة الأولى **ويُقرأ في موجّه
   * النموذج وحدَه**: النموذجُ يعرف أنّه رمضان، **والمالكُ يقرأ تقريرَه
   * فلا يجد ما يفسّر لِمَ ارتفع أسبوعٌ وهبط آخر**.
   *
   * **ولا يُعرَض إلّا حين يكون موسما.** تاريخٌ هجريٌّ فوق كلّ صفٍّ زينةٌ
   * تُتخطّى بالعين؛ و«العشر الأواخر من رمضان» فوق أسبوعٍ ارتفع فيه
   * التفاعلُ **هو الجواب**.
   *
   * والموسمُ يُقرأ من **وسط** الأسبوع لا من طرفه: أسبوعٌ يبدأ في شعبان
   * وينتهي في رمضان طرفاه يكذبان عليه، **ووسطُه يقول أيَّهما كان أغلبَ**.
   */
  const mid = new Date((Date.parse(r.from) + Date.parse(r.to)) / 2)
  const h = Number.isNaN(mid.getTime()) ? null : toHijri(mid)
  const season = h === null || h.season === null
    ? ''
    : `<span class="pill" tabindex="0" data-tip="${escapeHtml(`${h.day} ${h.monthName} ${h.year}هـ`)}"
        >${escapeHtml(h.season)}</span>`

  /*
   * **ومنشورٌ وحيدٌ يُرى ولو لم يُرتَّب** (ر-7). كان الأسبوعُ بمنشورٍ واحدٍ يقول
   * «لا ترتيب» ويسكت، فلا يعرف المالكُ أيُّ منشورٍ جلب ظهورَه. وقاعدةُ الترتيب
   * كما هي: واحدٌ وحده ليس ترتيبًا، **لكنّه صاحبُ الرقم**. وتقريرٌ كُتب قبل
   * الحقل `only` يبقى على فقرته.
   */
  const lone = r.top === null ? r.only : undefined
  const top =
    lone !== undefined
      ? `<div class="outcome ok">
          <span class="kv-k">${lone.window === null
            ? 'لم يُقَس بعد'
            : `في نافذة ${escapeHtml(windowLabel(lone.window))}`}</span>
          <span class="kv-v">${escapeHtml(firstLine(lone.text))} ${recordLink(lone)}</span>
        </div>
        ${lone.window === null ? '' : `<div class="stats">
          ${sum('ظهور', lone.impressions, lone.impressions === null ? 0 : 1, 1)}
          ${sum('تفاعل', lone.interactions, lone.interactions === null ? 0 : 1, 1)}
        </div>`}
        <p class="hint">خرج وحدَه هذا الأسبوع، <b>فلا ترتيب</b>: الترتيب يحتاج منشورَين
          فأكثر في نافذة واحدة.</p>`
      : r.top === null
      ? `<p class="hint"><b>لا ترتيب في هذا الأسبوع.</b> الترتيب يقع داخل نافذة
         واحدة، ويحتاج <b>اثنين فأكثر</b> فيها — وواحد وحده ليس ترتيبا.</p>`
      : `<div class="outcome ok">
          <span class="kv-k">الأوّل في نافذة ${escapeHtml(windowLabel(r.top.window))}</span>
          <span class="kv-v">${escapeHtml(r.top.post.text.slice(0, 160))}${
            r.top.post.text.length > 160 ? '…' : ''
          } ${recordLink(r.top.post)}</span>
        </div>
        <p class="hint">رُتِّب <b>${
          r.top.basis === 'rate' ? 'بنسبة التفاعل إلى الظهور' : 'بعدد التفاعل'
        }</b> بين <b>${escapeHtml(counted(r.top.cohort, NOUNS.post, 'gen'))}</b> في النافذة نفسِها.${
          r.top.basis === 'count'
            ? ' <b>والنسبة لم تُستعمَل</b> لأنّ الظهور ناقص عند بعضهم، ' +
              'ونسبة على ظهور ناقص تكافئ من لم يُقَس.'
            : ''
        }</p>`

  const notes = r.notes
    .map((n) => `<div class="outcome warn"><span class="kv-k">يُقال</span>
      <span class="kv-v">${escapeHtml(n)}</span></div>`)
    .join('')

  return `<div class="page-head">
    <div class="txt">
      <div class="eyebrow"><span class="ln"></span>تقرير أسبوعيّ</div>
      <h1>${span}</h1>${season}
      <p class="lede">${
        r.published === 0
          ? 'لا منشور خرج في هذه المدّة.'
          // ‏والعددُ من «counted» (D-177): «خرج منشورٌ واحد، وقِيس» لا «1 منشورا خرجت»
          : r.published === 1
            ? `خرج منشور واحد، ${r.measured === 1 ? 'وقِيس' : 'ولم يُقَس بعد'}.`
            : `خرج ${escapeHtml(counted(r.published, NOUNS.post))}، قِيس ${
              r.published === 2 ? 'منهما' : 'منها'} <b>${r.measured}</b>.`
      }</p>
      ${monthLine(month)}
    </div>
  </div>
  ${kpis}
  ${/*
   * ‏**والمنشورُ الذي جلب الأسبوعَ أوّلًا** (D-218): الملخّصُ ثمّ صاحبُ الرقم، ثمّ «ما خرج» صفًّا
   * ‏لكلّ منصّة. كان تحت جدول المنصّات، والمالكُ يفتح التقرير ليعرف أيَّ منشورٍ يكرّر.
   */ ''}<div class="card">
    <h2>${lone === undefined ? 'الأفضل داخل نافذته' : 'منشور الأسبوع'}</h2>
    ${top}
  </div>

  <div class="card">
    <div class="card-head">
      <h2>ما خرج</h2>
      <div class="grow"></div>
      <span class="chip" tabindex="0" data-tip="من سجلّ الكلفة في هذه المدّة وحدها">
        أُنفق ${escapeHtml(money(r.spendUsd))}</span>
    </div>
    ${r.platforms.length === 0 ? '' : `<div class="slices">${r.platforms.map(sliceCard).join('')}</div>`}
    ${r.platforms.length === 0 ? '<p class="hint">لا شيء يُعرَض — ولا أصفار تُختلَق.</p>' : ''}
  </div>

  ${notes === '' ? '' : `<div class="card"><h2>ما لا يقوله الرقم وحده</h2>${notes}</div>`}

  <p class="hint m-0 mt-4">
    هذا التقرير <b>كُتب مرّةً ولا يُعاد حسابُه</b>: المقاييس تتراكم بعد الأسبوع،
    وإعادة الحساب تبدّل رقمَه بأثر رجعيّ — فلا يُعرَف أنَما الحصاد أم أُعيد الحساب.
    ${
      r.version === 1 ? '' : `<b>نسخة البنية ${r.version}.</b>`
    }
  </p>`
}

export interface ReportScreenData {
  readonly reports: readonly StoredReport[]
  readonly current: StoredReport | null
  readonly suggestions: readonly OpenSuggestion[]
  readonly promoCapUsd: number
  readonly now: Date
  /** «هذا الشهر حتّى اليوم» من الدفتر — يُرسَم تحت الرأس حين يُمرَّر (ر-10). */
  readonly month?: MonthSpend
  /** مقاييسُ النجاح هذا الشهر (D-324) — تُرسَم بعد التقرير حين تُمرَّر. */
  readonly success?: SuccessMetrics
}

/** نسبةٌ صحيحة بعلامتها — والمقامُ الصفرُ لا يصل هنا. */
function pct(n: number, of: number): string {
  return String(Math.round((n / of) * 100)) + '٪'
}

/**
 * ‏**مقاييسُ النجاح هذا الشهر** (D-324 · PLAN.md §٧ · ROADMAP-3 §٧) — ثلاثُ بلاطاتٍ بأهدافها، **حيّةٌ من الجداول** لا من
 * ‏التقرير: اعتمادٌ بلا تعديل (≥ ‏60٪)، ونُشر في موعده بلا تدخّل (‏100٪)، وكلفةُ المنشور الكاملة. كانت معرَّفةً في الخطّة ولا
 * ‏تُرى في المنتج. **وما لا مقامَ له «لم يُقَس»** بسببه، لا ‏0٪ يُقرأ فشلًا (سنّةُ هذه الشاشة).
 */
export function successCard(m: SuccessMetrics): string {
  const tile = (k: string, v: string, note: string) =>
    html`<div class="card tile"><div class="kv-k">${k}</div><div class="kv-v">${v}</div><div class="note">${note}</div></div>`
  const none = 'لم يُقَس'
  const clean = m.clean.of === 0
    ? tile('اعتماد بلا تعديل', none, 'لم يُبَتّ في مسوّدة كتبها النموذج هذا الشهر. الهدف 60٪ فأكثر.')
    : tile('اعتماد بلا تعديل', pct(m.clean.n, m.clean.of),
      m.clean.n + ' من ' + m.clean.of + ' مسوّدة كتبها النموذج وبُتّ فيها. الهدف 60٪ فأكثر.')
  const onTime = m.onTime.of === 0
    ? tile('نُشر في موعده', none, 'لم يحلّ موعد منشور مجدول هذا الشهر. الهدف 100٪.')
    // ‏والمقامُ كلُّ ما حلّ موعدُه أو حوول نشرُه (مراجعة D-324): الفاشلُ والعالقُ فيه، فلا تقرأ ‏100٪ وثلاثةٌ لم تخرج
    : tile('نُشر في موعده', pct(m.onTime.n, m.onTime.of),
      m.onTime.n + ' من ' + m.onTime.of + ' حلّ موعده هذا الشهر خرج خلال ' + ON_TIME_MINUTES +
        ' دقيقة منه بلا محاولة فاشلة قبله، والفاشل والعالق من المقام. الهدف 100٪.')
  const cost = m.cost.posts === 0
    ? tile('كلفة المنشور', none, 'لم يُنشر شيء هذا الشهر، فلا قسمة.')
    : tile('كلفة المنشور', money(m.cost.direct / m.cost.posts),
      // ‏والعددُ بعربيّةٍ صحيحة (D-177): «متوسّط 9 منشورات» لا «9 منشورًا»
      'متوسّط ' + counted(m.cost.posts, NOUNS.post, 'gen') +
        ': الكتابة والصورة والنشر والقياس. ومع كلّ ما أُنفق هذا الشهر ' + money(m.cost.all / m.cost.posts) + ' لكلّ منشور.')
  return html`<section class="mb-4" id="success" aria-labelledby="success-h">
    <div class="card">
      <div class="card-head"><h2 id="success-h">مقاييس النجاح هذا الشهر</h2></div>
      <p class="hint m-0 mb-3">من الخطّة: منشور يُعتمَد بلا تعديل ويخرج في موعده بكلفة معروفة.${m.utc ? ' والشهر بتوقيت الرياض.' : ''}</p>
      <div class="grid tiles c3">${clean}${onTime}${cost}</div>
    </div>
  </section>`.value
}

/** بطاقةُ توصيةٍ — **ومعها المبلغُ ومصدرُه، وزرّان لا زرُّ إنفاق.** */
function suggestionCard(s: OpenSuggestion): string {
  return `<div class="card mb-3">
    <div class="card-head">
      <div class="plat-logo">${LOGOS[s.platform] ?? ''}</div>
      <h2>${escapeHtml(money(s.budgetUsd))}</h2>
      <div class="grow"></div>
      <span class="ago">اقتُرح ${escapeHtml(relativeTime(s.createdAt))}</span>
    </div>
    <p class="nm">${escapeHtml(s.text.slice(0, 200))}${s.text.length > 200 ? '…' : ''}</p>
    <div class="outcome"><span class="kv-k">لماذا</span>
      <span class="kv-v">${escapeHtml(s.reason)}</span></div>
    <form method="post" action="/panel/report/promote" class="row">
      <input type="hidden" name="post_id" value="${escapeHtml(s.postId)}">
      ${/*
        * **وزرّان بلا درجة ليسا زرّين** (D-123). كان الأوّلُ بلا صنفٍ والثاني
        * `ghost` — **وصنفٌ لا قاعدةَ له في الورقة**: فرُسما بلا أرضيّةٍ ولا
        * حدٍّ، لا يُعرَف أيُّهما الأوّليّ. والقبولُ أوّليٌّ لأنّه ما يُنتظَر،
        * والرفضُ ثانويٌّ — **ولا أحمرَ عليه**: رفضُ توصيةٍ رأيٌ لا خطر.
        */''}
      <button type="submit" name="decision" value="accepted" class="btn btn-primary">أقبل</button>
      <button type="submit" name="decision" value="rejected" class="btn btn-secondary">أرفض</button>
      <span class="grow"></span>
      <span class="ago">وقبولُك <b>تسجيل رأي لا أمر إنفاق</b> — لا مسار
        إعلانات في صدى أصلا.</span>
    </form>
  </div>`
}

/** مجموعُ مقياسٍ على المنصّات — و`null` حين لم يُقَس في أيٍّ منها، لا صفر. */
function total(r: WeeklyReport, k: 'impressions' | 'interactions'): number | null {
  const vals = r.platforms.map((p) => p[k]).filter((v): v is number => v !== null)
  return vals.length === 0 ? null : vals.reduce((a, b) => a + b, 0)
}

/** الفرقُ عن الأسبوع الذي قبله، كلمةً لا لونًا: الزيادةُ في الإنفاق ليست «خيرًا» ولا «شرًّا» بذاتها. */
function delta(cur: number | null, prev: number | null, hasPrev: boolean): string {
  if (!hasPrev) return 'لا أسبوع قبله يُقارَن به'
  if (cur === null || prev === null) return 'لا يُقارَن: أحد الأسبوعين لم يُقَس'
  if (prev === 0) return cur === 0 ? 'كالأسبوع الماضي' : 'والأسبوع الماضي صفر'
  const pct = Math.round(((cur - prev) / prev) * 100)
  if (pct === 0) return 'كالأسبوع الماضي'
  return `${pct > 0 ? 'أكثر' : 'أقلّ'} بـ${Math.abs(pct)}٪ من الأسبوع الماضي`
}

/**
 * **ثلاثةُ أرقامٍ بفرقها** (خطّة التصميم 5.8 · D-208): الظهورُ والتفاعلُ والإنفاق، كلٌّ بفرقه عن التقرير الذي قبله.
 * كان الرأسُ يقول ما خرج وما قِيس، والأرقامُ متفرّقةٌ في صفوف المنصّات والإنفاقُ رقاقةٌ في بطاقة — فسؤالُ «أأحسنتُ هذا
 * الأسبوع؟» يُجاب بالجمع في الرأس. ولا رقمَ يُخترع: ما لم يُقَس يقول «لم يُقَس»، والفرقُ بلا أسبوعٍ قبله يقول ذلك.
 */
/**
 * **جملةٌ تقرأ الأرقامَ الثلاثة** (EASE-PLAN هـ، من Revolut وMetricool): من أين جاء الظهور، وبكم التفاعلُ الواحد.
 * لا تكرّر فرقَ البلاطات ولا عددَ ما خرج (الرأسُ يقوله، D-235)، **ولا تقول ما لم يُقَس**: منصّةٌ بلا قياسٍ لا تُعَدّ،
 * وكلفةُ التفاعل لا تُحسب بلا إنفاقٍ وتفاعل. و`null` إن لم يبقَ ما يُقال.
 */
export function weekSentence(cur: WeeklyReport): string | null {
  if (cur.published === 0) return null
  const measured = cur.platforms.filter((p) => p.impressions !== null && p.impressions > 0)
  const imp = total(cur, 'impressions'), act = total(cur, 'interactions')
  const parts: string[] = []
  if (imp !== null && imp > 0 && measured.length > 0) {
    const lead = measured.reduce((a, b) => ((b.impressions ?? 0) > (a.impressions ?? 0) ? b : a))
    const share = Math.round(((lead.impressions ?? 0) / imp) * 100)
    parts.push(measured.length === 1
      ? `الظهورُ كلُّه من ${platformLabel(lead.platform)}`
      : `أكثرُ الظهور من ${platformLabel(lead.platform)} (${share}٪)`)
  }
  if (act !== null && act > 0 && cur.spendUsd > 0) {
    parts.push(`وكلّف التفاعلُ الواحد نحو ${money(cur.spendUsd / act)}`)
  }
  if (parts.length === 0) return null
  return `<p class="lede m-0 mb-4">${escapeHtml(parts.join('، '))}.</p>`
}

export function weekKpis(cur: WeeklyReport, prev: WeeklyReport | null): string {
  const tile = (k: string, v: string, note: string): string =>
    `<div class="card tile"><div class="kv-k">${k}</div><div class="kv-v">${v}</div><div class="note">${escapeHtml(note)}</div></div>`
  // ‏وما لم يُقَس لا يُرسَم بذهب العرض: سطرٌ هادئ بحبر ثالث (SPEC-v1 §6.4)
  const num = (n: number | null): string => (n === null ? '<span class="kv-none">—</span><span class="kv-un">لم يُقَس بعد</span>' : n.toLocaleString('en-US'))
  const imp = total(cur, 'impressions'), act = total(cur, 'interactions')
  return `<div class="card grid tiles c3 mb-4">
    ${tile('الظهور', num(imp), delta(imp, prev === null ? null : total(prev, 'impressions'), prev !== null))}
    ${tile('التفاعل', num(act), delta(act, prev === null ? null : total(prev, 'interactions'), prev !== null))}
    ${tile('الإنفاق', escapeHtml(money(cur.spendUsd)), delta(cur.spendUsd, prev?.spendUsd ?? null, prev !== null))}
  </div>${weekSentence(cur) ?? ''}`
}

/** التقريرُ الذي قبله في القائمة (الأحدثُ أوّلًا) — و`null` إن لم يكن، أو لم يُعرف موضعُه. */
function previousOf(reports: readonly StoredReport[], id: string): WeeklyReport | null {
  const i = reports.findIndex((x) => x.id === id)
  return i < 0 ? null : reports[i + 1]?.body ?? null
}

/** الشاشةُ كاملةً: تقريرُ الأسبوع، ثمّ التوصيات، ثمّ ما مضى. */
export function reportScreen(d: ReportScreenData): string {
  const head =
    d.current === null
      ? `<div class="page-head"><div class="txt">
          <div class="eyebrow"><span class="ln"></span>تقرير أسبوعيّ</div>
          <h1>لا تقرير بعد</h1>
          <p class="lede">يُكتب <b>فجر كلّ اثنين</b> عن الأسبوع الذي سبقه.
            ولا يُحسَب عند الفتح: هو <b>شهادة على وقت مضى</b>.</p>
          ${monthLine(d.month)}
        </div></div>`
      // ‏والأسبوعُ الذي قبله التقريرُ التالي في القائمة (الأحدثُ أوّلًا) — لا استعلامَ جديد
      : reportBody(d.current.body, d.now, d.month, weekKpis(d.current.body, previousOf(d.reports, d.current.id)))

  const promo =
    d.promoCapUsd <= 0
      ? `<div class="card">
          <h2>توصية الترويج</h2>
          <div class="outcome warn"><span class="kv-k">لا سقف موضوع</span>
            <span class="kv-v"><b>ولا مبلغ يُقترَح بلا سقف تضعه.</b>
              رقم نؤلّفه نحن رقم بلا مصدر — وهذه تقترح مالا لا كتابة.
              <a class="tap" href="/panel/settings#c3">ضع سقف الترويج الأسبوعيّ</a>
              لتُكتَب التوصيات.</span></div>
        </div>`
      : d.suggestions.length === 0
        ? `<div class="card">
            <h2>توصية الترويج</h2>
            <p class="hint">لا توصية تنتظر. والسقف الموضوع
              <b>${escapeHtml(money(d.promoCapUsd))}</b> أسبوعيّا، ولا يُنفَق منه
              شيء بلا قبولك.</p>
          </div>`
        : `<div class="card">
            <div class="card-head"><h2>توصية الترويج</h2><div class="grow"></div>
              <span class="chip">${d.suggestions.length} تنتظر بتّك</span></div>
            ${d.suggestions.map(suggestionCard).join('')}
          </div>`

  const past =
    d.reports.length <= 1
      ? ''
      : `<div class="card">
          <h2>ما مضى</h2>
          <p class="hint">ما خرج أسبوعًا بأسبوع، <b>ومع كلّ عمود عدد المقيس</b> — فلا
            نسبة بين أسبوعين قِيس أحدُهما نصف قياس.</p>
          ${historyBars(d.reports.map((r) => ({
            label: weekStart(r.body.from, d.now) || r.id,
            value: r.body.published, measured: r.body.measured, href: `/panel/report/${r.id}`,
          })))}
          <div class="scroll"><table>
            <thead><tr><th>الأسبوع</th><th>خرج</th><th>قِيس</th><th>أُنفق</th></tr></thead>
            <tbody>${d.reports
              .map(
                (r) => `<tr>
                  <td data-label="الأسبوع"><a href="/panel/report/${escapeHtml(
                    r.id,
                  )}">${escapeHtml(weekOf(r.body.from, r.body.to, d.now))}</a></td>
                  <td data-label="خرج">${r.body.published}</td>
                  <td data-label="قِيس">${r.body.measured}</td>
                  <td data-label="أُنفق">${escapeHtml(money(r.body.spendUsd))}</td>
                </tr>`,
              )
              .join('')}</tbody></table></div>
        </div>`

  // ‏ومقاييسُ النجاح بعد التقرير وقبل التوصية (D-324): جوابُ «أينجح صدى؟» تحت جواب «ماذا جلب الأسبوع؟»
  const success = d.success === undefined ? '' : successCard(d.success)
  return `${head}${success}${promo}${past}`
}
