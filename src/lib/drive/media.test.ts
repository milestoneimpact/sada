/** وسائطُ المالك من مجلّد Drive «04-media» (D-363): الوسومُ من المسار، والمزامنة، والتنزيلُ بسقفه، والمطابقةُ في الخطّة. */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import type { LinkedAccount } from '../channels'
import { applyPlan, readPlan, type PlanFacts } from '../plan/import'
import { seatedPosts, seatPlan } from '../plan/seat'
import { mediaLine } from '../../routes/ui/planImportView'
import { attachStatement } from '../library'
import {
  DEFAULT_MEDIA_FOLDER, fetchMediaBytes, itemNumber, listMediaFolder, matchMedia, mediaFolderName, mediaTags, readDriveMedia,
  setMediaFolderName, syncDriveMedia, wantedKind, type DriveMediaFile, type LibraryMedia,
} from './media'

const NOW = new Date('2026-10-03T08:00:00Z')

const lib = (over: Partial<LibraryMedia>): LibraryMedia => ({
  id: 'f', name: 'x.png', mime: 'image/png', kind: 'image', bytes: 1000, path: '01-افتتاح', itemNo: '01', variant: null, r2Key: 'library/org_owner/drive/f', ...over,
})

const file = (over: Partial<DriveMediaFile>): DriveMediaFile => ({
  id: 'd1', name: 'غلاف داكن.png', mimeType: 'image/png', md5: 'm1', bytes: 1000, path: '01-افتتاح', ...over,
})

describe('الوسوم من المسار', () => {
  it('رقمُ المادّة من أوّل مجلّدٍ يبدأ بأرقام، والداكنُ والفاتح من الاسم، والنوعُ من mime', () => {
    expect(mediaTags('01-افتتاح', 'غلاف داكن.png', 'image/png')).toEqual({ kind: 'image', itemNo: '01', variant: 'dark' })
    expect(mediaTags('٠٢-عرض/light', 'a.mp4', 'video/mp4')).toEqual({ kind: 'video', itemNo: '02', variant: 'light' })
    expect(mediaTags('', '7 فاتح.jpg', 'image/jpeg')).toEqual({ kind: 'image', itemNo: '07', variant: 'light' })
    expect(mediaTags('01', 'ملاحظات.pdf', 'application/pdf')).toBeNull()
    expect(itemNumber('1')).toBe('01')
  })

  it('الشكلُ يقول النوع: فيديو مقطع، و«نص فقط» بلا وسيطة، وما سواهما صورة', () => {
    expect(wantedKind('فيديو مربع 1080 + نص', '')).toBe('video')
    expect(wantedKind('اقتباس (نص فقط)', '')).toBe('text')
    expect(wantedKind('بطاقة', '04-media/01-…/')).toBe('image')
  })
})

describe('المطابقة', () => {
  const both = [
    lib({ id: 'a', name: 'داكن-1.png', variant: 'dark' }),
    lib({ id: 'b', name: 'فاتح-1.png', variant: 'light' }),
    lib({ id: 'v', name: 'مقطع.mp4', kind: 'video', mime: 'video/mp4' }),
  ]
  const want = (item: string, format = 'صورة', hint = '04-media/01-…/ (داكن أو فاتح بالتناوب)') => ({ item, hint, format })

  it('تتناوب بين الداكن والفاتح لصفوف المادّة نفسِها، والمقطعُ لشكل الفيديو', () => {
    const out = matchMedia([want('01'), want('1'), want('01'), want('01', 'فيديو مربع 1080 + نص')], both)
    expect(out.map((m) => (m?.kind === 'matched' ? m.media.id : m?.kind))).toEqual(['a', 'b', 'a', 'v'])
  })

  it('مادّةٌ بلا ملفٍّ «تنقصه وسيطة»، و«نص فقط» بلا وسيطة، والصفُّ بلا رقمٍ لا يُطابَق', () => {
    const out = matchMedia([want('09'), want('01', 'اقتباس (نص فقط)'), null], both)
    expect(out).toEqual([{ kind: 'missing', want: 'image' }, { kind: 'text' }, null])
  })
})

