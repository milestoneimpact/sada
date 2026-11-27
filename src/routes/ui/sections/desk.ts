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
import { byUrgency, decideForm, editorHref, platformMark, quickScheduleForm, type MediaView, type Target } from './drafts'
import { platformLabel } from '../../../lib/oauth/providers'

/**
 * ‏‏**سطران لا المنشورُ كلُّه** (D-440): الصفُّ يقصّه CSS في سطرين، وكان يحمل النصَّ كاملًا (‏٤٤٤ محرفًا) مرّةً ثانيةً بعد بطاقته
 * ‏في «المنشورات». فيُقطع عند ‏180 محرفًا بـ«…» — أكثرُ من سطرين على ‏‎--measure‏ — والنصُّ كاملًا في «عدّل».
 */
export const DESK_CHARS = 180
export function deskText(text: string): string {
  const flat = text.replace(/\s*\n\s*/g, ' ')
  return flat.length <= DESK_CHARS ? flat : flat.slice(0, DESK_CHARS).trimEnd() + '…'
}

/** ‏كم بطاقةً تُرسَم — والباقي رابطٌ إلى اللوح بعدده. */
export const DESK_MAX = 3

/**
 * ‏**الحلقةُ اليوميّة في الشاشة الأولى** (D-431): «اعتمد · غدًا» نموذجُ البطاقة نفسُه (`decideForm`) بـ`data-swap`، فيُعتمَد
 * ‏ويُجدوَل بلا تحميل و«تراجَع» في الإشعار؛ والمعتمَدةُ بلا موعدٍ صفٌّ بـ«جدوِل · غدًا». وبلا سكربتٍ يُرسَل النموذجُ كما كان.
 */
export function deskQueue(drafts: readonly DraftRow[], now: Date, targets: readonly Target[] = [], media: readonly MediaView[] = []): string {
  const unscheduled = (d: DraftRow) => (d.status === 'approved' || d.status === 'edited') && d.scheduledAt === null
    && quickScheduleForm(d, targets, media) !== null
  const due = byUrgency(drafts.filter((d) => d.status === 'failed' || d.status === 'draft' || unscheduled(d)))
  if (due.length === 0) return ''
  const rows = due.slice(0, DESK_MAX).map((d) => {
    const failed = d.status === 'failed'
    const who = d.accountName ?? platformLabel(d.platform)
    const act = failed
      ? `<a class="btn btn-primary btn-sm" href="/panel#d-${escapeHtml(d.id)}">أصلحه</a>`
      : `${d.status === 'draft' ? decideForm(d, targets, media) : quickScheduleForm(d, targets, media)!}
         <a class="btn btn-secondary btn-sm" href="${escapeHtml(editorHref(d.id))}">عدّل</a>`
    return `<li class="desk-row" id="k-${escapeHtml(d.id)}">
      <div class="desk-head">${platformMark(d.platform)}<b><bdi>${escapeHtml(who)}</bdi></b>
        <span class="ago">${failed ? 'فشل نشرُها · ' : d.status === 'draft' ? '' : 'معتمَدةٌ بلا موعد · '}${escapeHtml(relativeTime(d.createdAt, now))}</span></div>
      <p class="desk-text" dir="auto">${escapeHtml(deskText(d.text))}</p>
      <div class="desk-acts">${act}</div>
    </li>`
  }).join('')
  const more = due.length > DESK_MAX
    ? `<a class="tap" href="/panel#posts">و${due.length - DESK_MAX} غيرُها في المنشورات</a>` : ''
  return `<div class="card desk" id="desk">
    <div class="card-head"><h2>ينتظر قرارك</h2><div class="grow"></div><span class="count" data-desk-n>${due.length}</span></div>
    <ul class="desk-list">${rows}</ul>${more}
  </div>`
}
