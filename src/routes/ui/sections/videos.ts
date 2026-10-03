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
import { STALE_UPLOAD_HOURS, VIDEO_PLATFORMS, videoChecks, type UploadRow, type VideoCheck } from '../../../lib/media/uploads'
import { status } from '../parts'

const MARK: Readonly<Record<VideoCheck['level'], { cls: string; g: string }>> = {
  ok: { cls: 'ok', g: '●' },
  warn: { cls: 'warn', g: '!' },
  block: { cls: 'bad', g: '▲' },
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

function row(u: UploadRow, now: Date): string {
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
  const boxes = VIDEO_PLATFORMS.map((p) => {
    const c = checks.find((x) => x.platform === p)!
    const done = u.platforms.includes(p)
    const blocked = c.level === 'block'
    return `<label class="vpf">
        <input type="checkbox" name="platform" value="${p}"${blocked || done ? ' disabled' : ' checked'}>
        <span class="vpf-b"><b>${escapeHtml(platformLabel(p))}</b>
          ${done ? status('ok', '●', 'أُنشئ منشورُه') : status(MARK[c.level].cls, MARK[c.level].g, escapeHtml(c.note))}</span>
      </label>`
  }).join('')
  const open = VIDEO_PLATFORMS.some((p) => !u.platforms.includes(p) && checks.find((x) => x.platform === p)!.level !== 'block')
  return `<div class="vrow">
    <div class="vmeta"><b><bdi>${escapeHtml(u.name)}</bdi></b><span class="ago">${meta}</span></div>
    <form method="POST" action="/panel/uploads/${escapeHtml(u.id)}/posts" data-busy="جارٍ الإنشاء…">
      <div class="vpfs">${boxes}</div>
      ${open
        ? `<div class="field"><label for="vc-${escapeHtml(u.id)}">نصُّ المنشور</label>
            <textarea id="vc-${escapeHtml(u.id)}" name="caption" rows="3" required
              placeholder="سطرُه الأوّل عنوانُ YouTube، والنصُّ كلُّه وصفٌ على المنصّات الثلاث"></textarea></div>
          <div class="row">
            <label class="vapprove"><input type="checkbox" name="approve" checked> اعتمده الآن — كتبتُه أنا</label>
            <span class="grow"></span>
            <button class="p" type="submit">أنشئ المنشورات</button>
          </div>`
        : '<p class="hint">أُنشئ على كلّ ما يوافقه — وما بقي لا يوافق حدودَ منصّته.</p>'}
    </form>
  </div>`
}

export function videosSection(uploads: readonly UploadRow[], now: Date): string {
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
      : `<div class="vlist">${uploads.map((u) => row(u, now)).join('')}</div>`}
  </div>`
}
