/**
 * الخطّةُ — وهي **حكمٌ لا جدولة**.
 *
 * ## ما تجيب عنه
 *
 * صدى تحلّل كلَّ مصدرٍ على حدة، فتعرف قيمةَ كلٍّ منفردا. والخطّةُ تجيب
 * سؤالا لا يجيبه التحليل: **أيُّ هذه يستحقّ أن يُنشر في هذا المدى، وبأيّ
 * ترتيب، وعلى أيّ قناة؟** — وهو سؤالُ محرّرٍ لا سؤالُ قارئ.
 *
 * ## ولا تُنفق ولا تجدول
 *
 * بندٌ في الخطّة **اقتراح**: لا يُكتب منه نصٌّ حتّى يضغط المالك، ولا
 * يُجدول حتّى يعتمد النصّ. فالخطّةُ نداءٌ واحدٌ رخيص، والكتابةُ نداءٌ
 * لكلّ بندٍ يُختار.
 *
 * ## ولا مصدرَ يُخترَع
 *
 * النموذجُ يختار من قائمةٍ معطاةٍ بمعرّفاتها. ومعرّفٌ يخترعه يعطي بندا
 * **لا يمكن تنفيذُه** — فيُرفض في الشيفرة لا يُرجى من الوصف.
 *
 * ## والخطّةُ محورَ المنصّة (D-282)
 *
 * المالكُ يختار المدى (أسبوعًا إلى شهرين) والقنواتِ وإيقاعَ كلٍّ منها والمصادرَ والأفكارَ وأيرسم صورةً
 * مع كلّ منشور — **ولا منصّةَ مكتوبةً في هذا الملفّ بحرفها**: القنواتُ تُمرَّر إلى الموجّه والمخطّط
 * والقارئ معًا، فما يُطلب هو ما يُقبل. والفكرةُ بكلمات المالك تدخل مصدرًا بمعرّف `idea:<n>`.
 */
import type { PublishPlatform } from '../oauth/providers'

export interface PlanSource {
  readonly id: string
  readonly name: string
  readonly summary: string
  readonly themes: readonly string[]
  readonly worth: number
  /** كم منشورا خرج من هذا المصدر — فلا يُعاد ما استُنفد. */
  readonly used: number
}

/** القنواتُ التي تُخطَّط لها — كلُّ ما ينشر له صدى. */
export type PlanPlatform = PublishPlatform
export const PLAN_CHANNELS: readonly PlanPlatform[] = ['linkedin', 'x', 'instagram', 'tiktok', 'youtube']

/**
 * ما يُخطَّط له حين لا يختار المالكُ قناة: القناتان النصّيّتان اللتان لا تحتاجان مقطعًا ولا صورة.
 * **اختيارٌ افتراضيٌّ مسمًّى، لا ثابتٌ في منطق** — والمالكُ يبدّله من النموذج.
 */
export const DEFAULT_CHANNELS: readonly PlanPlatform[] = ['linkedin', 'x']

/** القنواتُ التي لا تنشر إلّا مقطعًا — البندُ لها `video` دائمًا، والمسوّدةُ تنتظر المقطع. */
export const CLIP_CHANNELS: ReadonlySet<string> = new Set<PlanPlatform>(['tiktok', 'youtube'])

export function isPlanPlatform(p: unknown): p is PlanPlatform {
  return typeof p === 'string' && (PLAN_CHANNELS as readonly string[]).includes(p)
}

/** نوعُ ما يُنشر في البند: نصٌّ، أو نصٌّ بصورة، أو مقطع. */
export type PlanKind = 'text' | 'image' | 'video'

/** نوعُ البند بمنصّته: المقطعُ إلزاميٌّ لقنوات المقاطع، والصورةُ لـ Instagram، وما سواهما نصٌّ ما لم يُقَل غيرُه. */
export function kindFor(platform: PlanPlatform, asked?: unknown): PlanKind {
  if (CLIP_CHANNELS.has(platform)) return 'video'
  if (platform === 'instagram') return asked === 'video' ? 'video' : 'image'
  return asked === 'image' || asked === 'video' ? asked : 'text'
}

