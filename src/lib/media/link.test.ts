/**
 * النافذةُ الموقّعة — وما يجب ألّا تفتحه.
 *
 * والتشفيرُ هنا حقيقيّ لا مزيّف: `crypto.subtle` نفسها التي في Worker.
 */
import { describe, expect, it } from 'vitest'
import { toBase64 } from '../crypto'
import { mediaUrl, signMediaToken, verifyMediaToken, WINDOW_SECONDS } from './link'

const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))
const OTHER = toBase64(crypto.getRandomValues(new Uint8Array(32)))
const NOW = new Date('2026-09-20T12:00:00.000Z')
const later = (s: number): Date => new Date(NOW.getTime() + s * 1000)

describe('التوقيعُ والقراءة', () => {
  it('يفتح ما وُقّع له', async () => {
    const token = await signMediaToken(KEY, 'med-1', NOW)
    expect(await verifyMediaToken(KEY, token, NOW)).toEqual({ ok: true, mediaId: 'med-1' })
  })

  it('والرمزُ آمنٌ في المسار — لا شرطةَ مائلة ولا زائد', async () => {
    for (let i = 0; i < 40; i += 1) {
      const token = await signMediaToken(KEY, `med-${i}`, NOW)
      expect(token).not.toMatch(/[/+=]/)
    }
  })

  it('ولا يحمل سرّا — المعرّفُ ولحظةٌ وتوقيع', async () => {
    const token = await signMediaToken(KEY, 'med-1', NOW)
    expect(token).not.toContain(KEY)
  })
})

describe('ما لا يُفتَح', () => {
  /** المعرّفُ وحده لا يفتح شيئا — وإلّا فُتح الدلوُ لمن يخمّن. */
  it('رمزٌ ملفَّقٌ يُردّ', async () => {
    expect(await verifyMediaToken(KEY, 'bWVkLTEuOTk5OTk5OTk5OQ.QUJD', NOW)).toEqual({
      ok: false, reason: 'bad_signature',
    })
  })

  it('ورمزٌ وُقّع بمفتاحٍ آخر يُردّ', async () => {
    const token = await signMediaToken(OTHER, 'med-1', NOW)
    expect(await verifyMediaToken(KEY, token, NOW)).toMatchObject({ ok: false })
  })

  it('وتبديلُ المعرّف في الجسد يُبطل التوقيع — فرابطُ صورةٍ لا يفتح غيرَها', async () => {
    const token = await signMediaToken(KEY, 'med-1', NOW)
    const [body, mac] = token.split('.')
    const forged = `${btoa('med-2.9999999999').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.${mac}`
    expect(forged).not.toBe(token)
    expect(await verifyMediaToken(KEY, forged, NOW)).toMatchObject({ ok: false })
    expect(body!.length).toBeGreaterThan(0)
  })

  it('وتمديدُ اللحظة يُبطل التوقيع كذلك', async () => {
    const token = await signMediaToken(KEY, 'med-1', NOW, 60)
    const mac = token.slice(token.lastIndexOf('.'))
    const body = btoa('med-1.9999999999')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(await verifyMediaToken(KEY, body + mac, NOW)).toMatchObject({ ok: false })
  })

  it('وشكلٌ فاسدٌ يُردّ ولا يرمي', async () => {
    for (const bad of ['', '.', 'abc', 'abc.', '.abc', '!!!.###']) {
      await expect(verifyMediaToken(KEY, bad, NOW)).resolves.toMatchObject({ ok: false })
    }
  })
})

describe('النافذة', () => {
  it('تُغلق بعد خمسَ عشرةَ دقيقة', async () => {
    const token = await signMediaToken(KEY, 'med-1', NOW)
    expect(await verifyMediaToken(KEY, token, later(WINDOW_SECONDS - 5))).toMatchObject({ ok: true })
    expect(await verifyMediaToken(KEY, token, later(WINDOW_SECONDS + 1))).toEqual({
      ok: false, reason: 'expired',
    })
  })

  it('واللحظةُ نفسُها مغلَقة — لا مساواةَ تفتح', async () => {
    const token = await signMediaToken(KEY, 'med-1', NOW, 60)
    expect(await verifyMediaToken(KEY, token, later(60))).toMatchObject({ ok: false })
  })

  /**
   * **التوقيعُ قبل الانتهاء.**
   *
   * من فحص الانتهاءَ أوّلا أخبر المهاجمَ أنّ رمزَه صالحُ الشكلِ منتهي
   * الوقت — وهو فرقٌ يُبنى عليه. فرمزٌ ملفَّقٌ **ومنتهٍ** يجب أن يُردّ
   * بـ «توقيعٌ خاطئ» لا بـ «منتهٍ».
   */
  it('ورمزٌ ملفَّقٌ ومنتهٍ يُقال عنه «توقيعٌ خاطئ» لا «منتهٍ»', async () => {
    const token = await signMediaToken(OTHER, 'med-1', NOW, 60)
    expect(await verifyMediaToken(KEY, token, later(600))).toEqual({
      ok: false, reason: 'bad_signature',
    })
  })
})

describe('الرابط', () => {
  it('يُبنى من الأساس ولا يكرّر الشرطة', () => {
    expect(mediaUrl('https://sada2.basserh.com', 'T')).toBe('https://sada2.basserh.com/m/T')
    expect(mediaUrl('https://sada2.basserh.com/', 'T')).toBe('https://sada2.basserh.com/m/T')
  })
})
