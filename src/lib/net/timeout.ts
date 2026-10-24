/**
 * مهلةٌ على كلّ نداءٍ خارجيّ (D-269).
 *
 * لم يكن على نداءات المنصّات والذكاء وDrive مهلةٌ واحدة، فنداءٌ يعلق كان
 * يعلق حتّى يقتل Cloudflare الاستدعاءَ عند حدّه (خمسَ عشرةَ دقيقة للطابور)،
 * **ويترك محاولةَ النشر بحالة `sent` بلا جواب**، والطابورُ يعيد الرسالة.
 *
 * فالمهلةُ هنا تُغلّف `fetch` نفسَه ولا تمسّ السائقين: سائقٌ جديدٌ يأخذ
 * `fetchImpl` من الناشر يأخذ مهلتَه معه ولو لم يعرفها. وإشارةُ المنادي إن
 * وُجدت تُجمَع مع المهلة، فلا تُدهَس.
 *
 * والعطلُ المرميّ من المهلة هو `DOMException` باسم `TimeoutError`، كما يرميه
 * `AbortSignal.timeout` — فيميّزه المنادي بـ `isTimeout`.
 */
export const DEFAULT_TIMEOUT_MS = 60_000

export function withTimeout(fetchImpl: typeof fetch, ms: number = DEFAULT_TIMEOUT_MS): typeof fetch {
  return (input, init) => {
    const timer = AbortSignal.timeout(ms)
    const given = init?.signal ?? null
    const signal = given === null || given === undefined
      ? timer
      : typeof AbortSignal.any === 'function'
        ? AbortSignal.any([given, timer])
        : timer
    return fetchImpl(input, { ...init, signal })
  }
}

export function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError'
}
