/**
 * «فيديوهاتك» (D-180) — **ترفعه مرّة، وتنشره على المنصّات الثلاث من نسخةٍ واحدة**.
 *
 * ثلاثُ طبقاتٍ بترتيب ما يفعله المالك: كيف يصدّر مقطعَه قبل أن يرفعه (فلا يُردّ بعد
 * الرفع)، ثمّ زرُّ الرفع بشريط تقدّمه، ثمّ كلُّ مقطعٍ بحدود المنصّات تحته ونموذجٌ
 * يصنع منه المنشورات. والحكمُ في `lib/media/uploads.ts`؛ وهنا رسمٌ وتهريب.
 */
import { escapeHtml } from '../escape'
import { kb, money, relativeTime } from '../../../lib/format'
import { platformLabel } from '../../../lib/oauth/providers'
import {
  CAPTION_LIMIT, PRIVATE_ONLY, PRIVATE_REACH, privateReach, STALE_UPLOAD_HOURS, VIDEO_PLATFORMS, videoChecks,
  YOUTUBE_DESCRIPTION_BYTES, type Reach, type UploadPost, type UploadRow, type VideoCheck, type VideoPlatform,
} from '../../../lib/media/uploads'
import { ABOUT_MAX, captionIssues, type VideoCaptions } from '../../../lib/media/captions'
import type { LinkState } from '../../../lib/channels'
import { YT_TITLE_MAX } from '../../../lib/publish/youtube'
import { PRESETS } from '../../../lib/time/local'
import { FALLBACK_ZONE } from '../../../lib/time/zone'
import { statusBadge, type Tone } from '../components/badge'
import { button } from '../components/button'
import { emptyState } from '../components/empty'
import { field } from '../components/field'
import { linkLine, pickLine } from '../reach'
import { fileName } from '../parts'

const MARK: Readonly<Record<VideoCheck['level'], { cls: Tone; g: string }>> = {
  ok: { cls: 'ok', g: '●' },
  warn: { cls: 'warn', g: '!' },
  block: { cls: 'bad', g: '▲' },
}