/**
 * بدايةُ الأسبوع: الأحدُ القادم، أو اليومَ إن كان أحدا.
 *
 * والأحدُ لا الاثنين: أسبوعُ العمل في الرياض يبدأ الأحد، وخطّةٌ تبدأ
 * الاثنين تترك يوما بلا موضع. والقياسُ بـ UTC كما في كلّ ما يُخزَّن.
 */
export function weekStart(now: Date): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const ahead = (7 - date.getUTCDay()) % 7
  date.setUTCDate(date.getUTCDate() + ahead)
  return date.toISOString().slice(0, 10)
}

/** مدى الخطّة (D-256 · D-282): أسبوعٌ أو أسبوعان أو شهرٌ من أربعة أسابيع أو شهران من ثمانية. */
export type PlanSpan = 'week' | '2weeks' | 'month' | '2months'
export const PLAN_SPANS: readonly PlanSpan[] = ['week', '2weeks', 'month', '2months']

const SPAN_DAYS: Readonly<Record<PlanSpan, number>> = { week: 7, '2weeks': 14, month: 28, '2months': 56 }

export function spanDays(span: PlanSpan): number {
  return SPAN_DAYS[span]
}

export function asSpan(raw: unknown): PlanSpan {
  return typeof raw === 'string' && (PLAN_SPANS as readonly string[]).includes(raw) ? (raw as PlanSpan) : 'week'
}

export const SPAN_LABEL: Readonly<Record<PlanSpan, string>> = { week: 'أسبوع', '2weeks': 'أسبوعان', month: 'شهر', '2months': 'شهران' }

/** إيقاعُ كلّ قناة: كم منشورًا في الأسبوع. */
export type Cadence = Readonly<Partial<Record<PlanPlatform, number>>>

/**
 * سقفُ البنود — **يُفرض في `parsePlan` لا يُرجى من المخطّط** (D-164).
 *
 * `maxItems` لا يصل إلى المزوّد: `portableSchema` يطويه وصفًا، لأنّ
 * المخرَجَ المقيَّد لا يقبله. فلو بقي السقفُ في المخطّط وحدَه لسقط كلُّه.
 */
export const MAX_ITEMS = 6

/** أقصى ما يُطلب في نداءٍ واحد — ما فوقه يُقسَم نداءين (شهران = شهرٌ وشهر). */
export const CALL_CAP = 60

/**
 * سقفُ البنود بالمدى والإيقاع: مجموعُ إيقاع القنوات في الأسبوع × الأسابيع، وبلا إيقاعٍ ستّةٌ للأسبوع كما كان.
 * وفوق `CALL_CAP` يُقصّ: نداءٌ بمئة بندٍ لا يقرؤه نموذجٌ قراءةً واحدة.
 */
export function maxItems(span: PlanSpan, cadence?: Cadence): number {
  const weeks = spanDays(span) / 7
  const perWeek = cadence === undefined ? 0 : Object.values(cadence).reduce((a, b) => a + Math.max(0, Math.floor(b ?? 0)), 0)
  return Math.min(CALL_CAP, Math.max(1, (perWeek > 0 ? perWeek : MAX_ITEMS) * weeks))
}

export interface PromptOptions {
  readonly channels?: readonly PlanPlatform[]
  readonly cadence?: Cadence
}

const CHANNEL_HINT: Readonly<Record<PlanPlatform, string>> = {
  linkedin: 'LinkedIn للفكرة المطوّلة: المصدرُ الغنيّ يصلح لها',
  x: 'X للجملة التي تقف وحدها: الفكرةُ الحادّة تصلح لها',
  instagram: 'Instagram لصورةٍ تحمل الفكرة وتعليقٍ قصير — كلُّ بندٍ لها `image`',
  tiktok: 'TikTok لمقطعٍ رأسيٍّ قصير يُغري بالمشاهدة — كلُّ بندٍ لها `video` ويحتاج مقطعًا يرفعه المالك',
  youtube: 'YouTube لمقطعٍ قصير بعنوانٍ يقف وحده — كلُّ بندٍ لها `video` ويحتاج مقطعًا يرفعه المالك',
}

