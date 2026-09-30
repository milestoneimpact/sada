/**
 * المنشورُ كما سيظهر — **بنيةُ المنصّة وجلدُ صدى** (D-172).
 *
 * كان المنشورُ في شاشة منصّته نصًّا في بطاقةٍ رماديّة، وصورتُه مصغَّرٌ مربّعٌ
 * بستّةٍ وتسعين بكسلا تحته. فالمالكُ لا يرى ما سيراه قارئُه: أين تقع الصورة،
 * وأين يقف النصّ، وأين تغطّي طبقةُ TikTok العنوان.
 *
 * فيُرسم هنا المنشورُ ببنية منصّته: الرأس، والوسيطُ في موضعه وبنسبته،
 * وشريطُ التفاعل. **ويلبس جلدَ صدى**: خطَّ اللوحة وحبرَها وأيقوناتٍ من
 * صنعنا، بلا لون المنصّة ولا أيقوناتها ولا شعارِها داخل الإطار.
 *
 * ## والصدقُ قبل الشبه
 *
 * - **لا رقمَ مخترَع**: شريطُ التفاعل بلا أرقامٍ حتّى يُقاس، و`null` لا يُرسم صفرًا.
 * - **لا طيَّ مفترَض**: «…المزيد» يختلف بين المنصّات والأجهزة ولم يُقَس، فلا يُرسم.
 *   والاختصارُ إلى ثلاثة أسطر في الخطّ الزمنيّ اختيارُ تصفّحٍ يُقال مرّةً في الصفحة.
 * - **لا اسمَ مستخدمٍ ولا صورةَ حسابٍ مخترَعة**: الحرفُ الأوّل من الاسم المحفوظ.
 * - **الحالُ والكلفةُ والأزرارُ خارج الإطار** دائمًا: الإطارُ صورةُ المنشور لا غير.
 */
import { escapeHtml } from './escape'
import { ICON } from './icons'
import { SLIDE_SIZE } from '../../lib/image/slide'

export type NpPlatform = 'linkedin' | 'x' | 'instagram' | 'tiktok' | 'youtube'
export type NpVariant = 'compact' | 'feed'

export interface NpMedia {
  readonly id: string
  readonly mime: string
  /** رُكّبت الشريحةُ بمقاس المنصّة (`note === ''`)، فنسبتُها معلومة. */
  readonly composed: boolean
}

export interface NpMetrics {
  readonly impressions: number | null
  readonly reactions: number | null
  readonly comments: number | null
  readonly shares: number | null
}

export interface NativePostInput {
  readonly platform: NpPlatform
  readonly id: string
  readonly author: { readonly name: string; readonly kind: string | null }
  readonly text: string
  /** الوقتُ داخل الإطار قصيرًا: «مسوّدة» أو «الخميس 09:00» أو «2 ي». */
  readonly when: string
  readonly media: NpMedia | null
  /** صورةُ الغلاف لمقطعٍ بلا إطارٍ أوّل — الصورةُ التي حُرّك منها. */
  readonly poster: string | null
  readonly metrics: NpMetrics | null
  readonly variant: NpVariant
}

const LABEL: Readonly<Record<NpPlatform, string>> = {
  linkedin: 'LinkedIn', x: 'X', instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube',
}

const CLASS: Readonly<Record<NpPlatform, string>> = {
  linkedin: 'np-li', x: 'np-x', instagram: 'np-ig', tiktok: 'np-tt', youtube: 'np-yt',
}

/** الحرفُ الأوّل — **وحرفٌ عربيٌّ يُكتب منفصلًا** لا بشكل أوّله. */
function initial(name: string): string {
  const first = Array.from(name.trim().replace(/^[@\s]+/, ''))[0]
  return first === undefined ? '؟' : first.toUpperCase()
}

/**
 * النصُّ مهرَّبًا، والوسومُ ملوّنةً **بعد التهريب** — فلا يُحقَن وسمٌ من نصٍّ
 * كتبه نموذج.
 */
