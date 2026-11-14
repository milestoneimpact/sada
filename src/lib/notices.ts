/**
 * مركزُ الإشعارات (D-294): **ما يحتاج يدَك الآن، مشتقًّا من الصفوف لا مخترَعًا.**
 *
 * ## لماذا اشتقاقٌ لا جدولُ أحداث
 *
 * جدولُ أحداثٍ يُكتب عند كلّ عطلٍ يحتاج كاتبًا في كلّ موضع (الناشرُ، والتجديدُ، والصورُ، والنبض…) ويكذب حين
 * يُنسى موضع. والصفوفُ القائمةُ تقول الحقَّ أصلًا: `posts.status = 'failed'`، و`accounts.status = 'needs_reauth'`،
 * و`image.quota_wait` في التدقيق، و`token_alerts`، و`heartbeats`، ودفترُ الكلفة. فالإشعارُ **قراءةٌ** لها
 * بمرجعٍ ثابتٍ لحدثه (`ref`)، **ويختفي حين يزول سببُه** — منشورٌ أُعيد أو حسابٌ رُبط لا يبقى إنذارُه.
 *
 * ## وما يُحفظ هو ما قُرئ
 *
 * `notice_reads` (0041): المرجعُ ومتى قُرئ ومن. فالعدّادُ في الترويسة = ما يحتاج يدَك **ولم تره بعد**.
 * والعدُّ جملةٌ واحدةٌ في كلّ فتحةٍ للّوحة (D-280: سقفُ الجمل لكلّ لوح)، والقائمةُ كاملةً في صفحتها وحدَها.
 */
import type { Db } from './tokens'
import { platformLabel, type Platform } from './oauth/providers'
import { whyFailed } from './publish/reasons'
import { briefError } from './platform/screen'
import type { Pulse } from './ops/heartbeat'
import type { Allowance } from './limits'
import { isOwnerEmail } from './ownerEmail'

export type NoticeKind = 'publish' | 'reauth' | 'quota' | 'token' | 'pulse' | 'budget' | 'security' | 'key'

/**
 * **من يقرأ الإشعارات** (D-317): بريدُه لإشعارات أمان حسابه، وبصمةُ جلسته كي لا يُرى إشعارُ الدخول في الجلسة التي فُتحت
 * به. وإشعاراتُ الأمان لصاحبها وحده — لا لكلّ من يرى المنظّمة.
 */
export interface NoticeViewer {
  readonly email: string
  readonly handle: string
}

/** ما يُقال في إشعار أمان، من تفصيل صفّه (`kind · تفصيل`). */
const SECURITY_NOTICE: Readonly<Record<string, string>> = {
  'session.new': 'دخولٌ جديد إلى حسابك',
  'factor.add': 'أُضيف عاملٌ ثانٍ إلى حسابك',
  'factor.remove': 'أُزيل عاملٌ ثانٍ من حسابك',
  'recovery.used': 'استُعمل رمزُ استرداد لحسابك',
  'sessions.revoke_all': 'أُخرجت الأجهزة الأخرى من حسابك',
}

/**
 * إشعاراتُ أمان الحساب في أسبوعها — **بلا إشعار الجلسة الحاليّة نفسِها** (بصمتُها في `target`)، **وبلا ما قرأه صاحبُها**.
 *
 * **وقراءتُها لصاحبها لا للمنظّمة** (مراجعة D-317): كانت تُستثنى بقراءات المنظّمة النشطة، فإشعارٌ قُرئ في منظّمة المالك
 * يعود غيرَ مقروءٍ في غيرها، وعضوٌ يرى المنظّمةَ يُطفئ إشعارَ المالك بمرجعٍ يخمّنه (المعرّفاتُ متتالية). فقراءتُها تُحفظ
 * في منظّمة المالك ببريد صاحبها، ولا يكتبها غيرُه (`markRead`).
 */
