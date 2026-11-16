/**
 * شاشةُ «ما عليك».
 *
 * ## ولماذا شاشةٌ والوثيقةُ قائمة
 *
 * الوثيقةُ تقول **ما الخطوات**. والشاشةُ تقول **أين أنت منها الآن** —
 * وهذا ما لا تعرفه وثيقةٌ مكتوبةٌ بيد. و«الحالةُ تُحدَّث هنا حين يقول
 * المالك إنّها تمّت» **وعدٌ يُنسى**: قائمةٌ تُحدَّث بيدٍ تشيخ، وقد
 * شاخت (D-056).
 *
 * ## ولا علامةَ صحٍّ على ما لم يُتحقَّق منه
 *
 * ثلاثُ حالاتٍ لا اثنتان: **تمّت · عليك · لا يُعرَف من هنا**.
 * والثالثةُ لِما يقع عند المنصّة — موافقةُ Community Management مثلا:
 * **لا واجهةَ تقرؤها**، وقولُ «لم تتمّ» عنها يجعل المالكَ يعيد طلبا
 * قُبل (D-061).
 */
import { escapeHtml } from './shell'
import { sectionLabel } from './command'
import { secretCommand, taskDoc, TASKS_DOC, TASKS_LATER, type OwnerRow, type Unblocks } from '../../lib/owner'
import type { Gate, ItemState } from '../../lib/gates'
import { statusBadge, type Tone } from './components/badge'
import { html, join, raw, type Html } from './html'
import { DEVICES, formatVital, METRICS, MIN_SAMPLES, THRESHOLDS, type Metric, type Rating, type VitalsSummary } from '../../lib/vitals'

const MARK: Readonly<Record<string, { g: string; cls: Tone; label: string }>> = {
  done: { g: '●', cls: 'ok', label: 'تمّت' },
  todo: { g: '◍', cls: 'warn', label: 'عليك' },
  unknown: { g: '?', cls: 'idle', label: 'لا يُعرَف من هنا' },
}

/** ماذا تفتح — **والحارسُ يسبق القدرة**: معطَّلٌ منه يُطمئن كذبا. */
const OPENS: Readonly<Record<Unblocks, { label: string; cls: Tone; why: string }>> = {
  gate: {
    label: 'بوّابة', cls: 'bad',
    why: 'مرحلة لا تُجتاز بدونها — يقف المشروع عندها',
  },
  guard: {
    label: 'حارس', cls: 'warn',
    why: 'النظام يعمل بدونها **ويبدو محروسا وهو ليس كذلك**',
  },
  capability: {
    label: 'قدرة', cls: 'idle',
    why: 'تُفتَح قدرة جديدة، ولا ينكسر شيء بتركها',
  },
}

function bold(text: string): string {
  // ‏و`رمزٌ` بين علامتَي اقتباسٍ خلفيّتين يُرسَم رمزًا لا علاماتٍ يراها المالك (D-202)
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<bdi class="mono" dir="ltr">$1</bdi>')
}

/**
 * **الأمرُ يُنسَخ من الصفّ** (D-126): مهمّةٌ تُغلَق بسرٍّ في Worker تحمل أمرَها
 * مكتوبًا للبيئة الحاليّة وزرَّ نسخٍ بجانبه. ولا يُعرَض لما تمّ.
 */
function commandBox(r: OwnerRow, env: string): string {
  if (r.secrets === undefined || r.secrets.length === 0 || r.state === true) return ''
  const id = `cmd-${r.code}`
  const text = r.secrets.map((n) => secretCommand(n, env)).join('\n')
  return `<details class="setup cmd"><summary>للمطوّر</summary>
      <label class="sub" for="${escapeHtml(id)}">من جذر المستودع، بعد <span class="mono">npx wrangler login</span>:</label>
      <div class="row gap-2">
        <textarea class="mono cmd-text" id="${escapeHtml(id)}" rows="${r.secrets.length}" readonly
                  spellcheck="false">${escapeHtml(text)}</textarea>
        <button class="btn btn-secondary btn-sm" type="button" data-copy="${escapeHtml(id)}">انسخ الأمر</button>
      </div>
    </details>`
}

