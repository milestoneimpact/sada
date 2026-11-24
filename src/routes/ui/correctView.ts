/**
 * **صفحةُ «صحّح المنشور»** (D-391) وصفحةُ تأكيد «احذف وأعد النشر» — نماذجُ بلا سكربت.
 *
 * - LinkedIn: النصُّ في حقله يُعدَّل، وزرٌّ واحد «احفظ التعديل على LinkedIn».
 * - X: ردٌّ تصحيحيّ هو الأوّليّ، و«احذف وأعد النشر» ثانويٌّ يمضي إلى صفحة تأكيدٍ بتحذيرٍ مكتوب قبل أن يقع شيء.
 * - وتحتهما «النصوصُ السابقة»: كلُّ تصحيحٍ بنصّه قبله، وحالُه.
 * ‏ومفتاحُ النموذج (D-004) يُولَّد مع الصفحة، فضغطتان بها لا ترسلان طلبين.
 */
import { pageHead } from './parts'
import { button } from './components/button'
import { card } from './components/card'
import { field } from './components/field'
import { noticeText } from './components/toast'
import { html, raw } from './html'
import type { CorrectionRow } from '../../lib/publish/correct'

export interface CorrectScreen {
  readonly id: string
  readonly platform: string
  readonly text: string
  readonly history: readonly CorrectionRow[]
  /** سببُ المنع بالعربيّة (الدورُ أو حالُ المنشور)، أو `null`. */
  readonly blocked: string | null
  readonly key: string
  readonly max: number
  readonly flash: { readonly tone: 'ok' | 'warn' | 'bad'; readonly text: string } | null
}

const KIND_SAY: Readonly<Record<string, string>> = { edit: 'تعديلٌ في مكانه', reply: 'ردٌّ تصحيحيّ', replace: 'حُذف وأُعيد نشرُه' }
const STATUS_SAY: Readonly<Record<string, string>> = { sent: 'أُرسل ولم يُعرَف جوابُه', deleted: 'حُذف الأصلُ ولم يُنشر البديل', succeeded: 'تمّ', failed: 'لم يتمّ' }

function textField(id: string, label: string, value: string, max: number): string {
  return field({
    id, label, hint: 'حتّى ' + String(max) + ' حرفًا.',
    control: html`<textarea name="text" rows="6" maxlength="${String(max)}" dir="auto" required>${value}</textarea>`.value,
  })
}

function historyCard(rows: readonly CorrectionRow[]): string {
  if (rows.length === 0) return ''
  return card({
    title: 'النصوصُ السابقة', level: 2,
    body: html`<ol class="plain stack">${rows.map((r) => html`<li><p class="m-0"><b>${KIND_SAY[r.kind] ?? r.kind}</b> · ${STATUS_SAY[r.status] ?? r.status} · ${r.created_at}</p>
      <p class="m-0">قبله: ${r.old_text}</p>${r.error === null ? html`` : html`<p class="m-0">${r.error}</p>`}</li>`)}</ol>`.value,
  })
}