describe('المزامنة', () => {
  let db: FakeDb
  beforeEach(() => { db = fakeDb() })

  it('تكتب صفًّا بوسومه، وإعادتُها لا تكرّر، والغائبُ يُعلَّم ولا يُحذف', async () => {
    expect(await syncDriveMedia(db, 'org_owner', [file({}), file({ id: 'd2', name: 'b.mp4', mimeType: 'video/mp4', path: '02-x/فاتح' })]))
      .toEqual({ added: 2, changed: 0, unchanged: 0, missing: 0 })
    expect(await syncDriveMedia(db, 'org_owner', [file({ md5: 'm2' })])).toEqual({ added: 0, changed: 1, unchanged: 0, missing: 1 })
    const rows = db.raw.prepare('SELECT drive_file_id, item_no, variant, kind, missing FROM drive_media ORDER BY drive_file_id').all()
    expect(rows).toEqual([
      { drive_file_id: 'd1', item_no: '01', variant: 'dark', kind: 'image', missing: 0 },
      { drive_file_id: 'd2', item_no: '02', variant: 'light', kind: 'video', missing: 1 },
    ])
    expect((await readDriveMedia(db, 'org_owner')).map((m) => m.id)).toEqual(['d1'])
  })

  it('التنزيلُ إلى R2 بسقفه، والأكبرُ من الحدّ لا يُنزَّل، والمفتاحُ تحت مكتبة المنظّمة', async () => {
    await syncDriveMedia(db, 'org_owner', [file({}), file({ id: 'big', name: 'b.png', bytes: 50 * 1024 * 1024 })])
    const put: string[] = []
    const bucket = { put: async (k: string) => { put.push(k) } }
    const fetchImpl = (async () => new Response(new Uint8Array(1000))) as unknown as typeof fetch
    const out = await fetchMediaBytes(db, 'org_owner', bucket, 'tok', fetchImpl)
    expect(out.fetched).toBe(1)
    expect(put).toEqual(['library/org_owner/drive/d1'])
    // ‏والمزامنةُ الثانيةُ لا تنزّل ما نُزّل
    expect((await fetchMediaBytes(db, 'org_owner', bucket, 'tok', fetchImpl)).fetched).toBe(0)
  })

  it('جسمٌ فوق الحدّ أو فارغٌ يُعلَّم فلا يُنزَّل في كلّ مزامنة، ويعود حين يتغيّر md5', async () => {
    await syncDriveMedia(db, 'org_owner', [file({})])
    let calls = 0
    const empty = (async () => { calls += 1; return new Response(new Uint8Array(0)) }) as unknown as typeof fetch
    const bucket = { put: async () => undefined }
    expect((await fetchMediaBytes(db, 'org_owner', bucket, 'tok', empty)).fetched).toBe(0)
    await fetchMediaBytes(db, 'org_owner', bucket, 'tok', empty)
    expect(calls).toBe(1)
    await syncDriveMedia(db, 'org_owner', [file({ md5: 'm2' })])
    await fetchMediaBytes(db, 'org_owner', bucket, 'tok', empty)
    expect(calls).toBe(2)
  })

  it('السردُ يجد المجلّد بالاسم ويتبع مجلّداته الفرعيّة ويُبقي الصور والمقاطع وحدها', async () => {
    const tree: Record<string, unknown[]> = {
      root: [{ id: 'm', name: '04-media', mimeType: 'application/vnd.google-apps.folder' }, { id: 'doc', name: 'خطة', mimeType: 'text/plain' }],
      m: [{ id: 's1', name: '01-افتتاح', mimeType: 'application/vnd.google-apps.folder' }],
      s1: [{ id: 'p', name: 'داكن.png', mimeType: 'image/png', md5Checksum: 'h', size: '12' }, { id: 'n', name: 'a.txt', mimeType: 'text/plain' }],
    }
    const fetchImpl = (async (url: string) => {
      const q = new URL(url).searchParams.get('q') ?? ''
      const id = /'([^']+)'/.exec(q)?.[1] ?? ''
      return Response.json({ files: tree[id] ?? [] })
    }) as unknown as typeof fetch
    expect(await listMediaFolder('t', 'root', '04-media', fetchImpl)).toEqual([
      { id: 'p', name: 'داكن.png', mimeType: 'image/png', md5: 'h', bytes: 12, path: '01-افتتاح' },
    ])
    expect(await listMediaFolder('t', 'root', 'غيره', fetchImpl)).toBeNull()
  })

  it('اسمُ المجلّد يُحفظ لكلّ منظّمة، وافتراضُه 04-media', async () => {
    expect(await mediaFolderName(db, 'org_owner')).toBe(DEFAULT_MEDIA_FOLDER)
    expect((await setMediaFolderName(db, 'org_owner', 'a/b')).ok).toBe(false)
    await setMediaFolderName(db, 'org_owner', 'وسائطي')
    expect(await mediaFolderName(db, 'org_owner')).toBe('وسائطي')
  })
})

