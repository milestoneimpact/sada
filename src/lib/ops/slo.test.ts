/**
 * ‏**مستوياتُ الخدمة** (D-321 · docs/SLO.md): المؤشّراتُ الثلاثة من صفوف D1، وما ردّته المنصّةُ لا يُعدّ، والخانةُ بلا سؤالٍ غياب،
 * ‏و`/pulse` يكتب خانتَه مرّةً لا مع كلّ طارق.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { app } from '../../index'
import { prunePulseSlots, readSlis, recordProbe, sli, slotOf } from './slo'

const NOW = new Date('2026-11-12T12:05:00.000Z')
const at = (minutesAgo: number): string => new Date(NOW.getTime() - minutesAgo * 60_000).toISOString().slice(0, 19).replace('T', ' ')

let db: FakeDb

beforeEach(() => {
  db = fakeDb()
  db.raw.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name, org_id) VALUES ('acc', 'linkedin', 'member', 'e', 'عمر', 'org_owner')`)
})

let n = 0
/** منشورٌ مجدولٌ قبل `due` دقيقةً، بحاله ومحاولاته: `[دقائقُ بعد الموعد، الحال، رمزُ الردّ]`. */
function post(due: number, status: string, attempts: readonly (readonly [number, 'succeeded' | 'failed', number?])[]): void {
  n += 1
  const id = `p${n}`
  db.raw.prepare(
    `INSERT INTO posts (id, account_id, platform, type, text, status, idempotency_key, approved_at, scheduled_at, org_id)
     VALUES (?, 'acc', 'linkedin', 'text', 'نصّ', ?, ?, ?, ?, 'org_owner')`,
  ).run(id, status, `k${n}`, at(due + 60), at(due))
  attempts.forEach(([after, s, code], i) => {
    db.raw.prepare(
      `INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, response_json, status, at, org_id)
       VALUES (?, ?, ?, ?, '{}', ?, ?, ?, 'org_owner')`,
    ).run(`${id}a${i}`, id, `k${n}`, i + 1, JSON.stringify(s === 'failed' ? { error: 'x', status: code ?? 0 } : { id: 'urn' }), s, at(due - after))
  })
}

describe('المؤشّرات (readSlis)', () => {
  it('في موعده: ما خرج خلال 16 دقيقة، والمتأخّرُ والفاشلُ منّا والعالقُ سيّئ، وما ردّته المنصّةُ لمحتواه لا يُعدّ', async () => {
    post(60, 'published', [[5, 'succeeded']])                 // في موعده
    post(120, 'published', [[30, 'succeeded']])               // متأخّر
    post(180, 'published', [[1, 'failed', 503], [20, 'succeeded']]) // أُعيد فنجح بعد 20 دقيقة: متأخّر
    post(240, 'failed', [[1, 'failed', 422]])                 // ردّته المنصّة: لا يُعدّ
    post(300, 'failed', [[1, 'failed', 500]])                 // فشل منّا: سيّئ
    post(90, 'queued', [])                                    // عالق بعد موعده: سيّئ
    post(-60, 'queued', [])                                   // لم يحلّ: لا يُعدّ
    post(5, 'queued', [])                                     // حلّ ولم يجاوز دورةً: لا يُعدّ بعد
    post(29 * 24 * 60, 'published', [[1, 'succeeded']])       // خارج النافذة
    const [onTime] = await readSlis(db, NOW)
    expect(onTime).toMatchObject({ key: 'on_time', good: 1, total: 5, excluded: 1, ratio: 0.2 })
  })

  it('نجاحُ النشر: آخرُ محاولةٍ حُسمت لكلّ منشور، والإذنُ المنتهي وحدُّ المعدّل والانقطاعُ منّا، والمحتوى المردودُ لا يُعدّ', async () => {
    post(60, 'published', [[1, 'failed', 503], [5, 'succeeded']]) // نجح بعد إعادة: جيّد
    post(70, 'failed', [[1, 'failed', 401]])                       // إذنٌ انتهى: منّا
    post(80, 'failed', [[1, 'failed', 429]])                       // حدُّ المعدّل: منّا
    post(90, 'failed', [[1, 'failed', 0]])                         // انقطاع: منّا
    post(100, 'failed', [[1, 'failed', 400]])                      // ردّته المنصّة: لا يُعدّ
    post(110, 'failed', [[1, 'failed', 403]])                      // ردّته المنصّة: لا يُعدّ
    post(29 * 24 * 60, 'failed', [[1, 'failed', 500]])             // خارج النافذة
    const [, success] = await readSlis(db, NOW)
    expect(success).toMatchObject({ key: 'success', good: 1, total: 4, excluded: 2, ratio: 0.25 })
  })

  it('التوافر: لا سؤالَ ← لا قياس؛ ثمّ الخاناتُ منذ أوّل سؤالٍ والخانةُ بلا سؤالٍ غياب، والجاريةُ لا تُعدّ', async () => {
    expect((await readSlis(db, NOW))[2]).toMatchObject({ key: 'availability', total: 0, ratio: null, budgetLeft: null })
    const t = (m: number) => new Date(NOW.getTime() - m * 60_000)
    await recordProbe(db, t(45), true)   // 11:20
    await recordProbe(db, t(35), true)   // 11:30
    await recordProbe(db, t(25), false)  // 11:40 ردّ 503
    // ‏11:50 لا سؤال، و12:00 الجارية
    await recordProbe(db, t(1), true)
    expect((await readSlis(db, NOW))[2]).toMatchObject({ good: 2, total: 4, ratio: 0.5 })
  })

  it('وجملةٌ واحدة للثلاثة: رحلةٌ واحدةٌ إلى D1 لبطاقة «صحّة صدى»، وسقوطُها «لا قياس» لا عطل', async () => {
    let prepared = 0
    const counting = { ...db, prepare: (q: string) => { prepared += 1; return db.prepare(q) } }
    await readSlis(counting, NOW)
    expect(prepared).toBe(1)
    const broken = { ...db, prepare: () => { throw new Error('D1_ERROR: overloaded') } }
    const out = await readSlis(broken, NOW)
    expect(out.map((s) => s.ratio)).toEqual([null, null, null])
  })
})