export function correctScreen(m: CorrectScreen): string {
  const isX = m.platform === 'x'
  const head = pageHead('التيّار', 'صحّح المنشور', isX
    ? 'X لا يعدّل تغريدةً من الواجهة. ردٌّ تصحيحيّ تحتها يبقي إعجاباتها وردودها، وهو الأسلم.'
    : 'يُعدَّل النصُّ في مكانه على LinkedIn وتبقى التفاعلات، ويُحفظ النصُّ السابق هنا.')
  const flash = m.flash === null ? '' : noticeText(m.flash.tone, m.flash.text)
  const current = card({ title: 'المنشورُ الآن', level: 2, body: html`<p class="m-0" dir="auto">${m.text}</p>`.value })
  let forms = ''
  if (m.blocked !== null) {
    forms = card({ title: 'لا يُصحَّح', level: 2, body: html`<p class="m-0">${m.blocked}</p>`.value })
  } else if (!isX) {
    forms = card({
      title: 'عدّل النصّ', level: 2,
      body: html`<form method="POST" action="/panel/posts/${m.id}/correct" class="stack">
        <input type="hidden" name="how" value="edit"><input type="hidden" name="key" value="${m.key}">
        ${raw(textField('fix-text', 'النصُّ المصحَّح', m.text, m.max))}
        <div class="row">${raw(button({ label: 'احفظ التعديل على LinkedIn', variant: 'primary', type: 'submit' }))}</div></form>`.value,
    })
  } else {
    forms = card({
      title: 'ردٌّ تصحيحيّ', level: 2,
      body: html`<form method="POST" action="/panel/posts/${m.id}/correct" class="stack">
        <input type="hidden" name="how" value="reply"><input type="hidden" name="key" value="${m.key}">
        ${raw(textField('fix-reply', 'نصُّ الردّ تحت المنشور', '', m.max))}
        <div class="row">${raw(button({ label: 'انشر الردّ التصحيحيّ', variant: 'primary', type: 'submit' }))}</div></form>`.value,
    }) + card({
      title: 'احذف وأعد النشر', level: 2,
      desc: 'تضيع الإعجاباتُ والردودُ ويتغيّر الرابط. تراه في خطوةٍ ثانية قبل أن يقع.',
      body: html`<form method="POST" action="/panel/posts/${m.id}/correct/review" class="stack">
        <input type="hidden" name="key" value="${m.key}">
        ${raw(textField('fix-replace', 'النصُّ البديل', m.text, m.max))}
        <div class="row">${raw(button({ label: 'راجع الحذف وإعادة النشر', variant: 'secondary', type: 'submit' }))}</div></form>`.value,
    })
  }
  return html`${raw(head)}<div class="stack">${raw(flash)}${raw(current)}${raw(forms)}${raw(historyCard(m.history))}
    <p class="m-0">${raw(button({ label: 'عودة إلى التيّار', variant: 'quiet', href: '/panel/feed#f-' + m.id }))}</p></div>`.value
}

export interface ReplaceConfirm {
  readonly id: string
  readonly oldText: string
  readonly text: string
  readonly key: string
}

/** الخطوةُ الثانية لـ«احذف وأعد النشر» — تحذيرٌ صريح بلا سكربت (نمطُ D-382). */
export function replaceConfirmScreen(m: ReplaceConfirm): string {
  const head = pageHead('صحّح المنشور', 'احذف وأعد النشر', 'هذا ما سيقع على X، ولا يُستردّ.')
  const warn = card({
    variant: 'alert', tone: 'warn', title: 'قبل أن تؤكّد', level: 2,
    body: html`<ul class="plain">
      <li>تُحذف التغريدةُ الأصليّة من X نهائيًّا.</li>
      <li>تضيع إعجاباتُها وردودُها وإعاداتُ نشرها، ولا تنتقل إلى البديل.</li>
      <li>يتغيّر الرابط: كلُّ من حفظ الرابطَ القديم أو شاركه يجده محذوفًا.</li>
      <li>تُنشر تغريدةٌ جديدة بالنصّ أدناه، وتُحتسب كلفتُها كأيّ منشور.</li>
      <li>إن نجح الحذفُ وفشل النشر تبقى الحالُ ظاهرةً في التيّار، و«أعد المحاولة» ينشر البديلَ وحده بلا حذفٍ ثانٍ.</li></ul>`.value,
  })
  const texts = card({
    title: 'النصّان', level: 2,
    body: html`<p class="m-0"><b>يُحذف:</b> <span dir="auto">${m.oldText}</span></p><p class="m-0"><b>يُنشر:</b> <span dir="auto">${m.text}</span></p>`.value,
  })
  const go = html`<form method="POST" action="/panel/posts/${m.id}/correct" class="row">
    <input type="hidden" name="how" value="replace"><input type="hidden" name="confirm" value="yes">
    <input type="hidden" name="key" value="${m.key}"><input type="hidden" name="text" value="${m.text}">
    ${raw(button({ label: 'نعم، احذف وأعد النشر', variant: 'primary', type: 'submit' }))}
    ${raw(button({ label: 'لا، عودة', variant: 'quiet', href: '/panel/posts/' + m.id + '/correct' }))}</form>`
  return html`${raw(head)}<div class="stack">${raw(warn)}${raw(texts)}${go}</div>`.value
}
