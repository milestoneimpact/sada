/**
 * نصوصُ المقطع تُكتب للمالك (D-190) — **ويُختبر الترتيبُ لا النجاحُ وحده**:
 *
 *   · أيقع النداءُ قبل الحارس؟ — الإيقافُ والسقفُ يمنعانه
 *   · أتُكتب الكلفةُ قبل أن يُقرأ الجواب؟ — جوابٌ مشوَّهٌ يبقى في الدفتر
 *   · أيُدفع ثمنُ الوصف نفسِه مرّتين؟ — الضغطةُ الثانيةُ من KV بلا نداء
 *
 * والقاعدةُ حقيقيّة وKV في الذاكرة، والشبكةُ وحدها مزيّفة.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, fakeKv, type FakeDb } from '../../test/fakes'
import { writeSetting } from '../settings'
import { recordCost } from '../cost'
import {
  CAPTIONS_TTL, captionIssues, captionsFor, captionsKey, captionSystem, captionUser, parseCaptions, readCaptions,
} from './captions'

let db: FakeDb
let kv: ReturnType<typeof fakeKv>
let calls: { url: string; body: { system?: { text: string }[]; messages?: { content: string }[] } | null }[]

const OK = {
  youtube_title: 'القيادةُ في أوّل مئة يوم',
  youtube_description: 'ما يقرّره القائدُ <أوّلًا> قبل أن يُقرَّر عنه.\n\n#قيادة #Shorts',
  tiktok: 'أوّلُ مئة يوم تكتب ما بعدها. #قيادة #إدارة #حوكمة',
  instagram: 'من أين يبدأ القائد؟\n\nمن قرارٍ واحدٍ يُقال بوضوح.\n\n#قيادة #إدارة #حوكمة',
}

function net(answer: unknown = OK): typeof fetch {
  calls = []
  return (async (input: unknown, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null
    const url = request !== null ? request.url : String(input)
    let body: unknown = null
    try {
      body = JSON.parse(String(request !== null ? await request.clone().text() : (init?.body ?? '{}')))
    } catch {
      body = null
    }
    calls.push({ url, body: body as (typeof calls)[number]['body'] })
    if (!url.includes('api.anthropic.com')) throw new Error(`نداء غير متوقّع: ${url}`)
    return new Response(
      JSON.stringify({
        id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5', stop_reason: 'end_turn',
        content: [{ type: 'text', text: typeof answer === 'string' ? answer : JSON.stringify(answer) }],
        usage: { input_tokens: 700, output_tokens: 300 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }) as unknown as typeof fetch
}

function deps(fetchImpl: typeof fetch) {
  return { db, kv, encKey: '', workerSecrets: { ANTHROPIC_API_KEY: 'sk-ant-secret-0001' }, fetchImpl, now: new Date('2026-10-05T08:00:00Z') }
}

async function upload(id = 'u1', dims: { width: number | null; height: number | null; duration: number | null } = { width: 1080, height: 1920, duration: 42_000 }, status = 'ready'): Promise<void> {
  await db
    .prepare(`INSERT INTO uploads (id, r2_key, name, mime, bytes, width, height, duration_ms, status) VALUES (?, ?, 'قيادة.mp4', 'video/mp4', 10, ?, ?, ?, ?)`)
    .bind(id, `upload/${id}.mp4`, dims.width, dims.height, dims.duration, status)
    .run()
}

const ledger = (): { operation: string; ref_id: string | null; total: number }[] =>
  db.raw.prepare('SELECT operation, ref_id, total FROM cost_ledger').all() as { operation: string; ref_id: string | null; total: number }[]

beforeEach(() => {
  db = fakeDb()
  kv = fakeKv()
})

describe('من جملةٍ إلى أربعة نصوص', () => {
  it('نداءٌ واحد، والكلفةُ في الدفتر باسم المقطع، والنصوصُ في KV يومًا — بلا سرّ', async () => {
    await upload()
    const out = await captionsFor(deps(net()), 'u1', '  لقاءٌ عن القيادة   في أوّل مئة يوم ')
    expect(out.kind).toBe('written')
    if (out.kind !== 'written') return
    expect(calls).toHaveLength(1)
    expect(ledger()).toEqual([expect.objectContaining({ operation: 'captions:claude-opus-5', ref_id: 'u1' })])
    expect(ledger()[0]!.total).toBeGreaterThan(0)
    expect(out.captions).toMatchObject({
      about: 'لقاءٌ عن القيادة في أوّل مئة يوم',
      youtubeTitle: 'القيادةُ في أوّل مئة يوم',
      // ‏«<» و«>» تُنزَعان: YouTube يردّ المقطعَ بهما بعد رفعه
      youtubeDescription: 'ما يقرّره القائدُ أوّلًا قبل أن يُقرَّر عنه.\n\n#قيادة #Shorts',
      model: 'claude-opus-5',
      at: '2026-10-05T08:00:00.000Z',
    })
    expect(out.captions.cost).toBe(ledger()[0]!.total)
    expect(kv.ttlOf(captionsKey('u1'))).toBe(CAPTIONS_TTL)
    const stored = await kv.get(captionsKey('u1'))
    expect(stored).not.toContain('sk-ant')
    expect(await readCaptions(kv, 'u1')).toEqual(out.captions)
  })

  it('والضغطةُ الثانيةُ بالوصف نفسِه لا تُنادي ولا تُكلّف — ووصفٌ آخرُ يُنادي', async () => {
    await upload()
    await captionsFor(deps(net()), 'u1', 'لقاءٌ عن القيادة')
    const again = await captionsFor(deps(net()), 'u1', 'لقاءٌ  عن القيادة')
    expect(again.kind).toBe('already')
    expect(calls).toHaveLength(0)
    expect(ledger()).toHaveLength(1)
    const other = await captionsFor(deps(net()), 'u1', 'ورشةٌ عن الحوكمة')
    expect(other.kind).toBe('written')
    expect(ledger()).toHaveLength(2)
  })

  /*
   * ‏**«أعد كتابتها» تكتب من جديد** (مراجعة D-190): كان الزرُّ يعيد الوصفَ نفسَه في حقله فيعود
   * ‏«مكتوبةٌ وهي هذه» أبدًا — ونصوصٌ مدفوعةٌ ناقصةٌ تبقى في KV يومًا. فالزرُّ يحمل `at` ما على
   * ‏الشاشة: يطابق فيُكتب مرّةً، وإعادةُ النموذج نفسِه بعدها تحمل `at` قديمًا فلا تُكلّف.
   */
  it('«أعد كتابتها» بـ at ما على الشاشة تكتب مرّةً — وإعادتُها لا تُنادي', async () => {
    await upload()
    const first = await captionsFor(deps(net({ ...OK, youtube_title: '', tiktok: '' })), 'u1', 'لقاءٌ عن القيادة')
    expect(first.kind).toBe('written')
    if (first.kind !== 'written') return
    expect(captionIssues(first.captions)).toMatchObject({ title: expect.any(String), tiktok: 'النصُّ فارغ' })
    // ‏الوصفُ نفسُه بلا `replace` — الضغطةُ الثانيةُ هي الأولى
    expect((await captionsFor(deps(net()), 'u1', 'لقاءٌ عن القيادة')).kind).toBe('already')
    const later = { ...deps(net()), now: new Date('2026-10-05T09:00:00Z') }
    const again = await captionsFor(later, 'u1', 'لقاءٌ عن القيادة', first.captions.at)
    expect(again.kind).toBe('written')
    expect(calls).toHaveLength(1)
    expect(ledger()).toHaveLength(2)
    expect((await readCaptions(kv, 'u1'))!.tiktok).toBe(OK.tiktok)
    // ‏والنموذجُ نفسُه مرّةً ثانية: `at` قديمٌ لا يطابق — لا نداءَ ولا كلفة
    const replay = await captionsFor(deps(net()), 'u1', 'لقاءٌ عن القيادة', first.captions.at)
    expect(replay.kind).toBe('already')
    expect(calls).toHaveLength(0)
    expect(ledger()).toHaveLength(2)
  })

  /*
   * ‏**وحفظٌ سقط بعد الدفع لا يصعد ‏500** (مراجعة D-190): كان استثناءُ KV يفلت من `captionsFor`
   * ‏بعد أن كُتبت الكلفة، فلا أثرَ ولا إشعار. فيعود `failed` بسببه وكلفتِه، كـ `insertDraft`.
   */
  it('وKV يرمي بعد أن دُفع: failed بكلفته، وصفٌّ واحدٌ في الدفتر، ولا خطأَ يُرمى', async () => {
    await upload()
    const broken = { ...kv, put: async (): Promise<void> => { throw new Error('KV PUT failed: 429') } }
    const out = await captionsFor({ ...deps(net()), kv: broken }, 'u1', 'لقاءٌ عن القيادة')
    expect(out).toMatchObject({ kind: 'failed', retryable: true, reason: expect.stringContaining('تعذّر حفظُها') })
    expect(ledger()).toHaveLength(1)
    if (out.kind === 'failed') expect(out.cost).toBeCloseTo(ledger()[0]!.total, 9)
  })

  it('الوصفُ يحمل شكلَ المقطع: Short بـ #Shorts، والأفقيُّ بلا #Shorts — ووصفُ المالك وحدَه مادّة', async () => {
    await upload('v', { width: 1080, height: 1920, duration: 42_000 })
    await upload('h', { width: 1920, height: 1080, duration: 42_000 })
    await captionsFor(deps(net()), 'v', 'لقاءٌ عن القيادة')
    expect(calls[0]!.body!.system![0]!.text).toContain('واختم الوصفَ بالوسم #Shorts')
    expect(calls[0]!.body!.messages![0]!.content).toContain('لقاءٌ عن القيادة')
    expect(calls[0]!.body!.messages![0]!.content).toContain('رأسيّ، مدّتُه 0:42')
    await captionsFor(deps(net()), 'h', 'لقاءٌ عن القيادة')
    expect(calls[0]!.body!.system![0]!.text).toContain('ولا تكتب #Shorts')
    expect(captionSystem('short')).toContain('أنت لم ترَ المقطع')
    // ‏والمجهولُ لا يُنفى (مراجعة D-190): رأسيٌّ لم تُقرأ مدّتُه قد يصير Short — فلا «لن يكون»
    const unknown = captionSystem('unknown')
    expect(unknown).not.toContain('لن يكون Short')
    expect(unknown).not.toContain('واختم الوصفَ بالوسم #Shorts')
    expect(unknown).toContain('لم تُقرأ')
    expect(captionUser({ name: 'x.mp4', about: 'وصف', shape: 'unknown', durationMs: null })).toContain('شكلُه لم يُقرأ، مدّتُه لم تُقرأ')
  })
})

