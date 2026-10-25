/**
 * مسارات اللوحة — المسوّدات: كتابةٌ وقرارٌ وجدولةٌ وتوزيع.
 *
 * جزءٌ من `panel.ts` قُسم على أقسامه (D-278) بلا تغييرٍ في سلوك.
 */
import { Hono, type Context } from 'hono'
import type { Env } from '../../env'
import { draftFromIdea, draftPost, ideaProblem, type DraftOutcome } from '../../lib/draft/job'
import { PLATFORMS, type Platform } from '../../lib/draft/prompt'
import { approveMany, decide, listDrafts, saveText, undoApprove, undoReject } from '../../lib/draft/store'
import { counted, NOUNS, money, parseSqliteUtc } from '../../lib/format'
import { platformLabel } from '../../lib/oauth/providers'
import { soloNav } from '../ui/rail'
import { buildCommands } from '../ui/command'
import { generateForPost, mediaFor } from '../../lib/image/job'
import {
  requeue, reschedulePost, schedulePost, unschedule, type ScheduleResult,
} from '../../lib/schedule/job'
import { missingMedia } from '../../lib/schedule/media'
import { GAP_MAX_HOURS, GAP_MIN_HOURS, planSpread } from '../../lib/schedule/spread'
import { getProvider } from '../../lib/providers'
import { activeOrg } from '../../lib/tenancy'
import { loadSession } from '../../lib/session'
import { isLinkedInPage, linkStates, listAccounts } from '../../lib/channels'
import { clock, dayLabel, localParts, validZone, zoneNote } from '../../lib/time/zone'
import { ownerZone } from '../../lib/time/ownerZone'
import { backTo } from '../../lib/nav/back'
import { autoImageRoom } from '../../lib/image/auto'
import { privateReach } from '../../lib/media/uploads'
import { localToUtc, presetAt } from '../../lib/time/local'
import { soloPage } from '../ui/shell'
import { spreadScreen } from '../ui/spreadView'
import { record } from '../../lib/audit'
import { type PanelFlash } from '../panelView'
import {
  deciderOf, page, loginResponse, setFlash, guardPost, reachNow, back, toCard, POST_ID, BOARD,
} from './shared'

export const drafts = new Hono<{ Bindings: Env }>()

/**
 * ‏**وفعلٌ من المحرّر يعود إلى المحرّر** (D-198): `?open=<id>` والمرساةُ قسمُه فيه («#ed» رأسُه،
 * ‏«#ed-when» موعدُه). والمعرّفُ يُفحَص كما في `toCard`.
 */
function toEditor(id: string, part: 'ed' | 'ed-when' = 'ed'): Response {
  return POST_ID.test(id)
    ? new Response(null, { status: 303, headers: { Location: `/panel?open=${id}#${part}` } })
    : back('posts')
}

/** أجاء النموذجُ من المحرّر؟ حقلٌ مخفيٌّ فيه وحدَه، فالبطاقةُ والإشعارُ يعودان كما كانا. */
function fromEditor(form: FormData): boolean {
  return form.get('from') === 'editor'
}

/**
 * ‏الموعدُ من نموذج المحرّر (D-198) — **زرٌّ تحسبه الخادمُ بتوقيت المالك، أو يومٌ وساعةٌ بتوقيته**،
 * ‏ثمّ `when` بـ UTC كما يرسله شريطُ البطاقة. فالجدولةُ تقرأ صيغةً واحدة، ولا يُحسَب في رأس أحد.
 */
function readWhen(form: FormData, cookieZone: string | null, now: Date): string {
  // ‏الحقلُ يُقرأ بالمنطقة التي قالتها لصيقتُه (D-202): «بتوقيت الرياض» في أوّل زيارة
  // ‏تعني الرياض وإن كتب المتصفّحُ كعكتَه بين العرض والإرسال
  const zone = validZone(String(form.get('tz') ?? '')) ?? cookieZone
  const preset = String(form.get('preset') ?? '')
  const iso = (d: Date | null): string => d === null ? '' : d.toISOString().slice(0, 16)
  if (preset !== '' && preset !== 'custom') return iso(presetAt(preset, now, zone))
  const local = String(form.get('local') ?? '')
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local)
  if (preset === 'custom' || m !== null) return m === null ? '' : iso(localToUtc(+m[1]!, +m[2]!, +m[3]!, +m[4]!, +m[5]!, zone))
  return String(form.get('when') ?? '')
}

/**
 * ‏**ولا يُنزَل إلى بطاقةٍ لم تُرسَم** (مراجعة ر-8).
 *
 * ‏اللوحةُ ترسم أحدثَ ‏`BOARD` منشورًا بتاريخ إنشائها، والإعادةُ لا تمسّ التاريخ. فمنشورٌ فشل
 * ‏قبل أسابيع — أو بعد خطّةٍ بمئتي صفّ — لا مرساةَ له، و`show()` لا تجد شيئًا فترتدّ إلى
 * ‏الرئيسيّة وإشعارُها يقول «اختر له موعدًا» ولا نموذج. فالبطاقةُ إن كانت في النافذة نفسِها
 * ‏التي تقرؤها اللوحة — **بـ`listDrafts` ذاتِها لا بعدٍّ يقاربها** — وإلّا فالمسارُ يختار غيرَها.
 */
async function onBoard(db: Env['DB'], org: string, id: string): Promise<boolean> {
  return (await listDrafts(db, org, BOARD)).some((d) => d.id === id)
}

/** ‏رحلةُ المنشور — موضعٌ يُرسَم لكلّ منشورٍ أيًّا كان عمرُه (D-104). */
function toJourney(id: string): Response {
  return /^[0-9a-f-]{8,}$/.test(id)
    ? new Response(null, { status: 303, headers: { Location: `/panel/journey/${id}` } })
    : back('posts')
}

