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
import type { OwnerRow, Unblocks } from '../../lib/owner'
import type { Gate, ItemState } from '../../lib/gates'

const MARK: Readonly<Record<string, { g: string; cls: string; label: string }>> = {
  done: { g: '●', cls: 'ok', label: 'تمّت' },
  todo: { g: '◍', cls: 'warn', label: 'عليك' },
  unknown: { g: '?', cls: 'idle', label: 'لا يُعرَف من هنا' },
}

/** ماذا تفتح — **والحارسُ يسبق القدرة**: معطَّلٌ منه يُطمئن كذبا. */
const OPENS: Readonly<Record<Unblocks, { label: string; cls: string; why: string }>> = {
  gate: {
    label: 'بوّابة', cls: 'bad',
    why: 'مرحلةٌ لا تُجتاز بدونها — يقف المشروعُ عندها',
  },
  guard: {
    label: 'حارس', cls: 'warn',
    why: 'النظامُ يعمل بدونها **ويبدو محروسا وهو ليس كذلك**',
  },
  capability: {
    label: 'قدرة', cls: 'idle',
    why: 'تُفتَح قدرةٌ جديدة، ولا ينكسر شيءٌ بتركها',
  },
}

function bold(text: string): string {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
}

function row(r: OwnerRow): string {
  const key = r.state === true ? 'done' : r.state === null ? 'unknown' : 'todo'
  const mark = MARK[key]!
  const opens = OPENS[r.unblocks]
  return `<tr class="${key === 'todo' && r.unblocks === 'gate' ? 'urgent' : ''}">
    <td data-label="المهمّة">
      <div class="nm"><span class="mono">${escapeHtml(r.code)}</span>
        · ${escapeHtml(r.title)}</div>
      <div class="sub">${bold(r.ifLeft)}</div>
    </td>
    <td data-label="تفتح">
      <span class="st ${opens.cls}"><span class="g">◆</span>${opens.label}</span>
      <div class="sub">${bold(opens.why)}</div>
    </td>
    <td data-label="الحال">
      <span class="st ${mark.cls}"><span class="g">${mark.g}</span>${mark.label}</span>
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
const ITEM_MARK: Readonly<Record<ItemState, { g: string; cls: string; label: string }>> = {
  met: { g: '●', cls: 'ok', label: 'تحقّق' },
  unmet: { g: '○', cls: 'idle', label: 'لم يتحقّق' },
  unmeasured: { g: '?', cls: 'warn', label: 'لا يُقاس من هنا' },
}

function gateCard(g: Gate): string {
  const items = g.items
    .map((i) => {
      const mark = ITEM_MARK[i.state]
      return `<li class="wz ${mark.cls}">
        <span class="body">
          <span class="what">${bold(i.text)}</span>
          <span class="why">${escapeHtml(i.evidence)}</span>
        </span>
        <span class="st ${mark.cls}"><span class="g">${mark.g}</span>${mark.label}</span>
      </li>`
    })
    .join('')

  return `<div class="card" style="margin-bottom:var(--s-3)">
    <div class="card-head">
      <h2>المرحلة ${escapeHtml(g.phase)} · ${escapeHtml(g.title)}</h2>
      <div class="grow"></div>
      ${g.passed
        ? '<span class="st ok"><span class="g">●</span>اجتِيزت</span>'
        : '<span class="st idle"><span class="g">○</span>لم تُجتَز</span>'}
    </div>
    <ol class="steps wiz nodot">${items}</ol>
  </div>`
}

export interface TasksScreenData {
  readonly rows: readonly OwnerRow[]
  readonly gates: readonly Gate[]
  /** أوّلُ مرحلةٍ لم تُجتَز — أو `null` إن اجتِزن. */
  readonly phase: string | null
}

export function tasksScreen(d: TasksScreenData): string {
  const todo = d.rows.filter((r) => r.state === false)
  const unknown = d.rows.filter((r) => r.state === null)
  const done = d.rows.filter((r) => r.state === true)

  const lede =
    todo.length === 0
      ? unknown.length === 0
        ? '<b>لا شيءَ عليك ممّا يُعرَف من هنا.</b>'
        : `<b>لا شيءَ عليك ممّا يُعرَف من هنا</b> — و${unknown.length} لا تُقرأ
           من اللوحة، تُراجَع في بوّابة المنصّة.`
      : `<b>${todo.length}</b> عليك، منها
         <b>${todo.filter((r) => r.unblocks === 'gate').length}</b> توقف بوّابةَ مرحلة.`

  return `<div class="page-head">
    <div class="txt">
      <div class="eyebrow"><span class="ln"></span>ما يقع عليك أنت</div>
      <h1>مهامُّ المالك</h1>
      <p class="lede">${lede}</p>
    </div>
  </div>

  <div class="card">
    <div class="card-head"><h2>القائمة</h2><div class="grow"></div>
      <span class="chip">${done.length} تمّت · ${todo.length} عليك · ${
        unknown.length} لا تُعرَف</span></div>
    <p class="hint"><b>والحالُ يُشتقّ من البيئة والقاعدة، لا يُكتَب بيد</b> —
      قائمةٌ تُحدَّث بيدٍ تشيخ. <b>وما يقع عند المنصّة يُقال «لا يُعرَف من هنا»
      لا «لم تتمّ»</b>: قولُ «لم تتمّ» عن طلبٍ قُبل يجعلك تعيده.</p>
    <div class="scroll"><table>
      <thead><tr><th>المهمّة وما يقع إن تُركت</th><th>تفتح</th><th>الحال</th></tr></thead>
      <tbody>${d.rows.map(row).join('')}</tbody>
    </table></div>
  </div>

  <div class="lede-row" style="margin-top:var(--s-6)">
    <h3 class="sec" style="margin:0; border:0; padding:0">بوّاباتُ المراحل</h3>
    <span class="grow"></span>
    <span class="st ${d.phase === null ? 'ok' : 'warn'}"><span class="g">${
      d.phase === null ? '●' : '◍'}</span>${
      d.phase === null ? 'اجتِزن كلُّهنّ' : `أنت في المرحلة ${escapeHtml(d.phase)}`}</span>
  </div>

  <p class="hint"><b>وهذه تُقاس من القاعدة لا تُكتَب في وثيقة.</b>
    <span class="mono">docs/PLAN.md</span> يقول «لا تبدأ مرحلة قبل أن تُجتاز بوّابة
    سابقتها ويُسجَّل ذلك في <span class="mono">STATUS.md</span>» —
    <b>وسجلٌّ يُكتب بيدٍ يشيخ</b>، وقد شاخ. فكلُّ بندٍ هنا استعلامٌ على ما وقع،
    <b>ومعه دليلُه</b>. <b>وبندٌ لا يُقاس يُبقي بوّابتَه غيرَ مجتازة</b> —
    فبوّابةٌ تُجتاز بشرطٍ لم يُقَس تُجيز مرحلةً لم تكتمل.</p>

  ${d.gates.map(gateCard).join('')}

  <div class="card">
    <h2>وأين الخطوات</h2>
    <p class="hint">كلُّ مهمّةٍ لها صفحةٌ بالعناصر الستّة في
      <span class="mono">docs/MANUAL-TASKS.md</span> — بأسماء الأزرار كما تراها
      على الشاشة، وعلامةِ النجاح، وما يُقرأ أوّلا إن فشلت.
      <b>ورمزٌ هنا بلا صفحةٍ هناك يُسقط CI</b>، فلا يبقى عنوانٌ بلا خطوات.</p>
  </div>`
}
