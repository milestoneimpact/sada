/**
 * قسمُ المسوّدات — حيث يقع القرار.
 *
 * ## المربّعُ قابلٌ للتحرير دائما
 *
 * لا «اعرض» ثمّ «عدّل» في شاشةٍ ثانية: النصُّ الذي يراه المالك هو النصُّ
 * الذي يُرسَل. فلا فرقَ بين ما قُرئ وما اعتُمد، ولا زرَّ اعتمادٍ يتجاهل
 * تحريرا وقع في المربّع.
 *
 * ## والعدّادُ يعدّ ما تقبله المنصّة لا ما نستهدفه
 *
 * الهدفُ توجيهٌ للنموذج، والحدُّ رفضٌ من المنصّة. فيُلوَّن العدّاد عند
 * الحدّ وحده — تحذيرٌ عند تجاوز الهدف، وخطأٌ عند تجاوز الحدّ. ومنشورٌ
 * أطولُ من الهدف بقليل يُنشر، وأطولُ من الحدّ بمحرفٍ لا يُنشر.
 *
 * ## ولا زرَّ نشرٍ هنا
 *
 * الاعتمادُ يفتح البابَ ولا يعبره: `approved_at` شرطُ الطابور في القاعدة
 * (D-009)، والطابورُ نفسه ينتظر قناةً مربوطة. **وزرٌّ يقول «انشر» ثمّ لا
 * ينشر أسوأ من غيابه.**
 */
import type { DraftRow } from '../../../lib/draft/store'
import { PLATFORMS } from '../../../lib/draft/prompt'
import { escapeHtml } from '../shell'
import { relativeTime } from '../../../lib/format'

const MARK: Readonly<Record<string, string>> = {
  linkedin: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM10 9h3.8v1.7h.05c.53-1 1.83-2.05 3.76-2.05C21.4 8.65 22 11 22 14.2V21h-4v-6c0-1.43-.03-3.27-2-3.27-2 0-2.3 1.56-2.3 3.17V21h-4z"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 3h3.1l-6.8 7.8L21.8 21h-6.2l-4.9-6.4L5.1 21H2l7.3-8.3L2.5 3h6.3l4.4 5.8zm-1.1 16.1h1.7L7.7 4.8H5.9z"/></svg>',
}

const STATUS: Readonly<Record<string, { cls: string; glyph: string; text: string }>> = {
  draft: { cls: 'idle', glyph: '○', text: 'تنتظر قرارك' },
  approved: { cls: 'ok', glyph: '●', text: 'معتمَدة' },
  edited: { cls: 'ok', glyph: '●', text: 'معتمَدة بعد تعديل' },
  rejected: { cls: 'bad', glyph: '✕', text: 'مرفوضة' },
  queued: { cls: 'warn', glyph: '↑', text: 'في الطابور' },
  published: { cls: 'ok', glyph: '✓', text: 'نُشرت' },
  failed: { cls: 'bad', glyph: '▲', text: 'فشل النشر' },
}

function money(value: number): string {
  return value === 0 ? '—' : `${value.toFixed(4)}$`
}

/** أسطرُ المربّع — لكلّ منصّةٍ قدرُ نصّها، فلا فائضٌ ولا فراغ. */
const LINES: Readonly<Record<string, number>> = { linkedin: 12, x: 6 }
const LINE = 26
const PAD = 28

function card(d: DraftRow, now: Date): string {
  const spec = PLATFORMS[d.platform]
  const st = STATUS[d.status] ?? STATUS['draft']!
  const open = d.status === 'draft'
  const len = d.text.length
  // متغيّرٌ لا خاصّيّة: ارتفاعٌ مكتوبٌ في `style` لا تغلبه استفسارةُ وسط،
  // فيبقى الجوّالُ — حيث يلتفّ النصّ أضعافا — بمربّعٍ مقاسِ الشاشة العريضة
  const box = `--lines:${LINES[d.platform] ?? 9}`

  const meta = [
    d.sourceName === null ? '' : `<span class="chip">${escapeHtml(d.sourceName)}</span>`,
    d.model === null ? '' : `<span class="chip mono">${escapeHtml(d.model)}</span>`,
    `<span class="chip mono">${money(d.cost)}</span>`,
    d.stale ? '<span class="st warn"><span class="g">▲</span>المصدر تغيّر بعدها</span>' : '',
  ]
    .filter((x) => x !== '')
    .join('')

  // مربّعٌ يُحرَّر ونصٌّ يُقرأ: البَتُّ مفتوحٌ للمسوّدة وحدها، وما بُتّ فيه
  // يبقى معروضا ولا يُحذف — كلفتُه وقعت، وما دُفع ثمنُه يُرى
  const editor = open
    ? `<form method="POST" action="/panel/drafts/decide" data-busy="جارٍ…">
         <input type="hidden" name="id" value="${escapeHtml(d.id)}">
         <textarea name="text" class="draft-text" style="${box}"
           data-limit="${spec.hardLimit}" data-target="${spec.target}"
           aria-label="نصّ المنشور">${escapeHtml(d.text)}</textarea>
         <div class="draft-foot">
           <span class="count ${len > spec.hardLimit ? 'bad' : len > spec.target ? 'warn' : ''}"
             ><b>${len}</b> / ${spec.hardLimit}</span>
           <span class="grow"></span>
           <button class="g sm" type="submit" name="do" value="reject">ارفض</button>
           <button class="p sm" type="submit" name="do" value="approve">اعتمد</button>
         </div>
       </form>`
    : `<div class="draft-text ro" style="${box}" data-ro>${escapeHtml(d.text)}</div>
       <div class="draft-foot"><span class="count"><b>${len}</b> / ${spec.hardLimit}</span>
         <span class="grow"></span>
         ${d.approvedBy === null
           ? ''
           : `<span class="ago">${d.status === 'rejected' ? 'رفضها' : 'اعتمدها'} ${escapeHtml(
               d.approvedBy,
             )}</span>`}</div>`

  return `<div class="draft${open ? '' : ' done'}">
    <div class="draft-top">
      <div class="ch-logo sm">${MARK[d.platform] ?? ''}</div>
      <div class="ch-name">${escapeHtml(spec.label)}
        <span class="ago">منذ ${escapeHtml(relativeTime(d.createdAt, now))}</span></div>
      <span class="grow"></span>
      <span class="st ${st.cls}"><span class="g">${st.glyph}</span>${escapeHtml(st.text)}</span>
    </div>
    ${d.rationale === null || d.rationale === '' ? '' : `<p class="draft-why">${escapeHtml(d.rationale)}</p>`}
    ${editor}
    <div class="draft-meta">${meta}</div>
  </div>`
}

