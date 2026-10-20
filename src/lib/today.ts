/**
 * «ما وقع اليوم» — **الروايةُ من بياناتٍ في اليد** (D-127).
 *
 * ## لماذا
 *
 * اللوحةُ تقول ما ينتظرك، **ولا تقول ما وقع منذ منتصف الليل**: نُشر
 * منشور، وفشل آخر، واعتمدتَ مسوّدة، وجُدّد إذن. والبياناتُ كلُّها في
 * القاعدة — في `audit_log` و`publish_attempts` و`posts` — **والروايةُ
 * غائبة** (سنّةُ D-104: ما في القاعدة يُروى ولا يُترَك صفوفًا).
 *
 * ## ولا استعلامَ جديدًا
 *
 * كلُّ ما هنا ممّا تقرؤه اللوحةُ أصلًا: آخرُ خمسين صفًّا من سجلّ التدقيق،
 * والمسوّداتُ، وحقائقُ اللوح المحوريّ. **فتُصفّى إلى اليوم وتُروى** —
 * دالّةٌ نقيّةٌ لا تمسّ شيئًا، وسقفُ الخمسين يحدّ ما يُروى من التدقيق
 * ويُقال حين يُبلَغ.
 *
 * ## واليومُ يومُ UTC
 *
 * كما تُصفَّر السقوفُ عند منتصف الليل UTC (D-011)، وكما تُختَم الصفوفُ
 * في القاعدة. **ويومٌ محلّيٌّ يجعل «اليوم» يختلف بين جهازين.**
 */
import { actionLabel, targetLabel } from './audit'
import { platformLabel } from './oauth/providers'

export interface TodayInput {
  readonly now: Date
  readonly audit: readonly {
    readonly at: string
    readonly action: string
    readonly target: string | null
    readonly detail: string | null
  }[]
  readonly drafts: readonly {
    readonly status: string
    readonly platform: string
    readonly createdAt: string
    readonly approvedAt: string | null
  }[]
  readonly facts: readonly {
    readonly day: string
    readonly platform: string
    readonly status: string
    readonly succeeded: boolean
  }[]
}

export interface TodayItem {
  /** وقتُه بصيغة القاعدة — أو `null` لما يُعرَف يومُه لا ساعتُه. */
  readonly at: string | null
  readonly kind: 'ok' | 'bad' | 'note'
  readonly text: string
  readonly go?: string
  /** اسمُ الوجهة على الزرّ — **فزرّان باسمٍ واحدٍ يذهبان إلى وجهتين يكذبان** (D-122). */
  readonly goLabel?: string
}

/** أفعالٌ تُقرأ عطلًا أو رفضًا — حالُها حمراء في الرواية. */
const BAD_ACTIONS = /denied|reject|revoke/

/** أفعالُ الجلسات ضجيجٌ في رواية اليوم — وموضعُها سجلُّ الأمان. */
const QUIET_ACTIONS = /^session\.(open|close|pending)$|^2fa\./

/** كم بندًا يُروى على الأكثر — والباقي يُقال عددًا. */
export const TODAY_CAP = 12

function dayOf(now: Date): string {
  return now.toISOString().slice(0, 10)
}

function sameDay(stamp: string, day: string): boolean {
  return stamp.slice(0, 10) === day
}

export function todayFeed(i: TodayInput): { items: readonly TodayItem[]; more: number } {
  const day = dayOf(i.now)
  const out: TodayItem[] = []

  for (const f of i.facts) {
    if (f.day !== day) continue
    if (f.succeeded) {
      out.push({ at: null, kind: 'ok', text: `نُشر منشور على ${platformLabel(f.platform)}`, go: `/panel/channels/${f.platform}`, goLabel: `شاشة ${platformLabel(f.platform)}` })
    } else if (f.status === 'failed') {
      out.push({ at: null, kind: 'bad', text: `فشل النشر على ${platformLabel(f.platform)}`, go: `/panel/channels/${f.platform}`, goLabel: `شاشة ${platformLabel(f.platform)}` })
    }
  }

  for (const d of i.drafts) {
    const name = platformLabel(d.platform)
    if (d.approvedAt !== null && sameDay(d.approvedAt, day)) {
      if (d.status === 'rejected') out.push({ at: d.approvedAt, kind: 'note', text: `رفضت مسوّدةً لـ${name}`, go: '#posts', goLabel: 'المنشورات' })
      else out.push({ at: d.approvedAt, kind: 'ok', text: `اعتمدت مسوّدةً لـ${name}`, go: '#posts', goLabel: 'المنشورات' })
    } else if (sameDay(d.createdAt, day)) {
      out.push({ at: d.createdAt, kind: 'note', text: `كُتبت مسوّدة لـ${name} تنتظر قرارك`, go: '#posts', goLabel: 'المنشورات' })
    }
  }

  for (const a of i.audit) {
    if (!sameDay(a.at, day) || QUIET_ACTIONS.test(a.action)) continue
    const what = actionLabel(a.action)
    const on = a.target === null ? '' : ` — ${targetLabel(a.target)}`
    out.push({ at: a.at, kind: BAD_ACTIONS.test(a.action) ? 'bad' : 'note', text: `${what}${on}`, go: '#activity', goLabel: 'سجلّ النشاط' })
  }

  // الأحدثُ أوّلًا، وما بلا ساعةٍ آخرًا — يُعرَف يومُه لا وقتُه
  out.sort((x, y) => {
    if (x.at === null || y.at === null) return x.at === null ? (y.at === null ? 0 : 1) : -1
    return x.at < y.at ? 1 : x.at > y.at ? -1 : 0
  })
  const folded = fold(out)
  return { items: folded.slice(0, TODAY_CAP), more: Math.max(0, folded.length - TODAY_CAP) }
}

/**
 * **الفعلُ الواحدُ مرّتين سطرٌ واحدٌ بعدده** (D-134).
 *
 * ضغط المالكُ «احفظ» مرّتين على بطاقات اللوح فقرأ «تغيير إعداد — بطاقات
 * اللوح» سطرين متطابقين تحت بعضهما. **والتطابقُ بالنصّ والحال**: يبقى
 * الأحدثُ بوقته، ويُلحَق به العدد، ولا يُطوى ما اختلف نصُّه.
 */
function fold(items: readonly TodayItem[]): readonly TodayItem[] {
  const seen = new Map<string, { item: TodayItem; n: number }>()
  const order: string[] = []
  for (const item of items) {
    const key = `${item.kind}\u0000${item.text}`
    const hit = seen.get(key)
    if (hit === undefined) {
      seen.set(key, { item, n: 1 })
      order.push(key)
    } else hit.n += 1
  }
  return order.map((key) => {
    const { item, n } = seen.get(key)!
    return n === 1 ? item : { ...item, text: `${item.text} — ${n === 2 ? 'مرّتين' : `${n} مرّات`}` }
  })
}