/**
 * موعدٌ كما يقرؤه المالك — **بتوقيته، وUTC بجانبه نصًّا ثانويًّا** (الخطّة 8.2 و8.3).
 *
 * كان إشعارُ الجدولة «في 2026-10-05 06:00:00 UTC» لمن ضغط «غدا 9ص» في الرياض: الردُّ
 * الوحيدُ على فعله ساعةٌ أخرى بالثواني، فيبدو ما حُفظ خطأً. **والمنطقةُ من كعكة
 * `sada_tz`** (D-173)؛ وإن غابت فبتوقيت الرياض وتُقال صراحةً (D-201).
 */
function ownerWhen(at: string, zone: string | null, now: Date): string {
  const date = parseSqliteUtc(at)
  if (date === null) return at
  const year = localParts(date, zone).year !== localParts(now, zone).year
  const local = `${dayLabel(date, zone, year)} ${clock(date, zone)}`
  return `${local}${zoneNote(zone)}`
}

/**
 * **صورةٌ مع كلّ مسوّدة** (GROWTH-PLAN م-٣، D-255) — إن رفعه المالك، وبما بقي من سقف اليوم.
 *
 * تُرسم **في الخلفيّة بعد الردّ** (`waitUntil`): المسوّدةُ لا تنتظر نداءً ثانيًا. والحارسُ في `generateForPost`
 * كما هو (D-019): الإيقافُ وسقفُ الإنفاق ومفتاحُ التكرار والدفتر. والسقفُ هنا **بالعدد** فوق المال، ويُعدّ فيه
 * كلُّ صورةٍ وُلّدت اليوم آليّةً أو بزرّ، فلا يتجاوزه المالكُ دون أن يدري. ويُعاد كم صورةً بدأت.
 */
async function autoImages(c: Context<{ Bindings: Env }>, org: string, ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0
  const batch = ids.slice(0, await autoImageRoom(c.env.DB, org))
  if (batch.length === 0) return 0
  const deps = {
    db: c.env.DB, bucket: c.env.MEDIA, encKey: c.env.TOKEN_ENC_KEY,
    workerSecrets: c.env as unknown as Record<string, string | undefined>,
  }
  const work = Promise.all(batch.map((id) => generateForPost(deps, id, { style: 'infographic', org })
    .catch((error: unknown) => console.warn({ job: 'auto-image', post: id, failed: String(error) }))))
  try {
    c.executionCtx.waitUntil(work)
  } catch {
    // ‏بلا سياق تنفيذ (الاختبار): يُنتظَر هنا
    await work
  }
  return batch.length
}

// ── الكتابة والبَتّ ──────────────────────────────────────────────────

/**
 * كتابةُ مسوّدة من اللوحة.
 *
 * يمرّ بـ `draftPost` نفسه — بسقوفه وإيقافه وسقفِ مزوّده: **زرٌّ في صفحةٍ
 * ليس طريقا جانبيّا حول الحارس** (D-019). ولا يُنشئ شيئا بحالةٍ غير
 * `draft`، فلا يمسّ D-009 من قريبٍ ولا بعيد.
 */
drafts.post('/panel/drafts/write', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const form = gate.form

  const id = String(form.get('id') ?? '')
  const raw = String(form.get('platform') ?? '')
  // منصّةٌ لا نعرفها لا تُمرَّر إلى القاعدة لتردَّها بقيدٍ غامض
  /*
   * **والقائمةُ من المواصفة لا من شرطٍ يُكتب حرفا** (D-092).
   *
   * كانت منصّتان مكتوبتين هنا وفي `<select>` هناك، **وثالثةٌ تُضاف
   * فتُنسى إحداهما** — وهي علّةُ `KNOWN_TASKS` نفسُها (D-091).
   */
  if (!(raw in PLATFORMS)) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'منصّة غير معروفة' })
    return back('write')
  }
  const platform = raw as Platform

  /*
   * ومزوّد يُختار لهذه الكتابة وحدها (D-244). واسمه يطابَق على صفّ قائم في
   * `providers` ولا يمرَّر: حقل في نموذج يرسله المتصفّح، واسم مخترَع يسقط
   * ويعود التوجيه المحفوظ — فلا يُفتَح باب إنفاق باسم يكتبه المرسل.
   */
  const wanted = String(form.get('provider') ?? '').trim()
  const chosen = wanted === '' ? null : await getProvider(c.env.DB, wanted)
  const provider = chosen === null ? undefined : chosen.name

  const outcome = await draftPost(
    { db: c.env.DB, encKey: c.env.TOKEN_ENC_KEY, workerSecrets: c.env as unknown as Record<string, string | undefined> },
    id,
    platform,
    provider,
  )

  const flash: PanelFlash =
    outcome.kind === 'drafted'
      ? {
          kind: 'ok',
          text: `كُتبت مسوّدة ${PLATFORMS[platform].label}${provider === undefined ? '' : ` بـ${provider}`} — ${outcome.length} محرفا، الكلفة ${money(outcome.cost)}.${
            (await autoImages(c, activeOrg(gate.session.record), [outcome.postId])) > 0 ? ' وتُرسم صورتُها الآن.' : ''}`,
        }
      : outcome.kind === 'already'
        // ‏والمسوّدةُ القائمةُ أمامه لا في مكانٍ يبحث عنه — والمرفوضةُ لا تُعدّ قائمة (job.ts)
        ? { kind: 'ok', text: `مسوّدة ${PLATFORMS[platform].label} من هذه النسخة موجودة وهي هذه — لم يُنفَق شيء.` }
        : outcome.kind === 'blocked'
          ? { kind: 'warn', text: outcome.reason }
          : outcome.kind === 'not_analyzed'
            ? { kind: 'warn', text: outcome.reason }
            : {
                kind: 'bad',
                text: `تعذّرت الكتابة: ${outcome.reason}${outcome.cost === undefined
                  ? ''
                  : ` — ودُفع ثمن المحاولة المردودة ${money(outcome.cost)}، والإعادة تدفع ثانيةً`}`,
              }

  await record(
    c.env.DB,
    { actor: 'panel', action: 'draft.write', target: `${id}:${platform}`, detail: outcome.kind },
    c.req.raw,
  )
  // ‏و«موجودةٌ وهي هذه» لمسوّدةٍ خارجَ النافذة — كُتبت من النسخة نفسِها قبل أسابيع — لا بطاقةَ لها:
  // ‏فرحلتُها تُريها بنصّها وحالها، والإشعارُ لا يُكتب لصفحةٍ لا تقرؤه فيظهر بعدها في غير موضعه
  if (outcome.kind === 'already' && !(await onBoard(c.env.DB, activeOrg(gate.session.record), outcome.postId))) return toJourney(outcome.postId)
  await setFlash(c.env, c.req.raw, flash)
  // ‏والمسوّدةُ الجديدةُ في بطاقتها لا عند رأس اللوح، وما لم يُكتب يعود إلى نموذج الكتابة
  return outcome.kind === 'drafted' || outcome.kind === 'already' ? toCard('d', outcome.postId) : back('write')
})

