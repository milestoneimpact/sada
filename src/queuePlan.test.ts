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
