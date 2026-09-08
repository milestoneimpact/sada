/**
 * البَتُّ في المسوّدات — **و D-009 يُقطَع في القاعدة لا يُفترَض.**
 *
 * آخرُ اختبارٍ هنا هو المهمّ: يحاول أن يدفع منشورا إلى `queued` بلا
 * `approved_at` **مباشرةً بـ SQL**، متجاوزا كلَّ شيفرةٍ كتبناها. فلو
 * أخطأنا في كلّ سطرٍ في `store.ts` لبقي القيدُ قائما — وهذا ما يجعله
 * قيدا لا عادة.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { approveMany, decide, listDrafts, undoReject } from './store'

let db: FakeDb

const LONG = 'ن'.repeat(300)

async function seedDraft(options: {
  platform?: 'linkedin' | 'x'
  text?: string
  status?: string
  hash?: string
} = {}): Promise<string> {
  const sourceId = crypto.randomUUID()
  await db
    .prepare(
      "INSERT INTO sources (id, drive_file_id, name, mime, content_hash) VALUES (?, ?, 'تقرير الأثر', 'text/plain', 'md5:abc')",
    )
    .bind(sourceId, sourceId)
    .run()

  const id = crypto.randomUUID()
  await db
    .prepare(
      `INSERT INTO posts (id, platform, source_id, source_hash, model, cost_usd, type, text,
                          rationale, status, idempotency_key)
       VALUES (?, ?, ?, ?, 'claude-opus-5', 0.012, 'text', ?, 'زاوية', ?, ?)`,
    )
    .bind(
      id,
      options.platform ?? 'linkedin',
      sourceId,
      options.hash ?? 'md5:abc',
      options.text ?? LONG,
      options.status ?? 'draft',
      `k-${id}`,
    )
    .run()
  return id
}

async function readPost(id: string): Promise<Record<string, unknown> | null> {
  return db
    .prepare('SELECT status, text, approved_by, approved_at FROM posts WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>()
}

beforeEach(() => {
  db = fakeDb()
})

describe('الاعتماد', () => {
  it('نصٌّ لم يتغيّر يُعتمد approved، ومع صاحبِ القرار ووقته', async () => {
    const id = await seedDraft()
    const out = await decide(db, id, { kind: 'approve', text: LONG }, 'panel:passkey')

    expect(out).toEqual({ ok: true, status: 'approved' })
    const row = await readPost(id)
    expect(row?.['status']).toBe('approved')
    expect(row?.['approved_by']).toBe('panel:passkey')
    expect(row?.['approved_at']).not.toBeNull()
  })

  it('نصٌّ تغيّر يُعتمد edited — والحالةُ تُستنتَج ولا تُسأل', async () => {
    const id = await seedDraft()
    const out = await decide(db, id, { kind: 'approve', text: `${LONG} زيادة` }, 'panel:token')

    expect(out).toEqual({ ok: true, status: 'edited' })
    const row = await readPost(id)
    expect(row?.['text']).toContain('زيادة')
  })

  it('نصٌّ فوق حدّ المنصّة يُرفض عند الاعتماد لا عند النشر', async () => {
    const id = await seedDraft({ platform: 'x', text: 'ن'.repeat(200) })
    const out = await decide(db, id, { kind: 'approve', text: 'ن'.repeat(400) }, 'panel:token')

    expect(out.ok).toBe(false)
    // ولا يُكتب شيء: لا نصٌّ ولا اعتماد
    const row = await readPost(id)
    expect(row?.['status']).toBe('draft')
    expect(row?.['approved_at']).toBeNull()
    expect(String(row?.['text']).length).toBe(200)
  })

  it('نصٌّ أقصر من أن يكون منشورا يُرفض', async () => {
    const id = await seedDraft()
    expect((await decide(db, id, { kind: 'approve', text: 'قصير' }, 'x')).ok).toBe(false)
  })
})

describe('الرفض', () => {
  it('يُعلَّم rejected بلا approved_at — فلا يفتح بابَ الطابور', async () => {
    const id = await seedDraft()
    expect(await decide(db, id, { kind: 'reject' }, 'panel:token')).toEqual({
      ok: true,
      status: 'rejected',
    })
    const row = await readPost(id)
    expect(row?.['status']).toBe('rejected')
    expect(row?.['approved_at']).toBeNull()
  })

  it('ولا يُحذف الصفّ: كلفتُه وقعت، وما دُفع ثمنُه يُرى', async () => {
    const id = await seedDraft()
    await decide(db, id, { kind: 'reject' }, 'panel:token')
    const list = await listDrafts(db)
    expect(list.map((d) => d.id)).toContain(id)
    expect(list[0]?.cost).toBe(0.012)
  })
})

describe('ما غادر المسوّدةَ لا يُبَتّ فيه ثانية', () => {
  it('المعتمَدُ لا يُعتمد مرّتين', async () => {
    const id = await seedDraft({ status: 'approved' })
    expect((await decide(db, id, { kind: 'approve', text: LONG }, 'x')).ok).toBe(false)
  })

  it('المرفوضُ لا يُقلَب اعتمادا من هذا الباب', async () => {
    const id = await seedDraft({ status: 'rejected' })
    expect((await decide(db, id, { kind: 'approve', text: LONG }, 'x')).ok).toBe(false)
  })

  it('معرّفٌ لا وجود له لا يُنشئ صفّا', async () => {
    expect((await decide(db, 'لا-شيء', { kind: 'approve', text: LONG }, 'x')).ok).toBe(false)
  })
})

describe('العرض', () => {
  it('يعلّم المسوّدةَ التي تغيّر مصدرُها بعدها', async () => {
    const fresh = await seedDraft()
    const stale = await seedDraft({ hash: 'md5:قديم' })
    const list = await listDrafts(db)
    expect(list.find((d) => d.id === stale)?.stale).toBe(true)
    expect(list.find((d) => d.id === fresh)?.stale).toBe(false)
  })

  it('يجلب اسمَ المصدر مع المسوّدة — فلا يُقرأ نصٌّ بلا أصله', async () => {
    const id = await seedDraft()
    const list = await listDrafts(db)
    expect(list.find((d) => d.id === id)?.sourceName).toBe('تقرير الأثر')
  })
})

describe('D-009 · القيدُ في القاعدة لا في الشيفرة', () => {
  it('SQL مباشر يحاول الطابورَ بلا اعتماد — فتردّه القاعدة', async () => {
    const id = await seedDraft()
    await expect(
      db
        .prepare("UPDATE posts SET status = 'queued', scheduled_at = '2026-09-09T09:00:00Z' WHERE id = ?")
        .bind(id)
        .run(),
    ).rejects.toThrow()
  })

  it('ولا طابورَ إلى حسابٍ لا وجود له، وإن كان الاعتماد قائما', async () => {
    const id = await seedDraft()
    await decide(db, id, { kind: 'approve', text: LONG }, 'panel:token')
    await expect(
      db
        .prepare("UPDATE posts SET status = 'queued', scheduled_at = '2026-09-09T09:00:00Z' WHERE id = ?")
        .bind(id)
        .run(),
    ).rejects.toThrow()
  })
})

/**
 * **ثمنُ النشر غيرُ ثمن الكتابة — ولم يُعرَض قطّ (D-069).**
 *
 * `ARCHITECTURE.md §٤` تقول إنّ `has_url` «يُحسَب بالشيفرة لا بالنموذج
 * **ويُعرَض في اللوحة مع تكلفته على X**» منذ أوّل يوم. وكان يُكتب
 * صفرا **حرفا** في المسوّدة، ويُحسَب عند النشر — بعد الاعتماد بأسابيع
 * — فلا يراه المالكُ حين يبتّ. **ورابطٌ على X ثلاثةَ عشرَ ضعفا.**
 */
