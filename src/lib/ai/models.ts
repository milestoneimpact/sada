/**
 * فهرسُ النماذج — يُجلَب من المزوّد، ولا يُكتَب باليد (D-081).
 *
 * ## لماذا وُجد
 *
 * كان اسمُ النموذج حقلَ نصٍّ حرّا في اللوحة: يُكتب `gpt-4o` أو
 * `@cf/black-forest-labs/flux-1-schnell` حرفا حرفا. **وحرفٌ واحدٌ خطأ
 * لا يُكتشَف عند الحفظ** — يُكتشَف في أوّل مهمّةٍ حقيقيّة، بردّ ٤٠٤ أو
 * ٤٠٠ لا يقول إنّ السببَ حرف. وأسوأُ منه: **نموذجٌ صحيحٌ اليوم يُسحَب
 * بعد شهرين**، فيبقى مكتوبا في القاعدة ويسقط النظامُ بلا تبديلِ سطر.
 *
 * فالقائمةُ تُجلب من عند المزوّد نفسِه عند الطلب: **ما يظهر فيها موجودٌ
 * الآن**، وما سُحب لا يظهر، وما نزل أمسِ يظهر بلا نشرٍ ولا شيفرة.
 *
 * ## ولهجاتُ الفهرس أربعٌ لا واحدة
 *
 * | المزوّد | النهاية | جذرُ القائمة | المعرّف |
 * |---|---|---|---|
 * | Cloudflare | `…/ai/models/search` | `result[]` | `name` |
 * | Anthropic | `/v1/models` | `data[]` | `id` |
 * | Gemini | `/v1beta/models` | `models[]` | `name` بلا `models/` |
 * | لهجةُ OpenAI | `{base}/models` | `data[]` | `id` |
 *
 * وهي **قراءةٌ لا توليد**: لا رموزَ تُحسَب ولا مالَ يُنفَق، فلا تُسجَّل
 * في `cost_ledger` (D-008 عن الطلبات المدفوعة).
 *
 * ## والسعرُ يُقرأ حيث يُعطى — ولا يُخمَّن حيث لا يُعطى
 *
 * OpenRouter وحده من بين هؤلاء يعطي سعرا في فهرسه، **وبالرمز الواحد
 * نصّا** (`"0.0000025"`). فيُحوَّل إلى «لكلّ مليون» — وهو ما تخزّنه
 * `providers.price_in` — ويُعرَض ليملأه المالكُ بضغطة. ومن لا يعطي
 * سعرا يبقى سعرُه فارغا: **صفرٌ معلومٌ أصدق من تقديرٍ مجهول المصدر**
 * (وهي قاعدةُ `costOf` نفسُها).
 */
import { cfAccountId, cfModelsUrl } from './cloudflare'

/**
 * صنفُ المهمّة — **موحَّدٌ عندنا لا كما يسمّيه كلٌّ منهم**.
 *
 * وفائدتُه أنّ توجيهَ «الصورة» لا يعرض نموذجَ نصّ: اختيارٌ خاطئٌ في
 * القائمة يكلّف نداءً يُردّ، والقائمةُ التي تمنعه أرخص.
 */
export type ModelTask = 'text' | 'image' | 'embedding' | 'other'

export interface ModelChoice {
  /** ما يُكتب في `providers.model` — المعرّفُ لا الاسمُ المعروض. */
  readonly id: string
  /** ما يُعرَض في القائمة. وقد يساوي المعرّف حين لا اسمَ عندهم. */
  readonly label: string
  readonly task: ModelTask | null
  /** لكلّ مليون رمز — `null` حين لا يعطيه المزوّد. */
  readonly priceIn: number | null
  readonly priceOut: number | null
}

export interface ModelList {
  readonly ok: boolean
  readonly models: readonly ModelChoice[]
  readonly detail: string
  readonly status: number | null
}

export interface ModelQuery {
  readonly name: string
  readonly kind: 'anthropic' | 'openai_compat'
  readonly baseUrl: string | null
  readonly apiKey: string
  readonly builtin: boolean
}

/** رمزُ الحالة يقرّر التفسير، لا نصُّ الرسالة — كما في كلّ سائقٍ عندنا. */
function explain(status: number): string {
  if (status === 401 || status === 403) return 'المفتاح مرفوض — تحقّق أنّه صحيح ولم يُلغَ'
  if (status === 404) return 'هذا المزوّد لا يخدم فهرسَ نماذج على هذا العنوان'
  if (status === 429) return 'بلغ حدُّ المزوّد — أعد المحاولة بعد قليل'
  if (status >= 500) return 'المزوّد متعب الآن، لا المفتاح'
  return `ردّ المزوّد ${status}`
}

