/**
 * قراءةُ الهويّة — أربعُ منصّاتٍ تجيب بأربعة أشكال.
 *
 * والشبكةُ مزيّفة: ما يُثبَت هنا **فرزُ الجواب**، لا أنّ المنصّة تعمل.
 */
import { describe, expect, it } from 'vitest'
import { fetchIdentity } from './identity'
import { LINKEDIN, TIKTOK, X, YOUTUBE } from './providers'

function reply(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch
}

describe('LinkedIn', () => {
  it('يقرأ sub اسما للحساب', async () => {
    const id = await fetchIdentity(LINKEDIN, 't', reply({ sub: 'urn:li:person:a', name: 'عمر' }))
    expect(id).toMatchObject({ platform: 'linkedin', kind: 'member', externalId: 'urn:li:person:a' })
  })

  it('وجوابٌ بلا sub يُردّ ولا يُخمَّن', async () => {
    await expect(fetchIdentity(LINKEDIN, 't', reply({ name: 'عمر' }))).rejects.toThrow()
  })
})

describe('X', () => {
  it('يقرأ data.id، ويقع على المعرّف حين ينقص الاسم', async () => {
    const id = await fetchIdentity(X, 't', reply({ data: { id: '42', username: 'omar' } }))
    expect(id).toMatchObject({ platform: 'x', externalId: '42', displayName: '@omar' })
  })
})

describe('YouTube', () => {
  /**
   * **القناةُ كيانٌ لا شخص.**
   *
   * فتُسجَّل `org`، والفرقُ ليس تسمية: صفُّ الحساب مفتاحُه
   * `(platform, kind, external_id)` — وتبديلُ المرتبة غدا يُنشئ حسابا
   * ثانيا للقناة نفسِها.
   */
  it('يسجّل القناةَ org لا member', async () => {
    const id = await fetchIdentity(
      YOUTUBE, 't',
      reply({ items: [{ id: 'UC123', snippet: { title: 'صدى' } }] }),
    )
    expect(id).toMatchObject({ platform: 'youtube', kind: 'org', externalId: 'UC123', displayName: 'صدى' })
  })

  /**
   * **حسابُ Google بلا قناةٍ يعيد قائمةً فارغة** — لا خطأً.
   *
   * وهي حالٌ شائعةٌ تُصيب مالكا حقيقيّا، فتُقال له بما يُفعَل لا
   * برقمٍ أعمى.
   */
  it('وحسابٌ بلا قناةٍ يُقال له ما يفعل، لا يُردّ برقم', async () => {
    await expect(fetchIdentity(YOUTUBE, 't', reply({ items: [] })))
      .rejects.toThrow(/أنشئ قناةً/)
    await expect(fetchIdentity(YOUTUBE, 't', reply({})))
      .rejects.toThrow(/أنشئ قناةً/)
  })
})

describe('TikTok', () => {
  it('يقرأ open_id من data.user', async () => {
    const id = await fetchIdentity(
      TIKTOK, 't',
      reply({ data: { user: { open_id: 'op-1', display_name: 'صدى' } } }),
    )
    expect(id).toMatchObject({ platform: 'tiktok', kind: 'member', externalId: 'op-1', displayName: 'صدى' })
  })

  it('واسمٌ فارغٌ يقع على المعرّف — لا صفَّ بلا اسم', async () => {
    const id = await fetchIdentity(
      TIKTOK, 't',
      reply({ data: { user: { open_id: 'op-2', display_name: '' } } }),
    )
    expect(id.displayName).toBe('op-2')
  })

  it('وجوابٌ بلا open_id يُردّ', async () => {
    await expect(fetchIdentity(TIKTOK, 't', reply({ data: {} }))).rejects.toThrow()
  })
})

describe('الطبقةُ المشتركة', () => {
  it('جوابٌ غيرُ ناجحٍ يُردّ باسم المنصّة — والسجلُّ يفرز', async () => {
    await expect(fetchIdentity(TIKTOK, 't', reply({}, 401))).rejects.toThrow(/tiktok/)
    await expect(fetchIdentity(YOUTUBE, 't', reply({}, 403))).rejects.toThrow(/youtube/)
  })
})
