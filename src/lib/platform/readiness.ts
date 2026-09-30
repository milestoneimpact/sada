/**
 * سلّمُ الجاهزيّة — **أتعمل هذه المنصّةُ الآن، وإن لم تعمل فأين وقفت؟** (D-158)
 *
 * ## لماذا
 *
 * شاشةُ المنصّة كانت تقول «مربوطة» من `accounts.status` وحدَه: حسابٌ بلا صفّ
 * `tokens` **مربوطٌ عندها**، وإذنٌ انتهى مربوطٌ، وحسابٌ لم ينشر قطّ مربوط. ثمّ
 * يُجدوَل منشورٌ فيسقط بـ`no_tokens` في الطابور — **حيث لا يقرأ المالكُ شيئا**
 * (`publisher.ts` يعود قبل أن يكتب محاولةً).
 *
 * فالسلّمُ خمسُ درجاتٍ بترتيب ما يقع فعلا: التطبيقُ ثمّ الحسابُ ثمّ الإذنُ ثمّ
 * التجديدُ ثمّ النشر. **وكلُّ درجةٍ تُحسَب من صفٍّ لا من كلمة**: الإذنُ من
 * `tokens.expires_at`، والتجديدُ من `tokens.refreshed_at`، والنشرُ من
 * `publish_attempts`. وأوّلُ درجةٍ ساقطةٍ هي **الحكمَ والفعلَ معا**: ما وقع
 * ولماذا وأيُّ زرٍّ يصلحه.
 *
 * ## ولماذا ليست معالجَ الضبط
 *
 * `wizardFor` (D-111) أربعُ خطواتٍ تنتهي عند «اربط» — وهو للضبط الأوّل.
 * والسلّمُ يبدأ حيث ينتهي: **ما بعد الربط هو ما يوقف النشرَ صامتا**.
 */
import type { ChannelView } from '../channels'
import type { AppStatus } from '../oauth/apps'
import type { AccountHealth, PlatformPost, PlatformTally } from './screen'
import { parseSqliteUtc } from '../format'

export type RungState = 'done' | 'now' | 'waiting' | 'failed'
export type RungKey = 'app' | 'account' | 'token' | 'renew' | 'publish'

export interface Rung {
  readonly key: RungKey
  readonly title: string
  readonly state: RungState
  /** ما وقع — جملةٌ تُقرأ، لا رمز. */
  readonly note: string
  /** الزرُّ الذي يصلح الدرجة — وحيث لا يصلحها زرٌّ يُترَك. */
  readonly action?: { readonly label: string; readonly href: string }
}

export interface Readiness {
  readonly rungs: readonly Rung[]
  /** الحكمُ في سطر: أخضرُ تعمل، أحمرُ لا، أصفرُ تنتظرك، رماديٌّ لم يُبنَ. */
  readonly verdict: { readonly kind: 'ok' | 'warn' | 'bad' | 'idle'; readonly text: string }
  /** أوّلُ درجةٍ غيرِ تامّةٍ لها فعل — وهي ما يُعرَض زرًّا في صدر الشاشة. */
  readonly next: Rung | null
}

export interface ReadinessInput {
  readonly view: ChannelView
  readonly app: AppStatus | undefined
  readonly health: Readonly<Record<string, AccountHealth>>
  readonly tally: PlatformTally
  readonly posts: readonly PlatformPost[]
  readonly now: Date
}

const PASSED: ReadonlySet<string> = new Set(['accepted'])
const FAILED: ReadonlySet<string> = new Set(['bad_secret', 'bad_client_id'])

/** أيّامٌ من الآن إلى طابعٍ — سالبةٌ لما مضى، و`null` لطابعٍ لا يُقرأ. */
function daysUntil(value: string | null, now: Date): number | null {
  if (value === null) return null
  const date = parseSqliteUtc(value)
  if (date === null) return null
  return Math.floor((date.getTime() - now.getTime()) / 86_400_000)
}

function isPast(value: string | null, now: Date): boolean {
  const d = daysUntil(value, now)
  return d !== null && d < 0
}

