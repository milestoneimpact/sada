/**
 * مسارات اللوحة.
 *
 * منفصلةٌ عن `/admin/*` عمدا: تلك تُنادى برمزٍ في ترويسة من طرفيّة، وهذه
 * بكعكة جلسةٍ من متصفّح. وخلطُ آليّتي مصادقة في مسارٍ واحد يصنع بابا لا
 * يُفحَص إلا في إحداهما.
 *
 * **وكلّ فعلٍ هنا يمرّ بالقيود نفسها** التي يمرّ بها نداءُ الطرفيّة: زرٌّ
 * في صفحةٍ ليس طريقا جانبيّا حول الحارس.
 */

import { Hono } from 'hono'
import type { Env } from '../env'
import { client } from './panel/client'
import { home } from './panel/home'
import { session } from './panel/session'
import { channels } from './panel/channels'
import { plan } from './panel/plan'
import { sources } from './panel/sources'
import { media } from './panel/media'
import { reports } from './panel/reports'
import { drafts } from './panel/drafts'
import { notices } from './panel/notices'
import { vitals } from './panel/vitals'

export { setFlash } from './panel/shared'

export const panel = new Hono<{ Bindings: Env }>()

// الترتيبُ ترتيبُ التسجيل الأصليّ قبل القسمة (D-278): Hono يطابق بترتيب التسجيل.
panel.route('/', client)
panel.route('/', home)
panel.route('/', session)
panel.route('/', channels)
panel.route('/', plan)
panel.route('/', sources)
panel.route('/', media)
panel.route('/', reports)
panel.route('/', drafts)
panel.route('/', notices)
panel.route('/', vitals)
