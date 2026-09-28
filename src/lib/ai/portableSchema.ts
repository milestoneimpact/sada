/**
 * المخطّطُ المحمول — **ما يقبله المخرَجُ المقيَّد عند الجميع** (D-164).
 *
 * ## العلّة
 *
 * `PLAN_SCHEMA` و`DRAFT_SCHEMA` كُتبا بقيودٍ تحرس المعنى: `minLength` على
 * الزاوية والنصّ، و`maxItems` و`minItems` على البنود. **وهذه الكلماتُ خارجَ
 * ما يقبله المخرَجُ المقيَّد**: Anthropic لا يقبل `minLength` ولا `maxItems`
 * ولا `minItems` فوق الواحد، والوضعُ الصارم عند OpenAI لا يعرف `minLength`.
 * وكان المخطّطُ يُرسَل خامًا عبر `output_config.format` — وSDK يجرّده في
 * `jsonSchemaOutputFormat` وحدَها لا في `messages.create`. فقيدٌ يحرس المعنى
 * عندنا قد يصير عند المزوّد سببَ ردٍّ بـ400 على المسار الافتراضيّ.
 *
 * ## والقيدُ لا يُحذف، يُنقل
 *
 * كلُّ حدٍّ هنا مفروضٌ في القارئ من قبل: `parsePlan` يرفض زاويةً أقصرَ من
 * عشرة أحرف ويقصّ على ستّة، و`parseDraft` يرفض نصًّا أقصرَ من أربعين.
 * **فالمخطّطُ يحمل الشكل، والشيفرةُ تحمل الحدود.** وما لا يُحمَل يُطوى في
 * `description`، فيراه النموذجُ وصفًا لا قيدًا.
 *
 * ## والأقلُّ حملًا هو الأسلم
 *
 * يبقى `type` و`properties` و`required` و`additionalProperties:false`
 * و`enum` و`items` و`description` وحدها. وكلُّ كلمةٍ زائدةٍ سببٌ محتمل
 * لرفضٍ عند مزوّدٍ لم يُقَس. ولا يُستورَد `transformJSONSchema` من SDK:
 * هو يُبقي `format` و`minItems` ويعرف لهجةً واحدة، وهذا تقاطعُ اللهجتين.
 *
 * **ويُنادى عند الطلب لا عند الاستيراد**: مخطّطٌ فاسدٌ يُسقط مهمّةً واحدةً
 * بسببٍ يُقرأ، لا Worker كاملًا عند الإقلاع.
 */

type Node = Readonly<Record<string, unknown>>

/** ما يُنقَل. وكلُّ ما سواه يُطوى في الوصف. */
const KEPT = new Set(['type', 'properties', 'required', 'additionalProperties', 'enum', 'items', 'description'])

/**
 * ما لا يُطوى ولا يُنقَل: بنيةٌ لا قيد. وطيُّها نصًّا يغيّر معنى المخطّط
 * بصمت — فحقلٌ من نوعين يصير حقلًا بلا نوع. فيُرفض ويُقال لماذا.
 */
const STRUCTURAL = ['$ref', '$defs', 'anyOf', 'oneOf', 'allOf', 'not', 'if', 'then', 'else']

function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function walk(node: unknown, path: string): Record<string, unknown> {
  if (!isNode(node)) throw new Error(`مخطّطٌ غير صالح عند ${path}`)
  for (const key of STRUCTURAL) {
    if (key in node) throw new Error(`${path}: ${key} بنيةٌ لا تُحمَل`)
  }
  const type = node['type']
  if (type === undefined) throw new Error(`${path}: بلا type`)

  const out: Record<string, unknown> = { type }
  if (Array.isArray(node['enum'])) out['enum'] = [...(node['enum'] as unknown[])]

  if (type === 'object') {
    const properties = node['properties'] ?? {}
    if (!isNode(properties)) throw new Error(`${path}: properties ليست كائنًا`)
    const keys = Object.keys(properties)
    out['properties'] = Object.fromEntries(keys.map((key) => [key, walk(properties[key], `${path}.${key}`)]))

    /*
     * **والوضعُ الصارم يشترط كلَّ حقلٍ مطلوبًا.** وحقلٌ اختياريٌّ يُرسَل
     * هكذا يُردّ عند OpenAI بـ400، ويُقبَل عند غيرها — فيعمل على مزوّدٍ
     * ويسقط على آخر. فيُمسك هنا، في الاختبار، لا عند أوّل نداء.
     */
    const required = Array.isArray(node['required']) ? (node['required'] as unknown[]).map(String) : []
    const optional = keys.filter((key) => !required.includes(key))
    const undeclared = required.filter((key) => !keys.includes(key))
    if (optional.length > 0) throw new Error(`${path}: حقلٌ اختياريّ (${optional.join('، ')}) — والوضعُ الصارم يشترط الكلّ`)
    if (undeclared.length > 0) throw new Error(`${path}: مطلوبٌ بلا تعريف (${undeclared.join('، ')})`)
    out['required'] = required

    // `false` وحدها: كائنٌ مفتوحٌ لا يُحمَل، وفرضُ الإغلاق عليه يغيّر ما طُلب
    const extra = node['additionalProperties']
    if (extra !== undefined && extra !== false) throw new Error(`${path}: additionalProperties غير false لا يُحمَل`)
    out['additionalProperties'] = false
  }

  if (type === 'array' && node['items'] !== undefined) out['items'] = walk(node['items'], `${path}[]`)

  // والباقي قيودٌ تُطوى في الوصف: يراها النموذج، ولا يرفض بها المزوّد
  const folded = Object.entries(node).filter(([key]) => !KEPT.has(key))
  const description = typeof node['description'] === 'string' ? node['description'] : ''
  const note = folded.length === 0 ? '' : `{${folded.map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join(', ')}}`
  const text = [description, note].filter((part) => part !== '').join('\n\n')
  if (text !== '') out['description'] = text

  return out
}

/** يعيد نسخةً محمولةً من المخطّط — ولا يمسّ الأصل. */
export function portableSchema(schema: Node): Record<string, unknown> {
  return walk(schema, '$')
}