/**
 * ‏**المهمّةُ طيّةٌ مغلقة** (D-310 · GOV.UK Accordion · Krug): كانت كلُّ مهمّةٍ صفًّا مفتوحًا بعناصرها وأمرِها وزرّها، فالصفحةُ
 * ‏‏11.6 شاشة على الهاتف وأوّلُها لا يقول كم بقي. فالعنوانُ وحالُه وما يفتحه في السطر، وما تحته يُفتح حين يُقصَد — والمعلّقةُ
 * ‏الأولى مفتوحةٌ وحدَها: هي ما يُسأل عنه كلَّ صباح.
 */
function item(r: OwnerRow, env: string, open: boolean): string {
  const key = r.state === true ? 'done' : r.state === null ? 'unknown' : 'todo'
  const mark = MARK[key]!
  const opens = OPENS[r.unblocks]
  const urgent = key === 'todo' && r.unblocks === 'gate'
  return `<details class="setup task${urgent ? ' urgent' : ''}"${open ? ' open' : ''}>
    <summary><bdi class="task-id mono" dir="ltr">${escapeHtml(r.code)}</bdi><span class="task-t" id="task-t-${escapeHtml(r.code)}">${bold(r.title)}</span>
      <span class="grow"></span>${statusBadge(opens.cls, '●', opens.label)} ${statusBadge(mark.cls, mark.g, mark.label)}</summary>
    <div class="setup-body">
      ${/* ‏«div» لا «p»: فقرةُ المتن تحمل هامشًا بالحرف (‏14px) خارجَ السلّم، و«.sub» هامشُها من السلّم */ ''}<h4 class="task-h">ما يقع إن تُرك</h4><div class="sub">${bold(r.ifLeft)}</div>
      ${r.measured === '' ? '' : `<h4 class="task-h">كيف يُقاس</h4><div class="sub">${bold(r.measured)}</div>`}
      ${commandBox(r, env)}
      ${r.state === true ? '' : `<div class="row gap-2 mt-2">
        ${r.go === undefined
          ? ''
          : `<a class="btn btn-secondary btn-sm" href="${escapeHtml(r.go)}"${
              r.go.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escapeHtml(r.goLabel ?? 'افتح')}</a>`}
        ${/* ‏**والخطواتُ رابطٌ لا اسمُ ملفّ** (ر-1): العناصرُ الستّةُ في الوثيقة وحدها */ ''}<a class="tap" href="${escapeHtml(taskDoc(r.code))}" id="task-s-${escapeHtml(r.code)}"
          target="_blank" rel="noopener noreferrer" aria-labelledby="task-s-${escapeHtml(r.code)} task-t-${escapeHtml(r.code)}">الخطوات</a>
      </div>`}
    </div>
  </details>`
}

/**
 * بطاقةُ بوّابةٍ — **ومعها دليلُ كلّ بند، لا حكمُه وحده.**
 *
 * «لم تُجتَز» بلا رقمٍ لا تُعالَج: **مِن أينَ يبدأ من يقرؤها؟** فيُعرَض
 * تحت كلّ بندٍ ما بُني عليه الحكم — «linkedin: 3 · x: 0» تقول ما ينقص
 * بلا كلمة.
 */
const ITEM_MARK: Readonly<Record<ItemState, { g: string; cls: Tone; label: string }>> = {
  met: { g: '●', cls: 'ok', label: 'تحقّق' },
  unmet: { g: '○', cls: 'idle', label: 'لم يتحقّق' },
  unmeasured: { g: '?', cls: 'warn', label: 'لا يُقاس من هنا' },
}

function gateCard(g: Gate): string {
  const items = g.items
    .map((i) => {
      const mark = ITEM_MARK[i.state]
      return `<li class="${mark.cls}">
        <span class="body">
          <span class="what">${bold(i.text)}</span>
          <span class="why">${escapeHtml(i.evidence)}</span>
        </span>
        ${statusBadge(mark.cls, mark.g, mark.label)}
      </li>`
    })
    .join('')

  return `<div class="card mb-3">
    <div class="card-head">
      <h2>المرحلة ${escapeHtml(g.phase)} · ${escapeHtml(g.title)}</h2>
      <div class="grow"></div>
      ${g.passed
        ? statusBadge('ok', '●', 'اجتِيزت')
        : statusBadge('idle', '○', 'لم تُجتَز')}
    </div>
    <ol class="steps wiz nodot">${items}</ol>
  </div>`
}

/** أين المشروعُ من بوّاباته — في سطر «ما عليك» وفي رأس صفحتها، بكلمةٍ واحدة (نصًّا، ويُهرَّب حيث يُرسَم). */
function phaseLine(phase: string | null): string {
  return phase === null ? 'اجتِزن كلُّهنّ' : `أنت في المرحلة ${phase}`
}