describe('الخطّة تستعمل وسائط المكتبة', () => {
  const account: LinkedAccount = {
    id: 'acc-li', platform: 'linkedin', kind: 'member', displayName: 'عمر', status: 'active',
    createdAt: '2026-09-01 00:00:00', expiresAt: '2026-12-01 00:00:00',
  }
  const library = [lib({ id: 'a', name: 'داكن.png', variant: 'dark' }), lib({ id: 'b', name: 'فاتح.png', variant: 'light' })]
  const facts: PlanFacts = { accounts: [account], uploads: [], now: NOW, zone: 'Asia/Riyadh', publishable: new Set(['linkedin', 'x']), library }
  const csv = 'التاريخ,الوقت,المنصة,النص,رقم المادة,الملف,الشكل\n'
    + '2026-10-12,09:30,linkedin,أوّل,01,04-media/01-…/ (داكن أو فاتح بالتناوب),صورة\n'
    + '2026-10-13,09:30,linkedin,ثانٍ,01,04-media/01-…/ (داكن أو فاتح بالتناوب),صورة\n'
    + '2026-10-14,09:30,linkedin,ثالث,02,,صورة\n'

  it('readPlan يُبقي رقم المادّة والملفّ، والمعاينةُ تقول وسيطتَه أو «تنقصه وسيطة»', () => {
    const read = readPlan(csv, facts)
    expect(read.rows.map((r) => [r.item, r.mediaHint !== ''])).toEqual([['01', true], ['01', true], ['02', false]])
    expect(mediaLine(read.rows[0]!)).toContain('وسيطته من مكتبتك')
    expect(mediaLine(read.rows[0]!)).toContain('داكن.png')
    expect(mediaLine(read.rows[1]!)).toContain('فاتح.png')
    expect(mediaLine(read.rows[2]!)).toContain('تنقصه وسيطة')
  })

  // ‏صفّا المكتبة في D1 كما تكتبهما المزامنة — `attachStatement` يقرأ منها لا من الذاكرة
  const withLibrary = (): FakeDb => {
    const db = fakeDb()
    for (const m of library) {
      db.raw.prepare(`INSERT INTO drive_media (id, org_id, drive_file_id, name, mime, kind, md5, bytes, path, item_no, variant, r2_key, r2_md5)
        VALUES (?, 'org_owner', ?, ?, 'image/png', 'image', 'h', 1000, '01-افتتاح', '01', ?, ?, 'h')`).run('dm-' + m.id, m.id, m.name, m.variant, 'library/org_owner/drive/' + m.id)
    }
    return db
  }

  it('الاعتمادُ يربط الوسيطة بالمنشور كما يُختار من المكتبة، والإعادةُ لا تكرّرها', async () => {
    const db = withLibrary()
    await db.prepare(`INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('acc-li', 'linkedin', 'member', 'sub', 'عمر', 'active')`).run()
    const read = readPlan(csv, facts)
    await applyPlan(db, 'org_owner', read.rows, 'panel:passkey', NOW)
    await applyPlan(db, 'org_owner', read.rows, 'panel:passkey', NOW)
    const keys = db.raw.prepare(`SELECT r2_key, model FROM media ORDER BY r2_key`).all()
    expect(keys).toEqual([{ r2_key: 'library/org_owner/drive/a', model: 'drive' }, { r2_key: 'library/org_owner/drive/b', model: 'drive' }])
  })

  it('البناءُ كما هي يربطها بالمسوّدة، ولا تُرسم صورةٌ لما رُبطت به', async () => {
    const db = withLibrary()
    const seated = await seatPlan(db, 'org_owner', csv, facts, new Map(), 'infographic')
    expect(seated.seated).toBe(3)
    expect((await seatedPosts(db, 'org_owner', seated.planId!)).length).toBe(1)
  })

  it('«اكتب من الفكرة» يضع مرجعَ الوسيطة على البند فيحمله `draftMessage` ويربطه الطابور', async () => {
    const db = withLibrary()
    const seated = await seatPlan(db, 'org_owner', csv, facts, new Map(), null, null, true)
    const row = db.raw.prepare('SELECT plan_json FROM plans WHERE id = ?').get(seated.planId) as { plan_json: string }
    const items = (JSON.parse(row.plan_json) as { items: { asset?: string }[] }).items
    expect(items.map((i) => i.asset ?? null)).toEqual(['d:a', 'd:b', null])
    for (const id of ['p1', 'p2']) {
      db.raw.prepare("INSERT INTO posts (id, platform, type, text, status, idempotency_key) VALUES (?, 'linkedin', 'text', 't', 'draft', ?)").run(id, 'k-' + id)
    }
    const st = attachStatement(db, 'org_owner', 'p1', 'd:a')
    await st!.run()
    expect(db.raw.prepare("SELECT r2_key FROM media WHERE post_id = 'p1'").all()).toEqual([{ r2_key: 'library/org_owner/drive/a' }])
    // ‏ومنظّمةٌ أخرى لا تربط وسيطةَ المالك
    await attachStatement(db, 'org_other', 'p2', 'd:a')!.run()
    expect(db.raw.prepare("SELECT r2_key FROM media WHERE post_id = 'p2'").all()).toEqual([])
  })
})
