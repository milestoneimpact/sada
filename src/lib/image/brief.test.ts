/**
 * الموجزُ البصريّ — **ما يربط الصورةَ بالنصّ** (D-083).
 *
 * وقبله كان الوصفُ عربيّا كلَّه، ونماذجُ الصور إنجليزيّةُ اللسان: تخرج
 * الصورةُ في الأسلوب ولا علاقةَ لها بالموضوع. وهو ما رآه المالك.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { toBase64 } from '../crypto'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { upsertProvider, saveKey } from '../providers'
import { writeRoute } from '../ai/routes'
import { BRIEF_SYSTEM, briefUser, parseBrief, visualBrief } from './brief'
import { imagePrompt } from './prompt'

const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))

describe('قراءةُ الجواب — يُفحَص الشكلُ ولا يُفترَض', () => {
  it('يقرأ الحقولَ الثلاثة', () => {
    const brief = parseBrief('{"subject":"folded paper","composition":"wide","palette":"teal"}')
    expect(brief?.subject).toBe('folded paper')
    expect(brief?.composition).toBe('wide')
  })

  it('ويقرأ JSON ملفوفا بسياج — بعضُ النماذج تلفّه', () => {
    const brief = parseBrief('```json\n{"subject":"stacked glass panes"}\n```')
    expect(brief?.subject).toBe('stacked glass panes')
  })

  it('و**بلا `subject` لا موجز** — الحقلُ الحاكم لا يُرقَّع بفراغ', () => {
    expect(parseBrief('{"composition":"wide"}')).toBeNull()
    expect(parseBrief('{"subject":"   "}')).toBeNull()
  })

  it('وما ليس JSON يُردّ ولا يُرمى', () => {
    expect(parseBrief('عذرا، لا أستطيع')).toBeNull()
  })

  it('والحقلان الناقصان يأخذان افتراضا صالحا لا فراغا', () => {
    const brief = parseBrief('{"subject":"a"}')
    expect(brief?.composition.length).toBeGreaterThan(0)
    expect(brief?.palette.length).toBeGreaterThan(0)
  })
})

describe('التعليمةُ نفسُها — إنجليزيّة، وتمنع ما لا يُرسَم', () => {
  it('تطلب JSON إنجليزيّا ملموسا', () => {
    expect(BRIEF_SYSTEM).toContain('JSON only')
    expect(BRIEF_SYSTEM).toContain('English only')
  })

  it('وتمنع الحروفَ والوجوهَ والصورَ النمطيّة', () => {
    expect(BRIEF_SYSTEM).toContain('No text, letters')
    expect(BRIEF_SYSTEM).toContain('No faces')
    expect(BRIEF_SYSTEM).toContain('handshakes')
  })

  it('و**تقصّ نصَّ المنشور** — ألفُ محرفٍ تكفي فكرةً، وما زاد كلفةٌ بلا معنى', () => {
    expect(briefUser('ن'.repeat(4000)).length).toBeLessThan(1200)
  })
})

describe('الوصفُ النهائيّ — الموجزُ هو الموضوع، والاحتياطُ يُعلَّم', () => {
  const visual = { subject: 'layered basalt slabs', composition: 'low angle', palette: 'slate and teal' }

  it('حين يوجد الموجزُ يصير هو الموضوع', () => {
    const prompt = imagePrompt({ topic: 'الحوكمة', platform: 'linkedin', visual })
    expect(prompt).toContain('layered basalt slabs')
    expect(prompt).toContain('low angle')
    expect(prompt).not.toContain('الحوكمة')
  })

  it('وحين يسقط يُستعمَل الموضوعُ العربيّ **معلَّما أنّه سياقٌ لا يُرسَم**', () => {
    const prompt = imagePrompt({ topic: 'الحوكمة في المشاريع', platform: 'x', visual: null })
    expect(prompt).toContain('الحوكمة في المشاريع')
    expect(prompt).toContain('do not render it')
  })

  it('والقيدُ في الطرفين لا في الوسط — فلا يُبهَت', () => {
    const prompt = imagePrompt({ topic: 'ت', platform: 'x', visual })
    expect(prompt.startsWith('ABSOLUTELY NO text')).toBe(true)
    expect(prompt.trimEnd().endsWith('resembles writing.')).toBe(true)
  })
})

describe('النداء — ولا يوقف سقوطُه التوليد', () => {
  let db: FakeDb
  beforeEach(() => {
    db = fakeDb()
  })

  const deps = (fetchImpl?: typeof fetch) => ({
    db,
    encKey: KEY,
    workerSecrets: {},
    ...(fetchImpl === undefined ? {} : { fetchImpl }),
  })

  async function seedWriter(): Promise<void> {
    await upsertProvider(
      db,
      { name: 'writer', label: 'Writer', kind: 'openai_compat', baseUrl: 'https://api.writer.test/v1' },
      'test',
    )
    await saveKey(db, KEY, 'writer', 'sk-writer-key-long', 'test')
    await writeRoute(db, 'draft', 'writer', 'writer-1', 'test')
  }

  it('لا مزوّدَ للكتابة يعني موجزا فارغا بسببٍ يُقرأ — لا رمي', async () => {
    await writeRoute(db, 'draft', 'لا-أحد', 'x', 'test')
    const out = await visualBrief(deps(), 'نصّ المنشور العربيّ')
    expect(out.brief).toBeNull()
    expect(out.detail).toContain('لا مزوّدَ للكتابة')
  })

  it('يبني الموجزَ من نصّ المنشور', async () => {
    await seedWriter()
    let body: Record<string, unknown> = {}
    const net = (async (_url: unknown, init?: RequestInit): Promise<Response> => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(
        JSON.stringify({
          model: 'writer-1',
          choices: [{ message: { content: '{"subject":"woven brass mesh"}' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 300, completion_tokens: 40 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }) as unknown as typeof fetch

    const out = await visualBrief(deps(net), 'منشورٌ عن أثر الحوكمة', 'post-1')
    expect(out.brief?.subject).toBe('woven brass mesh')
    expect(JSON.stringify(body)).toContain('أثر الحوكمة')
  })

  it('و**الكلفةُ تُسجَّل** — نداءٌ مدفوعٌ لا يُخفى ولو كان صغيرا (D-008)', async () => {
    await seedWriter()
    const net = (async (): Promise<Response> =>
      new Response(
        JSON.stringify({
          model: 'writer-1',
          choices: [{ message: { content: '{"subject":"a"}' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 300, completion_tokens: 40 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )) as unknown as typeof fetch

    await visualBrief(deps(net), 'نصّ', 'post-1')
    const { results } = await db
      .prepare('SELECT operation, units FROM cost_ledger')
      .all<{ operation: string; units: number }>()
    expect(results).toHaveLength(1)
    expect(results[0]!.operation).toContain('image-brief')
    expect(results[0]!.units).toBe(340)
  })

  it('وسقوطُ النداء يُعاد سببا — والتوليدُ يمضي بالاحتياط', async () => {
    await seedWriter()
    const net = (async (): Promise<Response> =>
      new Response('{}', { status: 500 })) as unknown as typeof fetch
    const out = await visualBrief(deps(net), 'نصّ')
    expect(out.brief).toBeNull()
    expect(out.cost).toBe(0)
    expect(out.detail).toContain('تعذّر')
  })

  it('وجوابٌ مشوَّهٌ **يُسجَّل كلفتُه** ثمّ يُردّ — النداءُ وقع', async () => {
    await seedWriter()
    const net = (async (): Promise<Response> =>
      new Response(
        JSON.stringify({
          model: 'writer-1',
          choices: [{ message: { content: 'لا أستطيع' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )) as unknown as typeof fetch

    const out = await visualBrief(deps(net), 'نصّ')
    expect(out.brief).toBeNull()
    const { results } = await db.prepare('SELECT id FROM cost_ledger').all<{ id: string }>()
    expect(results).toHaveLength(1)
  })
})