describe('ثمنُ النشر يُرى قبل الاعتماد (D-069)', () => {
  // **يسع الرابطَ تحت حدّ X (٢٨٠)**: `LONG` بثلاثمئةٍ يُردّ قبل أن
  // يُحسَب العمود، فيمرّ الاختبارُ على فرعٍ غير الذي يفحصه
  const FITS = 'ن'.repeat(200)
  const LINK = 'https://basserh.com'

  it('ورابطٌ على X يُسعَّر مئتين لا خمسةَ عشر', async () => {
    await seedDraft({ platform: 'x', text: `${FITS} ${LINK}` })
    const [row] = await listDrafts(db)
    expect(row?.publishCost).toBeCloseTo(0.2)
  })

  it('وبلا رابطٍ خمسةَ عشر', async () => {
    await seedDraft({ platform: 'x' })
    const [row] = await listDrafts(db)
    expect(row?.publishCost).toBeCloseTo(0.015)
  })

  it('و LinkedIn بلا رسمٍ على المنشور — فلا يُعرَض شيء', async () => {
    await seedDraft({ platform: 'linkedin', text: `${FITS} ${LINK}` })
    const [row] = await listDrafts(db)
    expect(row?.publishCost).toBe(0)
  })

  /**
   * **والمالكُ يعتمد بنصِّه بعد التعديل.** فنصٌّ بلا رابطٍ عند الكتابة
   * يخرج من البَتّ برابط — وعمودٌ حُسب مرّةً يبقى يقول ما بطل.
   */
  it('وتعديلٌ يضيف رابطا يعيد حسابَ العمود', async () => {
    const id = await seedDraft({ platform: 'x' })
    const before = db.raw.prepare('SELECT has_url AS u FROM posts WHERE id = ?').get(id) as { u: number }
    expect(before.u).toBe(0)

    const edited = await decide(db, id, { kind: 'approve', text: `${FITS} ${LINK}` }, 'omar')
    expect(edited.ok).toBe(true)

    const after = db.raw.prepare('SELECT has_url AS u FROM posts WHERE id = ?').get(id) as { u: number }
    expect(after.u).toBe(1)
  })

  it('وتعديلٌ يحذف الرابطَ يعيده صفرا', async () => {
    const id = await seedDraft({ platform: 'x', text: `${FITS} ${LINK}` })
    const edited = await decide(db, id, { kind: 'approve', text: FITS }, 'omar')
    expect(edited.ok).toBe(true)
    const after = db.raw.prepare('SELECT has_url AS u FROM posts WHERE id = ?').get(id) as { u: number }
    expect(after.u).toBe(0)
  })
})