describe('الهامش (sli)', () => {
  it('ما يجوز من السيّئ (1 − الهدف) × الكلّ، وما بقي منه', () => {
    expect(sli('on_time', 100, 100).budgetLeft).toBe(1)
    expect(sli('on_time', 199, 200).budgetLeft).toBeCloseTo(0.5)
    expect(sli('on_time', 99, 100).budgetLeft).toBeCloseTo(0)
    expect(sli('on_time', 98, 100).budgetLeft).toBeCloseTo(-1)
    expect(sli('availability', 0, 0)).toMatchObject({ ratio: null, budgetLeft: null })
  })
})

describe('خاناتُ المراقب (recordProbe · /pulse)', () => {
  it('يُكتب للخانة مرّةً، وثانيةً إن ساءت — لا مع كلّ طارق، ولا يصير السيّئُ حسنًا', async () => {
    let writes = 0
    const counting = { ...db, prepare: (q: string) => { if (/INSERT INTO pulse_slots/.test(q)) writes += 1; return db.prepare(q) } }
    for (let i = 0; i < 20; i += 1) await recordProbe(counting, NOW, true)
    expect(writes).toBe(1)
    await recordProbe(counting, NOW, false)
    await recordProbe(counting, NOW, false)
    await recordProbe(counting, NOW, true)
    expect(writes).toBe(2)
    expect(db.raw.prepare('SELECT slot, ok FROM pulse_slots').all()).toEqual([{ slot: slotOf(NOW), ok: 0 }])
  })

  it('`/pulse` يكتب خانتَه بما ردّ: قاعدةٌ بلا نبض ← ‏503 وخانةٌ سيّئة', async () => {
    const res = await app.request('/pulse', {}, { DB: db } as never)
    expect(res.status).toBe(503)
    expect(db.raw.prepare('SELECT ok FROM pulse_slots').all()).toEqual([{ ok: 0 }])
  })

  it('وما فوق خمسةٍ وثلاثين يومًا يُمحى', async () => {
    await recordProbe(db, new Date(NOW.getTime() - 36 * 86_400_000), true)
    await recordProbe(db, new Date(NOW.getTime() - 34 * 86_400_000), true)
    expect(await prunePulseSlots(db, NOW)).toBe(1)
    expect((db.raw.prepare('SELECT count(*) AS n FROM pulse_slots').get() as { n: number }).n).toBe(1)
  })
})

describe('`/pulse` بلا ربط D1', () => {
  it('يردّ ‏503 ولا يسقط ‏500: سجلُّ الخانة لا يرمي', async () => {
    const res = await app.request('/pulse', {}, {} as never)
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ ok: false })
  })
})
