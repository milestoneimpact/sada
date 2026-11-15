/**
 * مسارات اللوحة — المكتبة والصور والمقاطع ورفعُ مقاطع المالك.
 *
 * جزءٌ من `panel.ts` قُسم على أقسامه (D-278) بلا تغييرٍ في سلوك.
 */
import { Hono, type Context } from 'hono'
import type { Env } from '../../env'
import { platformLabel } from '../../lib/oauth/providers'
import {
  abortUpload, cleanName, completeUpload, postsFromUpload, startUpload, uploadPart, cutTitle, privateReach, scheduleFromUpload, VIDEO_PLATFORMS,
} from '../../lib/media/uploads'
import { parseRange, resolveRange } from '../../lib/media/range'
import { soloNav } from '../ui/rail'
import { buildCommands } from '../ui/command'
import { generateForPost, rejectMedia, resumeWaiting, waitingImages } from '../../lib/image/job'
import { animateForPost, bindingFor } from '../../lib/media/video'
import { NO_CREDIT } from '../../lib/media/workersAi'
import { kb, money } from '../../lib/format'
import { activeOrg } from '../../lib/tenancy'
import { loadSession } from '../../lib/session'
import { linkStates, listAccounts } from '../../lib/channels'
import { validZone, zoneNote } from '../../lib/time/zone'
import { ownerZone } from '../../lib/time/ownerZone'
import { backTo } from '../../lib/nav/back'
import { editPlanItem } from '../../lib/plan/edit'
import { thumbFor, thumbWidth } from '../../lib/media/thumb'
import { addLibraryFile, attachToPost, markAsset, libraryProblem, listLibrary, rawObject } from '../../lib/library'
import { libraryScreen } from '../ui/libraryView'
import { captionIssues, captionsFor, readCaptions, saveCaptions } from '../../lib/media/captions'
import { momentLabel, presetAt } from '../../lib/time/local'
import { injectCsrf, soloPage } from '../ui/shell'
import { record } from '../../lib/audit'
import { type PanelFlash } from '../panelView'
import {
  deciderOf, page, loginResponse, setFlash, takeFlash, guardPost, reachNow, back, toCard, POST_ID,
} from './shared'

export const media = new Hono<{ Bindings: Env }>()

// ── المكتبة (D-260) ─────────────────────────────────────────────────

media.get('/panel/assets', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  const org = activeOrg(session.record)
  const kind = c.req.query('kind')
  const origin = c.req.query('origin')
  const plan = c.req.query('plan') ?? ''
  const index = Number(c.req.query('index'))
  const body = libraryScreen({
    assets: await listLibrary(c.env.DB, org),
    kind: kind === 'image' || kind === 'video' || kind === 'doc' ? kind : null,
    origin: origin === 'generated' || origin === 'upload' || origin === 'drive' ? origin : null,
    pick: /^[A-Za-z0-9_-]{1,80}$/.test(plan) && Number.isInteger(index) && index >= 0 ? { plan, index } : null,
    // ‏«اختر من المكتبة» على بطاقة الخطّة (D-334): المنشورُ وبطاقتُه وأسبوعُها — وكلٌّ يُفحص قبل أن يُكتب في نموذجٍ أو رابط
    pickPost: POST_ID.test(c.req.query('post') ?? '') && Number.isInteger(index) && index >= 0
      ? { post: c.req.query('post')!, index, w: /^(?:\d{1,2}|all)$/.test(c.req.query('w') ?? '') ? c.req.query('w')! : '' }
      : null,
    flash: await takeFlash(c.env, c.req.raw),
    q: (c.req.query('q') ?? '').slice(0, 80),
    fav: c.req.query('fav') === '1',
  })
  return page((nonce) =>
    soloPage('صدى — الأصول', { href: '/panel/library', label: 'المكتبة', at: '/panel/assets' }, injectCsrf(body, session.record.csrf), nonce, '',
      buildCommands({ onPanel: false }), soloNav('library')),
  )
})

/**
 * **رفعُ صورةٍ إلى المكتبة** — البايتاتُ إلى R2 أوّلًا ثمّ الصفّ، فلا صفَّ بلا كائن. ومع `id` و`index` يُربط بالبند مباشرةً.
 * والمفتاحُ من معرّفٍ يصنعه صدى لا من اسم الملفّ (D-126).
 */
media.post('/panel/assets/upload', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const f = gate.form
  const file = f.get('file')
  const planId = String(f.get('id') ?? '')
  const backTo = planId === '' ? '/panel/assets' : `/panel/assets?plan=${encodeURIComponent(planId)}&index=${Number(f.get('index'))}`
  if (!(file instanceof File)) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'اختر صورةً أوّلًا.' })
    return c.redirect(backTo, 303)
  }
  const problem = libraryProblem(file.type, file.size)
  if (problem !== null) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: problem })
    return c.redirect(backTo, 303)
  }
  const key = `library/${org}/${crypto.randomUUID()}.${file.type.split('/')[1] ?? 'img'}`
  await c.env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } })
  const id = await addLibraryFile(c.env.DB, org, { key, name: cleanName(file.name), mime: file.type, bytes: file.size })
  await record(c.env.DB, { actor: 'panel', action: 'library.upload', target: id }, c.req.raw)
  // ‏ومن «اختر من المكتبة» لمنشورٍ مكتوب (D-334): المرفوعةُ تُربط به وتعود إلى بطاقته
  const forPost = String(f.get('post') ?? '')
  if (POST_ID.test(forPost)) {
    const linked = await attachToPost(c.env.DB, org, forPost, 'f:' + id, (m) => rejectMedia(c.env.DB, org, m))
    await setFlash(c.env, c.req.raw, linked.ok ? { kind: 'ok', text: 'رُفعت الصورة وحُفظت في الأصول، وربطت بالمنشور.' } : { kind: 'bad', text: linked.reason })
    return toPlanCard(withBack(f)) ?? c.redirect('/panel/plan/review', 303)
  }
  if (planId !== '') {
    const linked = await editPlanItem(c.env.DB, org, planId, Number(f.get('index')), { asset: `f:${id}` })
    await setFlash(c.env, c.req.raw, linked.ok ? { kind: 'ok', text: 'رُفعت الصورة وحُفظت في الأصول، وربطت بالبند.' } : { kind: 'bad', text: linked.reason })
    return c.redirect('/panel/client#board', 303)
  }
  await setFlash(c.env, c.req.raw, { kind: 'ok', text: 'رُفعت الصورة وحُفظت في الأصول.' })
  return c.redirect('/panel/assets', 303)
})