/** رقمٌ من نصٍّ أو رقم — وما ليس عددا منتهيا موجبا يُردّ `null`. */
function toNumber(raw: unknown): number | null {
  const value = typeof raw === 'string' ? Number(raw) : raw
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  return value
}

/** سعرُ الرمز الواحد ← سعرُ المليون. وصفرٌ يبقى صفرا (نموذجٌ مجّانيّ). */
function perMillion(raw: unknown): number | null {
  const value = toNumber(raw)
  return value === null ? null : value * 1_000_000
}

/** يصنّف مهمّةً من نصٍّ حرٍّ — وما لا يُعرَف يبقى `null` لا يُخمَّن. */
export function classifyTask(raw: unknown): ModelTask | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  const text = raw.toLowerCase()
  if (text.includes('embed')) return 'embedding'
  // «to-image» و «image generation»: المخرَجُ صورة. و «image-to-text»
  // مخرَجُه نصّ، فيُفحَص الاتّجاه لا وجودُ الكلمة
  if (/(to[- ]?image|image generation|text2image)/.test(text)) return 'image'
  if (/(text generation|chat|completion|to[- ]?text|instruct)/.test(text)) return 'text'
  return 'other'
}

function sortChoices(models: ModelChoice[]): ModelChoice[] {
  return models.sort((a, b) => a.id.localeCompare(b.id))
}

function asArray(raw: unknown): readonly unknown[] {
  return Array.isArray(raw) ? raw : []
}

function row(raw: unknown): Record<string, unknown> {
  return (raw ?? {}) as Record<string, unknown>
}

/** Cloudflare: `{ result: [ { name, description, task: { name } } ] }`. */
function readCloudflare(payload: Record<string, unknown>): ModelChoice[] {
  const out: ModelChoice[] = []
  for (const entry of asArray(payload['result'])) {
    const model = row(entry)
    const id = model['name']
    if (typeof id !== 'string' || id === '') continue
    const task = row(model['task'])['name']
    const description = model['description']
    out.push({
      id,
      // اسمُ النموذجِ عندهم هو المعرّفُ نفسُه، فيُعرَض معه وصفُه مختصرا
      label:
        typeof description === 'string' && description.trim() !== ''
          ? `${id} — ${description.trim().slice(0, 70)}`
          : id,
      task: classifyTask(task),
      priceIn: null,
      priceOut: null,
    })
  }
  return sortChoices(out)
}

/** Anthropic: `{ data: [ { id, display_name } ] }`. */
function readAnthropic(payload: Record<string, unknown>): ModelChoice[] {
  const out: ModelChoice[] = []
  for (const entry of asArray(payload['data'])) {
    const model = row(entry)
    const id = model['id']
    if (typeof id !== 'string' || id === '') continue
    const name = model['display_name']
    out.push({
      id,
      label: typeof name === 'string' && name !== '' ? `${name} (${id})` : id,
      task: 'text',
      priceIn: null,
      priceOut: null,
    })
  }
  return sortChoices(out)
}

/** Gemini: `{ models: [ { name: "models/x", displayName, supportedGenerationMethods } ] }`. */
function readGemini(payload: Record<string, unknown>): ModelChoice[] {
  const out: ModelChoice[] = []
  for (const entry of asArray(payload['models'])) {
    const model = row(entry)
    const raw = model['name']
    if (typeof raw !== 'string' || raw === '') continue
    // المعرّفُ عندهم مسبوقٌ بـ models/ — والمنادي يكتبه بلا سابقة
    const id = raw.startsWith('models/') ? raw.slice('models/'.length) : raw
    const methods = asArray(model['supportedGenerationMethods']).filter(
      (m): m is string => typeof m === 'string',
    )
    const name = model['displayName']
    out.push({
      id,
      label: typeof name === 'string' && name !== '' ? `${name} (${id})` : id,
      task: methods.includes('embedContent')
        ? 'embedding'
        : methods.includes('predict') || /imagen|image/.test(id)
          ? 'image'
          : methods.includes('generateContent')
            ? 'text'
            : null,
      priceIn: null,
      priceOut: null,
    })
  }
  return sortChoices(out)
}

/**
 * لهجةُ OpenAI: `{ data: [ { id } ] }`.
 *
 * وبعضُهم يزيد — OpenRouter يعطي `name` و `pricing` و `architecture` —
 * **فتُقرأ الزيادةُ إن وُجدت وتُترَك إن غابت**، ولا يُشترَط وجودُها.
 */
