/**
 * لوحُ المالك — **البطاقاتُ تُختار ولا تُفرَض** (D-119).
 *
 * ## لماذا
 *
 * كان لوحُ «نظرة عامّة» يحمل أربعَ بطاقاتٍ مكتوبةً في الشيفرة. وسُئل
 * المالكُ في D-114 أيُّ رقمين يستحقّان صدرَ شاشته فلم يكن له سبيلٌ إلى
 * الجواب **إلّا أن يُعدَّل الملفّ**. فصار الجوابُ في يده.
 *
 * ## والكتالوجُ مصدرُ الحقيقة الوحيد
 *
 * كلُّ بطاقةٍ هنا لها **معرِّفٌ ثابت** يُخزَّن في `settings`، ومنه يُشتَقّ
 * النوعُ ومنه تُبنى شاشةُ الاختيار. **فبطاقةٌ تُضاف غدا تدخل الثلاثةَ معا
 * أو لا تدخل واحدا** — وهو درسُ `SETTING_KEYS` في D-110 مطبَّقا قبل أن
 * يقع العطلُ لا بعده.
 *
 * ## وما لا يُعرَض لا يُحسَب
 *
 * كلُّ بطاقةٍ دالّةٌ **نقيّة** من بياناتٍ حاضرةٍ أصلا في اللوحة: لا
 * استعلامَ جديدا، ولا نداءَ مدفوعا، **ولا بطاقةً يكلّف عرضُها شيئا**.
 * فاختيارُ المالك لا يفتح بابَ إنفاق.
 */

/**
 * ما تحتاجه البطاقاتُ من بيانات اللوحة — **وهذا كلُّه**.
 *
 * **ولا يُستورَد `PanelData` هنا**: هو في `routes/`، وهذه في `lib/`،
 * **واستيرادُ الأعلى من الأدنى يقلب الاتّجاه**. والنوعُ بنيويٌّ في
 * TypeScript، فـ`PanelData` يوافق هذا من نفسه بلا إعلان.
 */
export interface TileSource {
  readonly paused: boolean
  readonly autoEnqueue: boolean
  readonly browserToken: boolean
  readonly analysisCap: number
  readonly spendCap: number
  readonly usedAnalyses: number
  readonly usedSpend: number
  readonly spend30d: number
  readonly series: readonly { day: string; total: number }[]
  readonly sources: readonly { analyzed: boolean; stale: boolean }[]
  readonly providers: readonly { configured: boolean; calls: number }[]
  readonly routing: readonly { ready: boolean; implemented: boolean }[]
  readonly drafts: readonly { status: string; scheduledAt: string | null }[]
  readonly targets: readonly { platform: string }[]
  readonly outbox: readonly { status: number | null; error: string | null }[]
  readonly alertWebhook: string
  readonly planReady: boolean
}

/** ما تعرضه البطاقةُ — **ورقمٌ واحدٌ صدرُها، وما سواه يتبعه**. */
export interface TileValue {
  /** الرقمُ نفسُه، منسَّقا. */
  readonly value: string
  /** ما بعده بخطٍّ أخفَّ: «‏/ ‏١٠» أو «‏/ ‏5.00$». */
  readonly em?: string
  /** سطرٌ تحته يقول ما يعنيه. */
  readonly note?: string
  /** شريطُ امتلاءٍ حين يكون للرقم سقف. */
  readonly bar?: { readonly used: number; readonly cap: number; readonly full?: string }
  /** أيُعرَض فرقُ الأمس تحته؟ — لبطاقة الإنفاق وحدَها. */
  readonly delta?: boolean
}

export interface TileSpec {
  readonly id: string
  readonly label: string
  /** **لماذا تختارها** — يُعرَض في شاشة الاختيار لا في اللوح. */
  readonly why: string
  readonly of: (d: TileSource, fmt: TileFormat) => TileValue
}

/**
 * التنسيقُ يأتي من الخارج — **ولا تعرف هذه الوحدةُ كيف يُكتب الدولار**.
 *
 * `money` في `format.ts` ولها اختبارُها، **ونسخُها هنا نسخةٌ ثانيةٌ
 * تشيخ وحدَها**.
 */
export interface TileFormat {
  readonly money: (n: number) => string
}

/**
 * **والمتقادمُ ينتظر وإن حُلِّل** — كما كانت تعدّه الشاشةُ قبل هذا الملفّ.
 *
 * مصدرٌ تغيّر بعد تحليله فهمُه القديمُ يصف نسخةً ولّت. **ولو عُدَّ جاهزا
 * لقال اللوحُ «لا شيء ينتظر» وفي المجلّد ما ينتظر.**
 */
const stillWaiting = (d: TileSource): number =>
  d.sources.filter((s) => !s.analyzed || s.stale).length

