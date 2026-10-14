/**
 * اسمُ النموذج كما يقرؤه المالك (D-203): **المزوّدُ ودرجتُه بالعربيّة**، والمعرّفُ قيمةٌ وتفصيلٌ لا عنوان.
 *
 * كان مُنتقي النموذج يعرض `claude-opus-5` و`gemini-2.5-flash` كما هي. فصار «Claude · الأقوى (Opus 5)»:
 * اسمُ الخدمة علامةٌ لا تُترجَم، والدرجةُ كلمةٌ عربيّة، والإصدارُ بين قوسين ليفرّق بين جيلين.
 * وما لا نعرفه يُعرض باسم خدمته إن عُرفت ثمّ معرّفه، فلا يختفي نموذجٌ لم يُسمَّ بعد.
 */
const VENDORS: readonly (readonly [RegExp, string])[] = [
  [/^claude/, 'Claude'],
  [/^gemini|^imagen|^veo/, 'Gemini'],
  [/^gpt|^o\d|^dall-e|^chatgpt/, 'GPT'],
  [/^deepseek/, 'DeepSeek'],
  [/^grok/, 'Grok'],
  [/^mistral|^mixtral|^codestral/, 'Mistral'],
  [/^llama|^@cf\/meta/, 'Llama'],
]

/** الدرجةُ بالعربيّة، والأولى التي تطابق تغلب: «flash-lite» قبل «flash». */
const TIERS: readonly (readonly [RegExp, string])[] = [
  [/image|imagen|dall-e/, 'للصور'],
  [/veo|video|i2v|t2v/, 'للمقاطع'],
  [/embed/, 'للفهرسة'],
  [/opus/, 'الأقوى'],
  [/sonnet/, 'المتوازن'],
  [/haiku/, 'الأسرع'],
  [/flash-lite|nano/, 'الأخفّ'],
  [/flash|mini/, 'السريع'],
  [/pro\b|-pro|ultra/, 'المتقدّم'],
  [/reasoner|^o\d/, 'للاستدلال'],
  [/chat/, 'للمحادثة'],
]

/** «opus-5» ← «Opus 5»، و«2.5-flash» ← «2.5 Flash»: الإصدارُ بحروفه اللاتينيّة كما يعرفه المزوّد. */
function version(id: string): string {
  const rest = id
    .replace(/^@cf\/[^/]+\//, '')
    .replace(/^(claude|gemini|gpt|deepseek|grok|mistral|llama)-?/, '')
    .replace(/-\d{8}$|-latest$|-preview.*$|-exp.*$/, '')
    .replace(/(\d)-(\d)(?!\d)/g, '$1.$2')
  return rest
    .split(/[-_]/)
    .filter((p) => p !== '')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}

export function modelName(id: string): string {
  const m = id.trim().toLowerCase()
  if (m === '') return ''
  const vendor = VENDORS.find(([re]) => re.test(m))?.[1]
  if (vendor === undefined) return id
  const tier = TIERS.find(([re]) => re.test(m))?.[1]
  const v = version(m)
  if (tier === undefined) return v === '' ? vendor : `${vendor} (${v})`
  return v === '' ? `${vendor} · ${tier}` : `${vendor} · ${tier} (${v})`
}
