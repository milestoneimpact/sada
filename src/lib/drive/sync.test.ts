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