/**
 * «اكتب من فكرتك» (D-190) — **جملةٌ أو كلماتٌ ← مسوّدةٌ لكلّ منصّةٍ مكتوبةٍ اختارها المالك**.
 *
 * نداءٌ لكلّ منصّةٍ بـ `draftFromIdea`، بحرّاس `draftPost` كلِّها (`writer.ts`): الإيقافُ
 * والسقفان وسقفُ المزوّد، والكلفةُ قبل المسوّدة، ومفتاحٌ من بصمة الفكرة ومنصّتها. وحاجزٌ
 * بلغه الأوّلُ يوقف الثاني فلا يُسأل مرّتين. **ثمّ يعود المالكُ إلى أوّل بطاقةٍ جديدة**،
 * لا إلى رأس اللوح — ومعه ما لا يُجدوَل منها لأنّ منصّتَه غيرُ متّصلة.
 */
const IDEA_PLATFORMS: readonly Platform[] = ['linkedin', 'x']

drafts.post('/panel/drafts/idea', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const form = gate.form
  const idea = String(form.get('idea') ?? '')
  const asked = form.getAll('platform').map(String)
  const chosen = IDEA_PLATFORMS.filter((p) => asked.includes(p))
  if (chosen.length === 0) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: 'اختر منصّةً واحدةً على الأقلّ — LinkedIn أو X.' })
    return back('idea')
  }

  // ‏فكرةٌ فارغةٌ أو طويلة تُردّ مرّةً قبل أيّ نداء، لا مرّةً لكلّ منصّة
  const problem = ideaProblem(idea)
  if (problem !== null) {
    await setFlash(c.env, c.req.raw, { kind: 'bad', text: problem })
    return back('idea')
  }

  const deps = { db: c.env.DB, encKey: c.env.TOKEN_ENC_KEY, workerSecrets: c.env as unknown as Record<string, string | undefined>, org: activeOrg(gate.session.record) }
  const done: { platform: Platform; outcome: DraftOutcome }[] = []
  for (const platform of chosen) {
    const outcome = await draftFromIdea(deps, idea, platform)
    done.push({ platform, outcome })
    // ‏حاجزٌ (إيقافٌ أو سقف) يحجز الثانيةَ كما حجز الأولى — فلا يُسأل مرّتين
    if (outcome.kind === 'blocked') break
  }
  await record(
    c.env.DB,
    { actor: 'panel', action: 'draft.idea', target: chosen.join(','), detail: done.map((d) => `${d.platform}:${d.outcome.kind}`).join(' ') },
    c.req.raw,
  )

  const label = (p: string): string => platformLabel(p)
  const names = (list: readonly { platform: string }[]): string => list.map((x) => label(x.platform)).join(' و')
  const drafted = done.filter((d): d is { platform: Platform; outcome: Extract<DraftOutcome, { kind: 'drafted' }> } => d.outcome.kind === 'drafted')
  const already = done.filter((d): d is { platform: Platform; outcome: Extract<DraftOutcome, { kind: 'already' }> } => d.outcome.kind === 'already')
  const stopped = done.filter((d) => d.outcome.kind === 'blocked' || d.outcome.kind === 'failed' || d.outcome.kind === 'not_analyzed')
  const spent = drafted.reduce((sum, d) => sum + d.outcome.cost, 0)
  // ‏ما كُتب لمنصّةٍ غيرِ متّصلة يُعتمَد ولا يُجدوَل: يُقال الآن لا عند الجدولة (D-190)
  const links = linkStates(await listAccounts(c.env.DB, activeOrg(gate.session.record)))
  const unlinked = [...drafted, ...already].filter((d) => links[d.platform] !== 'linked')
  const parts: string[] = []
  if (drafted.length > 0) {
    parts.push(`كُتبت من فكرتك ${drafted.length === 1 ? 'مسوّدة' : 'مسوّدتا'} ${names(drafted)} — الكلفة ${money(spent)}.`)
    const drawn = await autoImages(c, activeOrg(gate.session.record), drafted.map((d) => d.outcome.postId))
    if (drawn > 0) parts.push(`وتُرسم ${drawn === 1 ? 'صورتُها' : `${drawn} صور`} الآن.`)
  }
  if (already.length > 0) parts.push(`${already.length === 1 ? 'ومسوّدة' : 'ومسوّدتا'} ${names(already)} من هذه الفكرة موجودة — لم يُنفَق عليها شيء.`)
  for (const d of stopped) {
    const why = (d.outcome as { reason: string }).reason
    // ‏ومحاولةٌ رُدّ جوابُها بعد أن دُفع ثمنُه تُقال بكلفتها: كان الرقمُ الوحيدُ في الإشعار أقلَّ ممّا أُنفق
    const paid = d.outcome.kind === 'failed' ? d.outcome.cost : undefined
    parts.push(d.outcome.kind === 'blocked'
      ? `${why}.`
      : `تعذّرت ${label(d.platform)}: ${why}${paid === undefined ? '' : ` — ودُفع ثمن المحاولة المردودة ${money(paid)}، والإعادة تدفع ثانيةً`}.`)
  }
  if (unlinked.length > 0) parts.push(`ولا حساب متّصلًا على ${names(unlinked)}: تُعتمَد ولا تُجدوَل حتّى تربطه.`)
  const flash: PanelFlash = {
    kind: stopped.some((d) => d.outcome.kind === 'failed')
      ? (drafted.length + already.length > 0 ? 'warn' : 'bad')
      : stopped.length > 0 || unlinked.length > 0 ? 'warn' : 'ok',
    text: parts.join(' '),
  }

  /*
   * ‏إلى أوّل بطاقةٍ جديدة — وما كُتب من قبل خارجَ النافذة إلى رحلته (كـ «اكتب مسوّدة»)، **حين
   * ‏لا شيءَ غيرُه يُقال**: رحلةُ المنشور لا تقرأ الإشعار، فكان فشلُ X المدفوعُ و«لا حسابَ
   * ‏متّصلًا» يضيعان مع قديمٍ لـ LinkedIn خارجَ اللوح. وما يُقال يعود إلى البطاقة إن كانت في
   * ‏اللوح، وإلّا إلى «اكتب من فكرتك» حيث يُقرأ.
   */
  const first = drafted[0]?.outcome.postId ?? already[0]?.outcome.postId
  if (first === undefined) {
    await setFlash(c.env, c.req.raw, flash)
    return back('idea')
  }
  const onlyAlready = drafted.length === 0 && stopped.length === 0 && unlinked.length === 0
  const shown = await onBoard(c.env.DB, activeOrg(gate.session.record), first)
  if (onlyAlready && !shown) return toJourney(first)
  await setFlash(c.env, c.req.raw, flash)
  return shown ? toCard('d', first) : back('idea')
})