export function systemPrompt(options: PromptOptions = {}): string {
  const channels = options.channels === undefined || options.channels.length === 0 ? DEFAULT_CHANNELS : options.channels
  const cadence = options.cadence ?? {}
  const rhythm = channels.map((c) => {
    const n = Math.max(0, Math.floor(cadence[c] ?? 0))
    return n > 0 ? `${c}: ${n} في الأسبوع` : `${c}: بلا إيقاعٍ محدَّد`
  })
  const names = channels.map((c) => `\`${c}\``).join(' أو ')
  return [
    'أنت محرّر محتوًى يخطّط مدًى من الأيّام لحساب مهنيّ واحد.',
    '',
    '## ما تقرّره',
    '',
    'تُعطى مصادر محلَّلةً بخلاصاتها ومحاورها ودرجة استحقاقها، وقد تُعطى',
    'أفكارًا بكلمات المالك (معرّفها يبدأ بـ `idea:`). واختر منها',
    'ما يستحقّ النشر في المدى المذكور، ورتّبه.',
    '',
    '## قيود لا تُخالَف',
    '',
    '**لا تختر مصدرا ليس في القائمة، ولا تخترع معرّفا.** والمعرّف يُنسخ',
    'كما هو حرفا بحرف.',
    '',
    '**ولا تزد على سقف البنود المذكور في الرسالة.** مدًى مزدحم',
    'يُتعب القارئ ويُستهلك المصادر في أسبوع.',
    '',
    '**ولا تكرّر مصدرا في قناة استُعمل فيها**، إلّا أن يكون عالي',
    'الاستحقاق وللزاوية الثانية وجه مختلف حقّا.',
    '',
    '## القنوات وإيقاعها',
    '',
    `القنواتُ المطلوبة: ${names} لا غير. وإيقاعُ كلٍّ منها في الأسبوع:`,
    ...rhythm.map((r) => `- ${r}`),
    '',
    ...channels.map((c) => `- ${CHANNEL_HINT[c]}.`),
    '',
    '## التوزيع',
    '',
    'باعد بين البنود: يوم فارغ بين منشورين خير من يومين متتاليين.',
    'ولا تضع منشورين في يوم واحد على القناة نفسها.',
    'والأوقات بـ UTC، واختر ما بين 05:00 و 15:00 — وهو نهار الخليج.',
    '',
    '## المخرَج',
    '',
    /*
     * **عقدُ الحقول يُكتب في الموجّه لا في المخطّط وحدَه** (D-157).
     *
     * كان المخطّطُ يصل إلى Anthropic وحدَه (عبر `output_config.format`)، أمّا مزوّدٌ
     * openai_compat فيُطلب منه json_object بلا وصفٍ للبند — فيعيد بنودًا
     * بمفاتيحَ من عنده (source, channel, date…) يُسقطها القارئُ كلَّها،
     * ويعود «لم يبقَ بندٌ صالح» بعد أن دُفع النداء. قِيس على staging:
     * ثلاثُ محاولاتٍ بـDeepSeek، كلٌّ بصفٍّ في cost_ledger ثمّ failed.
     */
    'أعد JSON بحقلين لا غير: `rationale` سطر واحد يشرح منطق المدى كلِّه،',
    'و `items` مصفوفة البنود. **وكلّ بند كائن بهذه الحقول السبعة بأسمائها حرفًا**:',
    '- `source_id`: معرّف المصدر كما ورد بعد `id:` — يُنسخ حرفًا بحرف.',
    `- \`platform\`: ${names} لا غير.`,
    '- `kind`: `text` أو `image` أو `video` — ما يُنشر مع النصّ.',
    '- `angle`: الزاوية في جملة واحدة (عشرة أحرف فأكثر).',
    '- `day`: تاريخ بصيغة YYYY-MM-DD من الأيّام المذكورة في الرسالة.',
    '- `time`: الساعة بـ UTC بصيغة HH:MM (مثل 07:30).',
    '- `why`: لماذا هذا المصدر في هذا اليوم، في جملة.',
    '',
    'مثال على الشكل لا على المضمون:',
    `{"rationale":"…","items":[{"source_id":"src:…","platform":"${channels[0]}","kind":"${kindFor(channels[0]!)}","angle":"…","day":"2026-01-04","time":"07:30","why":"…"}]}`,
  ].join('\n')
}

