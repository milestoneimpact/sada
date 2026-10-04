/**
 * إنفوجرافيك من نصّ المنشور — **الصورةُ تحمل فكرتَه لا مزاجَه** (D-174).
 *
 * ## ما قاله المالك
 *
 * «الصورةُ يجب أن تكون لها علاقةٌ وطيدةٌ وتمثّل شيئًا من النصّ والمحتوى، وليست
 * صورةً عشوائيّة. اعتمد إنفوجرافيك وصورًا بيانيّةً احترافيّةً وفخمةً بمستوى مؤسّسيّ.»
 *
 * وقيس فوُجد: نموذجُ الصور لا يقرأ العربيّة، والموجزُ الذي يترجم له سقط على staging،
 * فخرج مشهدٌ جميلٌ لا يمتّ إلى «خمسة أبعاد وثلاث طبقات» بشيء. **ولا نموذجُ انتشارٍ
 * يرسم كلمةً عربيّةً موصولةً ولا رقمًا صحيحًا.**
 *
 * ## فالإنفوجرافيك يُكتب ولا يُرسَم
 *
 * ١ · **المحتوى من النصّ نفسِه**: نموذجُ الكتابة يستخرج العنوانَ والأبعادَ والأرقامَ
 *    والخلاصة بصيغةٍ مقيّدة (`INFO_SYSTEM`)، **ويُرفض كلُّ رقمٍ لا يرد في النصّ**
 *    (`parseInfo`). فإن سقط النداءُ استُخرج المحتوى من النصّ بقواعدَ حتميّة
 *    (`infoFromText`): القوائمُ بعد النقطتين، والمعطوفاتُ بالواو، والفقرات. **فلا
 *    تخرج صورةٌ لا علاقةَ لها بالنصّ في أيّ فرع.**
 * ٢ · **والرسمُ صفحةٌ بخطوطٍ مضمَّنة** (Reem Kufi للعناوين وBeiruti للمتن وInter للأرقام —
 *    كانت خطوطَ اللوحة، وبقيت للصورة في `font.ts` حين صارت اللوحةُ على Plex: D-185)
 *    يصوّرها متصفّحُ Cloudflare كما يصوّر الشريحة (D-085): عربيّةٌ موصولةٌ بمُشكِّل
 *    خطوطٍ حقيقيّ، وأرقامٌ كما كُتبت.
 *
 * ## والهويّةُ مؤسّسيّة
 *
 * أرضٌ حبريّةٌ داكنة، وذهبٌ نحاسيٌّ للخيوط والأرقام، وإطارٌ داخليٌّ رفيع، وشبكةٌ
 * مقيسة. **لا زخرفَ يدّعي بيانًا**: الأعمدةُ في «bars» بطولِ أرقامها لا بطولٍ يُجمِّل.
 */
import { askWriter, type BriefDeps } from './brief'
import { BEIRUTI, INTER, REEM_KUFI } from './font'
import type { Platform } from '../oauth/providers'

export type InfoKind = 'pillars' | 'layers' | 'steps' | 'stats' | 'bars' | 'compare' | 'quote'

export interface InfoItem {
  readonly label: string
  /** الرقمُ كما كُتب في النصّ — ولا يُقبَل رقمٌ لا يرد فيه. */
  readonly value: string
  readonly note: string
}

export interface InfoSpec {
  readonly kind: InfoKind
  /** فوقيّةٌ إنجليزيّةٌ من كلمتين، أو فارغة. */
  readonly kicker: string
  readonly title: string
  readonly items: readonly InfoItem[]
  readonly secondary: { readonly title: string; readonly items: readonly string[] } | null
  readonly takeaway: string
  /** من أين جاء المحتوى: نموذجُ الكتابة، أم استخراجٌ من النصّ نفسِه. */
  readonly source: 'writer' | 'text'
}