/**
 * البَتُّ في مسوّدة — **وهو القرار الذي يفتح بابَ النشر.**
 *
 * يُسجَّل في `audit_log` بمعرّف المسوّدة وحالتها الجديدة: D-009 يشترط
 * موافقةً بشريّة، وموافقةٌ بلا أثرٍ يُقرأ لا تُراجَع بعد شهر.
 */
drafts.post('/panel/drafts/decide', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const form = gate.form

  const id = String(form.get('id') ?? '')
  const wants = String(form.get('do') ?? '')
  const editor = fromEditor(form)
  const now = new Date()
  const zone = await ownerZone(c.env.DB, c.req.header('Cookie') ?? null)

  /*
   * ‏«احفظ» في المحرّر (D-198): النصُّ يُكتب والمسوّدةُ تبقى تنتظر قرارك، **والفحصُ فحصُ الاعتماد**
   * ‏(`saveText`)، فلا يُحفَظ ما سيُردّ عند الاعتماد. ويعود إلى المحرّر نفسِه.
   */
  if (wants === 'save') {
    const saved = await saveText(c.env.DB, activeOrg(gate.session.record), id, String(form.get('text') ?? ''))
    /*
     * ‏**والحفظُ التلقائيّ** (D-233، من Notion): المحرّرُ يرسل النصَّ نفسَه بعد ثانيةٍ ونصف من آخر حرف، بـ`auto=1`،
     * ‏فيُردّ عليه بسطرٍ لا بتحويل: لا إشعارَ يملأ الشاشة كلَّ جملة، ولا سطرَ تدقيقٍ لكلّ توقّف. والفحصُ فحصُ الاعتماد نفسُه.
     */
    if (form.get('auto') === '1') {
      return saved.ok ? c.json({ ok: true }) : c.json({ ok: false, reason: saved.reason }, 422)
    }
    await record(c.env.DB, { actor: 'panel', action: 'draft.save', target: id, detail: saved.ok ? 'saved' : `refused:${saved.reason}` }, c.req.raw)
    await setFlash(c.env, c.req.raw, saved.ok
      ? { kind: 'ok', text: 'حُفظ النصّ، وما زالت تنتظر قرارك.' }
      : { kind: 'bad', text: `لم يُحفظ: ${saved.reason}` })
    return editor ? toEditor(id) : toCard('d', id)
  }

  /*
   * ‏النصُّ المرسَل هو المعروض: تُقارنه `decide` بالمحفوظ فتعرف أعُتمد كما كُتب أم بعد تعديل.
   * ‏**و«اعتمد» على البطاقة المختصرة بلا مربّع** (D-198): البطاقةُ تعرض ثلاثةَ أسطرٍ لا مربّعًا،
   * ‏فيُعتمَد المحفوظُ كما هو، كما في «اعتمدها كما كُتبت» (`approveMany`).
   */
  let text = ''
  if (wants !== 'reject') {
    const sent = form.get('text')
    text = sent === null
      ? (await c.env.DB.prepare('SELECT text FROM posts WHERE id = ? AND org_id = ?')
          .bind(id, activeOrg(gate.session.record)).first<{ text: string }>())?.text ?? ''
      : String(sent)
  }
  const result = await decide(
    c.env.DB, activeOrg(gate.session.record),
    id,
    wants === 'reject' ? { kind: 'reject' } : { kind: 'approve', text },
    deciderOf(gate.session.record.via),
  )

  /*
   * ‏«اعتمد وجدوِل» (D-198): بعد الاعتماد وحده، **وبـ`schedulePost` نفسِها** بحسابها وموعدها من
   * ‏النموذج، فالحارسُ واحد (D-019) والاعتمادُ مسجَّلٌ قبلها (D-009).
   */
  let scheduled: ScheduleResult | null = null
  if (result.ok && result.status !== 'rejected' && wants === 'approve-schedule') {
    scheduled = await schedulePost(c.env.DB, id, String(form.get('account') ?? ''), readWhen(form, zone, now), now, activeOrg(gate.session.record))
    await record(c.env.DB, {
      actor: 'panel', action: 'draft.schedule', target: id, detail: scheduled.ok ? scheduled.at : `refused:${scheduled.reason}`,
    }, c.req.raw)
  }

  const flash: PanelFlash = !result.ok
    ? { kind: 'bad', text: result.reason }
    : result.status === 'rejected'
      ? {
          kind: 'ok',
          text: 'رُفضت — وتبقى معروضةً بكلفتها، فما دُفع ثمنُه يُرى.',
          // **والتراجعُ يقع مع الإشعار لا بعده** (D-100): الرفضُ عمودٌ
          // واحدٌ يُقلَب، فلا يحتاج سؤالا قبله ويكفيه بابٌ بعده
          undo: { action: '/panel/drafts/undo-reject', id, label: 'تراجَع' },
        }
      : scheduled !== null && scheduled.ok
        ? {
            kind: 'ok',
            text: `اعتُمدت وجُدولت على ${platformLabel(scheduled.platform)} (${scheduled.account}) ${ownerWhen(scheduled.at, zone, now)}.`,
          }
        : scheduled !== null
          ? { kind: 'warn', text: `اعتُمدت، وتعذّرت جدولتُها: ${scheduled.reason}` }
          : {
              kind: 'ok',
              text:
                result.status === 'edited'
                  ? 'اعتُمدت بنصّك بعد التعديل — اختر لها حسابًا وموعدًا.'
                  : 'اعتُمدت كما كُتبت — اختر لها حسابًا وموعدًا.',
              // ‏والاعتمادُ يُتراجَع عنه كالرفض (الخطّة 7.8): «ارفض» على بُعد ‏8px من «اعتمد»،
              // ‏والضغطةُ الخاطئةُ كانت تُدخل المنشورَ «وزّع المعتمَد» ولا طريقَ إلى المسوّدة
              undo: { action: '/panel/drafts/undo-approve', id, label: 'تراجَع' },
            }

  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'draft.decide',
      target: id,
      detail: result.ok ? result.status : `refused:${result.reason}`,
    },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, flash)
  /*
   * ‏ومن المحرّر (D-198): المردودةُ والمعتمَدةُ بلا موعدٍ إلى المحرّر نفسِه (موعدُها فيه)، والمجدولةُ
   * ‏والمرفوضةُ إلى بطاقتها في القائمة. ومن البطاقة كما كان: المعتمَدةُ إلى شريط جدولتها.
   */
  if (editor) {
    if (!result.ok) return toEditor(id)
    if (result.status === 'rejected' || scheduled?.ok === true) return toCard('d', id)
    return toEditor(id, 'ed-when')
  }
  return toCard(result.ok && result.status !== 'rejected' ? 's' : 'd', id)
})

