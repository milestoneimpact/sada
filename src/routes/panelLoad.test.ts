/**
 * ‏**كلُّ لوحٍ يُحمَّل له ما يقرأ وحدَه** (D-280) — ويُقاس بعدد الجمل لا يُقدَّر.
 *
 * ‏كانت `panelRoute` تجمع `PanelData` كلَّها لكلّ طلب: **أربعون جملةً** على قاعدةٍ فارغة لكلّ لوح — «الحسابات»
 * ‏التي ترسم القنواتِ وحدَها كـ«نظرة عامّة» بأرقامها كلِّها — وتزيد جملتان لكلّ مزوّدٍ وجملةٌ لكلّ منصّةٍ في المسوّدات.
 * ‏فيُلفّ `prepare` ويُعدّ لكلّ مسار، **والسقفُ تحت الأربعين بوضوح**: من يضيف انتظارًا إلى لوحٍ لا يقرؤه يسقط هنا.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { emailLogin } from '../test/emailLogin'
import { toBase64 } from '../lib/crypto'
import { fakeDb, fakeKv } from '../test/fakes'
import { app } from '../index'

const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))

let env: Record<string, unknown>
let count = 0

beforeEach(() => {
  const db = fakeDb()
  const inner = db.prepare
  // ‏العدُّ على `prepare` لا على التنفيذ: كلُّ جملةٍ تُحضَّر رحلةٌ إلى D1
  const counting = { ...db, prepare: (query: string) => { count += 1; return inner(query) } }
  env = {
    SADA_ENV: 'staging',
    PUBLIC_BASE_URL: 'https://sada2.basserh.com',
    DRIVE_FOLDER_ID: 'folder',
    DB: counting,
    KV: fakeKv(),
    TOKEN_ENC_KEY: KEY,
    ADMIN_TOKEN: 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e',
  }
})

/** ‏سقفُ الجمل لكلّ مسار على قاعدةٍ فارغة — وقبل D-280 كانت ‏40 لكلٍّ منها. */
const CEILING: Readonly<Record<string, number>> = {
  // ‏الرئيسيّةُ والمنشورات معًا: الهيكلُ تسعٌ (ثمانٍ وعدّادُ الإشعارات جملةً واحدة، D-294)، والرحلةُ والبطاقاتُ و«ما وقع اليوم» والخطّة والمزوّدون
  // ‏وآخرُ اختبارات المزوّدين (D-348): جاهزيّةُ المهمّة من آخر اختبارٍ لمفتاحها، لا من «اختُبر مرّة» — جملةٌ واحدةٌ لكلّ المزوّدين
  '/panel': 32,
  // ‏سكربتُ التبديل (D-232): «المنشورات» وحدَها بلا الرئيسيّة — والهيكلُ معها بعدّاد الإشعارات (D-294)
  // ‏وآخرُ اختبارات المزوّدين (D-348): أزرارُ الكتابة والصورة جاهزةٌ بآخر اختبارٍ لمفتاحها
  '/panel?swap=posts': 22,
  '/panel/library': 16,
  // ‏القنواتُ في الهيكل أصلًا: لا جملةَ فوقه
  '/panel/accounts': 10,
  // ‏و«صحّة صدى» (D-321): المؤشّراتُ الثلاثة وآخرُ نسخةٍ جملةٌ واحدة، فوق ما رفعه main إلى 23
  '/panel/settings': 24,
  '/panel/analysis': 10,
}

describe('حِملُ كلّ لوح (D-280)', () => {
  it('كلُّ مسارٍ تحت سقفه — ولا لوحَ يحمّل حقيبةَ غيره', async () => {
    const r = await emailLogin(app, env)
    expect(r.status).toBe(303)
    const cookie = (r.headers.get('Set-Cookie') ?? '').split(';')[0]!
    const measured: Record<string, number> = {}
    for (const path of Object.keys(CEILING)) {
      count = 0
      const res = await app.request(path, { headers: { Cookie: cookie } }, env)
      expect(res.status).toBe(200)
      measured[path] = count
    }
    for (const [path, ceiling] of Object.entries(CEILING)) {
      expect(measured[path], `${path}: ${measured[path]} جملة`).toBeLessThanOrEqual(ceiling)
    }
    // ‏والهيكلُ وحدَه (الحسابات) أقلُّ من ربع ما كان
    expect(measured['/panel/accounts']!).toBeLessThan(measured['/panel']!)
  })
})
