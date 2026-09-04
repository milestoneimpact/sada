import { describe, expect, it } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import { fakeFetch } from '../../test/fakes'
import { accessToken, DriveError, listFolder, parseServiceAccount } from './client'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const FILES_PREFIX = 'https://www.googleapis.com/drive/v3/files'

/** مفتاح حقيقي يُولَّد للاختبار — لا مفتاح إنتاج في مستودع. */
function serviceAccountJson(): string {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  return JSON.stringify({
    type: 'service_account',
    client_email: 'sada@example.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  })
}

describe('parseServiceAccount', () => {
  it('يقبل ملفا سليما', () => {
    const sa = parseServiceAccount(serviceAccountJson())
    expect(sa.client_email).toBe('sada@example.iam.gserviceaccount.com')
  })

  it('يرفض ما ليس JSON', () => {
    expect(() => parseServiceAccount('ليس json')).toThrow(DriveError)
  })

  it('يرفض ملفا بلا client_email', () => {
    expect(() => parseServiceAccount('{"private_key":"-----BEGIN PRIVATE KEY-----"}')).toThrow(
      DriveError,
    )
  })

  it('يرفض ملفا بلا مفتاح خاص', () => {
    expect(() => parseServiceAccount('{"client_email":"a@b.com"}')).toThrow(DriveError)
  })
})

describe('accessToken', () => {
  it('يوقّع JWT ويبدّله برمز', async () => {
    const sa = parseServiceAccount(serviceAccountJson())
    const f = fakeFetch({ [TOKEN_URL]: { json: { access_token: 'ya29.fake', expires_in: 3600 } } })
    await expect(accessToken(sa, new Date('2026-09-04T10:00:00Z'), f)).resolves.toBe('ya29.fake')
  })

  it('يرسل نوع المنحة الصحيح و JWT بثلاثة أجزاء', async () => {
    const sa = parseServiceAccount(serviceAccountJson())
    const f = fakeFetch({ [TOKEN_URL]: { json: { access_token: 'a', expires_in: 3600 } } })
    await accessToken(sa, new Date('2026-09-04T10:00:00Z'), f)

    const body = new URLSearchParams(f.calls[0]!.body)
    expect(body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer')
    const jwt = body.get('assertion') ?? ''
    expect(jwt.split('.')).toHaveLength(3)

    const claims = JSON.parse(atob(jwt.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as {
      iss: string
      scope: string
      exp: number
      iat: number
    }
    expect(claims.iss).toBe('sada@example.iam.gserviceaccount.com')
    expect(claims.scope).toBe('https://www.googleapis.com/auth/drive.readonly')
    expect(claims.exp - claims.iat).toBe(3600)
  })

  it('يفشل حين ترفض Google، بلا كشف جسم الاستجابة', async () => {
    const sa = parseServiceAccount(serviceAccountJson())
    const f = fakeFetch({
      [TOKEN_URL]: {
        status: 400,
        json: { error: 'invalid_grant', error_description: 'looks-like-a-secret' },
      },
    })
    let failure: unknown
    try {
      await accessToken(sa, new Date(), f)
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(DriveError)
    expect((failure as DriveError).message).toContain('invalid_grant')
    expect((failure as DriveError).message).not.toContain('looks-like-a-secret')
  })

  it('يفشل حين تأتي استجابة بلا رمز', async () => {
    const sa = parseServiceAccount(serviceAccountJson())
    const f = fakeFetch({ [TOKEN_URL]: { json: { expires_in: 3600 } } })
    await expect(accessToken(sa, new Date(), f)).rejects.toBeInstanceOf(DriveError)
  })
})

describe('listFolder', () => {
  function urlFor(pageToken?: string): string {
    const url = new URL(FILES_PREFIX)
    url.searchParams.set('q', `'folder-1' in parents and trashed = false`)
    url.searchParams.set(
      'fields',
      'nextPageToken, files(id, name, mimeType, md5Checksum, modifiedTime, version)',
    )
    url.searchParams.set('pageSize', '100')
    if (pageToken !== undefined) url.searchParams.set('pageToken', pageToken)
    return url.toString()
  }

  it('يقرأ الملفات ويشتق البصمة من md5 حين يوجد', async () => {
    const f = fakeFetch({
      [urlFor()]: {
        json: {
          files: [
            { id: 'a', name: 'تقرير.pdf', mimeType: 'application/pdf', md5Checksum: 'abc123' },
          ],
        },
      },
    })
    const files = await listFolder('tok', 'folder-1', f)
    expect(files).toHaveLength(1)
    expect(files[0]!.contentHash).toBe('md5:abc123')
  })

  it('يشتق البصمة من version لملفات Google الأصلية — لا md5 لها', async () => {
    const f = fakeFetch({
      [urlFor()]: {
        json: {
          files: [
            {
              id: 'b',
              name: 'مستند',
              mimeType: 'application/vnd.google-apps.document',
              version: '17',
              modifiedTime: '2026-09-04T10:00:00Z',
            },
          ],
        },
      },
    })
    const files = await listFolder('tok', 'folder-1', f)
    expect(files[0]!.contentHash).toBe('ver:17:2026-09-04T10:00:00Z')
  })

  it('يتجاهل المجلدات الفرعية ولا يتبعها', async () => {
    const f = fakeFetch({
      [urlFor()]: {
        json: {
          files: [
            { id: 'a', name: 'ملف', mimeType: 'application/pdf', md5Checksum: 'x' },
            { id: 'sub', name: 'مجلد', mimeType: 'application/vnd.google-apps.folder' },
          ],
        },
      },
    })
    const files = await listFolder('tok', 'folder-1', f)
    expect(files.map((x) => x.id)).toEqual(['a'])
  })

  it('يتبع الصفحات حتى تنتهي', async () => {
    const f = fakeFetch({
      [urlFor()]: {
        json: {
          nextPageToken: 'p2',
          files: [{ id: 'a', name: 'أ', mimeType: 'application/pdf', md5Checksum: '1' }],
        },
      },
      [urlFor('p2')]: {
        json: { files: [{ id: 'b', name: 'ب', mimeType: 'application/pdf', md5Checksum: '2' }] },
      },
    })
    const files = await listFolder('tok', 'folder-1', f)
    expect(files.map((x) => x.id)).toEqual(['a', 'b'])
    expect(f.calls).toHaveLength(2)
  })

  it('يرسل الرمز في ترويسة Bearer', async () => {
    const f = fakeFetch({ [urlFor()]: { json: { files: [] } } })
    await listFolder('tok-123', 'folder-1', f)
    expect(f.calls[0]!.headers['Authorization']).toBe('Bearer tok-123')
  })

  it('يتوقف عند سقف الصفحات بدل الدوران بلا نهاية', async () => {
    const f = fakeFetch({
      [urlFor()]: { json: { nextPageToken: 'p2', files: [] } },
      [urlFor('p2')]: { json: { nextPageToken: 'p2', files: [] } },
    })
    await expect(listFolder('tok', 'folder-1', f, 3)).rejects.toBeInstanceOf(DriveError)
  })

  it('يفشل حين يرفض Drive', async () => {
    const f = fakeFetch({ [urlFor()]: { status: 404, json: { error: 'notFound' } } })
    await expect(listFolder('tok', 'folder-1', f)).rejects.toBeInstanceOf(DriveError)
  })
})