const SECURITY_REFS = `SELECT 'security:' || id AS ref FROM audit_log
  WHERE org_id = 'org_owner' AND action = 'security.notice' AND by_email = ?3
    AND at >= datetime('now', '-7 days') AND COALESCE(target, '') != ?4
    AND ('security:' || id) NOT IN (SELECT ref FROM notice_reads WHERE org_id = 'org_owner' AND by_email = ?3)`

export interface Notice {
  /** ثابتٌ لحدثه: المنشورُ الفاشل نفسُه مرجعٌ واحد مهما أُعيدت قراءتُه. */
  readonly ref: string
  readonly kind: NoticeKind
  readonly tone: 'bad' | 'warn'
  readonly text: string
  /** إلى أين يذهب من يريد الفعل. */
  readonly href: string
  readonly action: string
  readonly at: string
}

export interface NoticeRead {
  readonly ref: string
  readonly readAt: string
  readonly byEmail: string | null
}

/** الدوراتُ التي يعني تأخّرُها أنّ شيئًا لا يُنشر ولا يُجدَّد — لا كلُّ دورة. */
const WATCHED_JOBS = new Set(['publish', 'renew', 'metrics', 'scan'])

function dayOf(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/** إشعاراتٌ من الذاكرة لا من جملة: النبضُ والسقفُ محمَّلان في الهيكل أصلًا (D-280). */
export function memoryNotices(pulses: readonly Pulse[], allowance: Pick<Allowance, 'settings' | 'usage'> | null, now: Date): Notice[] {
  const out: Notice[] = []
  for (const p of pulses) {
    if (!WATCHED_JOBS.has(p.job)) continue
    if (p.state === 'late' || p.state === 'failed') {
      const minutes = Math.floor(p.lateBy / 60)
      out.push({
        ref: `pulse:${p.job}:${p.beat?.at ?? 'never'}`,
        kind: 'pulse',
        tone: p.state === 'failed' ? 'bad' : 'warn',
        text: p.state === 'failed'
          ? `دورة «${p.label}» سقطت في آخر مرّة${p.beat?.detail ? `: ${p.beat.detail}` : ''}`
          : `دورة «${p.label}» لم تدُر منذ ${minutes > 0 ? `${minutes} دقيقة فوق موعدها` : 'موعدها'} — هل العدّاء يعمل؟`,
        href: '/panel#machine',
        action: 'افتح «هل الآلة تعمل؟»',
        at: p.beat?.at ?? now.toISOString(),
      })
    }
  }
  if (allowance !== null) {
    const cap = allowance.settings.dailySpendCapUsd
    if (cap > 0 && allowance.usage.spend >= cap) {
      out.push({
        ref: `budget:${dayOf(now)}`,
        kind: 'budget',
        tone: 'warn',
        text: `بلغ الإنفاقُ سقفَ اليوم ($${cap.toFixed(2)}) — لا كتابةَ ولا صورَ حتّى الغد أو حتّى ترفعه`,
        href: '/panel/settings#limits',
        action: 'الإنفاق والحدود',
        at: now.toISOString(),
      })
    }
  }
  return out
}

/**
 * العدُّ غيرُ المقروء **جملةً واحدة**: مراجعُ القاعدة الأربعة تُجمَع بـ `UNION ALL`، ومراجعُ الذاكرة تدخل بـ `json_each`،
 * وما في `notice_reads` يُستثنى. وعطلُ القاعدة صفر: العدّادُ زينةٌ لا حارس، ولا يُسقط اللوحة.
 */
export async function unreadNotices(db: Db, org: string, extraRefs: readonly string[], viewer?: NoticeViewer): Promise<number> {
  try {
    const row = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM (
           SELECT 'publish:' || id AS ref FROM posts WHERE org_id = ?1 AND status = 'failed'
           UNION ALL
           SELECT 'reauth:' || id || ':' || COALESCE(needs_reauth_at, '') FROM accounts WHERE org_id = ?1 AND status = 'needs_reauth'
           UNION ALL
           SELECT 'quota:' || date(at) FROM audit_log WHERE org_id = ?1 AND action = 'image.quota_wait' AND at >= date('now') GROUP BY date(at)
           UNION ALL
           SELECT 'token:' || al.account_id || ':' || al.kind || ':' || al.threshold FROM token_alerts al
             JOIN accounts a ON a.id = al.account_id AND a.org_id = al.org_id
            WHERE al.org_id = ?1 AND al.at >= datetime('now', '-2 days')
           UNION ALL
           SELECT value FROM json_each(?2)
           UNION ALL
           ${SECURITY_REFS}
         ) n WHERE ref NOT IN (SELECT ref FROM notice_reads WHERE org_id = ?1 AND ref NOT LIKE 'security:%')`,
      )
      .bind(org, JSON.stringify(extraRefs), viewer?.email ?? '', viewer?.handle ?? '')
      .first<{ n: number }>()
    return row?.n ?? 0
  } catch (error) {
    console.warn({ job: 'notices', failed: String(error) })
    return 0
  }
}

/** القائمةُ كاملةً — لصفحتها وحدَها، أربعُ جملٍ وما في الذاكرة. */
export async function collectNotices(
  db: Db,
  org: string,
  now: Date,
  memory: { readonly pulses: readonly Pulse[]; readonly allowance: Pick<Allowance, 'settings' | 'usage'> | null },
  viewer?: NoticeViewer,
): Promise<Notice[]> {
  const [failed, reauth, quota, tokens, security, keys] = await Promise.all([
    db.prepare(
      `SELECT p.id, p.platform, p.text,
              (SELECT pa.response_json FROM publish_attempts pa WHERE pa.post_id = p.id AND pa.org_id = p.org_id AND pa.status = 'failed' ORDER BY pa.at DESC LIMIT 1) AS why,
              (SELECT pa.at FROM publish_attempts pa WHERE pa.post_id = p.id AND pa.org_id = p.org_id AND pa.status = 'failed' ORDER BY pa.at DESC LIMIT 1) AS failed_at,
              p.created_at
         FROM posts p WHERE p.org_id = ? AND p.status = 'failed' ORDER BY failed_at DESC LIMIT 50`,
    ).bind(org).all<{ id: string; platform: string; text: string; why: string | null; failed_at: string | null; created_at: string }>()
      .then((r) => r.results).catch(() => []),
    db.prepare(`SELECT id, platform, display_name, needs_reauth_at FROM accounts WHERE org_id = ? AND status = 'needs_reauth'`)
      .bind(org).all<{ id: string; platform: string; display_name: string; needs_reauth_at: string | null }>()
      .then((r) => r.results).catch(() => []),
    db.prepare(`SELECT date(at) AS day, COUNT(*) AS n, MAX(at) AS at FROM audit_log WHERE org_id = ? AND action = 'image.quota_wait' AND at >= date('now') GROUP BY date(at)`)
      .bind(org).all<{ day: string; n: number; at: string }>()
      .then((r) => r.results).catch(() => []),
    db.prepare(
      `SELECT al.account_id, al.kind, al.threshold, al.at, a.platform, a.display_name FROM token_alerts al
         JOIN accounts a ON a.id = al.account_id AND a.org_id = al.org_id
        WHERE al.org_id = ? AND al.at >= datetime('now', '-2 days') ORDER BY al.at DESC`,
    ).bind(org).all<{ account_id: string; kind: 'access' | 'refresh'; threshold: number; at: string; platform: string; display_name: string }>()
      .then((r) => r.results).catch(() => []),
    // ‏أمانُ الحساب (D-317): لصاحبه وحده، وبلا إشعار جلسته هذه
    viewer === undefined ? Promise.resolve([]) : db.prepare(
      `SELECT id, detail, ip, at FROM audit_log
        WHERE org_id = ?1 AND action = 'security.notice' AND by_email = ?2
          AND at >= datetime('now', '-7 days') AND COALESCE(target, '') != ?3
        ORDER BY id DESC LIMIT 20`,
    ).bind('org_owner', viewer.email, viewer.handle).all<{ id: number; detail: string | null; ip: string | null; at: string }>()
      .then((r) => r.results).catch(() => []),
    // ‏مفتاحُ مزوّدٍ رُفض أو غاب (D-349): السلسلةُ تتخطّاه، والمالكُ يُقال له أيُّها — إعدادٌ عامّ يسكن منظّمةَ المالك
    db.prepare(`SELECT h.provider, h.why, h.down_until, h.updated_at, p.label FROM provider_health h
                  LEFT JOIN providers p ON p.name = h.provider AND p.org_id = h.org_id
                 WHERE h.org_id = 'org_owner' AND h.why IN ('key', 'nokey') AND h.down_until > ?`)
      .bind(now.toISOString()).all<{ provider: string; why: string; down_until: string; updated_at: string; label: string | null }>()
      .then((r) => r.results).catch(() => []),
  ])
  const out: Notice[] = []
  for (const f of failed) {
    const label = platformLabel(f.platform as Platform)
    const snippet = f.text.replace(/\s+/g, ' ').trim().slice(0, 48)
    out.push({
      ref: `publish:${f.id}`, kind: 'publish', tone: 'bad',
      text: `فشل نشر «${snippet}${f.text.length > 48 ? '…' : ''}» على ${label}: ${whyFailed(briefError(f.why), f.platform).text}`,
      href: `/panel/journey/${f.id}`, action: 'افتح المنشور', at: f.failed_at ?? f.created_at,
    })
  }
  for (const a of reauth) {
    out.push({
      ref: `reauth:${a.id}:${a.needs_reauth_at ?? ''}`, kind: 'reauth', tone: 'bad',
      text: `انقطع إذن ${platformLabel(a.platform as Platform)} (${a.display_name}) — والنشر عليه متوقّف حتّى يُعاد الربط`,
      href: `/oauth/${encodeURIComponent(a.platform)}/start`, action: 'أعد الربط', at: a.needs_reauth_at ?? now.toISOString(),
    })
  }
  for (const q of quota) {
    out.push({
      ref: `quota:${q.day}`, kind: 'quota', tone: 'warn',
      text: `${q.n} ${q.n === 1 ? 'صورة تنتظر' : 'صور تنتظر'} حصّةَ الغد المجّانيّة — ارسمها اليوم بالدفع أو انتظر`,
      href: '/panel#posts', action: 'المنشورات', at: q.at,
    })
  }
  for (const t of tokens) {
    out.push({
      ref: `token:${t.account_id}:${t.kind}:${t.threshold}`, kind: 'token', tone: t.threshold === 0 ? 'bad' : 'warn',
      text: `${t.kind === 'refresh' ? 'إذن التجديد' : 'إذن الوصول'} لـ ${platformLabel(t.platform as Platform)} (${t.display_name}) ${
        t.threshold === 0 ? 'انتهى' : `يقترب — بقي ${t.threshold} ${t.threshold === 1 ? 'يوم' : 'أيّام'}`}`,
      href: '/panel/accounts', action: 'الحسابات', at: t.at,
    })
  }
  for (const e of security) {
    const [kind = '', ...rest] = (e.detail ?? '').split(' ')
    const what = SECURITY_NOTICE[kind] ?? 'حدثُ أمانٍ على حسابك'
    const detail = rest.join(' ').trim()
    out.push({
      ref: `security:${e.id}`, kind: 'security', tone: kind === 'session.new' ? 'warn' : 'bad',
      text: `${what}${detail === '' ? '' : ` ${detail}`}${e.ip === null ? '' : ` — من ${e.ip}`}. إن لم تكن أنت فأخرِج الأجهزة الأخرى الآن`,
      href: isOwnerEmail(viewer?.email ?? '') ? '/panel/settings#security' : '/panel/enrol',
      action: isOwnerEmail(viewer?.email ?? '') ? 'الدخول والأجهزة' : 'أمان حسابك', at: e.at.replace(' ', 'T') + (e.at.includes('Z') ? '' : 'Z'),
    })
  }
  for (const k of keys) {
    out.push({
      ref: `key:${k.provider}:${k.updated_at}`, kind: 'key', tone: 'bad',
      text: `${k.why === 'key' ? 'رُفض مفتاح' : 'لا مفتاح لـ'} ${k.label ?? k.provider} — صدى يتخطّاه في السلسلة إلى غيره حتّى تحفظ مفتاحًا جديدًا`,
      href: '/panel/settings#providers', action: 'المزوّدون', at: k.updated_at.replace(' ', 'T') + (k.updated_at.includes('Z') ? '' : 'Z'),
    })
  }
  out.push(...memoryNotices(memory.pulses, memory.allowance, now))
  return out.sort((x, y) => (y.at > x.at ? 1 : y.at < x.at ? -1 : 0))
}

/** ما قُرئ في آخر أسبوعين — ومعه من قرأه. وإشعاراتُ الأمان بقراءة صاحبها أيًّا كانت المنظّمة (مراجعة D-317). */
export async function readMarks(db: Db, org: string, viewerEmail = ''): Promise<NoticeRead[]> {
  try {
    const { results } = await db
      .prepare(
        `SELECT ref, read_at, by_email FROM notice_reads
          WHERE read_at >= datetime('now', '-14 days')
            AND ((org_id = ?1 AND ref NOT LIKE 'security:%')
              OR (org_id = 'org_owner' AND ref LIKE 'security:%' AND by_email = ?2))`,
      )
      .bind(org, viewerEmail)
      .all<{ ref: string; read_at: string; by_email: string | null }>()
    return results.map((r) => ({ ref: r.ref, readAt: r.read_at, byEmail: r.by_email ?? null }))
  } catch {
    return []
  }
}

/**
 * تُعلَّم مقروءةً — مرّةً لكلّ مرجع، ومن قرأها أوّلًا يبقى.
 *
 * **وإشعارُ الأمان لا يُعلِّمه إلّا صاحبُه** (مراجعة D-317): مرجعٌ `security:<n>` يُقبل حين يكون صفُّ التدقيق نفسُه
 * `security.notice` ببريد القارئ، ويُحفظ في منظّمة المالك ببريده — فيُطفأ في كلّ منظّمة، ولا يُطفئه غيرُه.
 */
export async function markRead(db: Db, org: string, refs: readonly string[], byEmail: string | null): Promise<number> {
  const clean = [...new Set(refs.filter((r) => /^[a-z]+:[^\s]{1,200}$/.test(r)))].slice(0, 200)
  if (clean.length === 0) return 0
  try {
    const asked = clean.filter((r) => /^security:\d{1,12}$/.test(r)).map((r) => Number(r.slice('security:'.length)))
    const mine = asked.length === 0 || byEmail === null ? new Set<number>() : new Set((await db
      .prepare(`SELECT id FROM audit_log WHERE org_id = 'org_owner' AND action = 'security.notice' AND by_email = ?
                 AND id IN (SELECT value FROM json_each(?))`)
      .bind(byEmail, JSON.stringify(asked))
      .all<{ id: number }>()).results.map((r) => r.id))
    const kept = clean.filter((ref) => !ref.startsWith('security:') || mine.has(Number(ref.slice('security:'.length))))
    if (kept.length === 0) return 0
    const statements = kept.map((ref) =>
      db.prepare('INSERT OR IGNORE INTO notice_reads (ref, org_id, by_email) VALUES (?, ?, ?)')
        .bind(ref, ref.startsWith('security:') ? 'org_owner' : org, byEmail),
    )
    // ‏دفعةٌ واحدة حيث تُتاح (D1)، وإلّا واحدةً واحدة — والنتيجةُ نفسُها
    if (typeof db.batch === 'function') await db.batch(statements)
    else for (const s of statements) await s.run()
    return kept.length
  } catch (error) {
    console.warn({ job: 'notices-read', failed: String(error) })
    return 0
  }
}