export function userPrompt(sources: readonly PlanSource[], week: string, span: PlanSpan = 'week', options: PromptOptions = {}): string {
  const lines = sources.map((s) =>
    [
      `### ${s.name}`,
      `id: ${s.id}`,
      `الاستحقاق: ${s.worth.toFixed(2)}`,
      s.used === 0 ? 'لم يُنشر منه شيء' : `خرج منه ${s.used} منشورا`,
      s.themes.length === 0 ? '' : `المحاور: ${s.themes.join(' · ')}`,
      s.summary,
    ]
      .filter((l) => l !== '')
      .join('\n'),
  )
  // أيّامُ المدى بحرفها: النموذجُ لا يحسب تواريخَ، ينسخها
  const days = Array.from({ length: spanDays(span) }, (_, i) => {
    const d = new Date(`${week}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + i)
    return d.toISOString().slice(0, 10)
  })
  const cap = maxItems(span, options.cadence)
  const head = span === 'week'
    ? `# أسبوع يبدأ ${week}، وبنودُه حتّى ${cap}`
    : span === '2weeks'
      ? `# أسبوعان يبدآن ${week}، وبنودُهما حتّى ${cap}`
      : span === 'month'
        ? `# شهرٌ من أربعة أسابيع يبدأ ${week}، وبنودُه حتّى ${cap}`
        : `# شهران من ثمانية أسابيع يبدآن ${week}، وبنودُهما حتّى ${cap}`
  return [
    head,
    `أيّامُه المتاحة للنشر: ${days.join(' · ')}`,
    '',
    '# المصادر المتاحة',
    '',
    lines.join('\n\n'),
  ].join('\n')
}

/** مخطّطُ الخطّة بقنواتها وسقفها — القنواتُ المختارة هي قائمةُ `platform` لا غير. */
export function planSchema(channels: readonly PlanPlatform[] = DEFAULT_CHANNELS, max = MAX_ITEMS) {
  const list = channels.length === 0 ? DEFAULT_CHANNELS : channels
  return {
    type: 'object',
    properties: {
      rationale: { type: 'string' },
      items: {
        type: 'array',
        minItems: 1,
        maxItems: max,
        items: {
          type: 'object',
          properties: {
            source_id: { type: 'string' },
            platform: { type: 'string', enum: [...list] },
            kind: { type: 'string', enum: ['text', 'image', 'video'] },
            angle: { type: 'string', minLength: 10 },
            day: { type: 'string' },
            time: { type: 'string' },
            why: { type: 'string' },
          },
          required: ['source_id', 'platform', 'kind', 'angle', 'day', 'time', 'why'],
          additionalProperties: false,
        },
      },
    },
    required: ['rationale', 'items'],
    additionalProperties: false,
  } as const
}

export const PLAN_SCHEMA = planSchema()

export interface PlanItem {
  readonly sourceId: string
  readonly platform: PlanPlatform
  readonly angle: string
  /** `YYYY-MM-DD` داخل المدى. */
  readonly day: string
  /** `HH:MM` بـ UTC. */
  readonly time: string
  readonly why: string
  /** ما يُنشر مع النصّ (D-282) — وغيابُه في خطّةٍ قديمة يعني `text`. */
  readonly kind?: PlanKind
  /** ما اختير له من المكتبة (D-260): `m:` · `u:` · `f:` — وغيابُه يعني «ولّد أنت». */
  readonly asset?: string
  /** ملاحظةٌ على بندٍ من خطّةٍ مرفوعة (D-287): ما وجده القارئ فيه ولا يمنعه — منصّةٌ غيرُ مربوطة، أو نصٌّ أطولُ من حدّها. */
  readonly note?: string
}

export interface Plan {
  readonly rationale: string
  readonly items: readonly PlanItem[]
}

/**
 * اختياراتُ المالك التي بُنيت بها الخطّة (D-282) — تُحفظ في `plans.choices_json` وتُقرأ بافتراضاتٍ آمنة،
 * فخطّةٌ قبل 0037 تُقرأ باختياراتٍ فارغة ولا تسقط.
 */
export interface PlanChoices {
  readonly channels: readonly PlanPlatform[]
  readonly cadence: Cadence
  readonly sources: readonly string[] | 'all'
  readonly ideas: readonly string[]
  readonly assets: readonly string[]
  readonly autoImage: boolean
  /** نوعُ الصورة الآليّة (D-285): إنفوجرافيك (الافتراض) أو رسمٌ فنّيّ بمستويَي المسوّدة والنهائيّة. */
  readonly imageStyle: PlanImageStyle
  readonly startDay: string
}

export type PlanImageStyle = 'infographic' | 'illustration'

export function asImageStyle(v: unknown): PlanImageStyle {
  return v === 'illustration' ? 'illustration' : 'infographic'
}

export const EMPTY_CHOICES: PlanChoices = { channels: [], cadence: {}, sources: 'all', ideas: [], assets: [], autoImage: false, imageStyle: 'infographic', startDay: '' }

const IDEA_CAP = 20

export function readChoices(raw: unknown): PlanChoices {
  let parsed: unknown = raw
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw) } catch { parsed = {} }
  }
  if (typeof parsed !== 'object' || parsed === null) return EMPTY_CHOICES
  const v = parsed as Partial<Record<keyof PlanChoices, unknown>>
  const channels = Array.isArray(v.channels) ? v.channels.filter(isPlanPlatform) : []
  const cadence: Partial<Record<PlanPlatform, number>> = {}
  if (typeof v.cadence === 'object' && v.cadence !== null) {
    for (const [k, n] of Object.entries(v.cadence as Record<string, unknown>)) {
      if (isPlanPlatform(k) && typeof n === 'number' && Number.isFinite(n)) cadence[k] = Math.min(28, Math.max(0, Math.floor(n)))
    }
  }
  const strings = (x: unknown, cap: number): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string' && s !== '').slice(0, cap) : [])
  return {
    channels: [...new Set(channels)],
    cadence,
    sources: Array.isArray(v.sources) ? strings(v.sources, 200) : 'all',
    ideas: strings(v.ideas, IDEA_CAP),
    assets: strings(v.assets, 200),
    autoImage: v.autoImage === true,
    imageStyle: asImageStyle(v.imageStyle),
    startDay: typeof v.startDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.startDay) ? v.startDay : '',
  }
}

