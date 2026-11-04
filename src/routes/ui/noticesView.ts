/**
 * شاشةُ **الإشعارات** (D-294): ما يحتاج يدَك ولم تره، ثمّ ما قرأته. كلُّ سطرٍ من صفٍّ في القاعدة
 * (`lib/notices.ts`)، وبجانبه فعلُه. و«علّمها مقروءةً» تُطفئ العدّادَ في الترويسة، ولا تمحو السبب:
 * منشورٌ فاشل يبقى في المنشورات حتّى يُصلَح.
 */
import { html, raw, type Html } from './html'
import { relativeTime } from '../../lib/format'
import type { Notice, NoticeRead } from '../../lib/notices'

export interface NoticesScreenData {
  readonly notices: readonly Notice[]
  readonly reads: readonly NoticeRead[]
  readonly now: Date
}

function row(n: Notice, read: NoticeRead | undefined, now: Date): Html {
  return html`<li data-kind="${n.kind}">
    <span class="dot ${n.tone}"></span>
    <span class="grow">${n.text}
      <span class="ago">${relativeTime(n.at, now)}${read === undefined ? '' : html` · قرأها ${read.byEmail ?? 'أحدٌ'} ${relativeTime(read.readAt, now)}`}</span></span>
    <a class="btn btn-secondary btn-sm" href="${n.href}">${n.action}</a>
  </li>`
}

export function noticesScreen(d: NoticesScreenData): string {
  const reads = new Map(d.reads.map((r) => [r.ref, r]))
  const unread = d.notices.filter((n) => !reads.has(n.ref))
  const seen = d.notices.filter((n) => reads.has(n.ref))
  const lede = unread.length === 0
    ? seen.length === 0
      ? html`<b>لا شيء يحتاج يدَك الآن.</b> ما يفشل أو ينقطع أو ينتظر حصّةً يظهر هنا في دورته.`
      : html`<b>لا جديد.</b> ${seen.length} ${seen.length === 1 ? 'إشعارٌ مقروء' : 'إشعارات مقروءة'} ما زال سببُها قائمًا.`
    : html`<b>${unread.length}</b> ${unread.length === 1 ? 'يحتاج يدَك' : 'تحتاج يدَك'}، بالأحدث أوّلًا.`
  const refs = unread.map((n) => html`<input type="hidden" name="ref" value="${n.ref}">`)
  return html`<div class="page-head">
    <div class="txt">
      <div class="eyebrow"><span class="ln"></span>ما يحتاج يدَك</div>
      <h1>الإشعارات</h1>
      <p class="lede">${lede}</p>
    </div>
  </div>

  <div class="card">
    <div class="card-head"><h2>جديد</h2><div class="grow"></div>
      ${unread.length === 0 ? html`` : html`<form method="POST" action="/panel/notices/read" class="inline" data-busy="جار…">${refs}
        <button class="btn btn-quiet btn-sm" type="submit">علّمها مقروءةً</button></form>`}</div>
    ${unread.length === 0
      ? html`<p class="hint m-0">لا جديد.</p>`
      : html`<ul class="todo">${unread.map((n) => row(n, undefined, d.now))}</ul>`}
  </div>

  ${seen.length === 0 ? html`` : html`<details class="card">
    <summary><h2>ما قُرئ وسببُه قائم</h2><span class="grow"></span><span class="ago">${seen.length}</span></summary>
    <ul class="todo">${seen.map((n) => row(n, reads.get(n.ref), d.now))}</ul>
  </details>`}

  <p class="hint">${raw('')}الإشعارُ يختفي وحدَه حين يزول سببُه: منشورٌ أُعيد، أو حسابٌ رُبط، أو صورٌ رُسمت.</p>`.value
}