/**
 * التراجعُ عن الرفض (D-100) — **والحارسُ في الحال لا في الزرّ.**
 *
 * الزرُّ يظهر في إشعارٍ يعيش دقيقة. وقد يُترَك التبويبُ مفتوحا ساعةً ثمّ
 * يُضغَط، وقد تكون المسوّدةُ بُتَّ فيها من تبويبٍ آخر بينهما. **فالشرطُ
 * أنّ الحالَ `rejected` الآن، لا أنّ الرفضَ وقع يوما.**
 */
describe('التراجعُ عن الرفض', () => {
  it('يعيدها مسوّدةً ويمحو اسمَ الرافض', async () => {
    const id = await seedDraft({})
    await decide(db, id, { kind: 'reject' }, 'omar')

    const back = await undoReject(db, id)
    expect(back.ok).toBe(true)

    const [row] = await listDrafts(db)
    expect(row?.status).toBe('draft')
    // واسمُ الرافض يُمحى: قرارٌ رُجع عنه لا يبقى له صاحب
    expect(row?.approvedBy).toBeNull()
  })

  it('**ولا يُتراجَع عمّا لم يُرفَض** — والمعتمَدُ يُردّ بحاله', async () => {
    const id = await seedDraft({})
    await decide(db, id, { kind: 'approve', text: LONG }, 'omar')

    const back = await undoReject(db, id)
    expect(back.ok).toBe(false)
    if (!back.ok) expect(back.reason).toContain('approved')
  })

  it('ومسوّدةٌ لم تُبَتّ لا يُتراجَع عنها', async () => {
    const id = await seedDraft({})
    const back = await undoReject(db, id)
    expect(back.ok).toBe(false)
  })

  it('ومعرّفٌ لا وجودَ له يُردّ ولا يرمي', async () => {
    const back = await undoReject(db, 'لا-شيء')
    expect(back.ok).toBe(false)
  })

  /** والدورةُ كاملةً: رُفضت، فرُجع عنها، فاعتُمدت. */
  it('والمُرجَعُ عنها يُعتمَد بعدها', async () => {
    const id = await seedDraft({})
    await decide(db, id, { kind: 'reject' }, 'omar')
    await undoReject(db, id)

    const done = await decide(db, id, { kind: 'approve', text: LONG }, 'omar')
    expect(done.ok).toBe(true)
    if (done.ok) expect(done.status).toBe('approved')
  })
})