/**
 * التراجعُ عن رفض (D-100).
 *
 * **ولا حارسَ هنا**: `undoReject` تشترط أنّ الحالَ `rejected` الآن، فإشعارٌ
 * شاخ في تبويبٍ منسيٍّ لا يقلب حالا تبدّلت بعده. وهذا المسارُ ينقل الطلبَ
 * ويكتب السجلّ، **ولا يقرّر**.
 */
drafts.post('/panel/drafts/undo-reject', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  const id = String(gate.form.get('id') ?? '')
  const result = await undoReject(c.env.DB, activeOrg(gate.session.record), id)

  const flash: PanelFlash = result.ok
    ? { kind: 'ok', text: 'عادت مسوّدةً تنتظر قرارك.' }
    : { kind: 'bad', text: `تعذّر التراجع: ${result.reason}` }

  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'draft.undo_reject',
      target: id,
      detail: result.ok ? 'restored' : `refused:${result.reason}`,
    },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, flash)
  return toCard('d', id)
})

/**
 * التراجعُ عن اعتماد (الخطّة 7.8) — **والحكمُ في `undoApprove`**: لا يُسحب ما جُدول،
 * وإشعارٌ شاخ لا يقلب حالًا تبدّلت بعده. والمسارُ ينقل ويكتب السجلّ، **ولا يقرّر**.
 */
drafts.post('/panel/drafts/undo-approve', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  const id = String(gate.form.get('id') ?? '')
  const result = await undoApprove(c.env.DB, activeOrg(gate.session.record), id)

  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'draft.undo_approve',
      target: id,
      detail: result.ok ? 'restored' : `refused:${result.reason}`,
    },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, result.ok
    ? { kind: 'ok', text: 'عادت مسوّدةً تنتظر قرارك، بنصّها قبل الاعتماد.' }
    : { kind: 'bad', text: `تعذّر التراجع: ${result.reason}` })
  return toCard('d', id)
})

/**
 * البَتُّ الجماعيّ — **اعتمادٌ فقط، ولا رفضَ جماعيّ** (D-100).
 *
 * ## ولماذا لا رفضَ جماعيّ
 *
 * الاعتمادُ يفتح بابا ولا يعبره: يبقى بعده اختيارُ حسابٍ وموعد، **وفيه
 * محطّةٌ ثانية يُرى فيها ما اعتُمد**. والرفضُ الجماعيُّ بابٌ واحدٌ يُغلق
 * على جملةٍ بضغطة، **وتراجعُه واحدةً واحدة** — فيبقى فرديّا حيث يُقرأ
 * كلٌّ قبل بَتِّه.
 *
 * ## والمعرّفاتُ تُقرأ كلُّها لا أوّلُها
 *
 * `form.get` تعطي الأوّلَ وحدَه — **وصندوقان محدَّدان يمرّ منهما واحد،
 * بلا خطأ**. و`getAll` هي الصحيحة، وسقفٌ يمنع طلبا يحمل ألفا.
 */
const BULK_CAP = 25

