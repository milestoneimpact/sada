/**
 * «فيديوهاتك» (D-180) — **ترفعه مرّة، وتنشره على المنصّات الثلاث من نسخةٍ واحدة**.
 *
 * ثلاثُ طبقاتٍ بترتيب ما يفعله المالك: كيف يصدّر مقطعَه قبل أن يرفعه (فلا يُردّ بعد
 * الرفع)، ثمّ زرُّ الرفع بشريط تقدّمه، ثمّ كلُّ مقطعٍ بحدود المنصّات تحته ونموذجٌ
 * يصنع منه المنشورات. والحكمُ في `lib/media/uploads.ts`؛ وهنا رسمٌ وتهريب.
 */
import { escapeHtml } from '../escape'
import { kb, relativeTime } from '../../../lib/format'
import { platformLabel } from '../../../lib/oauth/providers'
import {
  privateReach, STALE_UPLOAD_HOURS, VIDEO_PLATFORMS, videoChecks, type UploadPost, type UploadRow, type VideoCheck,
} from '../../../lib/media/uploads'
import { YT_TITLE_MAX } from '../../../lib/publish/youtube'
import { PRESETS } from '../../../lib/time/local'
import { status } from '../parts'

const MARK: Readonly<Record<VideoCheck['level'], { cls: string; g: string }>> = {
  ok: { cls: 'ok', g: '●' },
  warn: { cls: 'warn', g: '!' },
  block: { cls: 'bad', g: '▲' },
}

/** حالُ منشور المقطع على صفّه — بكلمات بطاقته في «المنشورات»، والرابطُ إليها. */
const POST_STATE: Readonly<Record<string, { cls: string; g: string; text: string }>> = {
  draft: { cls: 'idle', g: '○', text: 'مسوّدةٌ تنتظر قرارك' },
  approved: { cls: 'ok', g: '●', text: 'معتمَدٌ بلا موعد' },
  edited: { cls: 'ok', g: '●', text: 'معتمَدٌ بلا موعد' },
  queued: { cls: 'warn', g: '◔', text: 'مجدول' },
  published: { cls: 'ok', g: '✓', text: 'نُشر' },
  failed: { cls: 'bad', g: '▲', text: 'فشل نشرُه' },
}