function readCompat(payload: Record<string, unknown>): ModelChoice[] {
  const out: ModelChoice[] = []
  for (const entry of asArray(payload['data'])) {
    const model = row(entry)
    const id = model['id']
    if (typeof id !== 'string' || id === '') continue
    const name = model['name']
    const pricing = row(model['pricing'])
    const modality = row(model['architecture'])['modality']
    out.push({
      id,
      label: typeof name === 'string' && name !== '' ? `${name} (${id})` : id,
      task: classifyTask(modality),
      priceIn: perMillion(pricing['prompt']),
      priceOut: perMillion(pricing['completion']),
    })
  }
  return sortChoices(out)
}

/**
 * عنوانُ الفهرس للهجة OpenAI — **ويُقرأ من هنا وحده**.
 *
 * فالفاحصُ («اختبر») والفهرسُ («حدّث القائمة») يناديان العنوانَ نفسَه.
 * ولو كُتب في الموضعين لافترقا: يُصلَح أحدُهما ويبقى الآخرُ ينادي نهايةً
 * لا تُخدَم — **وهي العلّةُ التي كانت** في Cloudflare بالضبط.
 */
export function compatCatalogUrl(baseUrl: string): string {
  const account = cfAccountId(baseUrl)
  return account === null ? `${baseUrl.replace(/\/+$/, '')}/models` : cfModelsUrl(account)
}

/**
 * يجلب فهرسَ نماذجِ مزوّدٍ واحد.
 *
 * **ولا يرمي**: يعيد `ok: false` بسببٍ يُقرأ في الشاشة. فالفهرسُ راحةٌ
 * لا شرط — ومزوّدٌ لا يخدم فهرسا يبقى صالحا، ويُكتب اسمُ نموذجه يدويّا.
 */
export async function listModels(
  query: ModelQuery,
  fetchImpl: typeof fetch = fetch,
): Promise<ModelList> {
  const key = query.apiKey.trim()
  if (key === '') {
    return { ok: false, models: [], detail: 'لا مفتاح لهذا المزوّد', status: null }
  }

  const cf = cfAccountId(query.baseUrl)
  let request: Request
  let read: (payload: Record<string, unknown>) => ModelChoice[]

  if (query.kind === 'anthropic') {
    request = new Request('https://api.anthropic.com/v1/models?limit=100', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    })
    read = readAnthropic
  } else if (query.name === 'gemini' && query.builtin) {
    request = new Request(
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
      { headers: { 'x-goog-api-key': key } },
    )
    read = readGemini
  } else if (cf !== null) {
    // **وهذه هي العلّة المُصلَحة**: `{base}/models` تحت `‎/ai/v1` نهايةٌ
    // لا يخدمها Workers AI، فكان المفتاحُ الصحيحُ يبدو مرفوضا
    request = new Request(compatCatalogUrl(query.baseUrl ?? ''), {
      headers: { Authorization: `Bearer ${key}` },
    })
    read = readCloudflare
  } else if (query.baseUrl === null || query.baseUrl.trim() === '') {
    return { ok: false, models: [], detail: 'لا عنوان لهذا المزوّد', status: null }
  } else {
    request = new Request(compatCatalogUrl(query.baseUrl), {
      headers: { Authorization: `Bearer ${key}` },
    })
    read = readCompat
  }

  let response: Response
  try {
    response = await fetchImpl(request)
  } catch (error) {
    return {
      ok: false,
      models: [],
      status: null,
      detail: `تعذّر الوصول: ${error instanceof Error ? error.message : 'عطل شبكة'}`,
    }
  }

  if (!response.ok) {
    return { ok: false, models: [], detail: explain(response.status), status: response.status }
  }

  let payload: Record<string, unknown>
  try {
    payload = (await response.json()) as Record<string, unknown>
  } catch {
    return { ok: false, models: [], detail: 'جوابُ الفهرس ليس JSON', status: response.status }
  }

  const models = read(payload)
  if (models.length === 0) {
    // ٢٠٠ بقائمةٍ فارغة ليس نجاحا يُشهَد به: المفتاحُ مرَّ والفهرسُ لم يُقرَأ
    return {
      ok: false,
      models: [],
      status: response.status,
      detail: 'جوابٌ مقبولٌ بلا نماذج — قد يكون شكلُ الفهرس تغيّر',
    }
  }

  return { ok: true, models, detail: `${models.length} نموذجا`, status: response.status }
}
