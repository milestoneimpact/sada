/**
 * ‏**دفعاتٌ دون حدّ الطابور** (D-320).
 *
 * ‏Cloudflare Queues تقبل مئةَ رسالةٍ في `sendBatch` الواحدة (وربعَ ميغابايت). وكان مسحُ Drive يرسل ما يستحقّ التحليل
 * ‏دفعةً واحدةً بسقفٍ يبلغ خمسمئة، فيوم يزيد الجديدُ على مئةٍ تسقط كلُّها. فكلُّ إرسالٍ إلى طابورٍ يمرّ من هنا مقطَّعًا.
 *
 * ‏والدفعاتُ تُرسَل بالترتيب، **ودفعةٌ تسقط تُسقط ما بعدها** ويُرمى عطلُها: ما أُرسل قبلها أُرسل، والمنادي يعرف كم.
 */
export const QUEUE_BATCH_MAX = 100

export interface BatchQueue<M> {
  sendBatch(messages: M[]): Promise<unknown>
}

/** ‏يرسل الرسائلَ دفعاتٍ لا تزيد على `size`، ويعيد كم أُرسل. */
export async function sendChunked<M>(queue: BatchQueue<M>, messages: readonly M[], size = QUEUE_BATCH_MAX): Promise<number> {
  let sent = 0
  for (let i = 0; i < messages.length; i += size) {
    const chunk = messages.slice(i, i + size)
    await queue.sendBatch(chunk)
    sent += chunk.length
  }
  return sent
}
