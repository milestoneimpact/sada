/**
 * الهاتفُ أصيلًا (D-296 · EASE-PLAN ح): بيانُ التثبيت، والأيقونة، وعاملُ الخدمة، و«شارك إلى صدى».
 *
 * ## ما هو وما ليس
 *
 * - **البيان** يجعل «أضف إلى الشاشة الرئيسيّة» تطبيقًا بلا شريط متصفّح يبدأ من `/panel`، وبمشاركةٍ من قائمة
 *   النظام (`share_target`): نصٌّ أو رابطٌ من أيّ تطبيقٍ يصل إلى «اكتب من فكرتك» مملوءًا.
 * - **عاملُ الخدمة** لا يخزّن شيئًا من اللوحة: صفحاتُها `no-store` بقرار (D-039)، ومسوّدةٌ قديمةٌ تُعرَض على أنّها
 *   الحاضر أسوأُ من «لا اتّصال». فهو يردّ صفحةً تقول «لا اتّصال» حين تسقط الشبكة، لا غير.
 * - **الأيقونة** الأصلُ النقطيّ الوحيد (`docs/brand/sada-icon-1024-v1.png`) مضمَّنًا، حتّى يصل أصلُ المصمّم (M-26).
 * - **ولا أصولَ ثابتة** في wrangler: ثلاثةُ ملفّاتٍ لا تستحقّ مسارَ نشرٍ ثانيًا، وكلُّ ما يُخدَم هنا يمرّ بالترويسات نفسِها.
 */
import { Hono } from 'hono'
import type { Env } from '../env'
import { BASE_HEADERS } from '../lib/security/headers'
import { loadSession } from '../lib/session'
import { IDEA_MAX } from '../lib/draft/job'
import { html, raw } from './ui/html'
import { injectCsrf, soloPage } from './ui/shell'
import { soloNav } from './ui/rail'
import { buildCommands } from './ui/command'
import { THEME } from './ui/tokens'
import { iconPngBytes } from './ui/iconPng'
import { loginResponse, page } from './panel/shared'
import { maySpend, SPEND_LOCKED } from '../lib/access'
import { button } from './ui/components/button'

export const pwa = new Hono<{ Bindings: Env }>()

