import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import type { DriveFile } from './client'
import { needsAnalysis, sourceId, syncSources } from './sync'

let db: FakeDb

function file(id: string, hash: string, name = `ملف ${id}`): DriveFile {
  return {
    id,
    name,
    mimeType: 'application/vnd.google-apps.document',
    contentHash: hash,
    modifiedTime: '2026-09-04T10:00:00Z',
  }
}

beforeEach(() => {
  db = fakeDb()
})

describe('المزامنة الأولى', () => {
  it('تعدّ كل الملفات جديدة', async () => {
    const result = await syncSources(db, [file('a', 'h1'), file('b', 'h2')])
    expect(result.added).toEqual(['a', 'b'])
    expect(result.changed).toEqual([])
    expect(result.unchanged).toEqual([])
  })

  it('تكتب صفا لكل ملف بمعرّف مشتق', async () => {
    await syncSources(db, [file('a', 'h1')])
    const row = db.raw.prepare('SELECT id, drive_file_id FROM sources').get() as {
      id: string
      drive_file_id: string
    }
    expect(row.id).toBe(sourceId('a'))
    expect(row.drive_file_id).toBe('a')
  })
})

describe('ما تغيّر فقط — القاعدة التي توفّر نداءات Claude', () => {
  it('لا تعدّ الملف الثابت متغيّرا', async () => {
    await syncSources(db, [file('a', 'h1')])
    const second = await syncSources(db, [file('a', 'h1')])
    expect(second.unchanged).toEqual(['a'])
    expect(needsAnalysis(second)).toEqual([])
  })

  it('تلتقط تغيّر البصمة', async () => {
    await syncSources(db, [file('a', 'h1')])
    const second = await syncSources(db, [file('a', 'h2')])
    expect(second.changed).toEqual(['a'])
    expect(needsAnalysis(second)).toEqual(['a'])
  })

  it('تحدّث الاسم والبصمة عند التغيّر', async () => {
    await syncSources(db, [file('a', 'h1', 'الاسم القديم')])
    await syncSources(db, [file('a', 'h2', 'الاسم الجديد')])
    const row = db.raw
      .prepare('SELECT name, content_hash FROM sources WHERE drive_file_id = ?')
      .get('a') as { name: string; content_hash: string }
    expect(row.name).toBe('الاسم الجديد')
    expect(row.content_hash).toBe('h2')
  })

  it('لا تنشئ صفا ثانيا مهما تكرّرت المزامنة', async () => {
    for (let i = 0; i < 5; i += 1) await syncSources(db, [file('a', `h${i}`)])
    const count = db.raw.prepare('SELECT count(*) AS n FROM sources').get() as { n: number }
    expect(count.n).toBe(1)
  })

  it('تعيد للتحليل ما أُضيف وما تغيّر معا، لا غير', async () => {
    await syncSources(db, [file('a', 'h1'), file('b', 'h1')])
    const second = await syncSources(db, [
      file('a', 'h1'), // ثابت
      file('b', 'h2'), // تغيّر
      file('c', 'h1'), // جديد
    ])
    expect(needsAnalysis(second).sort()).toEqual(['b', 'c'])
  })
})

describe('الملف الغائب', () => {
  it('يُبلَّغ عنه ولا يُحذف — المنشورات تشير إليه', async () => {
    await syncSources(db, [file('a', 'h1'), file('b', 'h1')])
    const second = await syncSources(db, [file('a', 'h1')])
    expect(second.missing).toEqual(['b'])

    const count = db.raw.prepare('SELECT count(*) AS n FROM sources').get() as { n: number }
    expect(count.n).toBe(2)
  })

  it('والمرفوعُ والرابطُ ليسا من Drive (D-284): لا يُعَدّان غائبَين ولا يُمَسّان', async () => {
    db.raw.exec(`INSERT INTO sources (id, drive_file_id, name, mime, content_hash, kind) VALUES
      ('src:upload:1', 'upload:1', 'تقرير.pdf', 'application/pdf', 'sha:x', 'upload'),
      ('src:url:1', 'url:1', 'مقال', 'text/html', 'sha:y', 'url')`)
    const result = await syncSources(db, [file('a', 'h1')])
    expect(result.missing).toEqual([])
    expect(db.raw.prepare("SELECT count(*) AS n FROM sources WHERE kind != 'drive'").get()).toEqual({ n: 2 })
  })

  it('يعود بلا تكرار حين يُشارَك مجدّدا', async () => {
    await syncSources(db, [file('a', 'h1')])
    await syncSources(db, [])
    const third = await syncSources(db, [file('a', 'h1')])
    expect(third.unchanged).toEqual(['a'])
    const count = db.raw.prepare('SELECT count(*) AS n FROM sources').get() as { n: number }
    expect(count.n).toBe(1)
  })
})