function within(day: string, week: string, length = 7): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  const start = Date.parse(`${week}T00:00:00Z`)
  const at = Date.parse(`${day}T00:00:00Z`)
  if (Number.isNaN(start) || Number.isNaN(at)) return false
  const days = (at - start) / 86_400_000
  return days >= 0 && days < length
}

/**
 * يقرأ الخطّةَ ويتحقّق منها.
 *
 * **والتحقّقُ يقع هنا لا يُترك للنموذج**: وصفٌ يقول «لا تخترع معرّفا»
 * يُطاع أكثرَ ممّا يُعصى ولا يُطاع دائما. وبندٌ بمعرّفٍ مخترَع يُعرض على
 * المالك فيضغط «اكتب» فيفشل — **فيُمسك الآن، لا بعد أن يُعرض.**
 *
 * والبندُ الفاسد يُسقَط وحده ولا تسقط الخطّة: خمسةٌ صالحةٌ من ستّةٍ خيرٌ
 * من نداءٍ يُعاد كاملا بكلفته.
 *
 * **والسقفُ هنا كذلك** (D-164): ما زاد على `maxItems` من الصالح يُقصّ
 * على ترتيب النموذج، ويُحصى سببًا كغيره.
 *
 * **والقنواتُ المقبولة هي المختارة** (D-282): بندٌ لقناةٍ لم تُطلب يُسقَط كمعرّفٍ مخترَع.
 */