/**
 * مقاسُ الإنفوجرافيك لكلّ منصّة — **والطوليُّ حيث تعرضه الخلاصةُ كاملًا**.
 *
 * LinkedIn وInstagram تعرضان 4:5 بلا قصّ، وهو أوسعُ ما يأخذه منشورٌ في الخلاصة،
 * والإنفوجرافيك يحتاج الطول. وX تقصّ الطوليَّ في خلاصتها فيبقى 16:9، والمقاطعُ 9:16.
 */
export const INFO_SIZE: Readonly<Record<Platform, { readonly width: number; readonly height: number }>> = {
  linkedin: { width: 1080, height: 1350 },
  instagram: { width: 1080, height: 1350 },
  x: { width: 1200, height: 675 },
  tiktok: { width: 1080, height: 1920 },
  youtube: { width: 1080, height: 1920 },
}

const KINDS: readonly InfoKind[] = ['pillars', 'layers', 'steps', 'stats', 'bars', 'compare', 'quote']

/** كم بندًا يحتمله كلُّ شكل — وما خرج عنه يُردّ ولا يُحشر. */
const COUNT: Readonly<Record<InfoKind, readonly [number, number]>> = {
  pillars: [3, 6], layers: [2, 5], steps: [3, 6], stats: [2, 4], bars: [2, 6], compare: [2, 2], quote: [0, 3],
}

/** التعليمةُ بالإنجليزيّة والمخرَجُ بالعربيّة — كتعليمة الموجز (D-083). */
export const INFO_SYSTEM = [
  'You turn an Arabic professional social post into the content of ONE institutional infographic.',
  'You never invent anything: every word, name and number must come from the post itself.',
  '',
  'Answer with JSON only, exactly these keys:',
  '{"kind":"…","kicker":"…","title":"…","items":[{"label":"…","value":"…","note":"…"}],',
  ' "secondary":{"title":"…","items":["…"]},"takeaway":"…"}',
  '',
  'kind — the one that fits the post\'s structure:',
  '- "pillars": the post names 3 to 6 parallel dimensions, principles or components.',
  '- "layers": the post describes 2 to 5 levels or tiers, narrow to broad.',
  '- "steps": the post describes a sequence, stages or a process of 3 to 6 steps.',
  '- "stats": the post states 2 to 4 numbers or percentages worth highlighting.',
  '- "bars": the post compares 2 to 6 quantities that all have numbers.',
  '- "compare": the post contrasts exactly two sides (before and after, A versus B).',
  '- "quote": one strong idea and no list.',
  'If the post contains no number, never choose "stats" or "bars".',
  '',
  'Fields — ARABIC unless stated otherwise:',
  '- title: the post\'s central claim, under 60 characters, not a question.',
  '- kicker: ENGLISH, exactly two words, Title Case, e.g. "Milestone Governance".',
  '- items[].label: under 26 characters, the post\'s own word for the item.',
  '- items[].note: under 80 characters, what the post says about that item.',
  '- items[].value: only for stats and bars — the number exactly as written in the post; otherwise "".',
  '- secondary: a second list in the post (for example three layers or scopes) with a title',
  '  under 30 characters and 2 to 5 items under 20 characters each; null if there is none.',
  '- takeaway: the post\'s conclusion or call to action, under 110 characters.',
  '- No hashtags, no emoji, no quotation marks.',
].join('\n')

function infoUser(text: string): string {
  return `The post:\n"""\n${text.trim()}\n"""`
}

/** أرقامٌ لاتينيّة — والأرقامُ العربيّةُ الهنديّةُ تُقرأ كما تُقرأ اللاتينيّة. */
function digits(value: string): string {
  return value.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
}

