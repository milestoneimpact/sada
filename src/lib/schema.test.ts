/**
 * اختبار المخطط: يشغل migrations/0001_init.sql على SQLite في الذاكرة
 * ويثبت أن قيود الحوكمة تمنع الحالات الممنوعة فعلا، لا في الوثيقة وحدها.
 *
 * D1 مبني على SQLite، فما يمر هنا يمر هناك في حدود ما يخص القيود.
 */
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'

const MIGRATION = readFileSync(new URL('../../migrations/0001_init.sql', import.meta.url), 'utf8')

let db: DatabaseSync

function seedAccount(id = 'lnkd_7'): string {
  db.exec(
    `INSERT INTO accounts (id, platform, kind, external_id, display_name)
     VALUES ('${id}', 'linkedin', 'member', 'ext_${id}', 'عمر')`,
  )
  return id
}

function insertPost(fields: Record<string, string | number | null>): void {
  const columns = Object.keys(fields)
  const stmt = db.prepare(
    `INSERT INTO posts (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
  )
  stmt.run(...columns.map((c) => fields[c] as string | number | null))
}

const basePost = {
  id: 'p1',
  account_id: 'lnkd_7',
  type: 'text',
  text: 'نص المنشور',
  scheduled_at: '2026-09-08T09:00:00+03:00',
  idempotency_key: 'key-1',
}

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(MIGRATION)
})

describe('الترحيل يمر', () => {
  it('ينشئ الجداول العشرة', () => {
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[]
    expect(rows.map((r) => r.name).sort()).toEqual([
      'accounts',
      'content_items',
      'cost_ledger',
      'metrics',
      'plans',
      'posts',
      'promotion_suggestions',
      'publish_attempts',
      'sources',
      'tokens',
    ])
  })
})

describe('D-004 · لا نشر بلا مفتاح فريد', () => {
  it('يرفض مفتاح idempotency مكررا', () => {
    seedAccount()
    insertPost({ ...basePost, approved_at: '2026-09-07T10:00:00Z', status: 'approved' })
    expect(() =>
      insertPost({ ...basePost, id: 'p2', status: 'approved', approved_at: '2026-09-07T10:00:00Z' }),
    ).toThrow(/UNIQUE/i)
  })

  it('يرفض محاولتي نشر بالرقم نفسه للمنشور نفسه', () => {
    seedAccount()
    insertPost({ ...basePost, status: 'approved', approved_at: '2026-09-07T10:00:00Z' })
    const attempt = db.prepare(
      `INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, status)
       VALUES (?, 'p1', 'key-1', ?, '{}', 'sent')`,
    )
    attempt.run('a1', 1)
    expect(() => attempt.run('a2', 1)).toThrow(/UNIQUE/i)
  })
})

describe('D-009 · لا نشر بلا اعتماد بشري', () => {
  it('يمنع وضع منشور في الطابور بلا approved_at', () => {
    seedAccount()
    expect(() => insertPost({ ...basePost, status: 'queued', approved_at: null })).toThrow(
      /CHECK/i,
    )
  })

  it('يمنع تعليم منشور منشورا بلا approved_at', () => {
    seedAccount()
    expect(() => insertPost({ ...basePost, status: 'published', approved_at: null })).toThrow(
      /CHECK/i,
    )
  })

  it('يسمح بالمسودة بلا اعتماد', () => {
    seedAccount()
    expect(() => insertPost({ ...basePost, status: 'draft', approved_at: null })).not.toThrow()
  })

  it('يسمح بالطابور بعد الاعتماد', () => {
    seedAccount()
    expect(() =>
      insertPost({ ...basePost, status: 'queued', approved_by: 'omar', approved_at: '2026-09-07T10:00:00Z' }),
    ).not.toThrow()
  })
})

describe('D-005 · الرموز لا تخزن إلا مشفرة', () => {
  it('يرفض refresh_enc بلا iv خاص به', () => {
    seedAccount()
    expect(() =>
      db.exec(
        `INSERT INTO tokens (account_id, access_enc, access_iv, refresh_enc, expires_at, scopes)
         VALUES ('lnkd_7', 'c', 'i', 'c2', '2026-11-01T00:00:00Z', 'w_member_social')`,
      ),
    ).toThrow(/CHECK/i)
  })

  it('يقبل رمزا بلا refresh إطلاقا', () => {
    seedAccount()
    expect(() =>
      db.exec(
        `INSERT INTO tokens (account_id, access_enc, access_iv, expires_at, scopes)
         VALUES ('lnkd_7', 'c', 'i', '2026-11-01T00:00:00Z', 'w_member_social')`,
      ),
    ).not.toThrow()
  })
})

describe('قيود المجالات', () => {
  it('يرفض منصة غير معروفة', () => {
    expect(() =>
      db.exec(
        `INSERT INTO accounts (id, platform, kind, external_id, display_name)
         VALUES ('fb_1', 'facebook', 'member', 'x', 'y')`,
      ),
    ).toThrow(/CHECK/i)
  })

  it('يرفض مزودا غير معروف في سجل التكلفة', () => {
    expect(() =>
      db.exec(
        `INSERT INTO cost_ledger (id, provider, operation, units, unit_cost, total)
         VALUES ('c1', 'openai', 'chat', 1, 1, 1)`,
      ),
    ).toThrow(/CHECK/i)
  })

  it('يرفض نافذة قياس غير معرفة', () => {
    seedAccount()
    insertPost({ ...basePost, status: 'draft' })
    expect(() =>
      db.exec(`INSERT INTO metrics (post_id, window) VALUES ('p1', '30d')`),
    ).toThrow(/CHECK/i)
  })

  it('يرفض ترتيب ثريد بلا معرف ثريد', () => {
    seedAccount()
    expect(() => insertPost({ ...basePost, thread_order: 2 })).toThrow(/CHECK/i)
  })
})

describe('D-008 · سجل التكلفة يقبل كل مزود مدفوع', () => {
  it('يسجل طلب X بتكلفته', () => {
    db.exec(
      `INSERT INTO cost_ledger (id, provider, operation, units, unit_cost, total, ref_id)
       VALUES ('c1', 'x', 'POST /2/tweets', 1, 0.015, 0.015, 'p1')`,
    )
    const row = db.prepare('SELECT total, currency FROM cost_ledger WHERE id = ?').get('c1') as {
      total: number
      currency: string
    }
    expect(row.total).toBeCloseTo(0.015)
    expect(row.currency).toBe('USD')
  })
})