/** مدّةٌ كما تُقرأ: «0:42» و«3:05». */
function clock(ms: number | null): string {
  if (ms === null) return 'مدّةٌ لم تُقرأ'
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function size(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : kb(bytes)
}

function row(u: UploadRow, now: Date, cards: ReadonlySet<string> | null): string {
  const checks = videoChecks(u)
  // ‏الأرقامُ اللاتينيّةُ معزولة: «1080×1920» في سطرٍ عربيٍّ تنقلب إلى «1920×1080» بلا عزل
  const ltr = (t: string): string => `<bdi dir="ltr">${escapeHtml(t)}</bdi>`
  const meta = [
    u.durationMs === null ? escapeHtml(clock(null)) : ltr(clock(u.durationMs)),
    u.width !== null && u.height !== null ? ltr(`${u.width}×${u.height}`) : '',
    ltr(size(u.bytes)),
    escapeHtml(relativeTime(u.createdAt, now)),
  ].filter((x) => x !== '').join(' · ')
  if (u.status === 'uploading') {
    // ‏رفعٌ جارٍ في نافذةٍ أخرى أو انقطع — لا يُستأنف؛ يُلغى ويُرفع من جديد، وما تُرك يُلغى وحده بعد ساعات
    return `<div class="vrow">
      <div class="vmeta"><b><bdi>${escapeHtml(u.name)}</bdi></b><span class="ago">${meta}</span></div>
      ${status('warn', '!', 'لم يكتمل رفعُه')}
      <form class="row" method="POST" action="/panel/uploads/${escapeHtml(u.id)}/abort" data-busy="جارٍ الإلغاء…">
        <input type="hidden" name="from" value="library">
        <span class="ago">إن انقطع رفعُه فألغِه ثمّ ارفعه من جديد — ويُلغى وحده بعد ${STALE_UPLOAD_HOURS} ساعات.</span>
        <button class="g" type="submit" aria-label="${escapeHtml(`ألغِ رفع ${u.name}`)}">ألغِ</button>
      </form>
    </div>`
  }
  // ‏منشورُ كلّ منصّةٍ من هذا المقطع — الأحدثُ إن تعدّد (من «فيديوهاتك» ومن خطّةٍ مستورَدة)
  const postOf = (p: string): UploadPost | undefined => u.posts.find((x) => x.platform === p)
  const boxes = VIDEO_PLATFORMS.map((p) => {
    const c = checks.find((x) => x.platform === p)!
    const post = postOf(p)
    if (post !== undefined) {
      // ‏أُنشئ: حالُه ورابطٌ إلى بطاقته (ر-4) — كان «أُنشئ منشورُه» بلا طريقٍ إليه. والرابطُ
      // ‏لبطاقةٍ في الصفحة وحدها: «المنشورات» أحدثُ ستّين، ومرساةٌ لا بطاقةَ لها ترتدّ إلى الرئيسيّة
      const st = POST_STATE[post.status] ?? { cls: 'idle', g: '○', text: post.status }
      const link = cards !== null && !cards.has(post.id) ? '' : `<a class="tap" href="#d-${escapeHtml(post.id)}"
            aria-label="${escapeHtml(`افتح منشورَ ${platformLabel(p)}`)}">افتح منشورَه</a>`
      return `<div class="vpf">
        <span class="vpf-b"><b>${escapeHtml(platformLabel(p))}</b>
          ${status(st.cls, st.g, escapeHtml(st.text))}
          ${link}</span>
      </div>`
    }
    const blocked = c.level === 'block'
    return `<label class="vpf">
        <input type="checkbox" name="platform" value="${p}"${blocked ? ' disabled' : ' checked'}>
        <span class="vpf-b"><b>${escapeHtml(platformLabel(p))}</b>
          ${status(MARK[c.level].cls, MARK[c.level].g, escapeHtml(c.note))}</span>
      </label>`
  }).join('')
  const isOpen = (p: string): boolean => postOf(p) === undefined && checks.find((x) => x.platform === p)!.level !== 'block'
  const open = VIDEO_PLATFORMS.some(isOpen)
  const id = escapeHtml(u.id)
  // ‏عنوانُ YouTube سطرُه الأوّل: يُقال فوق الحقل ويُعَدّ تحته ما دام YouTube مفتوحًا (ر-4)
  const yt = isOpen('youtube')
  const field = `<div class="field"><label for="vc-${id}">نصُّ المنشور</label>
      <span class="ago" id="vh-${id}">${yt
        ? `سطرُه الأوّل عنوانُ YouTube حتّى ${YT_TITLE_MAX} محرف، والنصُّ كلُّه وصفٌ على كلّ منصّة.`
        : 'النصُّ كلُّه وصفٌ على كلّ منصّة.'}</span>
      <textarea id="vc-${id}" name="caption" rows="3" required
        aria-describedby="vh-${id}${yt ? ` vt-${id}` : ''}"${yt ? ` data-yt-title="${YT_TITLE_MAX}"` : ''}></textarea>
      ${yt ? `<span class="ago" id="vt-${id}" data-yt-count hidden></span>` : ''}</div>`
  const made = VIDEO_PLATFORMS.filter((p) => postOf(p) !== undefined)
  const hint = made.length === VIDEO_PLATFORMS.length
    ? 'أُنشئت كلُّها — وكلٌّ في بطاقته تحت «المنشورات».'
    : 'أُنشئ على كلّ ما يوافقه — وما بقي لا يوافق حدودَ منصّته.'
  return `<div class="vrow" id="v-${id}">
    <div class="vmeta"><b><bdi>${escapeHtml(u.name)}</bdi></b><span class="ago">${meta}</span></div>
    <form method="POST" action="/panel/uploads/${id}/posts" data-busy="جارٍ الإنشاء…">
      <div class="vpfs">${boxes}</div>
      ${open
        ? `${field}
          <div class="row">
            <label class="vapprove"><input type="checkbox" name="approve" checked> اعتمده الآن — كتبتُه أنا</label>
            <span class="grow"></span>
            <button class="p" type="submit">أنشئ المنشورات</button>
          </div>`
        : `<p class="hint">${hint}</p>`}
    </form>
    ${scheduleAll(u)}
  </div>`
}

/**
 * «جدوِل منشوراتِه معًا» (ر-4) — **موعدٌ واحدٌ بتوقيت المالك لمعتمَد هذا المقطع وحده**.
 *
 * كان يجدول كلَّ منشورٍ من بطاقته (ستُّ لمسات وثلاثةُ تحميلات)، أو من «وزّع المعتمَد»
 * الذي يخلطها بغيرها ويفصل بينها ساعة. والأزرارُ ترسل اسمَ الموعد لا لحظته: الخادمُ يحسبه
 * بتوقيت المالك من كعكته (D-173)، فلا UTC في وجهه ولا حقلٌ يُترجَم في رأسه. والمعرّفاتُ
 * في النموذج ما عُرض هنا وحده، والحسابُ يُحسب على الخادم (D-182).
 */
function scheduleAll(u: UploadRow): string {
  const ready = u.posts.filter((p) => p.status === 'approved' || p.status === 'edited')
  if (ready.length === 0) return ''
  const platforms = VIDEO_PLATFORMS.filter((p) => ready.some((x) => x.platform === p))
  const names = platforms.map(platformLabel).join(' و')
  const reach = privateReach(platforms)
  return `<form method="POST" action="/panel/uploads/${escapeHtml(u.id)}/schedule" data-busy="جارٍ الجدولة…">
      ${ready.map((p) => `<input type="hidden" name="post" value="${escapeHtml(p.id)}">`).join('')}
      <div class="row">
        <span class="ago">${escapeHtml(ready.length === 1 ? `جدوِل منشورَ ${names} بتوقيتك:` : `جدوِل منشوراتِ ${names} معًا بتوقيتك:`)}</span>
        ${PRESETS.map((q) => `<button class="g sm" type="submit" name="preset" value="${q.kind}"
          aria-label="${escapeHtml(`جدوِل ${q.label}`)}">${escapeHtml(q.label)}</button>`).join('')}
      </div>
      ${reach === null ? '' : `<span class="ago">${escapeHtml(reach)}</span>`}
    </form>`
}

/** و`cards` معرّفاتُ بطاقات «المنشورات» في الصفحة — و`null` حين لا تُعرف فيُربط كلُّ منشور. */
export function videosSection(uploads: readonly UploadRow[], now: Date, cards: ReadonlySet<string> | null = null): string {
  return `<div class="card" id="videos" style="margin-top:var(--s-3)">
    <div class="card-head"><h2>فيديوهاتك</h2><div class="grow"></div>
      <span class="ago">ترفعه مرّةً، ويُنشر على YouTube وTikTok وInstagram</span></div>
    <p class="hint"><b>صدّره هكذا فيقبله الثلاث</b>: MP4 (H.264 وصوت AAC)، رأسيٌّ 1080×1920 بثلاثين إطارًا،
      بين ثلاث ثوانٍ وثلاث دقائق، وأقلُّ من 300MB — واختر «تحسين للويب» إن وُجد.</p>
    <div class="vup">
      <label class="btn p vpick">اختر مقطعًا وارفعه
        <input type="file" id="vfile" class="vfile" accept="video/mp4,video/quicktime,video/webm"></label>
      <progress id="vup-bar" max="100" value="0" hidden></progress>
      <span class="ago" id="vup-msg" aria-live="polite"></span>
    </div>
    ${uploads.length === 0
      ? '<div class="empty"><b>لا مقطعَ بعد</b><p>ارفع مقطعًا، ثمّ اكتب نصَّه واختر منصّاته.</p></div>'
      : `<div class="vlist">${uploads.map((u) => row(u, now, cards)).join('')}</div>`}
  </div>`
}