export interface DraftsInput {
  readonly drafts: readonly DraftRow[]
  /** مصادرُ محلَّلةٌ يمكن أن تُكتب منها — بلا خلاصةٍ لا مادّة. */
  readonly writable: readonly { id: string; name: string }[]
  readonly now: Date
  /** أمزوّدُ مهمّة `draft` جاهز؟ زرٌّ لا ينادي أحدا لا يُعرض عاملا. */
  readonly ready: boolean
}

export function draftsSection(input: DraftsInput): string {
  const { drafts, writable, now } = input
  const waiting = drafts.filter((d) => d.status === 'draft').length

  // نموذجُ الكتابة: مصدرٌ ومنصّة، ونداءٌ واحد لكلٍّ. ولا كتابةَ آليّة —
  // الإنفاقُ يبدأ بضغطةٍ من المالك لا بدورةِ ساعة
  const writer =
    writable.length === 0
      ? `<div class="empty"><b>لا مصدر جاهزا للكتابة</b>
           <p>الكتابةُ تنطلق من خلاصةِ تحليلٍ لا من المستند نفسه.
              حلّل مصدرا أوّلا ثمّ عد.</p>
           <a class="btn g sm" href="#sources">اذهب إلى المصادر</a></div>`
      : `<form class="row" method="POST" action="/panel/drafts/write" data-busy="جارٍ الكتابة…">
           <div class="field"><label for="dw-src">المصدر</label>
             <select id="dw-src" name="id">${writable
               .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`)
               .join('')}</select></div>
           <div class="field"><label for="dw-pf">المنصّة</label>
             <select id="dw-pf" name="platform">
               <option value="linkedin">LinkedIn — نحو ١٣٠٠ محرف</option>
               <option value="x">X — نحو ٢٥٠ محرفا</option></select></div>
           <div class="grow"></div>
           <button class="p" type="submit"${input.ready ? '' : ' disabled'}>اكتب مسوّدة</button>
         </form>
         ${input.ready
           ? ''
           : '<p class="hint" style="margin:10px 0 0">مزوّدُ مهمّة الكتابة غير جاهز — اضبط مفتاحه في «المزوّدون».</p>'}`

  const list =
    drafts.length === 0
      ? `<div class="empty"><b>لا مسوّدات بعد</b>
           <p>اكتب واحدةً من مصدرٍ محلَّل، وستظهر هنا لتقرأها وتقرّر.</p></div>`
      : `<div class="grid c2 ragged">${drafts.map((d) => card(d, now)).join('')}</div>`

  return `<div class="card" style="margin-bottom:14px">
    <div class="card-head"><h2>الكتابة من مصدر</h2>
      <div class="grow"></div>
      <span class="st ${waiting === 0 ? 'idle' : 'warn'}"><span class="g">${
        waiting === 0 ? '○' : '!'}</span>${waiting} تنتظر قرارك</span></div>
    <p class="hint">نداءٌ واحدٌ لكلّ ضغطة، وكلفتُه تُسجَّل قبل أن تُكتب المسوّدة.
      <b>ولا كتابةَ آليّة</b> — الإنفاق يبدأ بقرارك لا بدورةِ ساعة.</p>
    ${writer}
  </div>

  <div class="lede-row">
    <h3 class="sec" style="margin:0; border:0; padding:0">المسوّدات</h3>
    <span class="grow"></span>
    <span class="lede-note">الاعتمادُ يفتح بابَ الطابور ولا يعبره:
      <b>لا يُنشر منشورٌ بلا موافقةٍ مسجّلة</b>، والقيدُ في القاعدة لا في هذه الصفحة.</span>
  </div>
  ${list}`
}