/** معاينةُ المرفوع خلف الجلسة وبمنظّمتها — والمولَّدةُ من `/panel/media/:id`. */
/**
 * **الصورةُ لا تتبدّل بمعرّفها، فتُحفظ في المتصفّح ولا تُطلب ثانية** (D-333).
 *
 * كانت كلُّ صورةٍ تُحفظ ساعةً ثمّ تُجلب من R2 من جديد بحجمها كلِّه — ولوحةُ شهرٍ تحمل عشراتِ الصور. والبايتاتُ **تُكتب مرّةً واحدة**
 * لكلّ مفتاح (`r2_key` فريد، و«بدّلها» والنهائيّةُ صفٌّ جديدٌ بمعرّفٍ جديد)، فالمعرّفُ يكفي وسمًا لها:
 *
 * - `ETag` المعرّفُ نفسُه، و`If-None-Match` يطابقه يُردّ ‏304 **قبل أن يُقرأ R2** — بعد فحص الجلسة والمنظّمة كما في كلّ طلب.
 * - `Cache-Control: private, max-age=31536000, immutable`: خاصٌّ بمتصفّح المالك (لا وسيطَ مشتركًا يخزّن ما خلف جلسة)، وسنةً بلا سؤال.
 */
/** نموذجُ اختيارٍ من المكتبة يعود إلى بطاقة الخطّة: `toPlanCard` تقرأ `back=plan`. */
function withBack(form: FormData): FormData {
  form.set('back', 'plan')
  return form
}

/**
 * **«استعملها لهذا المنشور»** (D-334): صورةٌ من المكتبة تُربط بمنشورٍ مكتوب — والحكمُ كلُّه في `attachToPost` (الحال، والمنظّمة، وأنّها صورة).
 */
media.post('/panel/plan/review/image', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const post = String(gate.form.get('post') ?? '')
  const ref = String(gate.form.get('ref') ?? '')
  const done = await attachToPost(c.env.DB, org, post, ref, (m) => rejectMedia(c.env.DB, org, m))
  await record(c.env.DB, { actor: 'panel', action: 'plan.review.image', target: post, detail: done.ok ? ref.slice(0, 80) : ('refused:' + done.reason).slice(0, 200) }, c.req.raw)
  await setFlash(c.env, c.req.raw, done.ok
    ? { kind: 'ok', text: 'رُبطت «' + done.name + '» بالمنشور من مكتبتك — بلا كلفة.' }
    : { kind: 'bad', text: done.reason })
  return toPlanCard(withBack(gate.form)) ?? c.redirect('/panel/plan/review', 303)
})

/**
 * **«فضّلها» و«احفظ الوسوم»** (D-347): علامةُ المالك على أصلٍ في مكتبته — والحكمُ في `markAsset` (المنظّمة، وأنّ له كائنًا). وتعود إلى
 * العرض نفسِه: `back` نصُّ استعلامٍ يُفحص حرفًا حرفًا قبل أن يُكتب في العنوان.
 */
media.post('/panel/assets/mark', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const f = gate.form
  const ref = String(f.get('ref') ?? '')
  const fav = f.get('fav')
  const tags = f.get('tags')
  const done = await markAsset(c.env.DB, activeOrg(gate.session.record), ref, {
    ...(fav === '1' || fav === '0' ? { favourite: fav === '1' } : {}),
    ...(typeof tags === 'string' ? { tags } : {}),
  })
  await record(c.env.DB, { actor: 'panel', action: 'library.mark', target: ref.slice(0, 120), detail: done.ok ? (typeof tags === 'string' ? 'tags' : 'favourite') : ('refused:' + done.reason).slice(0, 200) }, c.req.raw)
  if (!done.ok) await setFlash(c.env, c.req.raw, { kind: 'bad', text: done.reason })
  const back = String(f.get('back') ?? '')
  return c.redirect('/panel/assets' + (/^[A-Za-z0-9=&%_.~+-]{1,300}$/.test(back) ? '?' + back : ''), 303)
})

const KEEP = 'private, max-age=31536000, immutable'

/**
 * **المصغَّرةُ إن طُلبت بمقاسها** (D-335): `?w=160|800` على مسارَي الصورة. تُسلَّم WebP من R2 (أو تُصنع وتُحفظ)، بوسمٍ يخصّ المقاس.
 * و`null`: لا مقاسَ طُلب، أو طلبُ مدًى، أو لم تُصنع (بلا ربطٍ، عند السقف، عطل) — فيمضي المسارُ إلى الأصل. **وتُنادى بعد فحص الجلسة والمنظّمة.**
 */
