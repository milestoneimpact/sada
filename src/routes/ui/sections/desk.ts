/**
 * ‏**«ينتظر قرارك» في الرئيسيّة** (D-216) — مكتبُ اليوم لا غرفةُ التحكّم.
 *
 * ‏كانت الرئيسيّةُ عشرةَ أقسامٍ في ‏٤٫٣ شاشات على الهاتف، وفي شاشتها الأولى زرٌّ واحد، والمسوّدةُ التي تنتظر القرارَ
 * ‏لا تُعتمَد منها: «ما ينتظرك» يرسلك إلى صفحةٍ أخرى. فهنا ما فيه فعلٌ باقٍ، بترتيب اللوح نفسِه (`byUrgency`): ما فشل
 * ‏ثمّ ما ينتظر قرارك، وفي كلٍّ فعلُه الأوّل. و«اعتمد» نموذجُ اللوح نفسُه (`/panel/drafts/decide`)، فيعود المالكُ إلى
 * ‏بطاقتها في «المنشورات» وفيها الموعد — الخطوةُ التالية بعد الاعتماد. ولا شاراتٍ صغيرةً على الصفّ (ROADMAP §٥: رقائقُ
 * ‏أقلّ في الرئيسيّة): الحالُ يقوله الفعل («أصلحه» أو «اعتمد») وسطرُ الوقت.
 */
import type { DraftRow } from '../../../lib/draft/store'
import { relativeTime } from '../../../lib/format'
import { escapeHtml } from '../escape'
import { byUrgency, editorHref, platformMark } from './drafts'
import { platformLabel } from '../../../lib/oauth/providers'

/** ‏كم بطاقةً تُرسَم — والباقي رابطٌ إلى اللوح بعدده. */
export const DESK_MAX = 3

export function deskQueue(drafts: readonly DraftRow[], now: Date): string {
  const due = byUrgency(drafts.filter((d) => d.status === 'failed' || d.status === 'draft'))
  if (due.length === 0) return ''
  const rows = due.slice(0, DESK_MAX).map((d) => {
    const failed = d.status === 'failed'
    const who = d.accountName ?? platformLabel(d.platform)
    const act = failed
      ? `<a class="btn btn-primary btn-sm" href="/panel#d-${escapeHtml(d.id)}">أصلحه</a>`
      : `<form class="inline" method="POST" action="/panel/drafts/decide" data-busy="جار…">
           <input type="hidden" name="id" value="${escapeHtml(d.id)}">
           <button class="btn btn-primary btn-sm" type="submit" name="do" value="approve">اعتمد</button></form>
         <a class="btn btn-secondary btn-sm" href="${escapeHtml(editorHref(d.id))}">عدّل</a>`
    return `<li class="desk-row">
      <div class="desk-head">${platformMark(d.platform)}<b><bdi>${escapeHtml(who)}</bdi></b>
        <span class="ago">${failed ? 'فشل نشرُها · ' : ''}${escapeHtml(relativeTime(d.createdAt, now))}</span></div>
      <p class="desk-text" dir="auto">${escapeHtml(d.text.replace(/\s*\n\s*/g, ' '))}</p>
      <div class="desk-acts">${act}</div>
    </li>`
  }).join('')
  const more = due.length > DESK_MAX
    ? `<a class="tap" href="/panel#posts">و${due.length - DESK_MAX} غيرُها في المنشورات</a>` : ''
  return `<div class="card desk" id="desk">
    <div class="card-head"><h2>ينتظر قرارك</h2><div class="grow"></div><span class="count">${due.length}</span></div>
    <ul class="desk-list">${rows}</ul>${more}
  </div>`
}