function tidy(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  const text = value.replace(/[#"«»“”]/g, '').replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return (space > max / 2 ? cut.slice(0, space) : cut).trim()
}

/**
 * يقرأ جوابَ النموذج — **ويردّ كلَّ رقمٍ لا يرد في النصّ**.
 *
 * نموذجٌ يُطلب منه «إنفوجرافيك» يميل إلى أن يملأه أرقامًا. والرقمُ في صورةٍ منشورةٍ
 * باسم المالك ادّعاءٌ باسمه. فكلُّ رقمٍ في `value` تُطلب أرقامُه في النصّ نفسِه،
 * وما لم يوجد يُمحى، **وشكلٌ رقميٌّ فقد أرقامَه يعود أعمدةً بلا أرقام**.
 */
export function parseInfo(raw: string, postText: string): InfoSpec | null {
  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    const match = /\{[\s\S]*\}/.exec(raw)
    if (match === null) return null
    try {
      payload = JSON.parse(match[0])
    } catch {
      return null
    }
  }
  const row = (payload ?? {}) as Record<string, unknown>
  let kind = (KINDS as readonly string[]).includes(String(row['kind'])) ? (row['kind'] as InfoKind) : null
  const title = tidy(row['title'], 70)
  if (kind === null || title.length < 4) return null

  const source = digits(postText)
  const truthful = (value: string): boolean => {
    const runs = digits(value).match(/\d+/g)
    return runs !== null && runs.every((run) => source.includes(run))
  }
  const items: InfoItem[] = (Array.isArray(row['items']) ? row['items'] : [])
    .slice(0, 6)
    .map((raw) => {
      const item = (raw ?? {}) as Record<string, unknown>
      const value = tidy(item['value'], 16)
      return {
        label: tidy(item['label'], 30),
        value: value !== '' && truthful(value) ? value : '',
        note: tidy(item['note'], 100),
      }
    })
    .filter((item) => item.label !== '')

  if ((kind === 'stats' || kind === 'bars') && items.some((item) => item.value === '')) kind = 'pillars'
  const [min, max] = COUNT[kind]
  if (items.length < min || items.length > max) return null

  const sec = row['secondary'] as Record<string, unknown> | null | undefined
  const secItems = sec !== null && sec !== undefined && Array.isArray(sec['items'])
    ? sec['items'].map((s) => tidy(s, 24)).filter((s) => s !== '').slice(0, 5)
    : []
  const kicker = tidy(row['kicker'], 28)
  return {
    kind,
    kicker: /^[A-Za-z][A-Za-z ]*[A-Za-z]$/.test(kicker) ? kicker : '',
    title,
    items,
    secondary: secItems.length >= 2 ? { title: tidy(sec?.['title'], 34), items: secItems } : null,
    takeaway: tidy(row['takeaway'], 130),
    source: 'writer',
  }
}

const COUNT_WORDS = /(اثن[اي]ن|ثلاث[ةه]?|أربع[ةه]?|خمس[ةه]?|ست[ةه]?|سبع[ةه]?|\d+)\s+([؀-ۿ]+)/

/**
 * المحتوى من النصّ بقواعدَ حتميّة — **حين يسقط النموذج، لا صورةٌ عامّة**.
 *
 * ١ · القائمةُ بعد النقطتين («بخمسة أبعاد: قرار، توقيت، تحكّم، قياس، قيمة») أعمدة.
 * ٢ · والمعطوفاتُ بالواو («المشروع والبرنامج والمحفظة») قائمةٌ ثانية، وعنوانُها
 *     عددُها ومعدودُها إن سبقاها («ثلاث طبقات»).
 * ٣ · وإلّا ففقراتُ المنشور خطوات، وإلّا فالفكرةُ الواحدةُ اقتباس.
 *
 * وكلُّ ما يُكتب في الصورة كلماتُ المنشور نفسُها.
 */
export function infoFromText(text: string): InfoSpec {
  const clean = text
    .split('\n')
    .filter((line) => !/^\s*(#[\p{L}\p{N}_]+\s*)+$/u.test(line))
    .join('\n')
    .replace(/#[\p{L}\p{N}_]+/gu, '')
  const sentences = clean.split(/[.!؟\n]+/).map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => s.length > 3)
  const title = tidy(sentences[0] ?? clean, 70)

  const short = (part: string): boolean => part.length > 0 && part.length <= 26 && part.split(' ').length <= 4
  let pillars: string[] = []
  for (const m of clean.matchAll(/:\s*([^.\n؟!]{4,220})/g)) {
    const parts = (m[1] ?? '').split(/[،,]\s*|\s+و(?=[؀-ۿ])/).map((p) => tidy(p, 30))
    if (parts.length >= 3 && parts.length <= 6 && parts.every(short)) {
      pillars = parts
      break
    }
  }

  let secondary: InfoSpec['secondary'] = null
  for (const m of clean.matchAll(/((?:ال[؀-ۿ]+\s+و)+ال[؀-ۿ]+)/g)) {
    const parts = (m[1] ?? '').split(/\s+و(?=ال)/).map((p) => p.trim())
    if (parts.length < 3 || parts.length > 5 || parts.some((p) => pillars.includes(p))) continue
    const before = clean.slice(Math.max(0, (m.index ?? 0) - 48), m.index ?? 0)
    const counted = COUNT_WORDS.exec(before)
    secondary = { title: counted === null ? '' : `${counted[1]} ${counted[2]}`, items: parts }
    break
  }

  const takeaway = tidy(sentences.length > 1 ? sentences[sentences.length - 1]! : '', 130)
  if (pillars.length >= 3) {
    return {
      kind: 'pillars', kicker: '', title,
      items: pillars.map((label) => ({ label, value: '', note: '' })),
      secondary, takeaway, source: 'text',
    }
  }

  const paragraphs = clean.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter((p) => p.length > 12).slice(1)
  if (paragraphs.length >= 3) {
    return {
      kind: 'steps', kicker: '', title,
      items: paragraphs.slice(0, 5).map((p) => {
        const first = p.split(/[.!؟]/)[0] ?? p
        const words = first.split(' ')
        return { label: tidy(words.slice(0, 4).join(' '), 30), value: '', note: tidy(words.slice(4).join(' '), 100) }
      }),
      secondary, takeaway, source: 'text',
    }
  }
  return { kind: 'quote', kicker: '', title, items: [], secondary, takeaway, source: 'text' }
}

export interface InfoOutcome {
  readonly spec: InfoSpec
  readonly cost: number
  /** ما وقع للنموذج — يُحفَظ مع الصورة فيُعرف من أين جاء محتواها. */
  readonly detail: string
}

/** سقفُ الجواب: قائمةٌ قصيرة، **وتفكيرُ نموذجٍ يفكّر قبلها** (D-174). */
export const INFO_MAX_TOKENS = 3000

/** المحتوى من النموذج، أو من النصّ إن سقط — **ولا يرمي، ولا يعود بلا محتوى**. */
export async function infographicSpec(deps: BriefDeps, postText: string, refId?: string): Promise<InfoOutcome> {
  const answer = await askWriter(deps, {
    system: INFO_SYSTEM,
    user: infoUser(postText),
    operation: 'infographic',
    maxTokens: INFO_MAX_TOKENS,
    ...(refId === undefined ? {} : { refId }),
  })
  const spec = answer.text === null ? null : parseInfo(answer.text, postText)
  if (spec !== null) return { spec, cost: answer.cost, detail: '' }
  return {
    spec: infoFromText(postText),
    cost: answer.cost,
    detail: answer.text === null
      ? `المحتوى من نصّ المنشور مباشرةً — تعذّر نموذجُ الكتابة: ${answer.detail}`
      : 'المحتوى من نصّ المنشور مباشرةً — جوابُ النموذج لم يوافق الشكل',
  }
}

// ── الرسم ─────────────────────────────────────────────────────────────

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** «01» — بأرقامٍ لاتينيّةٍ كأرقام اللوحة. */
function ordinal(i: number): string {
  return String(i + 1).padStart(2, '0')
}

function numberOf(value: string): number {
  const n = Number.parseFloat(digits(value).replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/**
 * الرقمُ كبيرًا — **والنسبةُ حلقةً بقدرها**: «62%» تُرسم قوسًا يملأ 62 من المئة، لا
 * زخرفًا بطولٍ يُجمِّل. وما ليس نسبةً يبقى رقمًا.
 */
function ring(value: string): string {
  const percent = /[%٪]/.test(value) ? numberOf(value) : NaN
  if (!(percent > 0 && percent <= 100)) return `<span class="big">${esc(value)}</span>`
  const c = 2 * Math.PI * 52
  return `<span class="ring"><svg viewBox="0 0 120 120" aria-hidden="true">
      <defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e7cf9b"/><stop offset="1" stop-color="#9b7640"/></linearGradient></defs>
      <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="10"/>
      <circle cx="60" cy="60" r="52" fill="none" stroke="url(#rg)" stroke-width="10" stroke-linecap="round"
        stroke-dasharray="${((percent / 100) * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 60 60)"/></svg>
    <span class="big">${esc(value)}</span></span>`
}

/** القائمةُ الثانية شريطَ طبقات: درجاتٌ تشتدّ من الأولى إلى الأخيرة. */
function tiers(sec: NonNullable<InfoSpec['secondary']>): string {
  const n = sec.items.length
  return `<div class="sec">${sec.title === '' ? '' : `<b class="st">${esc(sec.title)}</b>`}
    <div class="tier" style="grid-template-columns:repeat(${n},1fr)">${sec.items
      .map((item, i) => `<span style="background:rgba(214,184,128,${(0.06 + (0.22 * i) / Math.max(1, n - 1)).toFixed(2)})">
        <i>${ordinal(i)}</i>${esc(item)}</span>`).join('')}</div></div>`
}

function body(spec: InfoSpec): string {
  const items = spec.items
  switch (spec.kind) {
    case 'pillars':
      return `<div class="pil n${items.length}">${items.map((it, i) => `<div class="card">
          <span class="ord">${ordinal(i)}</span><b class="lab">${esc(it.label)}</b>
          ${it.note === '' ? '' : `<p class="note">${esc(it.note)}</p>`}</div>`).join('')}</div>`
    case 'layers':
      return `<div class="lay">${items.map((it, i) => `<div class="band" style="--w:${56 + (44 * i) / Math.max(1, items.length - 1)}%">
          <span class="num">${ordinal(i)}</span><b class="lab">${esc(it.label)}</b>
          ${it.note === '' ? '' : `<span class="note">${esc(it.note)}</span>`}</div>`).join('')}</div>`
    case 'steps':
      return `<ol class="stp">${items.map((it, i) => `<li><span class="dot">${ordinal(i)}</span>
          <div><b class="lab">${esc(it.label)}</b>${it.note === '' ? '' : `<p class="note">${esc(it.note)}</p>`}</div></li>`).join('')}</ol>`
    case 'stats':
      return `<div class="sta n${items.length}">${items.map((it) => `<div class="card">
          ${ring(it.value)}<div class="txt"><b class="lab">${esc(it.label)}</b>
          ${it.note === '' ? '' : `<p class="note">${esc(it.note)}</p>`}</div></div>`).join('')}</div>`
    case 'bars': {
      const top = Math.max(...items.map((it) => numberOf(it.value)), 1)
      return `<div class="bar">${items.map((it) => `<div class="row">
          <b class="lab">${esc(it.label)}</b>
          <span class="track"><span class="fill" style="width:${Math.max(4, (numberOf(it.value) / top) * 100).toFixed(1)}%"></span></span>
          <span class="val">${esc(it.value)}</span></div>`).join('')}</div>`
    }
    case 'compare':
      return `<div class="cmp">${items.map((it, i) => `<div class="side${i === 1 ? ' b' : ''}">
          <b class="lab">${esc(it.label)}</b>${it.note === '' ? '' : `<p class="note">${esc(it.note)}</p>`}</div>`).join('<span class="vs">مقابل</span>')}</div>`
    case 'quote':
      return `<div class="quo"><span class="mark" aria-hidden="true"></span>
        ${items.map((it) => `<p class="note">${esc(it.label)}${it.note === '' ? '' : ` · ${esc(it.note)}`}</p>`).join('')}</div>`
  }
}

/**
 * الصفحةُ التي تُصوَّر — **بالبكسل لا بالنِّسَب**: اللقطةُ بمقاسٍ ثابتٍ معلوم.
 *
 * والمقاساتُ تتبع عرضَ اللوح (`u`): المربّعُ والطوليُّ على العرض، والعرضيُّ على
 * الارتفاع، فيبقى الخطُّ مقروءًا في مصغَّر الخلاصة.
 */
export function infographicHtml(spec: InfoSpec, platform: Platform): string {
  const { width: W, height: H } = INFO_SIZE[platform]
  const wide = W > H
  // ‏والطوليُّ ‏9:16 يكبر بارتفاعه حتّى ‏1.3: بعرضه وحدَه يبقى نصفُه فارغًا
  const u = (wide ? H * 1.35 : Math.min(W * 1.3, H * 0.8)) / 1080
  const px = (n: number): string => `${Math.round(n * u)}px`
  const face = (family: string, b64: string, weight: string): string =>
    `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${b64}) format('woff2');font-weight:${weight};font-display:block}`
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
${face('Reem Kufi', REEM_KUFI.b64, '400 700')}${face('Beiruti', BEIRUTI.b64, '200 900')}${face('Inter', INTER.b64, '100 900')}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:#0c121c}
.c{position:relative;width:${W}px;height:${H}px;padding:${px(78)} ${px(80)};display:flex;flex-direction:column;gap:${px(34)};
  font-family:'Beiruti',sans-serif;color:#f3eee3;
  background:radial-gradient(${px(900)} ${px(640)} at 88% -12%,rgba(214,184,128,.20),transparent 62%),
    radial-gradient(${px(760)} ${px(560)} at -6% 108%,rgba(111,176,171,.12),transparent 60%),#0c121c}
.c::before{content:'';position:absolute;inset:${px(26)};border:1px solid rgba(214,184,128,.28);border-radius:${px(22)};pointer-events:none}
.c.wide{display:grid;grid-template-columns:38% 1fr;grid-template-rows:1fr auto;column-gap:${px(56)};row-gap:${px(24)}}
.head{display:flex;flex-direction:column;gap:${px(18)}}
.wide .head{grid-row:1/3;justify-content:center}
.k{font-family:'Inter',sans-serif;font-weight:600;font-size:${px(20)};letter-spacing:.3em;text-transform:uppercase;color:#d6b880;unicode-bidi:isolate}
.rule{width:${px(84)};height:${px(3)};border-radius:${px(2)};background:linear-gradient(270deg,#d6b880,#8e6a33)}
.t{font-family:'Reem Kufi',sans-serif;font-weight:700;font-size:${px(wide ? 50 : 64)};line-height:1.32;text-wrap:balance;color:#f7f2e7}
.main{flex:1;display:flex;flex-direction:column;justify-content:center;gap:${px(40)};min-height:0}
.num{font-family:'Inter',sans-serif;font-weight:600;font-size:${px(18)};letter-spacing:.14em;color:#d6b880}
.lab{font-family:'Reem Kufi',sans-serif;font-weight:700;font-size:${px(wide ? 32 : 42)};line-height:1.3;color:#f7f2e7}
.note{font-weight:500;font-size:${px(wide ? 20 : 25)};line-height:1.55;color:#b3bbc8}
.ord{font-family:'Inter',sans-serif;font-weight:700;font-size:${px(wide ? 30 : 46)};line-height:1;letter-spacing:.02em;
  background:linear-gradient(180deg,#ecd6a6,#9b7640);-webkit-background-clip:text;background-clip:text;color:transparent}
.card{position:relative;display:flex;flex-direction:column;gap:${px(14)};padding:${px(wide ? 26 : 36)} ${px(wide ? 24 : 32)};border-radius:${px(20)};
  background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.02));border:1px solid rgba(214,184,128,.22)}
.card::before{content:'';position:absolute;inset-inline:${px(26)};top:0;height:${px(3)};border-radius:0 0 ${px(3)} ${px(3)};
  background:linear-gradient(270deg,#d6b880,rgba(214,184,128,.15))}
.pil{display:grid;grid-template-columns:repeat(6,1fr);gap:${px(18)}}
.pil .card{grid-column:span 2}
.pil.n4 .card{grid-column:span 3}
.pil.n5 .card:nth-child(4){grid-column:2/span 2}
.pil.n5 .card:nth-child(5){grid-column:4/span 2}
.wide .pil.n5 .card:nth-child(4),.wide .pil.n5 .card:nth-child(5){grid-column:span 3}
.lay{display:flex;flex-direction:column;align-items:center;gap:${px(12)}}
.band{width:var(--w);display:flex;align-items:baseline;gap:${px(16)};padding:${px(22)} ${px(30)};border-radius:${px(16)};
  background:linear-gradient(270deg,rgba(214,184,128,.22),rgba(214,184,128,.06));border:1px solid rgba(214,184,128,.3)}
.band .note{font-size:${px(20)}}
.stp{list-style:none;display:flex;flex-direction:column;gap:${px(wide ? 18 : 34)};position:relative}
.tall .main{justify-content:space-evenly}
.stp li>div{display:flex;flex-direction:column;gap:${px(8)}}
/* كلُّ خطوةٍ بطاقة، والخيطُ بين دوائرها يصل ما بينها */
.stp li{display:flex;gap:${px(26)};align-items:center;position:relative;padding:${px(wide ? 16 : 26)} ${px(wide ? 20 : 30)};
  border-radius:${px(20)};border:1px solid rgba(214,184,128,.22);background:linear-gradient(270deg,rgba(255,255,255,.055),rgba(255,255,255,.015))}
.stp li:not(:last-child)::after{content:'';position:absolute;inset-inline-start:${px(wide ? 51 : 61)};top:100%;height:${px(wide ? 18 : 34)};width:2px;
  background:linear-gradient(180deg,#d6b880,rgba(214,184,128,.2))}
.tall .stp{flex:1;justify-content:space-evenly}
.tall .stp li::after{display:none}
.dot{flex:none;display:grid;place-items:center;width:${px(64)};height:${px(64)};border-radius:50%;border:2px solid #d6b880;
  font-family:'Inter',sans-serif;font-weight:600;font-size:${px(20)};color:#d6b880;background:#111a28}
/* ‏والأرقامُ تملأ لوحَها: بطاقتان أو ثلاثٌ في وسطٍ فارغٍ تُقرأ ناقصة، فتمتدّ الصفوفُ
   بالتساوي إلى سقفٍ لا تتجاوزه، والرقمُ في وسط بطاقته */
.sta{flex:1;display:grid;grid-template-columns:repeat(2,1fr);grid-auto-rows:1fr;gap:${px(18)};max-height:${px(wide ? 560 : 760)}}
.sta .card{align-items:flex-start;justify-content:center}
.txt{display:flex;flex-direction:column;gap:${px(10)}}
.sta.n3 .card:first-child,.sta.n1 .card{flex-direction:row;align-items:center;gap:${px(40)}}
.sta.n3 .card:first-child{grid-column:1/-1}
.big{font-family:'Inter',sans-serif;font-weight:700;font-size:${px(wide ? 56 : 84)};line-height:1;color:#d6b880;unicode-bidi:isolate}
.ring{position:relative;display:grid;place-items:center;width:${px(wide ? 150 : 210)};height:${px(wide ? 150 : 210)}}
.ring svg{position:absolute;inset:0;width:100%;height:100%}
.ring .big{font-size:${px(wide ? 36 : 50)};color:#f3eee3}
.bar{display:flex;flex-direction:column;gap:${px(22)}}
.row{display:grid;grid-template-columns:${px(240)} 1fr ${px(120)};align-items:center;gap:${px(18)}}
.row .lab{font-size:${px(26)}}
.track{height:${px(22)};border-radius:${px(11)};background:rgba(255,255,255,.06);overflow:hidden}
.fill{display:block;height:100%;border-radius:${px(11)};background:linear-gradient(270deg,#d6b880,#6fb0ab)}
.val{font-family:'Inter',sans-serif;font-weight:700;font-size:${px(28)};color:#f3eee3;unicode-bidi:isolate}
.cmp{display:grid;grid-template-columns:1fr auto 1fr;align-items:stretch;gap:${px(18)}}
.side{display:flex;flex-direction:column;gap:${px(12)};padding:${px(30)};border-radius:${px(18)};border:1px solid rgba(214,184,128,.3);
  background:rgba(255,255,255,.035)}
.side.b{background:rgba(214,184,128,.10)}
.vs{align-self:center;font-weight:700;font-size:${px(20)};color:#d6b880}
.quo{display:flex;flex-direction:column;gap:${px(16)};padding-inline-start:${px(36)};border-inline-start:${px(4)} solid #d6b880}
.mark{width:${px(56)};height:${px(40)};border-radius:${px(8)} ${px(8)} ${px(28)} ${px(8)};background:#d6b880;opacity:.9}
.sec{display:flex;flex-direction:column;gap:${px(16)}}
.sec .st{font-family:'Reem Kufi',sans-serif;font-weight:700;font-size:${px(wide ? 22 : 28)};color:#d6b880}
.tier{display:grid;border-radius:${px(18)};overflow:hidden;border:1px solid rgba(214,184,128,.38)}
.tier span{display:flex;flex-direction:column;align-items:flex-start;gap:${px(6)};padding:${px(wide ? 16 : 24)} ${px(wide ? 20 : 28)};
  font-family:'Reem Kufi',sans-serif;font-weight:700;font-size:${px(wide ? 24 : 32)};color:#f7f2e7}
.tier span+span{border-inline-start:1px solid rgba(214,184,128,.38)}
.tier i{font-style:normal;font-family:'Inter',sans-serif;font-weight:600;font-size:${px(16)};letter-spacing:.14em;color:#d6b880}
.take{padding:${px(26)} ${px(32)};border-radius:${px(18)};border-inline-start:${px(4)} solid #d6b880;
  background:linear-gradient(270deg,rgba(214,184,128,.10),rgba(255,255,255,.02));
  font-weight:600;font-size:${px(wide ? 22 : 28)};line-height:1.55;color:#f1eadc}
.wide .main,.wide .take{grid-column:2}
</style></head><body>
<div class="c${wide ? ' wide' : H / W > 1.5 ? ' tall' : ''}">
  <div class="head">
    ${spec.kicker === '' ? '' : `<div class="k">${esc(spec.kicker)}</div>`}
    <div class="rule"></div>
    <h1 class="t">${esc(spec.title)}</h1>
    ${wide && spec.takeaway !== '' ? `<p class="take">${esc(spec.takeaway)}</p>` : ''}
  </div>
  <div class="main">
    ${spec.kind === 'quote' && spec.items.length === 0 && spec.takeaway !== '' && !wide
      ? `<div class="quo"><span class="mark"></span><p class="lab">${esc(spec.takeaway)}</p></div>`
      : body(spec)}
    ${spec.secondary === null ? '' : tiers(spec.secondary)}
  </div>
  ${!wide && spec.takeaway !== '' && !(spec.kind === 'quote' && spec.items.length === 0) ? `<p class="take">${esc(spec.takeaway)}</p>` : ''}
</div></body></html>`
}