drafts.post('/panel/drafts/approve-many', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  const ids = gate.form.getAll('id').map(String).filter((x) => x !== '')
  if (ids.length === 0) {
    await setFlash(c.env, c.req.raw, { kind: 'warn', text: 'لم تُحدَّد مسوّدة واحدة.' })
    return back('posts')
  }
  if (ids.length > BULK_CAP) {
    await setFlash(c.env, c.req.raw, {
      kind: 'bad',
      text: `${ids.length} مسوّدةً في طلب واحد — والسقف ${BULK_CAP}. اعتمدها على دفعات.`,
    })
    return back('posts')
  }

  const result = await approveMany(
    c.env.DB, activeOrg(gate.session.record),
    ids,
    deciderOf(gate.session.record.via),
  )

  // **والمتعثّرُ يُسمَّى بسببه**: حصيلةٌ تقول «فشل بعضُها» تجعل المالك
  // يعيد الكلَّ — ولا يعرف أيَّها مضى
  const flash: PanelFlash =
    result.failed.length === 0
      ? {
          kind: 'ok',
          text: `اعتُمدت ${result.done.length} مسوّدةً كما كُتبت — اختر لكلّ حسابا وموعدا.`,
        }
      : {
          kind: result.done.length === 0 ? 'bad' : 'warn',
          text:
            `اعتُمدت ${result.done.length}، وتعثّرت ${result.failed.length}: ` +
            result.failed.map((f) => f.reason).join(' · '),
        }

  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'draft.approve_many',
      detail: `${result.done.length} تمّت · ${result.failed.length} تعثّرت`,
    },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, flash)
  return back('posts')
})

/**
 * الجدولة — **القرارُ الذي يُخرج المنشور من اللوحة إلى العالم.**
 *
 * والحارسُ في `schedulePost` لا هنا: المنصّةُ والحسابُ والموعدُ تُفحص في
 * موضعٍ واحد يشترك فيه هذا الزرّ وأيُّ منادٍ آخر. وزرٌّ في صفحةٍ ليس
 * طريقا جانبيّا حول الحارس (D-019).
 */
drafts.post('/panel/drafts/schedule', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const form = gate.form

  const id = String(form.get('id') ?? '')
  const now = new Date()
  const zone = await ownerZone(c.env.DB, c.req.header('Cookie') ?? null)
  const result = await schedulePost(
    c.env.DB,
    id,
    String(form.get('account') ?? ''),
    // ‏و«when» بـ UTC من شريط البطاقة، أو زرٌّ ويومٌ بتوقيت المالك من المحرّر (D-198)
    readWhen(form, zone, now),
    now,
    activeOrg(gate.session.record),
  )

  let flash: PanelFlash = result.ok
    ? {
        kind: 'ok',
        text: `جُدولت على ${platformLabel(result.platform)} (${result.account}) ${
          ownerWhen(result.at, zone, now)}.`,
      }
    : { kind: 'bad', text: `تعذّرت الجدولة: ${result.reason}` }

  // ‏YouTube وTikTok يصلان خاصَّين (ر-4): يُقال في إشعار الجدولة، لا في صفحة المنصّة وحدها
  const scheduled = result.ok
    ? await c.env.DB.prepare('SELECT platform FROM posts WHERE id = ? AND org_id = ?')
        .bind(id, activeOrg(gate.session.record)).first<{ platform: string }>()
    : null
  // ‏ويسكت حين قلب المالكُ النشرَ علنيًّا بعد الإجازة (D-190)
  const reach = scheduled === null ? null : privateReach([scheduled.platform], await reachNow(c.env.DB, activeOrg(gate.session.record)))
  if (reach !== null) flash = { ...flash, text: `${flash.text} ${reach}` }

  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'draft.schedule',
      target: id,
      detail: result.ok ? result.at : `refused:${result.reason}`,
    },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, flash)
  // ‏المجدولةُ إلى بطاقتها وموعدُها فيها، والمردودةُ إلى نموذجها حيث يُصلَح ما رُدّ
  if (fromEditor(form) && !result.ok) return toEditor(id, 'ed-when')
  return toCard(result.ok ? 'd' : 's', id)
})

/**
 * قراءةُ الفاصل والبداية — **في مكانٍ واحدٍ لا في مسارين** (D-089).
 *
 * المعاينةُ والتنفيذُ يقرآن المدخلاتِ نفسَها، **فلو قرأها كلٌّ بطريقته
 * لعُرض جدولٌ ونُفّذ غيرُه** — وهو أسوأ من ألّا تكون هناك معاينة.
 */
function readGap(raw: unknown): number {
  const value = Number(raw ?? '24')
  if (!Number.isFinite(value)) return 24
  return Math.min(GAP_MAX_HOURS, Math.max(GAP_MIN_HOURS, Math.round(value)))
}

/** بدايةٌ غيرُ مفهومةٍ تصير «بعد ساعة» — ولا تُردّ الاستمارةُ كلُّها. */
function readStart(raw: unknown, now: Date): Date {
  const text = String(raw ?? '')
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return new Date(now.getTime() + 3_600_000)
  const at = new Date(`${text}:00Z`)
  return Number.isNaN(at.getTime()) ? new Date(now.getTime() + 3_600_000) : at
}

/**
 * ما ينقص كلَّ معتمَدٍ من وسيط — **بالدالّة التي تحكم بها `schedulePost`** وبطاقتُه.
 * فالمعاينةُ تقول «TikTok تحتاج مقطعًا» بجانب المنشور، ولا تَعِد بخانةٍ يردّها التنفيذ.
 */
async function lackingOf(db: Env['DB'], drafts: readonly { id: string; platform: string; status: string }[]): Promise<Map<string, string>> {
  const approved = drafts.filter((d) => d.status === 'approved' || d.status === 'edited')
  const media = await mediaFor(db, approved.map((d) => d.id))
  const out = new Map<string, string>()
  for (const d of approved) {
    const why = missingMedia(d.platform, media.filter((m) => m.postId === d.id && m.status === 'ready').map((m) => m.mime))
    if (why !== null) out.set(d.id, why)
  }
  return out
}

/**
 * توزيعُ المعتمَد — **معاينةٌ أوّلا** (D-089).
 *
 * ولا يكتب هذا المسارُ شيئا. يقرأ ويحسب ويعرض، **والتنفيذُ في مسارٍ
 * ثانٍ يضغطه المالكُ بعد أن يرى**. ومسارٌ يفعل الاثنين يجعل زرَّ
 * «وزّع» يجدول عشرةَ منشوراتٍ بضغطةٍ واحدةٍ بلا أن يُقرأ جدول.
 */