export interface GatesScreenData {
  readonly gates: readonly Gate[]
  /** أوّلُ مرحلةٍ لم تُجتَز — أو `null` إن اجتِزن. */
  readonly phase: string | null
}

/**
 * ‏**شاشةُ «بوّابات المراحل»** — `/panel/gates`.
 *
 * ‏كانت طيّةً في آخر «ما عليك» (EASE-PLAN · D-252)، ثمّ رفعت مهامُّ D-318 وD-324 الأربعُ (M-39 إلى M-42) الصفحةَ فوق سقفها
 * ‏(‏14.2KB من ‏14KB مضغوطًا، `audit_size`)، وحارسُ الوزن يقول: ما تجاوز سقفَه يُقسَم أو يُؤجَّل، ولا يُرفع السقفُ ليمرّ.
 * ‏والبوّاباتُ أخفُّ ما يخرج بلا خسارة: لغةُ خطّة المشروع لا سؤالُ اليوم، وتُقرأ نادرًا. فصار لها بابُها بدور «ما عليك» نفسِه،
 * ‏و«ما عليك» يقول المرحلةَ في سطرٍ ويحيل إليها.
 */
export function gatesScreen(d: GatesScreenData): string {
  return html`<div class="page-head">
    <div class="txt">
      <div class="eyebrow"><span class="ln"></span>خطّة المشروع تُقاس</div>
      <h1>بوّابات المراحل</h1>
      <p class="lede">${d.phase === null
        ? html`<b>${phaseLine(d.phase)}.</b>`
        : html`<b>${phaseLine(d.phase)}</b>، وبوّابتُها أوّلُ ما لم يُجتَز.`}</p>
    </div>
  </div>

  <p class="hint"><b>البوّابات تُقاس من القاعدة لا تُكتَب في وثيقة.</b>
    خطّة المشروع تقول «لا تبدأ مرحلة قبل أن تُجتاز بوّابة
    سابقتها ويُسجَّل ذلك في سجلّ الحال»،
    <b>وسجلّ يُكتب بيد يشيخ</b>، وقد شاخ. فكلّ بند هنا استعلام على ما وقع،
    <b>ومعه دليلُه</b>. <b>وبند لا يُقاس يُبقي بوّابتَه غير مجتازة</b>،
    فبوّابة تُجتاز بشرط لم يُقَس تُجيز مرحلةً لم تكتمل.</p>

  ${raw(d.gates.map(gateCard).join(''))}`.value
}

export interface TasksScreenData {
  /** ‏المهامُّ كلُّها: «ما عليك» يرسم البوّابةَ والحارس، ويعدّ القدرةَ في سطرٍ إلى صفحتها (متابعة D-324). */
  readonly rows: readonly OwnerRow[]
  /** أوّلُ مرحلةٍ لم تُجتَز — أو `null` إن اجتِزن. يقولها سطرُ البوّابات وحدَه، وبطاقاتُها في `/panel/gates`. */
  readonly phase: string | null
  /** البيئةُ التي تُفتَح منها — فأمرُ `wrangler` يُكتب لها لا لغيرها. */
  readonly env: string
  /** ما قِيس من متصفّح المالك في أسبوع (D-299) — و`null` حين لا تُقرأ القاعدة. */
  readonly vitals?: VitalsSummary | null
  /** إرسالاتٌ رُدّت لعيبٍ في المُدخَل هذا الأسبوع (D-302). */
  readonly rejects?: number
}

const METRIC_LABEL: Readonly<Record<Metric, string>> = {
  LCP: 'أوّلُ محتوًى كبير (LCP)',
  INP: 'الاستجابةُ للّمس (INP)',
  CLS: 'ثباتُ التخطيط (CLS)',
}
const DEVICE_LABEL = { phone: 'الهاتف', desktop: 'الحاسوب' } as const
const RATING_MARK: Readonly<Record<Rating, { cls: Tone; label: string }>> = {
  good: { cls: 'ok', label: 'جيّد' },
  'needs-improvement': { cls: 'warn', label: 'يحتاج تحسينًا' },
  poor: { cls: 'bad', label: 'ضعيف' },
}