export function readiness(input: ReadinessInput): Readiness {
  const { view, app, health, tally, posts, now } = input
  const { spec } = view
  const id = spec.id
  const link = `/oauth/${id}/start`
  const accounts = view.accounts.filter((a) => a.status !== 'revoked')

  if (spec.stage === 'none') {
    return {
      rungs: [],
      verdict: { kind: 'idle', text: 'لم يُبنَ سائقُها بعد' },
      next: null,
    }
  }

  // ١ · التطبيق
  const kind = app?.verifiedKind ?? null
  const appRung: Rung =
    app === undefined || app.source === 'none'
      ? {
          key: 'app', title: 'التطبيق', state: accounts.length > 0 ? 'failed' : 'now',
          note: accounts.length > 0
            ? 'سرّا التطبيق غابا من البيئة والخزنة — والتجديدُ لا يملك ما يُقدّمه للمنصّة'
            : 'يُضبط معرّفُ التطبيق وسرُّه أوّلًا',
          action: { label: 'اضبط التطبيق', href: '#setup' },
        }
      : kind !== null && FAILED.has(kind)
        ? {
            key: 'app', title: 'التطبيق', state: 'failed',
            note: kind === 'bad_secret' ? 'المنصّةُ تعرف المعرّفَ ولا تقبل السرّ' : 'المنصّةُ لا تعرف هذا المعرّف',
            action: { label: 'أعد حفظ التطبيق', href: '#setup' },
          }
        : {
            key: 'app', title: 'التطبيق', state: 'done',
            note: app.source === 'worker_secret'
              ? 'من أسرار Worker'
              : kind !== null && PASSED.has(kind)
                ? 'من الخزنة، وقبلته المنصّة'
                : 'من الخزنة — ولم يُفحَص بعد',
          }

  // ٢ · الحساب
  const accountRung: Rung =
    accounts.length > 0
      ? {
          key: 'account', title: 'الحساب', state: 'done',
          note: accounts.length === 1
            ? accounts[0]!.displayName
            : `${accounts.length} حسابات: ${accounts.map((a) => a.displayName).join('، ')}`,
        }
      : appRung.state === 'done'
        ? { key: 'account', title: 'الحساب', state: 'now', note: 'لا حسابَ مربوطًا بعد', action: { label: `اربط ${spec.label}`, href: link } }
        : { key: 'account', title: 'الحساب', state: 'waiting', note: 'يُربَط بعد ضبط التطبيق' }

  // ٣ · الإذن — من الصفّ لا من الكلمة
  const first = accounts[0]
  const h = first === undefined ? undefined : health[first.id]
  let tokenRung: Rung
  if (first === undefined) {
    tokenRung = { key: 'token', title: 'الإذن', state: 'waiting', note: 'يُحفَظ عند الربط' }
  } else if (first.status === 'needs_reauth') {
    const since = h?.needsReauthAt ?? null
    tokenRung = {
      key: 'token', title: 'الإذن', state: 'failed',
      note: since === null ? 'سقط الإذن — والنشرُ متوقّفٌ عليه' : `سقط الإذن منذ ${since.slice(0, 10)} — والنشرُ متوقّفٌ عليه منذها`,
      action: { label: 'جدّد الإذن', href: link },
    }
  } else if (h === undefined || h.expiresAt === null) {
    tokenRung = {
      key: 'token', title: 'الإذن', state: 'failed',
      note: 'الحسابُ محفوظٌ ولا إذنَ وصولٍ معه — أوّلُ منشورٍ مجدولٍ سيسقط',
      action: { label: 'أعد الربط', href: link },
    }
  } else if (isPast(h.expiresAt, now)) {
    const refreshable = h.refreshExpiresAt !== null && !isPast(h.refreshExpiresAt, now)
    tokenRung = refreshable
      ? { key: 'token', title: 'الإذن', state: 'waiting', note: 'انتهى إذنُ الوصول وإذنُ التجديد قائم — تجدّده الدورةُ القادمة' }
      : { key: 'token', title: 'الإذن', state: 'failed', note: 'انتهى إذنُ الوصول ولا إذنَ تجديدٍ معه', action: { label: 'جدّد الإذن', href: link } }
  } else {
    const days = daysUntil(h.expiresAt, now) ?? 0
    tokenRung = {
      key: 'token', title: 'الإذن', state: 'done',
      note: days === 0 ? 'صالحٌ حتّى اليوم' : days === 1 ? 'صالحٌ حتّى الغد' : `صالحٌ ${days} يوما`,
    }
  }

  // ٤ · التجديد
  const renewRung: Rung =
    first === undefined || tokenRung.state === 'failed'
      ? { key: 'renew', title: 'التجديد', state: 'waiting', note: 'يبدأ حين يصحّ الإذن' }
      : h?.refreshedAt === undefined || h.refreshedAt === null
        ? { key: 'renew', title: 'التجديد', state: 'waiting', note: 'لم يُجدَّد بعد — الدورةُ تجدّده قبل انتهائه بساعتين' }
        : { key: 'renew', title: 'التجديد', state: 'done', note: `جُدّد آخرَ مرّةٍ ${h.refreshedAt.slice(0, 16)}` }

  // ٥ · النشر — من المحاولات
  const lastFailed = posts.find((p) => p.lastError !== null && p.publishedAt === null)
  let publishRung: Rung
  if (spec.stage === 'link') {
    publishRung = { key: 'publish', title: 'النشر', state: 'waiting', note: 'سائقُ الرفع لم يُبنَ لهذه المنصّة — تُربَط ولا تنشر' }
  } else if (
    lastFailed !== undefined &&
    // ‏وقتُ الفشل لا وقتُ الكتابة: منشورٌ كُتب قبل آخر نجاحٍ ثمّ فشل بعده
    // ‏كان يُحكَم عليه «تعمل»
    (tally.lastPublishedAt === null || (lastFailed.lastFailedAt ?? lastFailed.createdAt) > tally.lastPublishedAt)
  ) {
    publishRung = {
      key: 'publish', title: 'النشر', state: 'failed',
      note: `آخرُ محاولةٍ فشلت: ${lastFailed.lastError ?? ''}`,
      action: { label: 'افتح المنشور', href: `/panel/journey/${lastFailed.id}` },
    }
  } else if (tally.lastPublishedAt !== null) {
    publishRung = { key: 'publish', title: 'النشر', state: 'done', note: `${tally.published} نُشر، آخرُها ${tally.lastPublishedAt.slice(0, 16)}` }
  } else if (tally.queued > 0) {
    publishRung = { key: 'publish', title: 'النشر', state: 'waiting', note: `${tally.queued} مجدولٌ ينتظر موعدَه` }
  } else {
    publishRung = {
      key: 'publish', title: 'النشر', state: tokenRung.state === 'done' ? 'now' : 'waiting',
      note: 'لا منشورَ بعد — يُكتب ويُعتمَد ويُجدوَل',
      action: { label: 'افتح المسوّدات', href: '/panel#posts' },
    }
  }

  const rungs = [appRung, accountRung, tokenRung, renewRung, publishRung]
  const failed = rungs.find((r) => r.state === 'failed')
  const nowRung = rungs.find((r) => r.state === 'now')
  const next = failed ?? nowRung ?? null

  const verdict =
    failed !== undefined
      ? { kind: 'bad' as const, text: `لا تنشر: ${failed.title} — ${failed.note}` }
      : nowRung !== undefined
        ? { kind: 'warn' as const, text: `تنتظرك: ${nowRung.title} — ${nowRung.note}` }
        : publishRung.state === 'done'
          ? { kind: 'ok' as const, text: 'تعمل وتنشر' }
          : tokenRung.state === 'done'
            ? { kind: 'ok' as const, text: 'جاهزةٌ للنشر' }
            : { kind: 'idle' as const, text: publishRung.note }

  return { rungs, verdict, next }
}
