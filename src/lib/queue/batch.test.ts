/**
 * ‏**لا دفعةَ فوق مئة رسالة** (D-320).
 *
 * ‏Cloudflare Queues تقبل مئةَ رسالةٍ في `sendBatch` الواحدة. وكان مسحُ Drive يرسل كلَّ ما يستحقّ التحليل دفعةً واحدة بسقفٍ
 * ‏يبلغ خمسمئة (`daily_analysis_cap`)، فيوم يزيد الجديدُ على مئة تسقط الدفعةُ كلُّها — **والمصادرُ كُتبت «جديدةً» قبلها، فتصير
 * ‏في الغد «ثابتةً» ولا تُرسَل أبدًا**.
 */
import { describe, expect, it } from 'vitest'
import { enqueueForAnalysis } from '../drive/job'
import { QUEUE_BATCH_MAX, sendChunked } from './batch'

/** ‏طابورٌ كطابور Cloudflare: يردّ الدفعةَ فوق مئة. */
function strictQueue() {
  const batches: number[] = []
  return {
    batches,
    async sendBatch(messages: readonly unknown[]) {
      if (messages.length > QUEUE_BATCH_MAX) throw new Error(`batch of ${messages.length} exceeds ${QUEUE_BATCH_MAX}`)
      batches.push(messages.length)
    },
  }
}

describe('الدفعاتُ دون حدّ الطابور (D-320)', () => {
  it('مئتان وخمسون رسالةً في ثلاث دفعات', async () => {
    const q = strictQueue()
    expect(await sendChunked(q, Array.from({ length: 250 }, (_, i) => ({ body: i })))).toBe(250)
    expect(q.batches).toEqual([100, 100, 50])
  })

  it('ولا شيء لا يُرسَل', async () => {
    const q = strictQueue()
    expect(await sendChunked(q, [])).toBe(0)
    expect(q.batches).toEqual([])
  })

  it('ومسحٌ وجد مئةً وخمسين جديدةً بسقف خمسمئة يرسلها كلَّها', async () => {
    const q = strictQueue()
    const ids = Array.from({ length: 150 }, (_, i) => `src:${i}`)
    expect(await enqueueForAnalysis(q, ids, 500)).toBe(150)
    expect(q.batches).toEqual([100, 50])
  })

  it('وما فوق السقف يبقى للغد', async () => {
    const q = strictQueue()
    expect(await enqueueForAnalysis(q, ['a', 'b', 'c'], 2)).toBe(2)
    expect(await enqueueForAnalysis(q, ['a'], 0)).toBe(0)
    expect(q.batches).toEqual([2])
  })
})
