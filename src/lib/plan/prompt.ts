/**
 * الخطّةُ الأسبوعيّة — وهي **حكمٌ لا جدولة**.
 *
 * ## ما تجيب عنه
 *
 * صدى تحلّل كلَّ مصدرٍ على حدة، فتعرف قيمةَ كلٍّ منفردا. والخطّةُ تجيب
 * سؤالا لا يجيبه التحليل: **أيُّ هذه يستحقّ أن يُنشر هذا الأسبوع، وبأيّ
 * ترتيب، وعلى أيّ منصّة؟** — وهو سؤالُ محرّرٍ لا سؤالُ قارئ.
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
 */

export interface PlanSource {
  readonly id: string
  readonly name: string
  readonly summary: string
  readonly themes: readonly string[]
  readonly worth: number
  /** كم منشورا خرج من هذا المصدر — فلا يُعاد ما استُنفد. */
  readonly used: number
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

export function systemPrompt(): string {
  return [
    'أنت محرّرُ محتوًى يخطّط أسبوعا لحسابٍ مهنيّ واحد.',
    '',
    '## ما تقرّره',
    '',
    'تُعطى مصادرَ محلَّلةً بخلاصاتها ومحاورها ودرجةِ استحقاقها. واختر منها',
    'ما يستحقّ النشر في الأسبوع القادم، ورتّبه.',
    '',
    '## قيودٌ لا تُخالَف',
    '',
    '**لا تختر مصدرا ليس في القائمة، ولا تخترع معرّفا.** والمعرّفُ يُنسخ',
    'كما هو حرفا بحرف.',
    '',
    '**من ثلاثة إلى ستّة بنودٍ لا أكثر.** أسبوعٌ بعشرة منشورات يُتعب',
    'القارئ ويُستهلك المصادر في أسبوع.',
    '',
    '**ولا تكرّر مصدرا في منصّةٍ استُعمل فيها**، إلّا أن يكون عاليَ',
    'الاستحقاق وللزاوية الثانية وجهٌ مختلفٌ حقّا.',
    '',
    '## التوزيع',
    '',
    'باعد بين البنود: يومٌ فارغٌ بين منشورين خيرٌ من يومين متتاليين.',
    'ولا تضع منشورين في يومٍ واحدٍ على المنصّة نفسها.',
    'والأوقاتُ بـ UTC، واختر ما بين 05:00 و 15:00 — وهو نهارُ الخليج.',
    '',
    'وLinkedIn للفكرة المطوّلة، و X للجملة التي تقف وحدها. فالمصدرُ',
    'الغنيّ يصلح للأولى، والفكرةُ الحادّة للثانية.',
    '',
    '## المخرَج',
    '',
    /*
     * **عقدُ الحقول يُكتب في الموجّه لا في المخطّط وحدَه** (D-157).
     *
     * كان المخطّطُ PLAN_SCHEMA يصل إلى Anthropic وحدَه (عبر `output_config.format`)، أمّا مزوّدٌ
     * openai_compat فيُطلب منه json_object بلا وصفٍ للبند — فيعيد بنودًا
     * بمفاتيحَ من عنده (source, channel, date…) يُسقطها القارئُ كلَّها،
     * ويعود «لم يبقَ بندٌ صالح» بعد أن دُفع النداء. قِيس على staging:
     * ثلاثُ محاولاتٍ بـDeepSeek، كلٌّ بصفٍّ في cost_ledger ثمّ failed.
     */
    'أعد JSON بحقلين لا غير: `rationale` سطرٌ واحد يشرح منطق الأسبوع كلِّه،',
    'و `items` مصفوفةُ البنود. **وكلُّ بندٍ كائنٌ بهذه الحقول الستّة بأسمائها حرفًا**:',
    '- `source_id`: معرّفُ المصدر كما ورد بعد `id:` — يُنسخ حرفًا بحرف.',
    "- `platform`: `linkedin` أو `x` لا غير.",
    '- `angle`: الزاويةُ في جملةٍ واحدة (عشرةُ أحرفٍ فأكثر).',
    '- `day`: تاريخٌ بصيغة YYYY-MM-DD من أيّام الأسبوع المذكورة في الرسالة.',
    '- `time`: الساعةُ بـ UTC بصيغة HH:MM (مثل 07:30).',
    '- `why`: لماذا هذا المصدرُ في هذا اليوم، في جملة.',
    '',
    'مثالٌ على الشكل لا على المضمون:',
    '{"rationale":"…","items":[{"source_id":"src:…","platform":"linkedin","angle":"…","day":"2026-01-04","time":"07:30","why":"…"}]}',
  ].join('\n')
}

export function userPrompt(sources: readonly PlanSource[], week: string): string {
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
  // أيّامُ الأسبوع السبعةُ بحرفها: النموذجُ لا يحسب تواريخَ، ينسخها
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${week}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + i)
    return d.toISOString().slice(0, 10)
  })
  return [
    `# أسبوعٌ يبدأ ${week}`,
    `أيّامُه المتاحة للنشر: ${days.join(' · ')}`,
    '',
    '# المصادر المتاحة',
    '',
    lines.join('\n\n'),
  ].join('\n')
}