async function small(c: Context<{ Bindings: Env }>, name: string, key: string, mime: string): Promise<Response | null> {
  const width = c.req.header('Range') === undefined ? thumbWidth(c.req.query('w')) : null
  if (width === null) return null
  const tag = tagOf(name + ':w' + String(width))
  const same = unchanged(c.req.raw, tag)
  if (same !== null) return same
  const made = await thumbFor({ bucket: c.env.MEDIA as never, kv: c.env.KV, images: c.env.IMAGES }, key, mime, width)
  if (made === null) return null
  return new Response(made.body as BodyInit, {
    headers: {
      'Content-Length': String(made.size), 'Content-Type': 'image/webp', 'Cache-Control': KEEP, ETag: tag,
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  })
}
/** الأصلُ بدل مصغَّرةٍ لم تُصنع: **ساعةً وبلا وسم** — فيُعاد السؤالُ عنها، ولا تُثبَّت الكاملةُ سنةً تحت عنوان المصغَّرة. */
const keepFor = (c: Context<{ Bindings: Env }>): { 'Cache-Control': string; ETag?: string } | null =>
  c.req.header('Range') === undefined && thumbWidth(c.req.query('w')) !== null ? { 'Cache-Control': 'private, max-age=3600' } : null
const tagOf = (id: string): string => '"' + id.replace(/[^A-Za-z0-9:_-]/g, '') + '"'
function unchanged(request: Request, tag: string): Response | null {
  // ‏طلبُ مدًى (مقطع) يمضي إلى R2: ‏304 للكائن كلِّه لا لجزءٍ منه
  if (request.headers.get('Range') !== null) return null
  const seen = (request.headers.get('If-None-Match') ?? '').split(',').map((t) => t.trim().replace(/^W\//, ''))
  return seen.includes(tag) ? new Response(null, { status: 304, headers: { ETag: tag, 'Cache-Control': KEEP } }) : null
}

media.get('/panel/assets/raw/:ref', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return c.text('غير مصرَّح', 403)
  const found = await rawObject(c.env.DB, activeOrg(session.record), c.req.param('ref'))
  if (found === null) return c.text('لا ملفّ', 404)
  const thumb = await small(c, c.req.param('ref'), found.key, found.mime)
  if (thumb !== null) return thumb
  const tag = tagOf(c.req.param('ref'))
  const same = unchanged(c.req.raw, tag)
  if (same !== null) return same
  // ‏المقطعُ يُطلب بمداه (D-182)، والصورةُ كاملة
  const wanted = parseRange(c.req.header('Range'))
  const object = await c.env.MEDIA.get(found.key, wanted === null ? {} : { range: wanted })
  if (object === null) return c.text('البايتات مفقودة', 404)
  const span = wanted === null ? null : resolveRange(wanted, object.size)
  return new Response(object.body as unknown as BodyInit, {
    status: span === null ? 200 : 206,
    headers: {
      ...(span === null
        ? { 'Content-Length': String(object.size) }
        : { 'Content-Range': `bytes ${span.start}-${span.end}/${object.size}`, 'Content-Length': String(span.end - span.start + 1) }),
      'Accept-Ranges': 'bytes',
      'Content-Type': found.mime,
      ...(keepFor(c) ?? { 'Cache-Control': KEEP, ETag: tag }),
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  })
})

// ── الصور ────────────────────────────────────────────────────────────

/**
 * توليدُ صورةٍ لمنشور.
 *
 * يمرّ بـ `generateForPost` نفسه — بسقوفه وإيقافه وسقفِ مزوّده. **وهو
 * نداءٌ مدفوعٌ بضغطة**، فالزرُّ يُعطَّل بعد الأولى ومفتاحُ عدم التكرار
 * يمنع الثانية إن سبقت.
 */
media.post('/panel/media/generate', (c) => imageRoute(c, false))

/**
 * صورةٌ بديلة بضغطةٍ واحدة — **والقائمةُ لا تُرفَض إلّا إن مرّ التوليد**.
 *
 * كان البديلُ «ارفض» ثمّ «ولّد»: والأولى تقع ولو سقطت الثانيةُ عند سقف،
 * فيبقى المنشورُ بلا صورة. والحارسُ في `generateForPost` لا هنا (D-019).
 */
media.post('/panel/media/regenerate', (c) => imageRoute(c, true))

/**
 * **من بطاقة الخطّة يُعاد إليها** (D-327): «ولّد صورة» و«بدّلها» و«بدون صورة» على بطاقة البند في `/panel/plan/review`، فالعودةُ
 * إلى البطاقة في أسبوعها. والفهرسُ والأسبوعُ يُفحصان قبل أن يُكتبا في العنوان.
 */
function toPlanCard(form: FormData): Response | null {
  if (form.get('back') !== 'plan') return null
  const w = String(form.get('w') ?? '')
  const index = String(form.get('index') ?? '')
  return new Response(null, { status: 303, headers: { Location: '/panel/plan/review' + (/^(?:\d{1,2}|all)$/.test(w) ? '?w=' + w : '') + (/^\d{1,3}$/.test(index) ? '#c-' + index : '') } })
}

async function imageRoute(c: Context<{ Bindings: Env }>, replace: boolean): Promise<Response> {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const id = String(gate.form.get('id') ?? '')
  const old = replace ? String(gate.form.get('media') ?? '') : ''
  // ‏والنمطُ من قائمةٍ مغلقة، وما سواها إنفوجرافيك وهو الافتراض (D-174)
  const style = gate.form.get('style') === 'illustration' ? 'illustration' : 'infographic'

  const outcome = await generateForPost(
    {
      db: c.env.DB,
      bucket: c.env.MEDIA,
      encKey: c.env.TOKEN_ENC_KEY,
      workerSecrets: c.env as unknown as Record<string, string | undefined>,
    },
    id,
    replace ? { replace: old, style, org: activeOrg(gate.session.record) } : { style, org: activeOrg(gate.session.record) },
  )

  // ‏وما لم يُولَّد لم يُرفَض: يُقال ذلك للمالك فلا يبحث عن صورةٍ اختفت
  const kept = replace ? ' والصورة الحاليّة باقية كما هي.' : ''
  const flash: PanelFlash =
    outcome.kind === 'generated'
      ? {
          // **والنصُّ فوق الصورة قد لا يُركَّب لخمسة أسباب** — وسقوطُه كان
          // صامتا، فيُقرأ عطلا في مكانٍ آخر (D-088)
          kind: style === 'infographic' || outcome.note === '' ? 'ok' : 'warn',
          text:
            (style === 'infographic'
              ? `رُسم إنفوجرافيك${replace ? ' بديل' : ''} من نصّ المنشور — ${kb(outcome.bytes)}، الكلفة ${money(outcome.cost)}.`
              : `وُلّدت صورة${replace ? 'ٌ بديلة' : ''} — ${kb(outcome.bytes)}، الكلفة ${money(outcome.cost)}.`) +
            (replace ? ' والسابقة مرفوضة تبقى في الدفتر بكلفتها.' : '') +
            (outcome.note === '' ? '' : style === 'infographic' ? ` ${outcome.note}.` : ` وبلا نصّ فوقها: ${outcome.note}.`),
        }
      : outcome.kind === 'already'
        ? { kind: 'ok', text: 'وُلّدت صورة لهذا النصّ — لم يُنفَق شيء.' }
        : outcome.kind === 'in_progress'
          ? {
              kind: 'warn',
              text: `توليد جار لهذه الصورة منذ ${outcome.since} — انتظره ولا تنقر ثانيةً.`,
            }
          : outcome.kind === 'blocked'
            ? { kind: 'warn', text: `${outcome.reason}.${kept}` }
            : { kind: 'bad', text: `تعذّر التوليد: ${outcome.reason}.${kept}` }

  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: replace ? 'media.regenerate' : 'media.generate',
      target: id,
      // والسببُ مع النوع (D-157): «generated» بلا نصٍّ فوقها كانت تُقرأ نجاحا تامّا
      // ‏والنمطُ في أوّل التفصيل: اسمُ الفعل باقٍ كما تقرؤه الرحلة (D-174)
      detail: `${style} · ${
        outcome.kind === 'generated'
          ? outcome.note === '' ? 'generated' : `generated: ${outcome.note}`
          : 'reason' in outcome ? `${outcome.kind}: ${outcome.reason}` : outcome.kind}`.slice(0, 200),
    },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, flash)
  // ‏والصورةُ المولَّدةُ في بطاقتها: كان المالكُ يعود إلى رأس اللوح والصورةُ عند ‏2442px
  return toPlanCard(gate.form) ?? toCard('d', id)
}

/**
 * تحريكُ الصورة إلى مقطعٍ رأسيّ (D-052).
 *
 * **ولا يُنادى إلّا على صورةٍ معتمَدة**: الفيديو أغلى ما يُنادى في
 * النظام، وتحريكُ ما رُفض إنفاقٌ على ما لن يُنشَر. والحارسُ في الدالّة
 * لا هنا — فمسارٌ ثانٍ ينسخه ينسى شرطا (D-019).
 */
media.post('/panel/media/animate', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const id = String(gate.form.get('id') ?? '')

  const outcome = await animateForPost(
    {
      db: c.env.DB,
      bucket: c.env.MEDIA,
      ai: await bindingFor(c.env, c.env.DB, c.env.TOKEN_ENC_KEY),
      encKey: c.env.TOKEN_ENC_KEY,
      baseUrl: c.env.PUBLIC_BASE_URL,
      org: activeOrg(gate.session.record),
    },
    id,
  )

  const flash: PanelFlash =
    outcome.kind === 'generated'
      ? {
          kind: 'ok',
          text: `وُلّد مقطع رأسيّ — ${kb(outcome.bytes)}. ` +
            'والسعر لم يُقرأ من لوحة Cloudflare بعد، فسُجّل صفرا موسوما.',
        }
      : outcome.kind === 'already'
        ? { kind: 'ok', text: 'لهذا المنشور مقطع من قبل — لم يُنفَق شيء.' }
        : outcome.kind === 'in_progress'
          // **وليس عطلا**: نداءٌ سابقٌ لم يفرغ بعد، والتوليدُ دقائق
          ? {
              kind: 'warn',
              text: `توليد جار لهذا المقطع منذ ${outcome.since} — ` +
                'انتظره ولا تنقر ثانيةً، فالنقرة الثانية كانت تدفع ثانيةً.',
            }
          : outcome.kind === 'blocked'
            ? { kind: 'warn', text: outcome.reason }
            // ‏نفادُ الرصيد مهمّةٌ لا عطل (D-214): يُقال ما تفعله، والتفصيلُ في «ما عليك» ← «تفتح قدرة» (M-30 قدرة، متابعة D-324)
            : outcome.reason.startsWith(NO_CREDIT)
              ? { kind: 'warn', text: 'لم يُحرَّك المقطع: رصيد AI Gateway نفد. أضِف رصيدًا من لوحة Cloudflare، ' +
                  'والخطوات في «تفتح قدرة» من «ما عليك»، تحت «رصيد AI Gateway». ولم يُصرف شيء.' }
              : { kind: 'bad', text: `تعذّر تحريك الصورة: ${outcome.reason}` }

  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'media.animate',
      target: id,
      detail: 'reason' in outcome ? `${outcome.kind}: ${outcome.reason}`.slice(0, 200) : outcome.kind,
    },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, flash)
  return toCard('d', id)
})