/** حالُ منشور المقطع على صفّه — بكلمات بطاقته في «المنشورات»، والرابطُ إليها. */
const POST_STATE: Readonly<Record<string, { cls: Tone; g: string; text: string }>> = {
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

/**
 * ما يعرفه الصفُّ عن خارجه (D-190) — **وكلُّه اختياريّ**: صفٌّ يُرسَم بلا سياقٍ يُرسَم كما
 * كان (لا ربطَ يُقال، والنشرُ خاصّ).
 */
export interface VideoContext {
  /** حالُ ربط كلّ منصّة — وغيابُه «لا يُعرف» فلا يُقال «غير متّصل» لما لم يُسأل عنه. */
  readonly links?: Readonly<Record<string, LinkState>>
  /** مَن يرى المقطع: قرارُ المالك بعد الإجازة، والافتراضُ خاصّ. */
  readonly reach?: Reach
  /** منطقةُ المالك: `null` أوّلَ زيارةٍ فتُقال «بتوقيت الرياض» وتُرسَل مع الأزرار (D-202). */
  readonly zone?: string | null
  /** نصوصٌ كُتبت لكلّ مقطع (KV، يومًا) — مفتاحُها معرّفُ المقطع. */
  readonly captions?: Readonly<Record<string, VideoCaptions>>
  /**
   * أيُكتَب الآن؟ — **بحكم النداء نفسِه** (`blockerFor('draft', …)` وجاهزيّةُ مزوّد الكتابة):
   * زرُّ «اكتب النصوص» معطَّلٌ وسببُه تحته، لا زرٌّ يُضغَط فيُردّ إلى رأس اللوح.
   */
  readonly writer?: {
    readonly ready: boolean
    readonly blocked: { readonly text: string; readonly label: string; readonly href: string } | null
  }
}

/** مربّعُ المنصّة: اسمُها، ثمّ أمتّصلةٌ ومَن يرى، ثمّ ما يقوله شكلُ المقطع عندها. */
function chip(p: VideoPlatform, c: VideoCheck, ctx: VideoContext): string {
  const link = ctx.links?.[p]
  const reach = ctx.reach ?? PRIVATE_ONLY
  const blocked = c.level === 'block'
  // ‏غيرُ المتّصل لا يُؤشَّر: يبقى اختياره ممكنًا (يُنشأ ويُجدوَل بعد الربط)، ولا يُختار عنه
  const checked = !blocked && (link === undefined || link === 'linked')
  const who = link !== undefined
    ? linkLine(p, link, reach)
    : (p === 'youtube' || p === 'tiktok') && !reach[p]
      ? statusBadge('warn', '!', escapeHtml(PRIVATE_REACH[p]))
      : ''
  const shape = c.note === ''
    ? ''
    : c.level === 'ok'
      ? `<span class="ago">${escapeHtml(c.note)}</span>`
      : statusBadge(MARK[c.level].cls, MARK[c.level].g, escapeHtml(c.note))
  return `<label class="vpf">
      <input type="checkbox" name="platform" value="${p}"${blocked ? ' disabled' : checked ? ' checked' : ''}>
      <span class="vpf-b"><b>${escapeHtml(platformLabel(p))}</b>
        ${who}
        ${shape}</span>
    </label>`
}

/**
 * «صف المقطع بجملة» ← «اكتب النصوص» (D-190): نداءٌ واحدٌ يكتب لكلّ منصّةٍ نصَّها.
 * **نموذجٌ مستقلّ** فوق نموذج الإنشاء: نموذجٌ داخل نموذجٍ لا يصحّ، والكتابةُ لا تُنشئ شيئًا.
 */
function captionForm(u: UploadRow, cap: VideoCaptions | undefined, ctx: VideoContext, now: Date): string {
  const id = escapeHtml(u.id)
  const w = ctx.writer
  const why = w === undefined
    ? null
    : w.blocked !== null
      ? { text: w.blocked.text, label: w.blocked.label, href: w.blocked.href }
      : w.ready
        ? null
        : { text: 'مزوّدُ الكتابة غير جاهز.', label: 'افتح المزوّدين', href: '#providers' }
  const control = `<input type="text" name="about" required maxlength="${ABOUT_MAX}"
      placeholder="مثل: لقاءٌ عن القيادة في أوّل مئة يوم"${cap === undefined ? '' : ` value="${escapeHtml(cap.about)}"`}>`
  // ‏«أعد كتابتها» تحمل `at` ما على الشاشة (D-190): الوصفُ نفسُه يُكتب منه من جديد مرّةً، وإعادةُ
  // ‏إرسال النموذج نفسِه بعدها تحمل `at` قديمًا فتعود «مكتوبةً» بلا نداءٍ ولا كلفة
  return `<form class="vcap" method="POST" action="/panel/uploads/${id}/captions" data-busy="جارٍ كتابة النصوص…">
      ${cap === undefined ? '' : `<input type="hidden" name="replace" value="${escapeHtml(cap.at)}">`}
      ${field({
        id: `va-${u.id}`,
        label: 'صف المقطع بجملة',
        hint: 'ما فيه، وعمّ يتحدّث — ونكتب منه عنوانَ YouTube ووصفَه ونصَّي TikTok وInstagram.',
        control,
      })}
      <div class="row">
        <span class="ago">${cap === undefined
          ? 'نداءٌ واحد، وكلفتُه تُسجَّل قبل أن تراها. أو اكتب النصَّ بيدك أدناه بلا كلفة.'
          : escapeHtml(`كُتبت ${relativeTime(cap.at.replace('T', ' ').slice(0, 19), now)} · الكلفة ${money(cap.cost)} — راجعها وعدّلها قبل أن تُنشئ. و«أعد كتابتها» نداءٌ جديدٌ بكلفته يستبدلها.`)}</span>
        <span class="grow"></span>
        ${button({
          label: cap === undefined ? 'اكتب النصوص' : 'أعد كتابتها',
          variant: 'secondary',
          type: 'submit',
          ...(why === null ? {} : { disabled: { id: `vw-${u.id}`, reason: why.text } }),
        })}
      </div>
      ${why === null ? '' : `<a class="tap" href="${escapeHtml(why.href)}">${escapeHtml(why.label)}</a>`}
    </form>`
}

/**
 * عدّادٌ حيٌّ تحت الحقل (D-190) — **بقاعدة الإنشاء نفسِها** (`captionProblem`): TikTok وInstagram
 * بالمحرف بعد طيّ الطرفين، ووصفُ YouTube بالبايت (والعنوانُ لا يُعَدّ معه: يُرفع وحدَه).
 * كان الحدُّ لا يُقال، والخطأُ يظهر بعد أن يُردّ الإنشاءُ كلُّه.
 */
function counter(limit: number, unit: 'chars' | 'bytes'): { attrs: string; out: string } {
  return {
    attrs: ` data-cap-limit="${limit}" data-cap-unit="${unit}"`,
    out: '<span class="ago" data-cap-count aria-live="polite"></span>',
  }
}

/** حقولُ كلّ منصّةٍ مملوءةً بما كُتب (D-190) — لما بقي مفتوحًا منها وحدَه، وخطأُ كلٍّ تحته. */
function perPlatformFields(u: UploadRow, cap: VideoCaptions, open: (p: VideoPlatform) => boolean, tiktokInbox: boolean): string {
  const issues = captionIssues(cap)
  const parts: string[] = []
  if (open('youtube')) {
    parts.push(field({
      id: `vyt-${u.id}`,
      label: 'عنوان YouTube',
      hint: `حتّى ${YT_TITLE_MAX} محرف — يُرى في البحث وفي بطاقة المقطع.`,
      control: `<input type="text" name="title_youtube" maxlength="${YT_TITLE_MAX}" value="${escapeHtml(cap.youtubeTitle)}">`,
      ...(issues.title === undefined ? {} : { error: issues.title }),
    }))
    const bytes = counter(YOUTUBE_DESCRIPTION_BYTES, 'bytes')
    parts.push(field({
      id: `vyd-${u.id}`,
      label: 'وصف YouTube',
      hint: `حتّى ${YOUTUBE_DESCRIPTION_BYTES} بايت، والحرفُ العربيُّ بايتان — ويُرفع كما هو، والعنوانُ لا يتكرّر في أوّله.`,
      control: `<textarea name="caption_youtube" rows="4"${bytes.attrs}>${escapeHtml(cap.youtubeDescription)}</textarea>${bytes.out}`,
      ...(issues.youtube === undefined ? {} : { error: issues.youtube }),
    }))
  }
  for (const p of ['tiktok', 'instagram'] as const) {
    if (!open(p)) continue
    const id = `v${p === 'tiktok' ? 'tt' : 'ig'}-${u.id}`
    const chars = counter(CAPTION_LIMIT[p], 'chars')
    // ‏والصندوقُ لا يُرسَل إليه نصّ (D-190): نصٌّ دُفع ثمنُه وراجعه المالكُ يُقال إنّه يُلصق بيده
    const inbox = p === 'tiktok' && tiktokInbox
    parts.push(field({
      id,
      label: `نصّ ${platformLabel(p)}`,
      hint: inbox
        ? `حتّى ${CAPTION_LIMIT[p]} محرف. <b>ويصل المقطعُ صندوقَ تطبيق TikTok بلا هذا النصّ</b> — انسخه والصقه هناك حين تنشره.`
        : `حتّى ${CAPTION_LIMIT[p]} محرف.`,
      control: `<textarea name="caption_${p}" rows="4"${chars.attrs}>${escapeHtml(cap[p])}</textarea>${chars.out}${inbox
        ? `<button class="btn btn-secondary btn-sm" type="button" data-copy="${escapeHtml(id)}"
            aria-label="انسخ نصّ TikTok لتلصقه في التطبيق">انسخ النصّ</button>`
        : ''}`,
      ...(issues[p] === undefined ? {} : { error: issues[p] }),
    }))
  }
  // ‏ومَن كتبها يُرسَل معها (D-190): إن انتهى يومُها في KV قبل «أنشئ» لا تصير نصوصَ المالك
  return `<div class="vcaps"><input type="hidden" name="per_platform" value="1">
      <input type="hidden" name="caption_model" value="${escapeHtml(cap.model)}">${parts.join('')}</div>`
}

const PICK_LINE = pickLine('يُنشأ منشورُها ولا يُجدوَل')

function row(u: UploadRow, now: Date, cards: ReadonlySet<string> | null, ctx: VideoContext): string {
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
    return `<div class="card card-inset vrow">
      <div class="vmeta"><b>${fileName(u.name)}</b><span class="ago">${meta}</span></div>
      ${statusBadge('warn', '!', 'لم يكتمل رفعُه')}
      <form class="row" method="POST" action="/panel/uploads/${escapeHtml(u.id)}/abort" data-busy="جارٍ الإلغاء…">
        <input type="hidden" name="from" value="library">
        <span class="ago">إن انقطع رفعُه فألغِه ثمّ ارفعه من جديد — ويُلغى وحده بعد ${STALE_UPLOAD_HOURS} ساعات.</span>
        <button class="btn btn-secondary" type="submit" aria-label="${escapeHtml(`ألغِ رفع ${u.name}`)}">ألغِ</button>
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
      // ‏«نُشر» وحدَها لا تكفي حين لم يقع كما قُرّر (D-190): الصندوقُ بلا نصّه، أو مستوًى أضيق
      const note = post.status === 'published' && typeof post.note === 'string' && post.note !== ''
        ? statusBadge('warn', '!', escapeHtml(post.note))
        : ''
      return `<div class="vpf">
        <span class="vpf-b"><b>${escapeHtml(platformLabel(p))}</b>
          ${statusBadge(st.cls, st.g, escapeHtml(st.text))}
          ${note}
          ${link}</span>
      </div>`
    }
    return chip(p, c, ctx)
  }).join('')
  const isOpen = (p: VideoPlatform): boolean => postOf(p) === undefined && checks.find((x) => x.platform === p)!.level !== 'block'
  const open = VIDEO_PLATFORMS.some(isOpen)
  const id = escapeHtml(u.id)
  const cap = ctx.captions?.[u.id]
  // ‏عنوانُ YouTube سطرُه الأوّل: يُقال فوق الحقل ويُعَدّ تحته ما دام YouTube مفتوحًا (ر-4)
  const yt = isOpen('youtube')
  // ‏والعنوانُ لا يتكرّر في وصف YouTube (D-190)؛ وصندوقُ TikTok لا يُرسَل إليه النصّ فيُقال —
  // ‏لحسابٍ مربوطٍ بلا `video.publish` وحدَه: غيرُ المربوط لا يُعرف بابُه بعد
  const tiktokInbox = ctx.links?.['tiktok'] === 'linked' && ctx.reach?.tiktokInbox === true
  const inboxNote = isOpen('tiktok') && tiktokInbox
    ? ' وTikTok يصله المقطعُ بلا النصّ: تلصقه أنت حين تنشره من التطبيق.'
    : ''
  const shared = `<div class="field"><label for="vc-${id}">نصُّ المنشور</label>
      <span class="ago" id="vh-${id}">${escapeHtml(`${yt
        ? `سطرُه الأوّل عنوانُ YouTube حتّى ${YT_TITLE_MAX} محرف وما بعده وصفُه، والنصُّ كلُّه وصفٌ على TikTok وInstagram.`
        : 'النصُّ كلُّه وصفٌ على كلّ منصّة.'}${inboxNote}`)}</span>
      <textarea id="vc-${id}" name="caption" rows="3" required
        aria-describedby="vh-${id}${yt ? ` vt-${id}` : ''}"${yt ? ` data-yt-title="${YT_TITLE_MAX}"` : ''}></textarea>
      ${yt ? `<span class="ago" id="vt-${id}" data-yt-count hidden></span>` : ''}</div>`
  /*
   * ‏ونصُّ النموذج لا يُعتمَد بالافتراض (D-009 · D-190): «كتبتُه أنا» صادقةٌ بالبناء فتُؤشَّر،
   * ‏و«راجعتُ النصوص» شهادةٌ يؤشّرها المالكُ بيده — وإلّا تُنشأ مسوّداتٍ تنتظر قراره.
   */
  const made = VIDEO_PLATFORMS.filter((p) => postOf(p) !== undefined)
  const hint = made.length === VIDEO_PLATFORMS.length
    ? 'أُنشئت كلُّها — وكلٌّ في بطاقته تحت «المنشورات».'
    : 'أُنشئ على كلّ ما يوافقه — وما بقي لا يوافق حدودَ منصّته.'
  return `<div class="card card-inset vrow" id="v-${id}">
    <div class="vmeta"><b>${fileName(u.name)}</b><span class="ago">${meta}</span></div>
    ${open ? captionForm(u, cap, ctx, now) : ''}
    <form method="POST" action="/panel/uploads/${id}/posts" data-busy="جارٍ الإنشاء…">
      <div class="vpfs" role="group" aria-label="أنشئ على">${boxes}</div>
      ${open ? PICK_LINE : ''}
      ${open
        ? `${cap === undefined ? shared : perPlatformFields(u, cap, isOpen, tiktokInbox)}
          <div class="row">
            <label class="vapprove"><input type="checkbox" name="approve"${cap === undefined ? ' checked' : ''}> ${cap === undefined
              ? 'اعتمده الآن — كتبتُه أنا'
              : 'اعتمده الآن — راجعتُ النصوص'}</label>
            ${whenPick(u.id, ctx.zone)}
            <span class="grow"></span>
            <button class="btn btn-primary" type="submit">أنشئ المنشورات</button>
          </div>`
        : `<p class="hint">${hint}</p>`}
    </form>
    ${scheduleAll(u, ctx.reach ?? PRIVATE_ONLY, ctx.zone)}
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
/*
 * ‏**الإنشاءُ يعرض الجدولة** (D-218): «متى؟» بجوار «اعتمده الآن» فيُنشأ المنشورُ ويُجدوَل في ضغطةٍ
 * ‏واحدة، بأزرار الموعد نفسِها تحت المقطع (`scheduleFromUpload`). و«لاحقًا» افتراضيّة: مقطعٌ عامٌّ لا
 * ‏يُجدوَل بموعدٍ لم يختره المالك، ولا يُقرأ الموعدُ إلّا مع الاعتماد.
 */
function whenPick(id: string, zone?: string | null): string {
  const fid = `vwhen-${escapeHtml(id.slice(0, 8))}`
  return `<label class="vapprove" for="${fid}">متى؟
      <select id="${fid}" name="preset"><option value="">لاحقًا</option>${PRESETS
        .map((q) => `<option value="${q.kind}">${escapeHtml(q.label)}</option>`).join('')}</select></label>${
    zone === undefined ? '' : `<input type="hidden" name="tz" value="${escapeHtml(zone ?? FALLBACK_ZONE)}">`}`
}

function scheduleAll(u: UploadRow, reachNow: Reach, zone?: string | null): string {
  const ready = u.posts.filter((p) => p.status === 'approved' || p.status === 'edited')
  if (ready.length === 0) return ''
  const platforms = VIDEO_PLATFORMS.filter((p) => ready.some((x) => x.platform === p))
  const names = platforms.map(platformLabel).join(' و')
  const reach = privateReach(platforms, reachNow)
  const where = zone === null ? 'بتوقيت الرياض' : 'بتوقيتك'
  return `<form method="POST" action="/panel/uploads/${escapeHtml(u.id)}/schedule" data-busy="جارٍ الجدولة…">
      ${zone === undefined ? '' : `<input type="hidden" name="tz" value="${escapeHtml(zone ?? FALLBACK_ZONE)}">`}
      ${ready.map((p) => `<input type="hidden" name="post" value="${escapeHtml(p.id)}">`).join('')}
      <div class="row">
        <span class="ago">${escapeHtml(ready.length === 1 ? `جدوِل منشورَ ${names} ${where}:` : `جدوِل منشوراتِ ${names} معًا ${where}:`)}</span>
        ${PRESETS.map((q) => `<button class="btn btn-secondary btn-sm" type="submit" name="preset" value="${q.kind}"
          aria-label="${escapeHtml(`جدوِل ${q.label}`)}">${escapeHtml(q.label)}</button>`).join('')}
      </div>
      ${reach === null ? '' : `<span class="ago">${escapeHtml(reach)}</span>`}
    </form>`
}

/** و`cards` معرّفاتُ بطاقات «المنشورات» في الصفحة — و`null` حين لا تُعرف فيُربط كلُّ منشور. */
export function videosSection(
  uploads: readonly UploadRow[],
  now: Date,
  cards: ReadonlySet<string> | null = null,
  ctx: VideoContext = {},
): string {
  return `<div class="card mt-3" id="videos">
    <div class="card-head"><h2>فيديوهاتك</h2><div class="grow"></div>
      <span class="ago">ترفعه مرّةً، ويُنشر على YouTube وTikTok وInstagram</span></div>
    <p class="hint"><b>صدّره هكذا فيقبله الثلاث</b>: MP4 (H.264 وصوت AAC)، رأسيٌّ 1080×1920 بثلاثين إطارًا،
      بين ثلاث ثوانٍ وثلاث دقائق، وأقلُّ من 300MB — واختر «تحسين للويب» إن وُجد.</p>
    <div class="vup">
      <label class="btn btn-primary vpick">اختر مقطعًا وارفعه
        <input type="file" id="vfile" class="vfile" accept="video/mp4,video/quicktime,video/webm"></label>
      <progress id="vup-bar" max="100" value="0" hidden></progress>
      <span class="ago" id="vup-msg" aria-live="polite"></span>
    </div>
    ${uploads.length === 0
      ? emptyState({ echo: true, title: 'لا مقطعَ بعد', html: 'ارفع مقطعًا، ثمّ صفه بجملةٍ نكتب منها نصوصَه، واختر منصّاته.' })
      : `<div class="vlist">${uploads.map((u) => row(u, now, cards, ctx)).join('')}</div>`}
  </div>`
}
