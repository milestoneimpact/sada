/**
 * يرسم `/privacy` إلى ملفّ — بالمسار نفسه الذي يخدمه Worker.
 *
 * لا نسخةَ ثانية من المحتوى: يُستدعى التطبيق نفسه بـ `app.request`، فما
 * يُرى هو ما يُنشر. ونسخةٌ ثانيةٌ للعرض تفترق عن الأصل في أوّل تعديل.
 */
import { writeAudited } from './writeAudited'
import { app } from '../src/index'

const out = process.argv[2] ?? '/tmp/privacy.html'
const path = process.argv[3] ?? '/privacy'

const response = await app.request(path, {}, {
  SADA_ENV: 'staging',
  PUBLIC_BASE_URL: 'https://sada2.basserh.com',
  LEGAL_ENTITY: 'بصائر للاستشارات',
  LEGAL_CONTACT: 'privacy@basserh.com',
} as never)

writeAudited(out, await response.text())
console.error(`رُسمت ${path}`)