/**
 * ‏**والمعاينةُ بـ GET** (EASE-PLAN ب): كانت ردًّا على POST، فتحديثُ الصفحة يسأل «أعيد الإرسال؟». وهي لا تكتب شيئًا،
 * فلا حارسَ CSRF يلزمها — الجلسةُ وحدها. والمسارُ القديمُ بـ POST باقٍ لمن حفظ النموذجَ القديم.
 */
async function spreadPreview(c: Context<{ Bindings: Env }>, form: FormData, csrf: string, org: ReturnType<typeof activeOrg>): Promise<Response> {
  const drafts = await listDrafts(c.env.DB, org, BOARD)
  const accounts = await listAccounts(c.env.DB, org)
  const targets = accounts
    .filter((a) => a.status === 'active' && !isLinkedInPage(a))
    .map((a) => ({ id: a.id, platform: a.platform, label: a.displayName }))

  const now = new Date()
  const gap = readGap(form.get('gap'))
  const lacking = await lackingOf(c.env.DB, drafts)
  const zone = await ownerZone(c.env.DB, c.req.header('Cookie') ?? null)
  const plan = planSpread(
    drafts.map((d) => ({ id: d.id, platform: d.platform, status: d.status, text: d.text, lacking: lacking.get(d.id) ?? null })),
    targets,
    // ‏وأوّلُ موعدٍ بتوقيت المالك من اللوحة (`local`، D-199)، أو `start` بـ UTC كما يُرسله شريطُ الشاشة
    readStart(readWhen(form, zone, now) || form.get('start'), now),
    gap,
    now,
  )

  const start = plan.slots[0]?.when ?? String(form.get('start') ?? '')
  return page((nonce) =>
    soloPage('صدى — توزيع المعتمَد', { href: '/panel', label: 'اللوحة' }, spreadScreen({ plan, start, gap, csrf, zone }), nonce, '',
      buildCommands({ onPanel: false }), soloNav('posts')),
  )
}

drafts.post('/panel/drafts/spread', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  return spreadPreview(c, gate.form, gate.session.record.csrf, activeOrg(gate.session.record))
})

drafts.get('/panel/drafts/spread', async (c) => {
  const session = await loadSession(c.env.KV, c.req.raw, c.env.ADMIN_TOKEN)
  if (session === null) return loginResponse(c.env, c.req.raw)
  if (session.record.pending) return c.redirect('/panel/2fa', 303)
  const form = new FormData()
  for (const [k, v] of new URL(c.req.url).searchParams) form.append(k, v)
  return spreadPreview(c, form, session.record.csrf, activeOrg(session.record))
})

/**
 * تنفيذُ التوزيع — **بـ `schedulePost` واحدةً واحدة**.
 *
 * لا كتابةَ `queued` من هنا: الحارسُ الذي يمنع الجدولةَ إلى قناةٍ إذنُها
 * منتهٍ، أو إلى موعدٍ مضى، أو من منصّةٍ إلى أخرى — **كلُّه في تلك
 * الدالّة**. ومسارٌ ثانٍ ينسخه ينسى شرطا (D-019).
 *
 * **والوجهةُ تُحسَب هنا ولا تُقرأ من النموذج**: معرّفُ حسابٍ يأتي من
 * الصفحة يُصدَّق بلا فحص. فالمعرّفاتُ وحدَها تُقرأ منها — أي **ما عُرض**
 * — والوجهةُ والموعدُ يُحسبان من المدخلات نفسِها.
 */
drafts.post('/panel/drafts/spread/apply', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  const wanted = gate.form.getAll('post').map(String)
  const now = new Date()
  const gap = readGap(gate.form.get('gap'))

  const drafts = await listDrafts(c.env.DB, activeOrg(gate.session.record), BOARD)
  const accounts = await listAccounts(c.env.DB, activeOrg(gate.session.record))
  const targets = accounts
    .filter((a) => a.status === 'active' && !isLinkedInPage(a))
    .map((a) => ({ id: a.id, platform: a.platform, label: a.displayName }))

  // **وما لم يُعرَض لا يُنفَّذ**: القائمةُ تُقصر على ما حمله النموذج
  // بترتيبه، فمسوّدةٌ اعتُمدت بين المعاينة والتنفيذ لا تدخل خِلسة
  const wantedSet = new Set(wanted)
  const lacking = await lackingOf(c.env.DB, drafts)
  const plan = planSpread(
    drafts
      .filter((d) => wantedSet.has(d.id))
      .sort((a, b) => wanted.indexOf(a.id) - wanted.indexOf(b.id))
      .map((d) => ({ id: d.id, platform: d.platform, status: d.status, text: d.text, lacking: lacking.get(d.id) ?? null })),
    targets,
    readStart(gate.form.get('start'), now),
    gap,
    now,
  )

  let done = 0
  let first: string | null = null
  const failed: string[] = []
  for (const slot of plan.slots) {
    const result = await schedulePost(c.env.DB, slot.postId, slot.accountId, slot.when, new Date(), activeOrg(gate.session.record))
    if (result.ok) {
      done += 1
      first ??= result.at
    } else failed.push(result.reason)
  }

  // ‏والعددُ بمعدوده (الخطّة 8.3)، وأوّلُ موعدٍ بتوقيت المالك لا بـ UTC (8.2)
  const zone = await ownerZone(c.env.DB, c.req.header('Cookie') ?? null)
  const said = first === null
    ? ''
    : done === 1
      ? `جُدول منشور واحد: ${ownerWhen(first, zone, now)}.`
      : `جُدول ${counted(done, NOUNS.post)}، أوّلُها ${ownerWhen(first, zone, now)}.`
  const missing = wanted.length - plan.slots.length
  const flash: PanelFlash =
    done === 0
      ? { kind: 'bad', text: `لم يُجدوَل شيء. ${failed[0] ?? 'لم تعد أيّ مسوّدة صالحةً للجدولة.'}` }
      : failed.length === 0 && missing === 0
        ? { kind: 'ok', text: said }
        : {
            kind: 'warn',
            text:
              `${said} ` +
              (missing > 0 ? `و${missing === 1 ? 'واحدة لم تعد صالحة' : `${missing} لم تعد صالحةً`} للجدولة. ` : '') +
              (failed.length > 0 ? `وردّ ${failed.length}: ${failed[0]}` : ''),
          }

  await record(
    c.env.DB,
    { actor: 'panel', action: 'draft.spread', target: String(wanted.length), detail: `done:${done}` },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, flash)
  return back('posts')
})