/** البيانُ كما يقرؤه المتصفّح — ثابتٌ، ولا يحمل شيئًا من الجلسة. */
export function manifest(): Record<string, unknown> {
  return {
    name: 'صدى',
    short_name: 'صدى',
    description: 'مدير محتوى عربيّ: يخطّط ويكتب وينتظر اعتمادك ثمّ ينشر ويقيس.',
    lang: 'ar',
    dir: 'rtl',
    start_url: '/panel',
    scope: '/',
    display: 'standalone',
    background_color: THEME.light['--bg'],
    theme_color: THEME.light['--brand'],
    icons: [{ src: '/icons/sada.png', sizes: '1024x1024', type: 'image/png', purpose: 'any' }],
    // ‏«شارك إلى صدى» من قائمة النظام: نصٌّ أو رابطٌ أو عنوان — يصل إلى «اكتب من فكرتك» مملوءًا
    share_target: { action: '/panel/share', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
  }
}

/**
 * عاملُ الخدمة — **لا يخزّن صفحةً من اللوحة**: التصفّحُ يذهب إلى الشبكة، وإن سقطت عادت صفحةُ «لا اتّصال».
 * والتفعيلُ فوريّ (`skipWaiting` · `clients.claim`) فتحديثُه لا ينتظر إغلاقَ كلّ التبويبات.
 */
export const SERVICE_WORKER = `'use strict';
var OFFLINE = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>صدى — لا اتّصال</title><style>main{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;text-align:center}</style></head><body><main><h1>لا اتّصال</h1><p>صدى يقرأ مسوّداتك من الشبكة، ولا يعرض نسخةً قديمةً على أنّها الحاضر. عُد حين يعود الاتّصال.</p><p><a href="/panel">أعد المحاولة</a></p></main></body></html>';
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(function () {
    return new Response(OFFLINE, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }));
});
`

pwa.get('/manifest.webmanifest', (c) =>
  c.body(JSON.stringify(manifest()), 200, {
    ...BASE_HEADERS,
    'Content-Type': 'application/manifest+json; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
  }),
)

pwa.get('/sw.js', (c) =>
  c.body(SERVICE_WORKER, 200, {
    ...BASE_HEADERS,
    'Content-Type': 'application/javascript; charset=utf-8',
    // ‏يُسأل عنه في كلّ تثبيت: عاملٌ قديمٌ يبقى سنةً أسوأُ من طلبٍ صغير
    'Cache-Control': 'no-cache',
  }),
)

pwa.get('/icons/sada.png', (c) =>
  c.body(iconPngBytes(), 200, {
    ...BASE_HEADERS,
    'Content-Type': 'image/png',
    // ‏الأيقونةُ علامةٌ عامّة كالرمز في `/favicon.ico` (D-050)
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Cache-Control': 'public, max-age=86400',
  }),
)

/**
 * «شارك إلى صدى»: ما وصل من قائمة النظام يُملأ به «اكتب من فكرتك» ثمّ يُرسَل إلى `/panel/drafts/idea` نفسِه —
 * فلا مسارَ كتابةٍ ثانٍ ولا حارسٌ يُنسى. وبلا جلسةٍ صفحةُ الدخول ثمّ العودةُ إلى هنا بما شُورك.
 */
pwa.get('/panel/share', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  const q = c.req.query()
  const parts = [q['title'] ?? '', q['text'] ?? '', q['url'] ?? ''].map((s) => s.trim()).filter((s) => s !== '')
  const idea = [...new Set(parts)].join('\n').slice(0, IDEA_MAX)
  const body = html`<div class="page-head"><div class="txt">
      <div class="eyebrow"><span class="ln"></span>من قائمة المشاركة</div>
      <h1>اكتب من فكرتك</h1>
      <p class="lede">ما شاركتَه هنا، ومنه تُكتب مسوّدةٌ لكلّ منصّةٍ تختارها — <b>وتقرؤها وتعتمدها أنت</b>.</p>
    </div></div>
    <div class="card"><form method="POST" action="/panel/drafts/idea" class="stack" data-busy="جار كتابة المسوّدات…">
      <div class="field"><label for="sh-idea">فكرتك أو ما شاركتَه</label>
        <textarea id="sh-idea" name="idea" rows="5" required maxlength="${IDEA_MAX}" dir="auto">${idea}</textarea></div>
      <fieldset class="field"><legend>اكتب لـ</legend>
        <div class="row gap-2">
          <label class="vpf"><input type="checkbox" name="platform" value="linkedin" checked><span class="vpf-b"><b>LinkedIn</b></span></label>
          <label class="vpf"><input type="checkbox" name="platform" value="x" checked><span class="vpf-b"><b>X</b></span></label>
        </div></fieldset>
      <div class="row gap-2">${raw(button({
        label: 'اكتب المسوّدات', variant: 'primary', type: 'submit',
        // ‏والمحرّرُ لا يبدأ كتابةً مدفوعة (D-318): السببُ تحت الزرّ
        ...(maySpend() ? {} : { disabled: { id: 'sh-lock', reason: SPEND_LOCKED } }),
      }))}
        <span class="ago">نداءٌ لكلّ منصّة، وكلفتُه تُسجَّل قبل أن تُكتب المسوّدة.</span></div>
    </form></div>`.value
  return page((nonce) =>
    soloPage('صدى — شارك إلى صدى', { href: '/panel', label: 'اللوحة' }, injectCsrf(body, session.record.csrf), nonce, '',
      buildCommands({ onPanel: false }), soloNav('posts')),
  )
})