/**
 * **سرعةُ اللوحة عندك** (D-299): ما قاسه متصفّحُ المالك لا ما قدّره المختبر — المئينُ ‏75 لكلّ مقياسٍ وجهازٍ في
 * أسبوع، والحكمُ من حدود web.dev. ودون عشر عيّناتٍ لا حكم: يُقال «لم تُقَس بعد» لا «جيّد».
 */
function rejectsLine(n: number | undefined): string {
  if (n === undefined) return ''
  const text = n === 0 ? 'لم يُردّ إرسالٌ هذا الأسبوع.' : n === 1 ? 'رُدّ إرسالٌ واحد هذا الأسبوع.' : n === 2 ? 'رُدّ إرسالان هذا الأسبوع.' : `رُدّ ${n} إرسالات هذا الأسبوع.`
  return html`<p class="hint m-0 mt-2">${text} الردُّ لعيبٍ في المُدخَل يُعَدّ، والهدفُ خمسةٌ في المئة من الإرسال أو أقلّ.</p>`.value
}

function vitalsCard(v: VitalsSummary | null | undefined, rejects?: number): string {
  if (v === null || v === undefined) {
    return html`<div class="card mb-3"><div class="card-head"><h2>سرعةُ اللوحة عندك</h2></div>
      <p class="hint m-0">القياسُ لا يُقرأ الآن.</p></div>`.value
  }
  const cell = (m: Metric, d: (typeof DEVICES)[number]): string => {
    const x = v.byMetric[m][d]
    if (x.p75 === null) return html`<td><span class="ago">لم تُقَس</span></td>`.value
    const mark = x.rating === null ? null : RATING_MARK[x.rating]
    return html`<td><b>${formatVital(m, x.p75)}</b> ${mark === null
      ? html`<span class="ago">${x.n} من ${MIN_SAMPLES}</span>`
      : raw(statusBadge(mark.cls, '●', mark.label))}</td>`.value
  }
  const rows = METRICS.map((m) => html`<tr><td>${METRIC_LABEL[m]}</td>${raw(DEVICES.map((d) => cell(m, d)).join(''))}<td>${formatVital(m, THRESHOLDS[m][0])}</td></tr>`)
  const slow = v.slowest === null ? '' : html`<p class="hint m-0 mt-2">أبطأُ صفحةٍ على الهاتف: <code>${v.slowest.page}</code> (${formatVital('LCP', v.slowest.p75)}).</p>`
  return html`<div class="card mb-3">
    <div class="card-head"><h2>سرعةُ اللوحة عندك</h2><div class="grow"></div>
      <span class="chip">${v.samples} عيّنة في ${v.days} أيّام</span></div>
    ${v.samples < MIN_SAMPLES
      ? html`<p class="hint">لم تُقَس بعد: افتح اللوحةَ من هاتفك مرّاتٍ وستُقاس من نفسها. ثلاثةُ أرقامٍ كما تعرّفها web.dev،
        بلا هويّةٍ ولا عنوان، والحكمُ عند المئين 75 من عشر عيّناتٍ فأكثر.</p>`
      : html`<p class="hint">ما قاسه متصفّحُك لا ما قدّره المختبر: المئينُ 75 في أسبوع، والحدُّ حدُّ web.dev للجيّد.</p>`}
    <div class="scroll"><table>
      <thead><tr><th>المقياس</th>${raw(DEVICES.map((d) => html`<th>${DEVICE_LABEL[d]}</th>`.value).join(''))}<th>الحدّ</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${slow}
    ${raw(rejectsLine(rejects))}
  </div>`.value
}

/** القائمةُ طيّاتٌ — والمفتوحةُ أوّلُ ما عليك وحدَها. */
function list(rows: readonly OwnerRow[], env: string): string {
  const first = rows.findIndex((r) => r.state === false)
  return rows.map((r, i) => item(r, env, i === first)).join('')
}

/** ‏ما في الصفحة بحاله: عليك · لا يُعرَف · تمّت — ومن صفوفها وحدها، فالرأسُ والرقاقةُ يعدّان الشيءَ نفسَه. */
function tally(rows: readonly OwnerRow[]): { readonly todo: readonly OwnerRow[]; readonly unknown: readonly OwnerRow[]; readonly done: readonly OwnerRow[] } {
  return {
    todo: rows.filter((r) => r.state === false),
    unknown: rows.filter((r) => r.state === null),
    done: rows.filter((r) => r.state === true),
  }
}