/**
 * الكتالوج — **مرتَّبٌ كما يُعرَض في شاشة الاختيار**.
 *
 * والأربعُ الأولى هي التي كانت مكتوبةً في الشيفرة، فمن لم يختر شيئا
 * رآها كما كانت. **ولا شاشةَ فارغةً في أوّل يوم.**
 */
export const TILES: readonly TileSpec[] = [
  {
    id: 'analyses_today',
    label: 'تحليلات اليوم',
    why: 'كم مصدرا فُهم اليوم من سقف اليوم.',
    of: (d) => ({
      value: String(d.usedAnalyses),
      em: `/ ${d.analysisCap}`,
      bar: { used: d.usedAnalyses, cap: d.analysisCap },
      note: 'يُصفَّر عند منتصف الليل UTC',
    }),
  },
  {
    id: 'spend_today',
    label: 'إنفاق اليوم',
    why: 'ما أُنفق على الذكاء اليوم من سقف اليوم.',
    of: (d, f) => ({
      value: f.money(d.usedSpend),
      em: `/ ${f.money(d.spendCap)}`,
      bar: { used: d.usedSpend, cap: d.spendCap },
      delta: true,
    }),
  },
  {
    id: 'sources_analyzed',
    label: 'المصادر المحلَّلة',
    why: 'كم ملفّا في مجلّدك صار مفهوما، وكم ينتظر.',
    of: (d) => {
      const pending = stillWaiting(d)
      const ready = d.sources.length - pending
      return {
        value: String(ready),
        em: `/ ${d.sources.length}`,
        ...(d.sources.length === 0
          ? {}
          : { bar: { used: ready, cap: d.sources.length, full: 'كلّها محلَّلة' } }),
        note: pending === 0 ? 'لا شيء ينتظر' : `${pending} تنتظر تحليلا`,
      }
    },
  },
  {
    id: 'spend_30d',
    label: 'إنفاق 30 يوما',
    why: 'المجموعُ الشهريُّ، ومَن أنفقه.',
    of: (d, f) => ({
      value: f.money(d.spend30d),
      note: `${d.providers.filter((p) => p.calls > 0).length} مزوّدا نشطا · ${
        d.providers.reduce((sum, p) => sum + p.calls, 0)} نداءً`,
    }),
  },
  {
    id: 'drafts_waiting',
    label: 'مسوّدات تنتظرك',
    why: '**ولا تُنشر واحدةٌ منها بلا قرارك** — فهذا عددُ ما يقف عليك.',
    of: (d) => {
      const waiting = d.drafts.filter((x) => x.status === 'draft').length
      return {
        value: String(waiting),
        em: `/ ${d.drafts.length}`,
        note: waiting === 0 ? 'لا قرارَ معلَّق' : 'تنتظر اعتمادا أو تعديلا',
      }
    },
  },
  {
    id: 'scheduled',
    label: 'مجدولٌ للنشر',
    why: 'ما اعتمدتَه وله موعدٌ لم يحن بعد.',
    of: (d) => {
      const n = d.drafts.filter((x) => x.scheduledAt !== null).length
      // **والصفرُ لا «له موعد»**: الملاحظةُ تتبع الرقم لا القالب (D-134)
      return { value: String(n), note: n === 0 ? 'لا موعدَ في الطابور' : 'له موعدٌ في الطابور' }
    },
  },
  {
    id: 'live_targets',
    label: 'قنواتٌ جاهزة',
    why: 'كم حسابًا مربوطًا وإذنُه قائمٌ الآن — **وهي التي يقع عليها النشر**.',
    of: (d) => {
      const platforms = new Set(d.targets.map((t) => t.platform)).size
      return {
        value: String(d.targets.length),
        note: platforms === 0 ? 'لا وجهةَ حيّة' : `على ${platforms} منصّة`,
      }
    },
  },
  {
    id: 'providers_ready',
    label: 'مزوّدون جاهزون',
    why: 'كم مزوّدَ ذكاءٍ مفتاحُه مضبوط.',
    of: (d) => {
      const ready = d.providers.filter((p) => p.configured).length
      return {
        value: String(ready),
        em: `/ ${d.providers.length}`,
        ...(d.providers.length === 0
          ? {}
          : { bar: { used: ready, cap: d.providers.length, full: 'كلّهم جاهزون' } }),
      }
    },
  },
  {
    id: 'tasks_ready',
    label: 'مهامٌّ جاهزة',
    why: 'كم مهمّةً في جدول التوجيه لها مزوّدٌ جاهزٌ ينفّذها.',
    of: (d) => {
      const ready = d.routing.filter((r) => r.ready && r.implemented).length
      return {
        value: String(ready),
        em: `/ ${d.routing.length}`,
        ...(d.routing.length === 0
          ? {}
          : { bar: { used: ready, cap: d.routing.length, full: 'كلُّها جاهزة' } }),
      }
    },
  },
  {
    id: 'alerts_out',
    label: 'تنبيهاتٌ خرجت',
    why: '**ولا صمتٌ يُظنّ نجاحا**: كم تنبيها وصل، وكم ردَّته القناة.',
    of: (d) => {
      const failed = d.outbox.filter((o) => o.error !== null || (o.status ?? 0) >= 400).length
      return {
        value: String(d.outbox.length - failed),
        em: `/ ${d.outbox.length}`,
        note: d.alertWebhook === ''
          ? 'لا قناةَ مضبوطة'
          : failed === 0 ? 'كلُّها وصلت' : `${failed} ردَّتها القناة`,
      }
    },
  },
  {
    id: 'peak_spend_day',
    label: 'ذروةُ الإنفاق',
    why: 'أعلى يومٍ في أربعةَ عشرَ يوما — ومتى كان.',
    of: (d, f) => {
      if (d.series.length === 0) return { value: f.money(0), note: 'لا سجلَّ بعد' }
      const top = d.series.reduce((a, c) => (c.total > a.total ? c : a), d.series[0]!)
      return { value: f.money(top.total), note: `يوم ${top.day}` }
    },
  },
  {
    id: 'daily_average',
    label: 'المتوسّطُ اليوميّ',
    why: 'ما تنفقه في يومٍ وسطيّ — **وهو الذي يُقاس عليه السقف**.',
    of: (d, f) => {
      if (d.series.length === 0) return { value: f.money(0), note: 'لا سجلَّ بعد' }
      const sum = d.series.reduce((a, c) => a + c.total, 0)
      return {
        value: f.money(sum / d.series.length),
        note: `على ${d.series.length} يوما`,
      }
    },
  },
  {
    id: 'system_state',
    label: 'حالُ النظام',
    why: 'مفتاحُ الإيقاف والإدراجُ الآليّ ومفتاحُ المتصفّح في بطاقةٍ واحدة.',
    of: (d) => {
      const on = [!d.paused, d.autoEnqueue, d.browserToken].filter(Boolean).length
      return {
        value: d.paused ? 'موقوف' : 'يعمل',
        note: `${on} من 3 مفاتيحَ مرفوعة`,
      }
    },
  },
  {
    id: 'plan_state',
    label: 'خطّةُ الأسبوع',
    why: 'أمزوّدُها جاهزٌ فتُولَّد، أم تنتظر مفتاحا.',
    of: (d) => ({
      value: d.planReady ? 'جاهزة' : 'تنتظر',
      note: d.planReady ? 'مزوّدُها مضبوط' : 'لا مزوّدَ جاهزٌ لها',
    }),
  },
]

