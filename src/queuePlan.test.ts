/** طابورُ التوليد يفرّق بين «افهم مصدرًا» و«اكتب بندَ خطّة» (D-258). */
import { describe, expect, it } from 'vitest'
import worker from './index'
import { fakeDb } from './test/fakes'

describe('بندُ الخطّة في طابور التوليد', () => {
  it('يُكتب بـ draftPost، ومصدرٌ لا يوجد يُقَرّ ولا يُعاد', async () => {
    const db = fakeDb()
    const seen: string[] = []
    const message = {
      body: { draft: { sourceId: 'missing', platform: 'linkedin', org: 'org_owner' } },
      ack: () => seen.push('ack'), retry: () => seen.push('retry'),
    }
    await worker.queue({ queue: 'sada-generate-staging', messages: [message] } as never, { DB: db, TOKEN_ENC_KEY: '' } as never)
    expect(seen).toEqual(['ack'])
    expect(db.raw.prepare('SELECT count(*) AS n FROM posts').get()).toEqual({ n: 0 })
  })
})

/** الخطّةُ محورَ المنصّة (D-282): بندُ فكرةٍ يُكتب من نصّها، وبلا نصٍّ يُقَرّ ولا يُعاد. */
describe('بندُ فكرةٍ في طابور التوليد (D-282)', () => {
  it('بلا نصّ الفكرة يُقَرّ ولا يُكتب شيء، وبنصٍّ وبلا مفتاحٍ يُقَرّ كذلك', async () => {
    const db = fakeDb()
    const seen: string[] = []
    const make = (draft: Record<string, unknown>) => ({ body: { draft }, ack: () => seen.push('ack'), retry: () => seen.push('retry') })
    const env = { DB: db, TOKEN_ENC_KEY: '' } as never
    await worker.queue({ queue: 'sada-generate-staging', messages: [make({ sourceId: 'idea:1', platform: 'x', org: 'org_owner' })] } as never, env)
    await worker.queue({ queue: 'sada-generate-staging', messages: [make({ sourceId: 'idea:1', platform: 'x', org: 'org_owner', idea: 'فكرةٌ عن الوقف' })] } as never, env)
    expect(seen).toEqual(['ack', 'ack'])
    expect(db.raw.prepare('SELECT count(*) AS n FROM posts').get()).toEqual({ n: 0 })
  })
})

/** ‏**وبندُ السلسلة يُكتب سلسلةً** (D-324): الشكلُ من الخطّة يصل إلى `draftPost` ووصفُه وصفُ سلسلة X. */
describe('بندُ سلسلةٍ في طابور التوليد (D-324)', () => {
  it('shape=thread يصل إلى الموجّه، والمسوّدةُ نوعُها thread', async () => {
    const db = fakeDb()
    db.raw.exec(`INSERT INTO sources (id, drive_file_id, name, mime, content_hash) VALUES ('s1', 'd1', 'تقرير', 'text/plain', 'md5:a');
      INSERT INTO content_items (id, source_id, summary, themes_json, worth_score) VALUES ('c1', 's1', 'خلاصة عن الوقف', '{"hash":"md5:a","themes":[]}', 0.8)`)
    const asked: string[] = []
    const original = globalThis.fetch
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      asked.push(String(init?.body ?? ''))
      const text = `${'ن'.repeat(120)}\n---\n${'م'.repeat(120)}\n---\n${'ل'.repeat(60)}`
      return new Response(JSON.stringify({
        id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5', stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify({ text, rationale: 'ر' }) }],
        usage: { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as typeof fetch
    try {
      const seen: string[] = []
      const message = {
        body: { draft: { sourceId: 's1', platform: 'x', org: 'org_owner', shape: 'thread', autoImage: false } },
        ack: () => seen.push('ack'), retry: () => seen.push('retry'),
      }
      await worker.queue({ queue: 'sada-generate-staging', messages: [message] } as never,
        { DB: db, TOKEN_ENC_KEY: '', ANTHROPIC_API_KEY: 'sk-test' } as never)
      expect(seen).toEqual(['ack'])
    } finally {
      globalThis.fetch = original
    }
    expect(asked.join('')).toContain('سلسلة X')
    expect(db.raw.prepare('SELECT type FROM posts').get()).toEqual({ type: 'thread' })
  })
})
