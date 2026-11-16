/** جدولا «التعديل والصلاحيات» حالةً حالة (D-383 المرحلة ٧)، وسجلُّ التعديل والاستعادة والتصادم والتجميد والنسخ. */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { afterSave, CONFLICT_SAY, mayDo, stageOf, type EditAction, type EditStage } from './rights'
import { copyToDraft, holdPost, postHistory, restoreEdit, revisePost } from './revise'
import { dispose, type PackagePost } from '../package/apply'
import type { Role } from '../ownerEmail'

const NOW = new Date('2099-01-01T08:00:00Z')

describe('المرحلة من حال المنشور وموعده', () => {
  it('آخر 15 دقيقة تجميد، وما قبلها مجدوَل، والمرسَل مجمَّد', () => {
    expect(stageOf({ status: 'draft' }, NOW)).toBe('draft')
    expect(stageOf({ status: 'edited' }, NOW)).toBe('draft')
    expect(stageOf({ status: 'approved' }, NOW)).toBe('approved')
    expect(stageOf({ status: 'queued', scheduled_at: '2099-01-01T08:16:00Z' }, NOW)).toBe('scheduled')
    expect(stageOf({ status: 'queued', scheduled_at: '2099-01-01T08:15:00Z' }, NOW)).toBe('frozen')
    expect(stageOf({ status: 'queued', scheduled_at: '2099-01-02T08:00:00Z', dispatched_at: 'x' }, NOW)).toBe('frozen')
    expect(stageOf({ status: 'published' }, NOW)).toBe('posted')
  })
})

describe('جدول المراحل', () => {
  const ok = (a: EditAction, s: EditStage): boolean => mayDo('owner', a, s).ok
  it('كما في التصميم', () => {
    expect(['draft', 'approved', 'scheduled'].map((s) => ok('edit', s as EditStage))).toEqual([true, true, true])
    expect(ok('edit', 'frozen')).toBe(false)
    expect(ok('edit', 'posted')).toBe(false)
    expect(ok('add_remove', 'draft')).toBe(true)
    expect(ok('add_remove', 'approved')).toBe(false)
    expect(ok('pause', 'frozen')).toBe(true)
    expect(ok('pause', 'scheduled')).toBe(true)
    expect(ok('pause', 'draft')).toBe(false)
    expect(ok('copy', 'posted')).toBe(true)
    expect(ok('copy', 'draft')).toBe(false)
  })
})

describe('جدول الأدوار', () => {
  const row = (r: Role) => [mayDo(r, 'edit').ok, mayDo(r, 'approve').ok, mayDo(r, 'import').ok]
  it('كما في التصميم', () => {
    expect(row('owner')).toEqual([true, true, true])
    expect(row('admin')).toEqual([true, true, true])
    expect(row('publisher')).toEqual([true, true, false])
    expect(row('editor')).toEqual([true, false, false])
    expect(row('viewer')).toEqual([false, false, false])
    expect(mayDo('viewer', 'edit')).toMatchObject({ ok: false, reason: expect.stringContaining('يعلّق') })
  })
  it('ما يقع بعد الحفظ', () => {
    expect(afterSave('editor', 'draft')).toBe('recheck')
    expect(afterSave('editor', 'approved')).toBe('await')
    expect(afterSave('owner', 'approved')).toBe('await')
    expect(afterSave('editor', 'scheduled')).toBe('await')
    expect(afterSave('publisher', 'scheduled')).toBe('pull_reapprove')
  })
})

let db: FakeDb
const seed = (status: string, at: string | null = null): void => {
  db.raw.exec(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status, org_id) VALUES ('a1', 'x', 'member', 'e1', 'حساب', 'active', 'o')`)
  db.raw.exec(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, org_id, scheduled_at, account_id, approved_by, approved_at)
    VALUES ('p1', 'x', 'text', 'النصّ الأوّل', '${status}', 'k1', 'o', ${at === null ? 'NULL' : `'${at}'`}, 'a1',
      ${status === 'draft' ? 'NULL' : "'owner'"}, ${status === 'draft' ? 'NULL' : "'2098-12-31T00:00:00Z'"})`)
}
const post = () => db.raw.prepare('SELECT status, text, rev, edited_in_sada, scheduled_at FROM posts WHERE id = ?').get('p1') as
  { status: string; text: string; rev: number; edited_in_sada: number; scheduled_at: string | null }

beforeEach(() => { db = fakeDb() })