describe('المجلد الفارغ', () => {
  it('لا يرمي ولا يحذف', async () => {
    const result = await syncSources(db, [])
    expect(result).toEqual({ added: [], changed: [], unchanged: [], missing: [] })
  })
})

/**
 * ‏**ألفُ ملفٍّ في دفعاتٍ لا في ألف نداء** (D-320).
 *
 * ‏كانت المزامنةُ تكتب صفًّا لكلّ ملفٍّ بنداءٍ مستقلّ، في استدعاء 03:03 الذي يحمل معه التجديدَ والإرسالَ والتنبيهاتِ والحصّة.
 * ‏وD1 يقبل ألفَ نداءٍ في الاستدعاء الواحد (Workers Paid)، **والدفعةُ (`batch`) تُعدّ نداءً واحدًا** — فالمسحُ كان ينكسر
 * ‏عند نحو تسعمئة ملفّ.
 */
describe('المزامنة في دفعات (D-320)', () => {
  function counting(inner: FakeDb) {
    const seen = { run: 0, batch: 0, largest: 0 }
    const wrap = (s: ReturnType<FakeDb['prepare']>): ReturnType<FakeDb['prepare']> => ({
      bind: (...v: unknown[]) => wrap(s.bind(...v)),
      first: s.first.bind(s),
      all: s.all.bind(s),
      run: async () => { seen.run += 1; return s.run() },
      // ‏ما يُدفَع في الدفعة يُنفَّذ بالأصل لا بالغلاف: لا يُعدّ نداءً
      ...{ inner: s },
    } as ReturnType<FakeDb['prepare']>)
    const db = {
      prepare: (q: string) => wrap(inner.prepare(q)),
      batch: async (statements: ReturnType<FakeDb['prepare']>[]) => {
        seen.batch += 1
        seen.largest = Math.max(seen.largest, statements.length)
        return inner.batch!(statements.map((s) => (s as unknown as { inner: ReturnType<FakeDb['prepare']> }).inner))
      },
    }
    return { db, seen }
  }

  it('ألفٌ وملفٌّ جديدة ثمّ متغيّرة ثمّ ثابتة: نداءاتٌ معدودة، والتصنيفُ كما كان', async () => {
    const files = Array.from({ length: 1001 }, (_, i) => file(`id${String(i).padStart(4, '0')}`, `h${i}`))
    const { db: counted, seen } = counting(db)
    const first = await syncSources(counted, files)
    expect(first.added).toHaveLength(1001)
    expect(seen.run).toBe(0)
    expect(seen.batch).toBeLessThanOrEqual(21)
    expect(seen.largest).toBeLessThanOrEqual(50)
    const rows = db.raw.prepare("SELECT count(*) AS n FROM sources WHERE kind = 'drive'").get() as { n: number }
    expect(rows.n).toBe(1001)

    const again = files.map((f, i) => (i % 2 === 0 ? file(f.id, `${f.contentHash}-v2`) : f))
    const second = await syncSources(counted, again)
    expect(second.changed).toHaveLength(501)
    expect(second.unchanged).toHaveLength(500)
    expect(seen.run).toBe(0)
    const changed = db.raw.prepare("SELECT content_hash FROM sources WHERE drive_file_id = 'id0000'").get() as { content_hash: string }
    expect(changed.content_hash).toBe('h0-v2')
  })
})