/** رفضُ صورة — تبقى بكلفتها ولا تُحذف بايتاتُها. */
media.post('/panel/media/reject', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const id = String(gate.form.get('id') ?? '')
  // ‏والمعرّفُ معرّفُ الصورة، والعودةُ إلى بطاقة منشورها
  const owner = await c.env.DB
    .prepare('SELECT post_id FROM media WHERE id = ? AND org_id = ?')
    .bind(id, activeOrg(gate.session.record))
    .first<{ post_id: string }>()

  const done = await rejectMedia(c.env.DB, activeOrg(gate.session.record), id)
  await record(
    c.env.DB,
    { actor: 'panel', action: 'media.reject', target: id, detail: done ? 'rejected' : 'refused' },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, {
    kind: done ? 'ok' : 'bad',
    text: done ? 'رُفضت الصورة — وتبقى بكلفتها، فما دُفع ثمنُه يُرى.' : 'لا صورة بهذه الحال.',
  })
  return toPlanCard(gate.form) ?? (owner === null ? back('posts') : toCard('d', owner.post_id))
})

/**
 * تسليمُ بايتات الصورة — **خلف الجلسة**.
 *
 * R2 ليس له عنوانٌ عامّ هنا، وهذا مقصود: صورةٌ لمنشورٍ لم يُنشر بعد
 * تكشف ما يُعدّه المالك قبل أن يعلنه. فتُقرأ من الدلو ويُسلَّمها من
 * يملك جلسةً، ولا رابطَ يُشارَك.
 *
 * والمفتاحُ يُقرأ من القاعدة لا من المسار: مسارٌ يُبنى من مدخلٍ يفتح
 * الدلوَ كلَّه لمن يخمّن مفتاحا.
 */