describe('الحارسُ قبل النداء (D-006 · D-008)', () => {
  it('الإيقافُ يمنع النداء — ولا كلفة', async () => {
    await upload()
    await writeSetting(db, 'paused', 'true', 'test')
    const out = await captionsFor(deps(net()), 'u1', 'لقاءٌ عن القيادة')
    expect(out).toMatchObject({ kind: 'blocked' })
    expect(calls).toHaveLength(0)
    expect(ledger()).toHaveLength(0)
    expect(await kv.get(captionsKey('u1'))).toBeNull()
  })

  it('وسقفُ الإنفاق اليوميّ كذلك — بحكم `draft` نفسِه', async () => {
    await upload()
    await recordCost(db, { provider: 'anthropic', operation: 'draft:x', units: 1, unitCost: 6 })
    const out = await captionsFor(deps(net()), 'u1', 'لقاءٌ عن القيادة')
    expect(out).toMatchObject({ kind: 'blocked', reason: expect.stringContaining('سقف الإنفاق') })
    expect(calls).toHaveLength(0)
  })

  it('وجوابٌ مشوَّهٌ يبقى في الدفتر ولا يُحفظ — النداءُ وقع وحوسِب عليه', async () => {
    await upload()
    const out = await captionsFor(deps(net('ليس JSON')), 'u1', 'لقاءٌ عن القيادة')
    expect(out).toMatchObject({ kind: 'failed', retryable: true })
    expect(ledger()).toHaveLength(1)
    // ‏وما دُفع يُعاد ليُقال في الإشعار (مراجعة D-190)
    if (out.kind === 'failed') expect(out.cost).toBeCloseTo(ledger()[0]!.total, 9)
    expect(await kv.get(captionsKey('u1'))).toBeNull()
  })

  it('ووصفٌ قصيرٌ أو مقطعٌ لم يكتمل يُردّان قبل أيّ نداء', async () => {
    await upload('u1')
    await upload('u2', { width: 1080, height: 1920, duration: 42_000 }, 'uploading')
    expect(await captionsFor(deps(net()), 'u1', ' قا ')).toMatchObject({ kind: 'failed', retryable: false })
    expect(await captionsFor(deps(net()), 'u1', 'ق'.repeat(501))).toMatchObject({ kind: 'failed' })
    expect(await captionsFor(deps(net()), 'u2', 'لقاءٌ عن القيادة')).toMatchObject({ kind: 'failed', reason: 'المقطعُ لم يكتمل رفعُه' })
    expect(await captionsFor(deps(net()), 'none', 'لقاءٌ عن القيادة')).toMatchObject({ kind: 'failed' })
    expect(calls).toHaveLength(0)
  })
})