/**
 * ‏**ما يعدّه رأسُ كلّ صفحةٍ باسمه** (مراجعة متابعة D-324): كلٌّ يعدّ نوعَه وحدَه، فرأسٌ يقول «N عليك» أو «لا شيء عليك» بلا اسمِ
 * ‏ما يعدّه يُقرأ عن الكلّ — وقد قال «لا شيء عليك» وسطرُ «تفتح قدرة» تحته «7 عليك».
 */
const HERE_SCOPE = 'ممّا يوقف أو يحرس'
const LATER_SCOPE = 'ممّا يفتح قدرة'

/** ‏الرأسُ حين لا شيء عليك ممّا يُعرَف — **باسم ما تعدّه الصفحة**، ويقول المجهولَ إن كان، فلا يُقرأ الفراغُ «تمّ كلُّ شيء». */
function idleLede(scope: string, unknown: number): Html {
  return unknown === 0
    ? html`<b>لا شيء عليك ${scope}</b>، فيما يُعرَف من هنا.`
    : html`<b>لا شيء عليك ${scope}</b>، فيما يُعرَف من هنا — و${unknown} لا تُقرأ
           من اللوحة، تُراجَع في بوّابة المنصّة.`
}

/**
 * ‏بطاقةُ القائمة — **في الصفحتين بقالبٍ واحد**: الرقاقةُ بما في الصفحة، والشرحُ مرّةً، ومعنى الأنواع التي فيها وحدها، ثمّ المعلّقةُ
 * ‏فما تمّ مطويًّا (EASE-PLAN: كانت الصفحةُ ثلاثَ عشرةَ شاشةً على الهاتف، وأوّلُها لا يقول ما بقي).
 * ‏و`list` و`bold` لم يُحوَّلا إلى `html` بعدُ (`item` و`commandBox` تحتهما): مخرَجُهما يمرّ بـ`raw` عند الحدّ.
 */
function listCard(rows: readonly OwnerRow[], env: string, kinds: readonly Unblocks[]): Html {
  const { todo, unknown, done } = tally(rows)
  return html`<div class="card">
    <div class="card-head"><h2>القائمة</h2><div class="grow"></div>
      <span class="chip">${done.length} تمّت · ${todo.length} عليك · ${
        unknown.length} لا تُعرَف</span></div>
    <details class="fold task-how"><summary><span>كيف تعمل هذه القائمة</span></summary>
    <p class="hint"><b>الحالُ يُقرأ من صدى نفسِه</b>، ولا يُكتَب بيد. وما يقع عند المنصّة يُقال «لا يُعرَف من هنا».</p>
    <p class="hint">${join(kinds.map((k) => html`<b>«${OPENS[k].label}»</b>: ${raw(bold(OPENS[k].why))}.`), html` `)}</p></details>
    ${raw(list(rows.filter((r) => r.state !== true), env))}
    ${done.length === 0
      ? ''
      : html`<details class="setup mt-3"><summary>تمّت (${done.length})</summary>${raw(list(done, env))}</details>`}
  </div>`
}

/** ‏وأين الخطوات — في الصفحتين: العناصرُ الستّةُ في الوثيقة وحدها، ورابطُها لا اسمُ ملفّها. */
function stepsCard(): Html {
  return html`<div class="card">
    <h2>وأين الخطوات</h2>
    <p class="hint">كلّ مهمّة لها صفحة بالعناصر الستّة في
      <a class="tap" href="${TASKS_DOC}" target="_blank" rel="noopener noreferrer"
        data-tip="docs/MANUAL-TASKS.md">دليل المهامّ اليدويّة</a> — بأسماء الأزرار كما تراها
      على الشاشة، وعلامة النجاح، وما يُقرأ أوّلا إن فشلت.
      <b>ومعرِّف هنا بلا صفحة هناك يُسقط CI</b>، فلا يبقى عنوان بلا خطوات.</p>
  </div>`
}

/** ‏اسمُ صفحة القدرة في رأسها وفي سطرها وفي عنوان المتصفّح — من موضعٍ واحد (متابعة D-324). */
export const LATER_LABEL = 'تفتح قدرة'

/** ‏عنوانُ المتصفّح: «ما عليك» ثمّ الصفحة، فيُعرَف موضعُها في التبويب والسجلّ. */
export function laterTitle(): string {
  return 'صدى — ' + sectionLabel('tasks') + ' · ' + LATER_LABEL
}

