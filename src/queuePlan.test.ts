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
