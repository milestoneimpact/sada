/**
 * الخطّةُ من نسخةٍ في الحزمة (D-377): التصوّرُ من اللقطة المحفوظة، والبناءُ من نسخةٍ أقدم، و«تابع التحديث» مطفأً — بلا شبكة.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fakeDb } from '../../test/fakes'
import { adoptRevision, previewMedia, previewRevision, setFollow } from './adopt'
import { lastAppliedSnapshot, listRevisions, revisePackage } from './revision'
import { readSource, saveSource } from './sync'
import type { PackagePick } from './pick'

const DIR = join(__dirname, '../../test/package')
const PLAN = new Uint8Array(readFileSync(join(DIR, 'plan-v1.xlsx')))
const COPY = readFileSync(join(DIR, 'copy-v1.md'), 'utf8')
const PLAN_PATH = '01-plan/خطة-النشر-شهر-v1.xlsx'
const COPY_PATH = '02-copy/03-15-copy-v1.md'
const EDITED = COPY.replace('هذا «الأخضر المجامل».', 'هذا هو «الأخضر المجامل».')

function github(copy: string, copySha: string): typeof fetch {
  const files: Record<string, Uint8Array | string> = { [PLAN_PATH]: PLAN, [COPY_PATH]: copy }
  return (async (input: RequestInfo | URL) => {
    const url = decodeURIComponent(String(input))
    if (url.includes('/commits/')) return Response.json({ parents: [], commit: { message: 'نسخة' } })
    if (url.includes('/git/trees/')) {
      return Response.json({ truncated: false, tree: Object.keys(files).map((p) => ({ path: 'social-media/' + p, type: 'blob', size: 1, sha: p.startsWith('02') ? copySha : 'plan1' })) })
    }
    for (const [p, body] of Object.entries(files)) if (url.includes('/contents/social-media/' + p + '?')) return new Response(typeof body === 'string' ? body : new Uint8Array(body))
    return new Response('', { status: 404 })
  }) as typeof fetch
}

async function twoVersions() {
  const db = fakeDb()
  await saveSource(db, 'org_owner', { owner: 'o', repo: 'r', branch: 'b', root: 'social-media' })
  const source = (await readSource(db, 'org_owner'))!
  await revisePackage({ db, token: 't', fetchImpl: github(COPY, 'copy1') }, source, 'a'.repeat(40))
  await revisePackage({ db, token: 't', fetchImpl: github(EDITED, 'copy2') }, source, 'b'.repeat(40))
  const [newer, older] = await listRevisions(db, 'org_owner')
  return { db, source, newer: newer!, older: older! }
}

const text03 = async (db: ReturnType<typeof fakeDb>): Promise<string> =>
  (await db.prepare("SELECT text FROM posts WHERE package_item_no = '03' AND platform = 'x' AND status = 'draft'").first<{ text: string }>())!.text

describe('الخطّة من نسخة', () => {
  it('التصوّرُ الكامل لأيّ نسخة: المدّةُ وعددُ كلّ منصّة والصفوفُ والناقصُ والفرقُ عن الحاليّة', async () => {
    const { db, older, newer } = await twoVersions()
    const p = (await previewRevision(db, 'org_owner', older.id, [], { x: 'dark', linkedin: 'light' }))!
    expect(p.rows).toHaveLength(30)
    expect(p.perPlatform).toEqual({ x: 15, linkedin: 15 })
    expect(p.period?.from).toBe('2026-11-22')
    expect(p.missing).toBeGreaterThan(0)
    expect(p.changes.map((c) => c.kind)).toEqual(['text'])
    expect((await previewRevision(db, 'org_owner', newer.id, [], {}))!.changes).toEqual([])
  })

  it('«ابنِ الخطّة من هذه النسخة» يعيد المسوّداتِ إلى نسختها، والدفعُ التالي يُحسب منها', async () => {
    const { db, source, older } = await twoVersions()
    expect(await text03(db)).toContain('هذا هو')
    const out = await adoptRevision(db, source, older.id)
    expect(out).toMatchObject({ kind: 'adopted', changes: 1, awaiting: 0 })
    expect(await text03(db)).not.toContain('هذا هو')
    expect((await lastAppliedSnapshot(db, 'org_owner'))!.copySha).toBe('copy1')
    expect(await adoptRevision(db, source, older.id)).toEqual({ kind: 'same' })
    expect(await adoptRevision(db, source, 'rev_nothere')).toEqual({ kind: 'missing' })
  })

  it('«تابع التحديث تلقائيًّا» مطفأ: الدفعُ الجديد لا يمسّ المسوّدة، وينتظر القرار', async () => {
    const db = fakeDb()
    await saveSource(db, 'org_owner', { owner: 'o', repo: 'r', branch: 'b', root: 'social-media' })
    const first = (await readSource(db, 'org_owner'))!
    expect(first.followUpdates).toBe(true)
    await revisePackage({ db, token: 't', fetchImpl: github(COPY, 'copy1') }, first, 'a'.repeat(40))
    await setFollow(db, 'org_owner', first.id, false)
    const held = (await readSource(db, 'org_owner'))!
    expect(await revisePackage({ db, token: 't', fetchImpl: github(EDITED, 'copy2') }, held, 'b'.repeat(40))).toMatchObject({ kind: 'applied', awaiting: 1 })
    expect(await text03(db)).not.toContain('هذا هو')
  })

  it('الوسيطة: المقطعُ لصيغة الفيديو، والغلافُ لغيرها، باللون المختار', () => {
    const f = (path: string) => ({ path, blobSha: path, size: 1, role: 'media' as const, itemNo: '06', variant: 'dark' as const, version: 1, hasSound: true, r2Key: 'k' })
    const picks: PackagePick[] = [
      { itemNo: '06', variant: 'dark', video: f('06-a-v2-dark-sound-1080x1080.mp4'), cover: f('06-a-v1-dark-cover.png'), superseded: [] },
      { itemNo: '06', variant: 'light', video: f('06-a-v2-light-sound-1080x1080.mp4'), cover: f('06-a-v1-light-cover.png'), superseded: [] },
    ]
    expect(previewMedia(picks, { item: '06', platform: 'x', format: 'فيديو قصير' }, { x: 'dark' })).toMatchObject({ kind: 'video', name: '06-a-v2-dark-sound-1080x1080.mp4' })
    expect(previewMedia(picks, { item: '06', platform: 'linkedin', format: 'منشور نصّي' }, { linkedin: 'light' })).toMatchObject({ kind: 'cover', name: '06-a-v1-light-cover.png' })
    expect(previewMedia(picks, { item: '99', platform: 'x', format: 'فيديو' }, {}).kind).toBe('none')
  })
})

describe('البناءُ ذرّيّ أو «تعذّر»', () => {
  it('تطبيقٌ انكسر يجعل صفَّ البناء «تعذّر» بسببه، فلا يبقى «محسوبًا» ولا يصير «آخر ما طُبّق»', async () => {
    const { db, source, older } = await twoVersions()
    const before = (await lastAppliedSnapshot(db, 'org_owner'))!.copySha
    const broken = new Proxy(db, {
      get(target, key, recv) {
        if (key === 'batch') return async () => { throw new Error('D1 down') }
        const v = Reflect.get(target, key, recv) as unknown
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v
      },
    })
    expect(await adoptRevision(broken, source, older.id)).toEqual({ kind: 'failed' })
    const rows = (await db.prepare("SELECT status, error_reason FROM package_revisions WHERE adopted_from = ?").bind(older.id).all<{ status: string; error_reason: string }>()).results
    expect(rows).toEqual([{ status: 'failed', error_reason: expect.stringContaining('تعذّر بناءُ الخطّة') }])
    expect((await lastAppliedSnapshot(db, 'org_owner'))!.copySha).toBe(before)
  })
})