export function npText(text: string): string {
  return escapeHtml(text).replace(
    /(^|[\s(])(#[\p{L}\p{N}_]+)/gu,
    (_, lead: string, tag: string) => `${lead}<span class="np-tag">${tag}</span>`,
  )
}

/** رقمٌ مقيسٌ بأرقامٍ لاتينيّة، و`null` لا يُرسم. */
function num(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : `<b>${value.toLocaleString('en-US')}</b>`
}

function avatar(input: NativePostInput): string {
  return `<span class="np-av" data-kind="${input.author.kind === 'org' ? 'org' : 'member'}" aria-hidden="true">${
    escapeHtml(initial(input.author.name))}</span>`
}

/** الوسيطُ في موضعه — ونسبتُه حقيقيّةٌ إن عُرفت، وطبيعيّةٌ إن لم تُعرف. */
function mediaFigure(input: NativePostInput, stage: boolean): string {
  const m = input.media
  if (m === null) return ''
  const src = `/panel/media/${encodeURIComponent(m.id)}`
  if (m.mime.startsWith('video/')) {
    const poster = input.poster === null ? '' : ` poster="/panel/media/${escapeHtml(encodeURIComponent(input.poster))}"`
    return `<video src="${escapeHtml(src)}"${poster} preload="metadata" muted playsinline
      aria-label="المقطعُ المولَّد لهذا المنشور"></video>`
  }
  const size = !stage && m.composed && (input.platform === 'linkedin' || input.platform === 'x')
    ? SLIDE_SIZE[input.platform]
    : null
  const dims = size === null ? '' : ` width="${size.width}" height="${size.height}"`
  return `<img src="${escapeHtml(src)}" alt="الصورةُ المولَّدة لهذا المنشور" loading="lazy" data-media${dims}>`
}

function linkedin(input: NativePostInput): string {
  const media = mediaFigure(input, false)
  const m = input.metrics
  const counts = m === null || (m.reactions === null && m.comments === null && m.shares === null)
    ? ''
    : `<div class="np-counts">${m.reactions === null ? '' : `<span>${num(m.reactions)} تفاعلًا</span>`}
        <span class="np-end">${m.comments === null ? '' : `${num(m.comments)} تعليقات`}${
          m.shares === null ? '' : ` · ${num(m.shares)} إعادة نشر`}</span></div>`
  return `<header class="np-head">${avatar(input)}
      <span class="np-who"><b class="np-name">${escapeHtml(input.author.name)}</b>
        <span class="np-meta">${escapeHtml(input.when)} · ${ICON.globe}</span></span>
      <span class="np-end">${ICON.more}</span></header>
    <p class="np-text">${npText(input.text)}</p>
    ${media === '' ? '' : `<div class="np-media">${media}</div>`}
    ${counts}
    <div class="np-bar np-bar-li" aria-hidden="true"><span>${ICON.like}أعجبني</span><span>${ICON.comment}تعليق</span>
      <span>${ICON.repost}إعادة نشر</span><span>${ICON.send}إرسال</span></div>`
}

function x(input: NativePostInput): string {
  const media = mediaFigure(input, false)
  const m = input.metrics
  return `${avatar(input)}<div>
    <header class="np-head"><b class="np-name">${escapeHtml(input.author.name)}</b>
      <span class="np-meta">· ${escapeHtml(input.when)}</span><span class="np-end">${ICON.more}</span></header>
    <p class="np-text">${npText(input.text)}</p>
    ${media === '' ? '' : `<div class="np-media">${media}</div>`}
    <div class="np-bar" aria-hidden="true">
      <span>${ICON.comment}${num(m?.comments)}</span><span>${ICON.repost}${num(m?.shares)}</span>
      <span>${ICON.heart}${num(m?.reactions)}</span><span>${ICON.views}${num(m?.impressions)}</span>
      <span class="np-end">${ICON.bookmark}${ICON.share}</span></div></div>`
}

function instagram(input: NativePostInput): string {
  const media = mediaFigure(input, false)
  const m = input.metrics
  return `<header class="np-head">${avatar(input)}<b class="np-name">${escapeHtml(input.author.name)}</b>
      <span class="np-meta">· ${escapeHtml(input.when)}</span><span class="np-end">${ICON.more}</span></header>
    ${media === ''
      ? '<div class="np-slot"><span>Instagram لا تنشر بلا صورة</span></div>'
      : `<div class="np-media">${media}</div>`}
    <div class="np-bar" aria-hidden="true"><span>${ICON.heart}</span><span>${ICON.comment}</span>
      <span>${ICON.send}</span><span class="np-end">${ICON.bookmark}</span></div>
    ${m?.reactions === null || m?.reactions === undefined ? '' : `<p class="np-likes">${num(m.reactions)} إعجابًا</p>`}
    <p class="np-text"><b class="np-name">${escapeHtml(input.author.name)}</b> ${npText(input.text)}</p>`
}

/** مسرحُ المقطع الرأسيّ — TikTok وYouTube Shorts معا، ويفترقان في العمود والعنوان. */
function stage(input: NativePostInput): string {
  const media = mediaFigure(input, true)
  const tube = input.platform === 'youtube'
  const lines = input.text.trim().split('\n')
  const title = tube ? (lines[0] ?? '').slice(0, 100) : ''
  const caption = tube ? lines.slice(1).join('\n').trim() : input.text
  const m = input.metrics
  const clip = input.media?.mime.startsWith('video/') === true
  return `<div class="np-stage">
      ${media}
      ${clip ? '' : `<span class="np-noclip">${input.media === null
        ? 'لا يُنشر بلا مقطع'
        : 'صورةٌ لا مقطع — ولا يُنشر حتّى تُحرَّك'}</span>`}
      <span class="np-scrim" aria-hidden="true"></span>
      <ul class="np-rail" aria-hidden="true">
        <li>${avatar(input)}</li>
        <li>${tube ? ICON.like : ICON.heart}${num(m?.reactions)}</li>
        <li>${ICON.comment}${num(m?.comments)}</li>
        ${tube ? '' : `<li>${ICON.bookmark}</li>`}
        <li>${ICON.share}${num(m?.shares)}</li>
      </ul>
      <div class="np-over">
        <b class="np-name">${escapeHtml(input.author.name)}</b>
        ${tube ? `<p class="np-title">${npText(title)}</p>` : `<p class="np-text">${npText(caption)}</p>`}
      </div>
    </div>
    ${tube && caption !== ''
      ? `<details class="np-desc"><summary>الوصف · لا يظهر إلّا لمن فتحه</summary><p class="np-text">${npText(caption)}</p></details>`
      : ''}`
}

/** المنشورُ في إطار منصّته. */
export function nativePost(input: NativePostInput): string {
  const body = input.platform === 'linkedin'
    ? linkedin(input)
    : input.platform === 'x'
      ? x(input)
      : input.platform === 'instagram'
        ? instagram(input)
        : stage(input)
  return `<figure class="np ${CLASS[input.platform]}${input.variant === 'compact' ? ' np-compact' : ''}" data-np="${escapeHtml(input.id)}"
    aria-label="معاينةُ منشور ${LABEL[input.platform]}">${body}</figure>`
}

/**
 * صفٌّ في الخطّ الزمنيّ: الوقتُ في البداية، والمنشورُ في الوسط، وما تحت
 * الإطار في النهاية — الحالُ والنتيجةُ والأفعال.
 */
export function npRow(id: string, when: string, frame: string, under: string, cls = ''): string {
  return `<div class="np-row${cls === '' ? '' : ` ${cls}`}" id="p-${escapeHtml(id)}">
    <div class="np-when">${when}</div>${frame}<div class="np-under">${under}</div></div>`
}

/** رأسُ يومٍ لاصق — «الأحد 28 سبتمبر 2026». */
export function npDay(label: string): string {
  return `<h4 class="np-day">${escapeHtml(label)}</h4>`
}

/**
 * مربّعٌ في «الوسائط» — الوسيطُ وحده بنسبة الشبكة، ورابطُه إلى صفّه.
 *
 * والقصُّ هنا مقبول: الشبكةُ عند المنصّة تقصّ كذلك، والمنشورُ كاملًا في صفّه.
 */
export function npTile(input: {
  readonly id: string
  readonly media: NpMedia
  readonly poster: string | null
  readonly badge: string
  readonly dim: boolean
}): string {
  const src = `/panel/media/${encodeURIComponent(input.media.id)}`
  const video = input.media.mime.startsWith('video/')
  const body = video
    ? input.poster === null
      ? `<video src="${escapeHtml(src)}" preload="metadata" muted playsinline aria-hidden="true"></video>`
      : `<img src="/panel/media/${escapeHtml(encodeURIComponent(input.poster))}" alt="" loading="lazy" data-media>`
    : `<img src="${escapeHtml(src)}" alt="" loading="lazy" data-media>`
  return `<a class="np-tile${input.dim ? ' dim' : ''}" href="#p-${escapeHtml(input.id)}"
      aria-label="افتح المنشورَ في الخطّ الزمنيّ">${body}
    ${video ? `<span class="np-play" aria-hidden="true">${ICON.play}</span>` : ''}
    <span class="np-badge">${input.badge}</span></a>`
}