describe('التعديل والسجلّ والاستعادة', () => {
  it('تعديلٌ يُسجَّل، ويحمل «عُدِّل في صدى»، ويُستعاد', async () => {
    seed('draft')
    const r = await revisePost(db, 'o', 'p1', { text: 'النصّ الثاني' }, 1, 'a@x', 'editor', NOW)
    expect(r).toMatchObject({ ok: true, rev: 2, after: 'recheck' })
    expect(post()).toMatchObject({ text: 'النصّ الثاني', rev: 2, edited_in_sada: 1, status: 'draft' })
    const h = await postHistory(db, 'o', 'p1')
    expect(h).toHaveLength(1)
    expect(h[0]).toMatchObject({ actor: 'a@x', rev: 1, before: { text: 'النصّ الأوّل' }, after: { text: 'النصّ الثاني' } })
    expect(await restoreEdit(db, 'o', h[0]!.id, 2, 'b@x', 'editor', NOW)).toMatchObject({ ok: true, rev: 3 })
    expect(post().text).toBe('النصّ الأوّل')
    expect(await postHistory(db, 'o', 'p1')).toHaveLength(2)
  })
  it('تعديلان متزامنان: الأوّل يُقبل والثاني يُكشف ولا يمحوه', async () => {
    seed('draft')
    expect((await revisePost(db, 'o', 'p1', { text: 'أ' }, 1, 'a', 'owner', NOW)).ok).toBe(true)
    expect(await revisePost(db, 'o', 'p1', { text: 'ب' }, 1, 'b', 'owner', NOW)).toEqual({ ok: false, reason: CONFLICT_SAY, conflict: true })
    expect(post().text).toBe('أ')
  })
  it('القارئ لا يعدّل، والمنظّمة الأخرى لا ترى', async () => {
    seed('draft')
    expect((await revisePost(db, 'o', 'p1', { text: 'x' }, 1, 'v', 'viewer', NOW)).ok).toBe(false)
    expect((await revisePost(db, 'o2', 'p1', { text: 'x' }, 1, 'v', 'owner', NOW)).ok).toBe(false)
    expect(post().text).toBe('النصّ الأوّل')
  })
  it('تعديلٌ على معتمَد يرجعه «ينتظر الاعتماد»', async () => {
    seed('approved')
    expect(await revisePost(db, 'o', 'p1', { text: 'جديد' }, 1, 'e', 'editor', NOW)).toMatchObject({ ok: true, after: 'await' })
    expect(post().status).toBe('edited')
  })
  it('مجدوَلٌ يعدّله المحرّر يُسحب من الطابور وينتظر الاعتماد', async () => {
    seed('queued', '2099-01-02T08:00:00Z')
    expect(await revisePost(db, 'o', 'p1', { text: 'جديد' }, 1, 'e', 'editor', NOW)).toMatchObject({ ok: true, after: 'await' })
    expect(post().status).toBe('edited')
  })
  it('مجدوَلٌ يعدّله الناشر يُسحب ويُعتمد من جديد', async () => {
    seed('queued', '2099-01-02T08:00:00Z')
    expect(await revisePost(db, 'o', 'p1', { text: 'جديد' }, 1, 'p', 'publisher', NOW)).toMatchObject({ ok: true, after: 'pull_reapprove' })
    expect(post().status).toBe('approved')
  })
})

describe('آخر 15 دقيقة والمنشور', () => {
  it('لا تعديل للنصّ، و«أوقف» يسحبه، والمحرّر لا يوقف', async () => {
    seed('queued', '2099-01-01T08:10:00Z')
    expect((await revisePost(db, 'o', 'p1', { text: 'x' }, 1, 'o', 'owner', NOW)).ok).toBe(false)
    expect((await holdPost(db, 'o', 'p1', { pause: true }, 'e', 'editor', NOW)).ok).toBe(false)
    expect(await holdPost(db, 'o', 'p1', { pause: true }, 'o', 'owner', NOW)).toMatchObject({ ok: true })
    expect(post()).toMatchObject({ status: 'approved', text: 'النصّ الأوّل', rev: 2 })
  })
  it('منشورٌ لا يُعدَّل، ويُنسخ مسوّدةً بمفتاحٍ جديد', async () => {
    seed('published', '2098-12-31T08:00:00Z')
    expect(await revisePost(db, 'o', 'p1', { text: 'x' }, 1, 'o', 'owner', NOW)).toMatchObject({ ok: false, reason: expect.stringContaining('انسخه') })
    const c = await copyToDraft(db, 'o', 'p1', 'o', 'editor', NOW)
    expect(c.ok).toBe(true)
    const copy = db.raw.prepare('SELECT status, text, idempotency_key FROM posts WHERE id = ?').get(c.ok ? c.id : '') as { status: string; text: string; idempotency_key: string }
    expect(copy).toMatchObject({ status: 'draft', text: 'النصّ الأوّل' })
    expect(copy.idempotency_key).not.toBe('k1')
    expect((await copyToDraft(db, 'o', 'p1', 'v', 'viewer', NOW)).ok).toBe(false)
  })
})

describe('الاستيراد اللاحق لا يدهس «عُدِّل في صدى»', () => {
  const p = (editedInSada: boolean): PackagePost => ({ id: 'p', period: '2099-01', item: '01', platform: 'x', status: 'draft', text: 'ن', copyOrigin: 'package', editedInSada })
  const change = (kind: 'time' | 'media') => ({ kind, item: '01', platform: 'x', before: null, after: null }) as never
  it('الموعد والوسيط ينتظران المالك', () => {
    expect(dispose(change('time'), p(false))).toBe('auto_applied')
    expect(dispose(change('time'), p(true))).toBe('awaiting_owner')
    expect(dispose(change('media'), p(true))).toBe('awaiting_owner')
  })
})
