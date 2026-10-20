/**
 * المخطّطُ المحمول (D-164) — **ما يصل إلى المزوّد شكلٌ لا حدود.**
 *
 * والحدودُ لا تضيع: تُطوى وصفًا يراه النموذج، وتُفرض في القارئ. فيُختبَر
 * هنا أنّ الكلماتِ المرفوضةَ لا تبقى في أيّ مستوى، وأنّ ما يشترطه الوضعُ
 * الصارم قائمٌ في كلّ كائن.
 */
import { describe, expect, it } from 'vitest'
import { portableSchema } from './portableSchema'
import { PLAN_SCHEMA } from '../plan/prompt'
import { DRAFT_SCHEMA } from '../draft/prompt'

type Node = Record<string, unknown>

/** كلُّ عقدةِ مخطّطٍ في الشجرة — الجذرُ والخصائصُ وعناصرُ المصفوفات. */
function nodes(schema: Node): Node[] {
  const out: Node[] = [schema]
  const properties = schema['properties'] as Record<string, Node> | undefined
  for (const child of Object.values(properties ?? {})) out.push(...nodes(child))
  if (schema['items'] !== undefined) out.push(...nodes(schema['items'] as Node))
  return out
}

const KEPT = ['type', 'properties', 'required', 'additionalProperties', 'enum', 'items', 'description']

describe.each([
  ['PLAN_SCHEMA', PLAN_SCHEMA],
  ['DRAFT_SCHEMA', DRAFT_SCHEMA],
])('%s محمولًا', (_name, schema) => {
  const portable = portableSchema(schema)

  it('لا minLength ولا maxLength ولا maxItems ولا minItems في أيّ مستوى', () => {
    for (const node of nodes(portable)) {
      for (const key of ['minLength', 'maxLength', 'maxItems', 'minItems']) expect(node).not.toHaveProperty(key)
    }
  })

  it('ولا كلمة خارج السبع في أيّ عقدة', () => {
    for (const node of nodes(portable)) {
      for (const key of Object.keys(node)) expect(KEPT).toContain(key)
    }
  })

  it('وكلّ كائن مغلق، وكلّ حقل فيه مطلوب — شرط الوضع الصارم', () => {
    const objects = nodes(portable).filter((node) => node['type'] === 'object')
    expect(objects.length).toBeGreaterThan(0)
    for (const node of objects) {
      expect(node['additionalProperties']).toBe(false)
      expect([...(node['required'] as string[])].sort()).toEqual(Object.keys(node['properties'] as Node).sort())
    }
  })

  it('ولا يمسّ الأصل — الثابت يبقى كما كُتب', () => {
    const before = JSON.stringify(schema)
    portableSchema(schema)
    expect(JSON.stringify(schema)).toBe(before)
  })
})

describe('والقيد يُطوى وصفًا لا يُحذف', () => {
  it('حدّ الزاوية وسقف البنود يراهما النموذج في الوصف', () => {
    const portable = portableSchema(PLAN_SCHEMA)
    const items = (portable['properties'] as Record<string, Node>)['items']!
    expect(items['description']).toContain('maxItems: 6')
    expect(items['description']).toContain('minItems: 1')
    const angle = ((items['items'] as Node)['properties'] as Record<string, Node>)['angle']!
    expect(angle['description']).toContain('minLength: 10')
  })

  it('والمنصّة تبقى قيمًا مسمّاةً — enum شكل لا حدّ', () => {
    const portable = portableSchema(PLAN_SCHEMA)
    const items = (portable['properties'] as Record<string, Node>)['items']!
    const platform = ((items['items'] as Node)['properties'] as Record<string, Node>)['platform']!
    expect(platform['enum']).toEqual(['linkedin', 'x'])
  })

  it('ووصف قائم يبقى، والمطويّ يُلحَق به', () => {
    const out = portableSchema({
      type: 'object',
      properties: { a: { type: 'string', description: 'سطر واحد', maxLength: 80 } },
      required: ['a'],
      additionalProperties: false,
    })
    const a = (out['properties'] as Record<string, Node>)['a']!
    expect(a['description']).toBe('سطر واحد\n\n{maxLength: 80}')
  })

  it('وكائن بلا additionalProperties يُغلَق', () => {
    const out = portableSchema({ type: 'object', properties: { a: { type: 'string' } }, required: ['a'] })
    expect(out['additionalProperties']).toBe(false)
  })
})

describe('وما لا يُحمَل يُرفض بسبب — في الاختبار لا عند أوّل نداء', () => {
  it('حقل اختياريّ: الوضع الصارم يشترط الكلّ', () => {
    expect(() =>
      portableSchema({
        type: 'object',
        properties: { a: { type: 'string' }, b: { type: 'string' } },
        required: ['a'],
        additionalProperties: false,
      }),
    ).toThrow(/اختياريّ \(b\)/)
  })

  it('ومطلوب لا تعريف له', () => {
    expect(() =>
      portableSchema({ type: 'object', properties: {}, required: ['ghost'], additionalProperties: false }),
    ).toThrow(/ghost/)
  })

  it('وحقل اختياريّ في كائن متداخل يُسمّى بموضعه', () => {
    expect(() =>
      portableSchema({
        type: 'object',
        properties: {
          list: {
            type: 'array',
            items: { type: 'object', properties: { x: { type: 'string' } }, required: [], additionalProperties: false },
          },
        },
        required: ['list'],
        additionalProperties: false,
      }),
    ).toThrow(/\$\.list\[\]/)
  })

  it('وبنية كـanyOf لا تُطوى نصًّا — تُرفض', () => {
    expect(() => portableSchema({ anyOf: [{ type: 'string' }, { type: 'null' }] })).toThrow(/anyOf/)
  })

  it('وكائن مفتوح لا يُغلَق بصمت', () => {
    expect(() =>
      portableSchema({ type: 'object', properties: {}, required: [], additionalProperties: true }),
    ).toThrow(/additionalProperties/)
  })
})
