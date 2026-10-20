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
import { secretCommand, taskDoc, TASKS_DOC, type OwnerRow, type Unblocks } from '../../lib/owner'
import type { Gate, ItemState } from '../../lib/gates'
import { statusBadge, type Tone } from './components/badge'

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
  return `<div class="cmd">
      <label class="sub" for="${escapeHtml(id)}">من جذر المستودع، بعد <span class="mono">npx wrangler login</span>:</label>
      <div class="row gap-2">
        <textarea class="mono cmd-text" id="${escapeHtml(id)}" rows="${r.secrets.length}" readonly
                  spellcheck="false">${escapeHtml(text)}</textarea>
        <button class="btn btn-secondary btn-sm" type="button" data-copy="${escapeHtml(id)}">انسخ الأمر</button>
      </div>
    </div>`
}

function row(r: OwnerRow, env: string): string {
  const key = r.state === true ? 'done' : r.state === null ? 'unknown' : 'todo'
  const mark = MARK[key]!
  const opens = OPENS[r.unblocks]
  return `<tr class="${key === 'todo' && r.unblocks === 'gate' ? 'urgent' : ''}">
    <td data-label="المهمّة">
      ${/* ‏**العنوان أوّلًا والرمز صغير بعده** (D-203): كان «M-16» أبرز ما في الصفّ */ ''}<div class="nm">${bold(r.title)}
        <small class="ago"><bdi dir="ltr">${escapeHtml(r.code)}</bdi></small></div>
      <div class="sub">${bold(r.ifLeft)}</div>
      ${commandBox(r, env)}
      ${r.go === undefined || r.state === true
        ? ''
        : `<a class="btn btn-secondary btn-sm mt-2" href="${escapeHtml(r.go)}"${
            r.go.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escapeHtml(r.goLabel ?? 'افتح')}</a>`}
      ${/*
         * ‏**والخطواتُ رابطٌ لا اسمُ ملفّ** (ر-1): العناصرُ الستّةُ في الوثيقة وحدها، وكانت
         * ‏الشاشةُ تسمّيها ولا تفتحها — فلا تُبلَغ من الهاتف. ولا تُعرَض لما تمّ.
         */ ''}${r.state === true ? '' : `<div class="sub"><a class="tap" href="${escapeHtml(taskDoc(r.code))}"
        target="_blank" rel="noopener noreferrer" aria-label="خطوات ${escapeHtml(r.title.replaceAll('`', ''))}">الخطوات</a></div>`}
    </td>
    <td data-label="تفتح">
      ${statusBadge(opens.cls, '◆', opens.label)}
      <div class="sub">${bold(opens.why)}</div>
    </td>
    <td data-label="الحال">
      ${statusBadge(mark.cls, mark.g, mark.label)}
      ${/*
         * **و«تمّت» وحدها تكذب على مهمّةٍ دوريّة** (D-072): مراجعةٌ لم
         * تقع بعدُ وليست مستحقّةً ليست «تمّت» — فيُقال ما قِيس، كما
         * تحمل بنودُ البوّابات دليلَها.
         */ ''}${r.measured === '' ? '' : `<div class="sub">${bold(r.measured)}</div>`}
    </td>
  </tr>`
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

export interface TasksScreenData {
  readonly rows: readonly OwnerRow[]
  readonly gates: readonly Gate[]
  /** أوّلُ مرحلةٍ لم تُجتَز — أو `null` إن اجتِزن. */
  readonly phase: string | null
  /** البيئةُ التي تُفتَح منها — فأمرُ `wrangler` يُكتب لها لا لغيرها. */
  readonly env: string
}

export function tasksScreen(d: TasksScreenData): string {
  const todo = d.rows.filter((r) => r.state === false)
  const unknown = d.rows.filter((r) => r.state === null)
  const done = d.rows.filter((r) => r.state === true)

  const lede =
    todo.length === 0
      ? unknown.length === 0
        ? '<b>لا شيء عليك ممّا يُعرَف من هنا.</b>'
        : `<b>لا شيء عليك ممّا يُعرَف من هنا</b> — و${unknown.length} لا تُقرأ
           من اللوحة، تُراجَع في بوّابة المنصّة.`
      : `<b>${todo.length}</b> عليك، منها
         <b>${todo.filter((r) => r.unblocks === 'gate').length}</b> توقف بوّابة مرحلة.`

  return `<div class="page-head">
    <div class="txt">
      <div class="eyebrow"><span class="ln"></span>ما يقع عليك أنت</div>
      <h1>${escapeHtml(sectionLabel('tasks'))}</h1>
      <p class="lede">${lede}</p>
    </div>
  </div>

  <div class="card">
    <div class="card-head"><h2>القائمة</h2><div class="grow"></div>
      <span class="chip">${done.length} تمّت · ${todo.length} عليك · ${
        unknown.length} لا تُعرَف</span></div>
    <p class="hint"><b>والحال يُشتقّ من البيئة والقاعدة، لا يُكتَب بيد</b> —
      قائمة تُحدَّث بيد تشيخ. <b>وما يقع عند المنصّة يُقال «لا يُعرَف من هنا»
      لا «لم تتمّ»</b>: قول «لم تتمّ» عن طلب قُبل يجعلك تعيده.</p>
    <div class="scroll"><table>
      <thead><tr><th>المهمّة وما يقع إن تُركت</th><th>تفتح</th><th>الحال</th></tr></thead>
      <tbody>${d.rows.map((r) => row(r, d.env)).join('')}</tbody>
    </table></div>
  </div>

  <div class="lede-row mt-6">
    <h3 class="sec bare">بوّابات المراحل</h3>
    <span class="grow"></span>
    ${statusBadge(d.phase === null ? 'ok' : 'warn', d.phase === null ? '●' : '◍', `${
      d.phase === null ? 'اجتِزن كلُّهنّ' : `أنت في المرحلة ${escapeHtml(d.phase)}`}`)}
  </div>

  <p class="hint"><b>وهذه تُقاس من القاعدة لا تُكتَب في وثيقة.</b>
    خطّة المشروع تقول «لا تبدأ مرحلة قبل أن تُجتاز بوّابة
    سابقتها ويُسجَّل ذلك في سجلّ الحال» —
    <b>وسجلّ يُكتب بيد يشيخ</b>، وقد شاخ. فكلّ بند هنا استعلام على ما وقع،
    <b>ومعه دليلُه</b>. <b>وبند لا يُقاس يُبقي بوّابتَه غير مجتازة</b> —
    فبوّابة تُجتاز بشرط لم يُقَس تُجيز مرحلةً لم تكتمل.</p>

  ${d.gates.map(gateCard).join('')}

  <div class="card">
    <h2>وأين الخطوات</h2>
    <p class="hint">كلّ مهمّة لها صفحة بالعناصر الستّة في
      <a class="tap" href="${escapeHtml(TASKS_DOC)}" target="_blank" rel="noopener noreferrer"
        title="docs/MANUAL-TASKS.md">دليل المهامّ اليدويّة</a> — بأسماء الأزرار كما تراها
      على الشاشة، وعلامة النجاح، وما يُقرأ أوّلا إن فشلت.
      <b>ومعرِّف هنا بلا صفحة هناك يُسقط CI</b>، فلا يبقى عنوان بلا خطوات.</p>
  </div>`
}