/**
 * ‏سطرُ «تفتح قدرة» في رأس «ما عليك» (متابعة D-324) — **في الشاشة الأولى**: الرأسُ يعدّ ما يوقف أو يحرس وحدَه ويقولها، فبلا هذا
 * ‏السطر يقرأ المالكُ «3 عليك ممّا يوقف أو يحرس» وقد كانت «10 عليك» ولا يعرف أين ذهب الباقي. ويعدّ ما عليك منها كما تعدّه صفحتُها.
 */
function laterLine(rows: readonly OwnerRow[]): Html {
  const n = rows.filter((r) => r.state === false).length
  return html`<p class="hint m-0 mt-2"><a class="tap" href="${TASKS_LATER}">${LATER_LABEL}</a> · ${
    n === 0 ? 'لا شيء عليك ممّا يُعرَف منها' : html`${n} عليك`}، ولا ينكسر شيء بتركها.</p>`
}

export function tasksScreen(d: TasksScreenData): string {
  // ‏**القائمةُ بنوعها** (متابعة D-324): البوّابةُ والحارسُ هنا، والقدرةُ في صفحتها وسطرُها في الرأس
  const here = d.rows.filter((r) => r.unblocks !== 'capability')
  const { todo, unknown } = tally(here)

  const lede =
    todo.length === 0
      ? idleLede(HERE_SCOPE, unknown.length)
      : html`<b>${todo.length}</b> عليك ${HERE_SCOPE}، منها
         <b>${todo.filter((r) => r.unblocks === 'gate').length}</b> توقف بوّابة مرحلة.`

  // ‏و`vitalsCard` يعيد نصًّا (`.value` من قالب `html` نفسِه)، فيمرّ بـ`raw` عند الحدّ
  return html`<div class="page-head">
    <div class="txt">
      <div class="eyebrow"><span class="ln"></span>ما يقع عليك أنت</div>
      <h1>${sectionLabel('tasks')}</h1>
      <p class="lede">${lede}</p>
      ${laterLine(d.rows.filter((r) => r.unblocks === 'capability'))}
    </div>
  </div>

  ${listCard(here, d.env, ['gate', 'guard'])}

  ${/* ‏وبوّاباتُ المراحل لغةُ خطّة المشروع لا سؤالُ اليوم: سطرٌ يقول حالَها ويحيل إلى صفحتها (دمجُ D-318 مع D-324) */''}<p class="hint mt-6"><a class="tap" href="/panel/gates">بوّابات المراحل</a> · ${phaseLine(d.phase)}</p>

  ${raw(vitalsCard(d.vitals, d.rejects))}

  ${stepsCard()}`.value
}

export interface LaterScreenData {
  /** ‏المهامُّ كلُّها، والصفحةُ ترسم ما يفتح قدرةً منها وحدَه. */
  readonly rows: readonly OwnerRow[]
  readonly env: string
}

/**
 * ‏**شاشةُ «تفتح قدرة»** — `/panel/tasks/later` (متابعة D-324).
 *
 * ‏كانت مهامُّ القدرة في «ما عليك» مع البوّابات والحرّاس، فبلغت الصفحةُ ‏14.0KB مضغوطًا والسقفُ ‏14KB، والمهمّةُ نحو ‏0.19KB،
 * ‏ومهامُّ D-321 وD-322 قادمة. وD-324 كتب قاعدةَ العبور التالي: تُقسَم القائمةُ بنوعها ولا يُرفع السقف. فالقدرةُ هنا بطاقتُها
 * ‏نفسُها وطيّاتُها نفسُها، بدور «ما عليك» وجلستها وموضعها في الرافدة، والعودةُ إليها.
 */
export function laterScreen(d: LaterScreenData): string {
  const rows = d.rows.filter((r) => r.unblocks === 'capability')
  const { todo, unknown } = tally(rows)
  const lede = todo.length === 0
    ? idleLede(LATER_SCOPE, unknown.length)
    : html`<b>${todo.length}</b> عليك، وكلٌّ منها يفتح لصدى ما لا يقدر عليه اليوم.`

  return html`<div class="page-head">
    <div class="txt">
      <div class="eyebrow"><span class="ln"></span>${sectionLabel('tasks')}</div>
      <h1>${LATER_LABEL}</h1>
      <p class="lede">${lede}</p>
    </div>
  </div>

  ${listCard(rows, d.env, ['capability'])}

  ${stepsCard()}`.value
}