export function parsePlan(
  raw: unknown,
  known: ReadonlySet<string>,
  week: string,
  span: PlanSpan = 'week',
  options: PromptOptions = {},
): { ok: true; plan: Plan; dropped: number; droppedWhy: string } | { ok: false; reason: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'الجواب ليس كائنا' }
  const value = raw as { rationale?: unknown; items?: unknown }
  if (!Array.isArray(value.items)) return { ok: false, reason: 'لا بنود في الخطّة' }
  const channels = new Set<string>(options.channels === undefined || options.channels.length === 0 ? DEFAULT_CHANNELS : options.channels)

  const items: PlanItem[] = []
  let dropped = 0
  // ولماذا أُسقط يُحصى (D-157): «أُسقط ٣» بلا سببٍ لا يقول ما يُصلَح في الموجّه
  const why = new Map<string, number>()
  for (const entry of value.items) {
    const item = entry as Partial<Record<keyof PlanItem | 'source_id' | 'source' | 'id', unknown>>
    // قارئٌ متسامحٌ في الشكل صارمٌ في المعنى (D-157): الاسمُ البديلُ للحقل
    // يُقبَل، والقيمةُ الخاطئةُ لا تُقبَل
    const rawId = item['source_id'] ?? item['sourceId'] ?? item['source'] ?? item['id']
    const sourceId = typeof rawId === 'string' ? rawId.trim() : ''
    const platformRaw = typeof item['platform'] === 'string' ? item['platform'].trim().toLowerCase() : ''
    const platform = isPlanPlatform(platformRaw) && channels.has(platformRaw) ? platformRaw : null
    const angle = typeof item['angle'] === 'string' ? item['angle'].trim() : ''
    const day = typeof item['day'] === 'string' ? item['day'].trim().slice(0, 10) : ''
    const rawTime = typeof item['time'] === 'string' ? item['time'].trim() : ''
    const time = /^\d:\d{2}$/.test(rawTime) ? `0${rawTime}` : rawTime.slice(0, 5)

    const fault = !known.has(sourceId)
      ? 'مصدر لا نعرفه'
      : platform === null
        ? 'منصّة غير مطلوبة'
        : angle.length < 10
          ? 'زاوية أقصر من عشرة أحرف'
          : !within(day, week, spanDays(span))
            ? 'يوم خارج المدى'
            : !/^\d{2}:\d{2}$/.test(time)
              ? 'وقت ليس HH:MM'
              : null

    if (fault !== null) {
      dropped += 1
      why.set(fault, (why.get(fault) ?? 0) + 1)
      continue
    }
    items.push({
      sourceId,
      platform: platform!,
      kind: kindFor(platform!, typeof item['kind'] === 'string' ? item['kind'].trim().toLowerCase() : undefined),
      angle,
      day,
      time,
      why: typeof item['why'] === 'string' ? item['why'].trim() : '',
    })
  }

  if (items.length === 0) return { ok: false, reason: 'لم يبق بند صالح في الخطّة' }

  /*
   * **القصُّ على ترتيب النموذج، قبل الفرز بالموعد** (D-164).
   *
   * الموجّهُ يقول «اختر… ورتّبه»، فترتيبُه حكمٌ بالأولويّة. والقصُّ بعد
   * الفرز يُسقط آخرَ المدى لا أضعفَ البنود: سابعٌ في الأولويّة يومَ
   * الأحد يبقى، وثانٍ يومَ الخميس يُرمى.
   */
  const cap = maxItems(span, options.cadence)
  const over = items.length - cap
  if (over > 0) {
    items.splice(cap)
    dropped += over
    why.set(cap === MAX_ITEMS ? 'بند بعد السادس' : `بند فوق السقف ${cap}`, over)
  }

  return {
    ok: true,
    plan: {
      rationale: typeof value.rationale === 'string' ? value.rationale.trim() : '',
      items: items.sort((a, b) => `${a.day}${a.time}`.localeCompare(`${b.day}${b.time}`)),
    },
    dropped,
    droppedWhy: [...why.entries()].map(([k, n]) => (n === 1 ? k : `${k} ×${n}`)).join('، '),
  }
}