/** الأربعُ التي كانت مكتوبةً في الشيفرة — **وهي الافتراض**. */
export const DEFAULT_TILES: readonly string[] = [
  'analyses_today', 'spend_today', 'sources_analyzed', 'spend_30d',
]

/** أقلُّ ما يُعرَض وأكثرُه — **وصفٌّ من سبعٍ لا يُقرأ صفّا**. */
export const TILE_MIN = 2
export const TILE_MAX = 6

const BY_ID = new Map(TILES.map((t) => [t.id, t]))

/**
 * يقرأ اختيارَ المالك من النصّ المخزَّن — **ويردّ ما لا يعرفه بلا عطل**.
 *
 * **ومعرِّفٌ زال من الكتالوج لا يُسقط الشاشة**: بطاقةٌ تُحذف غدا تترك
 * معرِّفَها في `settings` عند مالكٍ اختارها، **فيُتخطّى صامتا** ويبقى ما
 * سواه. وفراغٌ بعد التنقية يعود إلى الافتراض — **لا إلى شاشةٍ بيضاء**.
 */
export function parseTiles(raw: string | undefined): readonly string[] {
  if (raw === undefined || raw.trim() === '') return DEFAULT_TILES
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(',')) {
    const id = part.trim()
    if (id === '' || seen.has(id) || !BY_ID.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length === TILE_MAX) break
  }
  return out.length < TILE_MIN ? DEFAULT_TILES : out
}

/** يُصفّي ما يُكتب قبل أن يُخزَّن — **بالقواعد نفسِها التي يُقرأ بها**. */
export function normalizeTiles(raw: string): string {
  return parseTiles(raw).join(',')
}

/** البطاقاتُ المختارةُ بأعيانها، مرتَّبةً كما اختارها. */
export function chosenTiles(raw: string | undefined): readonly TileSpec[] {
  const out: TileSpec[] = []
  for (const id of parseTiles(raw)) {
    const spec = BY_ID.get(id)
    if (spec !== undefined) out.push(spec)
  }
  return out
}