media.get('/panel/media/:id', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return c.text('غير مصرَّح', 403)

  const row = await c.env.DB
    // ‏صورةُ منظّمةٍ لا تُسلَّم من جلسةٍ نشطةٍ في غيرها (D-277)
    .prepare('SELECT r2_key, mime FROM media WHERE id = ? AND org_id = ?')
    .bind(c.req.param('id'), activeOrg(session.record))
    .first<{ r2_key: string; mime: string }>()
  if (row === null) return c.text('لا صورة', 404)
  const thumb = await small(c, c.req.param('id'), row.r2_key, row.mime)
  if (thumb !== null) return thumb
  const tag = tagOf(c.req.param('id'))
  const same = unchanged(c.req.raw, tag)
  if (same !== null) return same

  /*
   * **بثٌّ بمداه لا مخزنٌ كامل** (D-182). كان يُقرأ الكائنُ كلُّه إلى الذاكرة —
   * صحيحٌ لصورةٍ ومقطعٍ مولَّدٍ بخمسَ عشرةَ ثانية، **ويُسقط العاملَ على مقطع المالك**
   * (حتّى ‏500MB وسقفُ الذاكرة ‏128MB) حين يطلبه `<video>` في صفحة المنصّة. فيُقرأ
   * `Range` ويُطلب من R2 مداه وحده، ويُردّ ‏206 به أو ‏200 بالكائن كلِّه بثًّا.
   */
  const wanted = parseRange(c.req.header('Range'))
  if (wanted !== null) {
    const head = await c.env.MEDIA.head(row.r2_key)
    if (head === null) return c.text('البايتات مفقودة', 404)
    if (resolveRange(wanted, head.size) === null) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${head.size}` } })
    }
  }
  const object = await c.env.MEDIA.get(row.r2_key, wanted === null ? {} : { range: wanted })
  if (object === null) return c.text('البايتات مفقودة', 404)
  const span = wanted === null ? null : resolveRange(wanted, object.size)

  return new Response(object.body as unknown as BodyInit, {
    status: span === null ? 200 : 206,
    headers: {
      ...(span === null
        ? { 'Content-Length': String(object.size) }
        : { 'Content-Range': `bytes ${span.start}-${span.end}/${object.size}`, 'Content-Length': String(span.end - span.start + 1) }),
      'Accept-Ranges': 'bytes',
      'Content-Type': row.mime,
      // خاصّةٌ لا عامّة: وسيطٌ مشترك لا يخزّن ما يخصّ جلسة — وسنةً بلا سؤال، فالبايتاتُ لا تتبدّل بمعرّفها (D-333)
      ...(keepFor(c) ?? { 'Cache-Control': KEEP, ETag: tag }),
      'X-Content-Type-Options': 'nosniff',
      // الوسيطُ بايتاتٌ لا صفحة (D-152): لا برمجةَ ولا أصلَ لو جاء نوعٌ غيرُ متوقَّع
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Disposition': `inline; filename="${row.r2_key.split('/').pop() ?? 'media'}"`,
    },
  })
})

// ── مقاطعُ المالك (D-180) ─────────────────────────────────────────────
//
// أربعُ خطوات: «ابدأ» يفحص النوعَ والحجمَ ويفتح رفعًا متعدّدًا، و«قطعة» تدفع ‏20MB،
// و«أكمل» يجمعها، و«انشره» يصنع منشورًا لكلّ منصّة. والثلاثُ الأولى من سكربت اللوحة
// بنموذجٍ يحمل `_csrf` كأيّ نموذج — فتمرّ من `guardPost` نفسِه، ولا حارسَ ثانٍ يُكتب.

const numberOr = (value: string | File | null): number | null => {
  const n = Number(value)
  return value === null || value === '' || !Number.isFinite(n) ? null : n
}

media.post('/panel/uploads/start', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const f = gate.form
  const result = await startUpload(c.env.DB, activeOrg(gate.session.record), c.env.MEDIA, {
    name: String(f.get('name') ?? ''),
    mime: String(f.get('mime') ?? ''),
    bytes: Number(f.get('bytes')),
    width: numberOr(f.get('width')),
    height: numberOr(f.get('height')),
    durationMs: numberOr(f.get('duration_ms')),
  })
  await record(c.env.DB, {
    actor: 'panel', action: 'upload.start', target: result.ok ? result.id : null,
    detail: result.ok ? `${String(f.get('mime'))} · ${String(f.get('bytes'))}` : `refused:${result.reason}`.slice(0, 200),
  }, c.req.raw)
  return Response.json(result, { status: result.ok ? 200 : 400 })
})

media.post('/panel/uploads/:id/part', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const chunk = gate.form.get('chunk')
  if (!(chunk instanceof Blob)) return Response.json({ ok: false, reason: 'قطعة بلا بايتات' }, { status: 400 })
  const result = await uploadPart(c.env.DB, activeOrg(gate.session.record), c.env.MEDIA, c.req.param('id'), Number(gate.form.get('n')),
    await chunk.arrayBuffer())
  return Response.json(result, { status: result.ok ? 200 : 400 })
})

media.post('/panel/uploads/:id/complete', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  let parts: { partNumber: number; etag: string }[] = []
  try {
    const raw = JSON.parse(String(gate.form.get('parts') ?? '[]')) as unknown
    if (Array.isArray(raw)) {
      parts = raw.map((p) => ({ partNumber: Number((p as { partNumber?: unknown }).partNumber), etag: String((p as { etag?: unknown }).etag ?? '') }))
    }
  } catch {
    parts = []
  }
  const id = c.req.param('id')
  const result = await completeUpload(c.env.DB, activeOrg(gate.session.record), c.env.MEDIA, id, parts)
  await record(c.env.DB, {
    actor: 'panel', action: 'upload.complete', target: id,
    detail: result.ok ? `${parts.length} parts` : `refused:${result.reason}`.slice(0, 200),
  }, c.req.raw)
  if (result.ok) await setFlash(c.env, c.req.raw, { kind: 'ok', text: 'رُفع المقطع — اكتب نصَّه واختر منصّاته تحته.' })
  return Response.json(result, { status: result.ok ? 200 : 400 })
})

media.post('/panel/uploads/:id/abort', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  await abortUpload(c.env.DB, activeOrg(gate.session.record), c.env.MEDIA, c.req.param('id'))
  // ‏زرُّ «ألغِ» في المكتبة نموذجٌ لا `fetch` (D-182): يعود إلى «فيديوهاتك» برسالته
  if (gate.form.get('from') === 'library') {
    await record(c.env.DB, { actor: 'panel', action: 'upload.abort', target: c.req.param('id') }, c.req.raw)
    await setFlash(c.env, c.req.raw, { kind: 'ok', text: 'أُلغي الرفع الذي انقطع — ارفع المقطع من جديد.' })
    return back('videos')
  }
  return Response.json({ ok: true })
})

/**
 * «اكتب النصوص» من صفّ المقطع (D-190) — **نداءٌ واحدٌ بضغطة المالك**، بحرّاس الكتابة كلِّها
 * (`captionsFor` ← `writeOnce`)، والكلفةُ في الدفتر قبل أن تُعرَض النصوص. ولا يُنشأ منشور:
 * تُحفظ النصوصُ يومًا في KV وتُرسم في حقولٍ يحرّرها، ثمّ «أنشئ المنشورات» كما كان.
 */
media.post('/panel/uploads/:id/captions', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const id = c.req.param('id')
  const out = await captionsFor(
    {
      db: c.env.DB, encKey: c.env.TOKEN_ENC_KEY, kv: c.env.KV, org: activeOrg(gate.session.record),
      workerSecrets: c.env as unknown as Record<string, string | undefined>,
    },
    id,
    String(gate.form.get('about') ?? ''),
    // ‏«أعد كتابتها» تحمل `at` النصوص التي على الشاشة: تُكتب من جديد مرّةً، وإعادتُها لا تُكلّف
    String(gate.form.get('replace') ?? ''),
  )
  await record(c.env.DB, {
    actor: 'panel', action: 'upload.captions', target: id,
    detail: out.kind === 'written' ? `written · ${money(out.captions.cost)}` : out.kind === 'already' ? 'already' : `${out.kind}:${out.reason}`.slice(0, 200),
  }, c.req.raw)
  const flash: PanelFlash = out.kind === 'written'
    ? {
        kind: Object.keys(captionIssues(out.captions)).length === 0 ? 'ok' : 'warn',
        text: `كُتبت نصوص YouTube وTikTok وInstagram — الكلفة ${money(out.captions.cost)}. راجعها تحت المقطع ثمّ «أنشئ المنشورات».${
          Object.keys(captionIssues(out.captions)).length === 0 ? '' : ' وفي بعضها ما يُصلَح قبل الإنشاء — والسبب تحت حقله.'}`,
      }
    : out.kind === 'already'
      ? { kind: 'ok', text: 'النصوص من هذا الوصف مكتوبة وهي هذه — لم يُنفَق شيء. ولنصوص أخرى «أعد كتابتها» من صفّ المقطع.' }
      : out.kind === 'blocked'
        ? { kind: 'warn', text: out.reason }
        // ‏وما دُفع في المحاولة المردودة يُقال: «تعذّرت» وحدَها تُري أقلَّ ممّا أُنفق
        : {
            kind: 'bad',
            text: `تعذّرت كتابة النصوص: ${out.reason}${out.cost === undefined
              ? ''
              : ` — وكلّفت المحاولة ${money(out.cost)}، والإعادة تدفع ثانيةً`}`,
          }
  await setFlash(c.env, c.req.raw, flash)
  return back(/^[0-9a-f-]{8,}$/.test(id) ? `v-${id}` : 'videos')
})

media.post('/panel/uploads/:id/posts', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const id = c.req.param('id')
  const form = gate.form
  /*
   * ‏**نصٌّ لكلّ منصّةٍ حين كُتبت النصوص** (D-190): الحقولُ الأربعةُ من صفّ المقطع، وما لم
   * ‏يُرسَم منها (منصّةٌ أُنشئ منشورُها) يبقى بما حُفظ. ونموذجٌ قديمٌ بلا `per_platform` يمرّ
   * ‏بنصّه الواحد كما كان.
   */
  const perPlatform = form.get('per_platform') === '1'
  const cached = perPlatform ? await readCaptions(c.env.KV, id) : null
  /*
   * ‏**ومَن كتبها يصل مع النموذج** (D-190): الحقولُ لكلّ منصّةٍ لا تُرسم إلّا لنصوصٍ كتبها
   * ‏النموذج، فإن انتهى يومُها في KV أو سقطت قراءتُها لم تصر نصوصَ المالك. فالمحفوظُ أوّلًا،
   * ‏ثمّ اسمُ النموذج المرسوم مع الحقول بنمطٍ ضيّق، وإلّا علامةٌ تقول «آليٌّ مجهولُ المصدر».
   */
  const sent = String(form.get('caption_model') ?? '')
  const model = cached?.model
    ?? (!perPlatform ? undefined : /^[\w.:/-]{1,80}$/.test(sent) && sent !== 'owner' ? sent : 'captions:unknown')
  const pick = (name: string, prev: string): string => {
    const v = form.get(name)
    return v === null ? prev : String(v)
  }
  const texts = {
    youtubeTitle: pick('title_youtube', cached?.youtubeTitle ?? ''),
    youtubeDescription: pick('caption_youtube', cached?.youtubeDescription ?? ''),
    tiktok: pick('caption_tiktok', cached?.tiktok ?? ''),
    instagram: pick('caption_instagram', cached?.instagram ?? ''),
  }
  const result = await postsFromUpload(c.env.DB, {
    org: activeOrg(gate.session.record),
    uploadId: id,
    platforms: form.getAll('platform').map(String),
    ...(perPlatform
      ? {
          captions: { youtube: texts.youtubeDescription, tiktok: texts.tiktok, instagram: texts.instagram },
          title: texts.youtubeTitle,
        }
      : { caption: String(form.get('caption') ?? '') }),
    approve: form.get('approve') === 'on',
    by: deciderOf(gate.session.record.via),
    // ‏مَن كتبها: النموذجُ وراجعها المالك — فيُقرأ في رحلة المنشور
    ...(model === undefined ? {} : { model }),
    /*
     * ‏**وحصّتُه من كلفة الكتابة** (D-190): نداءٌ واحدٌ كتب للمنصّات الثلاث، فلكلّ منشورٍ ثلثُه
     * ‏في `cost_usd` — كمسوّدة المصدر والفكرة — والدفترُ باسم المقطع فلا يُعَدّ مرّتين. كان
     * ‏`0` بجانب اسم النموذج في محطّة «كُتبت المسوّدة»، وكلفتُها لا تُرى إلّا في مجموع اليوم.
     */
    ...(cached === null ? {} : { cost: cached.cost / VIDEO_PLATFORMS.length }),
  })
  /*
   * ‏وما حرّره المالكُ يبقى في حقوله: إنشاءٌ رُدّ لا يُعيده إلى ما كُتب له — **ولو انتهى يومُ
   * ‏المحفوظ**: كان الحفظُ مشروطًا به، فيعود الصفُّ إلى مربّعٍ واحدٍ فارغ وتضيع الحقولُ الأربعة.
   */
  if (perPlatform) {
    try {
      await saveCaptions(c.env.KV, id, cached !== null
        ? { ...cached, ...texts }
        : { about: '', ...texts, model: model ?? 'captions:unknown', cost: 0, at: new Date().toISOString() })
    } catch (error) {
      // ‏المنشوراتُ كُتبت أو رُدّت بسببها — وحفظُ الحقول تحسينٌ لا يُسقط الإشعار
      console.error({ job: 'upload.posts', captions_save_failed: String(error).slice(0, 200) })
    }
  }
  await record(c.env.DB, {
    actor: 'panel', action: 'upload.posts', target: id,
    detail: result.ok ? `created:${result.created.join(',')} skipped:${result.skipped.join(',')}` : `refused:${result.reason}`.slice(0, 200),
  }, c.req.raw)
  const label = (p: string): string => platformLabel(p)
  /*
   * ‏**وموعدُ «متى؟» مع الاعتماد وحدَه** (D-218): ما أُنشئ الآن معتمَدًا يُجدوَل بـ`scheduleFromUpload`
   * ‏نفسِها التي تجدول من صفّ المقطع، مقصورةً على منصّات هذا الإنشاء.
   */
  const now = new Date()
  const zone = validZone(String(form.get('tz') ?? '')) ?? await ownerZone(c.env.DB, c.req.header('Cookie') ?? null)
  const at = result.ok && result.created.length > 0 && form.get('approve') === 'on'
    ? presetAt(String(form.get('preset') ?? ''), now, zone)
    : null
  const planned = at === null ? null : await scheduleFromUpload(c.env.DB, {
    org: activeOrg(gate.session.record),
    uploadId: id,
    shown: (await c.env.DB
      .prepare(`SELECT p.id, p.platform FROM media m JOIN posts p ON p.id = m.post_id AND p.org_id = m.org_id
                 WHERE m.upload_id = ? AND m.org_id = ?`)
      .bind(id, activeOrg(gate.session.record)).all<{ id: string; platform: string }>()).results
      .filter((r) => (result.ok ? result.created as readonly string[] : []).includes(r.platform)).map((r) => r.id),
    accounts: await listAccounts(c.env.DB, activeOrg(gate.session.record)),
    at,
    now,
  })
  const plannedReach = planned === null ? null : privateReach(planned.scheduled, await reachNow(c.env.DB, activeOrg(gate.session.record)))
  if (planned !== null) {
    await record(c.env.DB, {
      actor: 'panel', action: 'upload.schedule', target: id,
      detail: `scheduled:${planned.scheduled.join(',')} failed:${planned.failed.length}`,
    }, c.req.raw)
  }
  // ‏عنوانُ YouTube فوق حدّه يُقصّ عند الرفع (ر-4): يُقال الآن بما سيُرفع، لا يُكتشف في القناة
  const cut = result.ok && !perPlatform && result.created.includes('youtube') ? cutTitle(String(form.get('caption') ?? '')) : null
  // ‏ومنصّةٌ غيرُ متّصلةٍ يُنشأ منشورُها ولا يُجدوَل: يُقال الآن لا عند الجدولة (D-190)
  const links = result.ok ? linkStates(await listAccounts(c.env.DB, activeOrg(gate.session.record))) : {}
  const unlinked = result.ok ? result.created.filter((p) => links[p] !== 'linked') : []
  // ‏والموعدُ الذي اختاره المالكُ لا يسقط بلا كلمة (D-314): بلا «اعتمده الآن» لا يُقرأ، ومع اعتمادٍ تعذّرت جدولتُه كلُّها يُقال لماذا
  const approved = form.get('approve') === 'on'
  const asked = String(form.get('preset') ?? '') !== ''
  const noneScheduled = planned !== null && planned.scheduled.length === 0 && planned.failed.length > 0
  await setFlash(c.env, c.req.raw, !result.ok
    ? { kind: 'bad', text: `لم يُنشأ منشور: ${result.reason}` }
    : result.created.length === 0
      ? { kind: 'bad', text: `موجود من قبل على ${result.skipped.map(label).join(' و')} — لا يُكرَّر.` }
      : {
          kind: cut === null && unlinked.length === 0 && (planned === null || planned.failed.length === 0) && !(asked && !approved) ? 'ok' : 'warn',
          text: `أُنشئ على ${result.created.map(label).join(' و')}${planned !== null && at !== null && planned.scheduled.length > 0
            ? ` وجُدول ${momentLabel(at, zone, now)}${zoneNote(zone)}.${planned.failed.length === 0 ? '' : ` وتعذّرت جدولة ${planned.failed.map((f) => `${label(f.platform)}: ${f.reason}`).join('؛ ')}.`}${plannedReach === null ? '' : ` ${plannedReach}`}`
            : noneScheduled
              ? ' معتمَدًا ولم يُجدوَل: تعذّرت جدولة ' + planned!.failed.map((f) => label(f.platform) + ': ' + f.reason).join('؛ ') + '.'
              : approved
                ? ' معتمَدًا — جدوِله تحت المقطع بموعد واحد، أو من بطاقة كلّ.'
                : asked
                  ? ' مسوّدةً تنتظر اعتمادك، ولم يُجدوَل: الموعد يُقرأ مع «اعتمده الآن» وحده.'
                  : ' مسوّدةً تنتظر اعتمادك.'}${cut === null
            ? ''
            : ` وعنوان YouTube أطول ممّا تقبله فيُرفع مقصوصًا: «${cut}».`}${unlinked.length === 0 || planned !== null
            ? ''
            : ` ولا حساب متّصلًا على ${unlinked.map(label).join(' و')}: لا يُجدوَل حتّى تربطه.`}`,
        })
  // ‏ويعود إلى صفّ المقطع نفسِه: عليه روابطُ منشوراته وزرُّ جدولتها
  return back(/^[0-9a-f-]{8,}$/.test(id) ? `v-${id}` : 'videos')
})

/**
 * «جدوِل منشوراتِه معًا» من صفّ المقطع (ر-4) — **الموعدُ يُحسب هنا بتوقيت المالك** من
 * كعكة `sada_tz` (D-173)، والجدولةُ من `schedulePost` لكلّ منشورٍ في `scheduleFromUpload`
 * (D-019). ولا طلبَ خارجيَّ ولا كلفة: الطابورُ يخرج بها في موعدها بمفاتيحها (D-004).
 */
media.post('/panel/uploads/:id/schedule', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const id = c.req.param('id')
  const now = new Date()
  // ‏بالمنطقة التي قالها السطرُ فوق الأزرار (D-202)، وإلّا منطقةُ المالك
  const zone = validZone(String(gate.form.get('tz') ?? '')) ?? await ownerZone(c.env.DB, c.req.header('Cookie') ?? null)
  const at = presetAt(String(gate.form.get('preset') ?? ''), now, zone)
  const result = at === null ? null : await scheduleFromUpload(c.env.DB, {
    org: activeOrg(gate.session.record),
    uploadId: id,
    shown: gate.form.getAll('post').map(String),
    accounts: await listAccounts(c.env.DB, activeOrg(gate.session.record)),
    at,
    now,
  })
  const names = (list: readonly string[]): string => [...new Set(list)].map((p) => platformLabel(p)).join(' و')
  const failed = result === null ? '' : result.failed.map((f) => `${platformLabel(f.platform)}: ${f.reason}`).join('؛ ')
  const reach = result === null ? null : privateReach(result.scheduled, await reachNow(c.env.DB, activeOrg(gate.session.record)))
  const flash: PanelFlash = at === null || result === null
    ? { kind: 'bad', text: 'لم يُجدوَل شيء: موعد لا أعرفه — اختر أحد أزرار الموعد.' }
    : result.scheduled.length === 0
      ? { kind: 'bad', text: `لم يُجدوَل شيء. ${failed === '' ? 'لا منشور معتمَدًا بلا موعد من هذا المقطع الآن.' : `تعذّر ${failed}.`}` }
      : {
          kind: result.failed.length === 0 ? 'ok' : 'warn',
          text: `جُدول على ${names(result.scheduled)} ${momentLabel(at, zone, now)}${zoneNote(zone)}.`
            + (failed === '' ? '' : ` وتعذّر ${failed}.`)
            + (reach === null ? '' : ` ${reach}`),
        }
  await record(c.env.DB, {
    actor: 'panel', action: 'upload.schedule', target: id,
    detail: result === null ? 'refused:preset' : `scheduled:${result.scheduled.join(',')} failed:${result.failed.length}`,
  }, c.req.raw)
  await setFlash(c.env, c.req.raw, flash)
  return back(/^[0-9a-f-]{8,}$/.test(id) ? `v-${id}` : 'videos')
})

/**
 * **قرارُ المالك حين تنفد الحصّةُ المجّانيّة** (D-285): «ارسمها الآن بالدفع» يُسجَّل إذنًا لليوم ثمّ تُرسَم المنتظرةُ
 * في الخلفيّة بأسعارها؛ و«انتظر للغد» يُسجَّل فيختفي السؤالُ اليوم، ويرسمها المسحُ بعد تجدّد الحصّة. والقرارُ في السجلّ.
 */
media.post('/panel/images/quota', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const org = activeOrg(gate.session.record)
  const pay = gate.form.get('decision') === 'pay'
  const waiting = await waitingImages(c.env.DB, org)
  await record(c.env.DB, { actor: 'panel', action: pay ? 'image.overage.approve' : 'image.overage.wait', target: null, detail: String(waiting.length) + ' صورة', org }, c.req.raw)
  if (pay && waiting.length > 0) {
    const job = resumeWaiting(
      { db: c.env.DB, bucket: c.env.MEDIA, encKey: c.env.TOKEN_ENC_KEY, workerSecrets: c.env as unknown as Record<string, string | undefined> },
      org, 'today', true,
    ).catch(() => 0)
    try { c.executionCtx.waitUntil(job) } catch { /* لا سياقَ تنفيذٍ خارج Worker */ }
  }
  await setFlash(c.env, c.req.raw, pay
    ? { kind: 'ok', text: 'تُرسَم ' + String(waiting.length) + ' صورةً الآن بأسعارها — تظهر على مسوّداتها خلال دقائق.' }
    : { kind: 'ok', text: 'تنتظر الصورُ تجدّدَ الحصّة (03:00 بتوقيت الرياض)، ويرسمها صدى بعدها وحدَه.' })
  return back('posts')
})