/** سحبُ الموعد — قبل مغادرة الرسالة وحده. */
drafts.post('/panel/drafts/unschedule', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  const id = String(gate.form.get('id') ?? '')
  const result = await unschedule(c.env.DB, id, activeOrg(gate.session.record))

  const flash: PanelFlash = result.ok
    ? { kind: 'ok', text: 'سُحب الموعد — وتبقى معتمَدةً تنتظر موعدا جديدا.' }
    : { kind: 'bad', text: `تعذّر السحب: ${result.reason}` }

  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'draft.unschedule',
      target: id,
      detail: result.ok ? 'withdrawn' : `refused:${result.reason}`,
    },
    c.req.raw,
  )
  await setFlash(c.env, c.req.raw, flash)
  const to = backTo(gate.form.get('return'), '')
  // ‏ومن اللوحة: المسحوبةُ إلى نموذج جدولتها — وهو ما يحتاجه من سحب ليغيّر الموعد
  if (to !== '') return new Response(null, { status: 303, headers: { Location: to } })
  return toCard(result.ok ? 's' : 'd', id)
})

/**
 * «غيّر الموعد» من المحرّر (D-198) — **الموعدُ وحدَه، بلا سحبٍ وجدولةٍ من جديد** (`reschedulePost`).
 * والموعدُ من النموذج كما في «اعتمد وجدوِل» (`readWhen`): زرٌّ بتوقيت المالك، أو يومٌ وساعة.
 */
drafts.post('/panel/drafts/reschedule', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied
  const form = gate.form
  const id = String(form.get('id') ?? '')
  const now = new Date()
  const zone = await ownerZone(c.env.DB, c.req.header('Cookie') ?? null)
  const result = await reschedulePost(c.env.DB, id, readWhen(form, zone, now), now, activeOrg(gate.session.record))
  await record(c.env.DB, {
    actor: 'panel', action: 'draft.reschedule', target: id, detail: result.ok ? result.at : `refused:${result.reason}`,
  }, c.req.raw)
  await setFlash(c.env, c.req.raw, result.ok
    ? { kind: 'ok', text: `تغيّر الموعد: ${platformLabel(result.platform)}${result.account === '' ? '' : ` (${result.account})`} ${ownerWhen(result.at, zone, now)}.` }
    : { kind: 'bad', text: `لم يتغيّر الموعد: ${result.reason}` })
  // ‏ومن سحبٍ في الخطّ الزمنيّ (D-233) يعود إليه بنافذته نفسِها، نجح أو رُدّ، فيُقرأ الإشعارُ حيث سُحب
  const back = String(form.get('back') ?? '')
  if (form.get('from') === 'timeline' && /^\/panel\/timeline(\?[a-z0-9=&-]*)?$/.test(back)) return c.redirect(back, 303)
  return result.ok ? toCard('d', id) : toEditor(id, 'ed-when')
})

/**
 * إعادةُ الفاشل أو العالق إلى «معتمَد» — والحارسُ في `requeue` لا هنا.
 *
 * **وعند النجاح يذهب المالكُ إلى نموذج جدولته في المنشورات أيًّا كان مصدرُ الطلب**:
 * صار معتمَدًا ينتظر موعدًا، ولا حقلَ موعدٍ في صفحة المنصّة. كان `return` يتقدّم
 * فيعود إلى صفحةٍ يقول إشعارُها «اختر له موعدًا» ولا موعدَ فيها (رحلة R-8).
 * وعند الردّ يعود إلى حيث كان، فيقرأ السببَ بجانب ما ضغط.
 *
 * ‏**إلّا منشورًا خارجَ النافذة** (مراجعة ر-8): «فشل قبل أسبوعٍ فأكثر» في صفحة المنصّة يُري
 * ‏منشوراتٍ لا ترسمها اللوحة، والنزولُ إلى بطاقةٍ لم تُرسَم يرتدّ إلى الرئيسيّة. فيعود إلى
 * ‏`return` كما كان قبل R-8 — وتبويبُ «تنتظر» يُريه معتمَدًا بلا موعد — وبلا `return` إلى رحلته.
 */
drafts.post('/panel/drafts/requeue', async (c) => {
  const gate = await guardPost(c)
  if ('denied' in gate) return gate.denied

  const id = String(gate.form.get('id') ?? '')
  const result = await requeue(c.env.DB, id, new Date(), activeOrg(gate.session.record))

  await record(
    c.env.DB,
    {
      actor: 'panel',
      action: 'draft.requeue',
      target: id,
      detail: result.ok ? 'requeued' : `refused:${result.reason}`.slice(0, 200),
    },
    c.req.raw,
  )
  const to = backTo(gate.form.get('return'), '')
  const card = result.ok && (await onBoard(c.env.DB, activeOrg(gate.session.record), id))
  // ‏ورحلةُ المنشور لا تقرأ الإشعار: لا يُكتب لها فيظهر بعدها في غير موضعه — وحالُه فيها «معتمَد»
  if (result.ok && !card && to === '') return toJourney(id)
  await setFlash(c.env, c.req.raw, result.ok
    ? { kind: 'ok', text: 'عاد معتمَدًا بنصّه كما هو — اختر له موعدًا جديدًا.' }
    : { kind: 'bad', text: `تعذّرت الإعادة: ${result.reason}` })
  if (card) return toCard('s', id)
  if (to !== '') return new Response(null, { status: 303, headers: { Location: to } })
  return toCard('d', id)
})
