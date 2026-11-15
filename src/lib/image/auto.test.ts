/** الصورةُ الآليّة واختيارُ الخطّة (D-282): اختيارُ الخطّة يغلب الإعدادَ العامّ، والسقفُ والإيقافُ فوقهما. */
import { describe, expect, it } from 'vitest'
import { fakeDb, fakeKv } from '../../test/fakes'
import { restoreTrash, trashPost } from '../privacy/trash'
import { writeSetting } from '../settings'
import { autoImageRoom } from './auto'

describe('autoImageRoom باختيار الخطّة', () => {
  it('الإعدادُ مطفأٌ والخطّةُ تريد: يُرسَم بما بقي من السقف — والخطّةُ لا تريد: لا يُرسَم ولو كان مرفوعًا', async () => {
    const db = fakeDb()
    await writeSetting(db, 'auto_image', 'false', 'test')
    await writeSetting(db, 'daily_image_cap', '3', 'test')
    expect(await autoImageRoom(db, 'org_owner')).toBe(0)
    expect(await autoImageRoom(db, 'org_owner', true)).toBe(3)
    await writeSetting(db, 'auto_image', 'true', 'test')
    expect(await autoImageRoom(db, 'org_owner')).toBe(3)
    expect(await autoImageRoom(db, 'org_owner', false)).toBe(0)
    // ‏والإيقافُ فوق الاثنين
    await writeSetting(db, 'paused', 'true', 'test')
    expect(await autoImageRoom(db, 'org_owner', true)).toBe(0)
  })
})

/*
 * ‏**مراجعة D-322**: السقفُ يُعدّ من صفوف `media` اليوم، و«احذفها» يحذف صفوفَ المسوّدة كلَّها — فكانت كلُّ مسوّدةٍ تُحذف تفتح بابَ صورةٍ
 * ‏مدفوعةٍ أخرى في اليوم نفسِه. فما وُلّد لمنشورٍ حُذف يبقى في العدّ من قيده في الدفتر (D-008)، ويعود العدُّ كما كان بعد «تراجَع».
 */
describe('السقفُ اليوميّ بعد الحذف', () => {
  it('**مسوّدةٌ حُذفت لا تعيد ما وُلّد لها** — والتراجعُ لا يعدّه مرّتين', async () => {
    const db = fakeDb()
    const kv = fakeKv()
    await writeSetting(db, 'auto_image', 'true', 'test')
    await writeSetting(db, 'daily_image_cap', '2', 'test')
    for (const id of ['p1', 'p2']) {
      db.raw.prepare(`INSERT INTO posts (id, platform, type, text, status, idempotency_key) VALUES (?, 'linkedin', 'text', 'نصّ', 'draft', ?)`).run(id, 'k-' + id)
      db.raw.prepare(`INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, idempotency_key)
        VALUES (?, ?, ?, 'image/png', 10, 'p', 'flux', ?)`).run('m-' + id, id, `img/${id}/m.png`, 'mk-' + id)
      db.raw.prepare(`INSERT INTO cost_ledger (id, provider, operation, units, unit_cost, total, ref_id)
        VALUES (?, 'workers-ai', 'image:linkedin:flux', 1, 0, 0, ?)`).run('c-' + id, id)
    }
    // ‏وقيودٌ ليست صورةً لا تُعدّ: مسوّدةٌ مكتوبة، ووصفُ صورة، ومواصفةُ إنفوجرافيك
    db.raw.exec(`INSERT INTO cost_ledger (id, provider, operation, units, unit_cost, total, ref_id) VALUES
      ('c-d', 'anthropic', 'draft:linkedin', 1, 0.01, 0.01, 'p1'), ('c-b', 'anthropic', 'image-brief:claude', 1, 0, 0, 'p1'),
      ('c-s', 'anthropic', 'infographic:claude', 1, 0, 0, 'p2')`)
    expect(await autoImageRoom(db, 'org_owner')).toBe(0)
    const first = await trashPost({ db, kv }, 'org_owner', 'p1')
    await trashPost({ db, kv }, 'org_owner', 'p2')
    expect(await autoImageRoom(db, 'org_owner')).toBe(0)
    await restoreTrash({ db, kv }, 'org_owner', first.ok ? first.token : '')
    expect(await autoImageRoom(db, 'org_owner')).toBe(0)
    // ‏وما وُلّد أمس لا يُعدّ اليوم، حُذف منشورُه أو لم يُحذف
    db.raw.exec("UPDATE cost_ledger SET at = datetime('now', '-1 days'); UPDATE media SET created_at = datetime('now', '-1 days')")
    expect(await autoImageRoom(db, 'org_owner')).toBe(2)
  })
})