/**
 * سقفُ البنود — **يُفرض في `parsePlan` لا يُرجى من المخطّط** (D-164).
 *
 * `maxItems` لا يصل إلى المزوّد: `portableSchema` يطويه وصفًا، لأنّ
 * المخرَجَ المقيَّد لا يقبله. فلو بقي السقفُ في المخطّط وحدَه لسقط كلُّه.
 */
export const MAX_ITEMS = 6

export const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    rationale: { type: 'string' },
    items: {
      type: 'array',
      minItems: 1,
      maxItems: MAX_ITEMS,
      items: {
        type: 'object',
        properties: {
          source_id: { type: 'string' },
          platform: { type: 'string', enum: ['linkedin', 'x'] },
          angle: { type: 'string', minLength: 10 },
          day: { type: 'string' },
          time: { type: 'string' },
          why: { type: 'string' },
        },
        required: ['source_id', 'platform', 'angle', 'day', 'time', 'why'],
        additionalProperties: false,
      },
    },
  },
  required: ['rationale', 'items'],
  additionalProperties: false,
} as const

export interface PlanItem {
  readonly sourceId: string
  readonly platform: 'linkedin' | 'x'
  readonly angle: string
  /** `YYYY-MM-DD` داخل الأسبوع. */
  readonly day: string
  /** `HH:MM` بـ UTC. */
  readonly time: string
  readonly why: string
}

export interface Plan {
  readonly rationale: string
  readonly items: readonly PlanItem[]
}

function within(day: string, week: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  const start = Date.parse(`${week}T00:00:00Z`)
  const at = Date.parse(`${day}T00:00:00Z`)
  if (Number.isNaN(start) || Number.isNaN(at)) return false
  const days = (at - start) / 86_400_000
  return days >= 0 && days < 7
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
 * **والسقفُ هنا كذلك** (D-164): ما زاد على `MAX_ITEMS` من الصالح يُقصّ
 * على ترتيب النموذج، ويُحصى سببًا كغيره.
 */
export function parsePlan(
  raw: unknown,
  known: ReadonlySet<string>,
  week: string,
): { ok: true; plan: Plan; dropped: number; droppedWhy: string } | { ok: false; reason: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'الجواب ليس كائنا' }
  const value = raw as { rationale?: unknown; items?: unknown }
  if (!Array.isArray(value.items)) return { ok: false, reason: 'لا بنودَ في الخطّة' }

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
    const platform = typeof item['platform'] === 'string' ? item['platform'].trim().toLowerCase() : item['platform']
    const angle = typeof item['angle'] === 'string' ? item['angle'].trim() : ''
    const day = typeof item['day'] === 'string' ? item['day'].trim().slice(0, 10) : ''
    const rawTime = typeof item['time'] === 'string' ? item['time'].trim() : ''
    const time = /^\d:\d{2}$/.test(rawTime) ? `0${rawTime}` : rawTime.slice(0, 5)

    const fault = !known.has(sourceId)
      ? 'مصدرٌ لا نعرفه'
      : platform !== 'linkedin' && platform !== 'x'
        ? 'منصّةٌ غير مدعومة'
        : angle.length < 10
          ? 'زاويةٌ أقصرُ من عشرة أحرف'
          : !within(day, week)
            ? 'يومٌ خارج الأسبوع'
            : !/^\d{2}:\d{2}$/.test(time)
              ? 'وقتٌ ليس HH:MM'
              : null

    if (fault !== null) {
      dropped += 1
      why.set(fault, (why.get(fault) ?? 0) + 1)
      continue
    }
    items.push({
      sourceId,
      platform: platform === 'x' ? 'x' : 'linkedin',
      angle,
      day,
      time,
      why: typeof item['why'] === 'string' ? item['why'].trim() : '',
    })
  }

  if (items.length === 0) return { ok: false, reason: 'لم يبقَ بندٌ صالحٌ في الخطّة' }

  /*
   * **القصُّ على ترتيب النموذج، قبل الفرز بالموعد** (D-164).
   *
   * الموجّهُ يقول «اختر… ورتّبه»، فترتيبُه حكمٌ بالأولويّة. والقصُّ بعد
   * الفرز يُسقط آخرَ الأسبوع لا أضعفَ البنود: سابعٌ في الأولويّة يومَ
   * الأحد يبقى، وثانٍ يومَ الخميس يُرمى.
   */
  const over = items.length - MAX_ITEMS
  if (over > 0) {
    items.splice(MAX_ITEMS)
    dropped += over
    why.set('بندٌ بعد السادس', over)
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