describe('ما يُقرأ من الجواب وما يُقال تحته', () => {
  it('العنوانُ سطرٌ واحد، والزاويّتان تُنزَعان، والكلُّ فارغًا يُردّ', () => {
    const read = parseCaptions({ youtube_title: 'سطرٌ\nثانٍ <x>', youtube_description: '', tiktok: 't', instagram: 'i' })
    expect(read).toMatchObject({ ok: true, texts: { youtubeTitle: 'سطرٌ ثانٍ x' } })
    expect(parseCaptions({ youtube_title: '', youtube_description: '', tiktok: '', instagram: '' })).toMatchObject({ ok: false })
    expect(parseCaptions('نصّ')).toMatchObject({ ok: false })
  })

  it('ما يتجاوز حدَّ منصّته يُقال تحت حقله ولا يُرمى', () => {
    const issues = captionIssues({
      youtubeTitle: 'ع'.repeat(120), youtubeDescription: 'وصف', tiktok: 'ن'.repeat(2300), instagram: 'سليم',
    })
    expect(Object.keys(issues).sort()).toEqual(['tiktok', 'title'])
    expect(issues.title).toContain('YouTube تقبل 100')
    expect(issues.tiktok).toContain('TikTok تقبل 2200')
  })

  it('وصفٌّ فاسدٌ في KV يُقرأ كأن لم يُكتب', async () => {
    await kv.put(captionsKey('u9'), '{"about":1}')
    expect(await readCaptions(kv, 'u9')).toBeNull()
    await kv.put(captionsKey('u9'), 'ليس JSON')
    expect(await readCaptions(kv, 'u9')).toBeNull()
  })
})