/**
 * البَتُّ الجماعيّ (D-100) — **ولا حارسَ ثانٍ فيه.**
 *
 * يمرّ من `decide` نفسِها، فما يُردّ فرديًّا يُردّ جماعيًّا بالسبب نفسِه.
 * وأهمُّ ما يُثبَت هنا اثنان: أنّ النصَّ يُؤخَذ من القاعدة **فتخرج الحالُ
 * `approved` لا `edited`**، وأنّ متعثّرةً واحدةً لا توقف البقيّة.
 */
describe('البَتُّ الجماعيّ', () => {
  it('يعتمد الجملةَ بنصّها المحفوظ — والحالُ approved لا edited', async () => {
    const one = await seedDraft({})
    const two = await seedDraft({})

    const result = await approveMany(db, [one, two], 'omar')
    expect(result.done).toHaveLength(2)
    expect(result.failed).toHaveLength(0)

    const rows = await listDrafts(db)
    // **لم يُعدَّل شيء، فلا تُقال «عُدّلت»**
    expect(rows.every((r) => r.status === 'approved')).toBe(true)
    expect(rows.every((r) => r.approvedBy === 'omar')).toBe(true)
  })

  it('**ومتعثّرةٌ لا توقف البقيّة** — وتُسمّى بسببها', async () => {
    const good = await seedDraft({})
    const gone = await seedDraft({})
    await decide(db, gone, { kind: 'reject' }, 'omar')

    const result = await approveMany(db, [gone, good], 'omar')
    expect(result.done).toEqual([good])
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]?.id).toBe(gone)
    expect(result.failed[0]?.reason).toContain('rejected')
  })

  it('ومعرّفٌ لا وجودَ له يُسمَّى ولا يرمي', async () => {
    const good = await seedDraft({})
    const result = await approveMany(db, ['لا-شيء', good], 'omar')
    expect(result.done).toEqual([good])
    expect(result.failed[0]?.id).toBe('لا-شيء')
  })

  it('وقائمةٌ فارغة تعطي حصيلةً فارغة', async () => {
    const result = await approveMany(db, [], 'omar')
    expect(result.done).toHaveLength(0)
    expect(result.failed).toHaveLength(0)
  })

  /**
   * **وحدُّ الطول يُطبَّق جماعيًّا كما يُطبَّق فرديًّا.**
   *
   * مسوّدةٌ وُلّدت فوق حدّ المنصّة تُردّ عند الاعتماد لا عند النشر — وهذا
   * هو الفحصُ الذي يجعل البَتَّ الجماعيَّ آمنا: **لا يمرّ منه ما لا يمرّ
   * من الفرديّ.**
   */
  it('ونصٌّ فوق حدّ المنصّة يُردّ في الجملة كما يُردّ وحده', async () => {
    const big = await seedDraft({ platform: 'x', text: 'ن'.repeat(400) })
    const result = await approveMany(db, [big], 'omar')
    expect(result.done).toHaveLength(0)
    expect(result.failed[0]?.reason).toContain('محرفا')
  })
})
