/**
 * دورةُ الأسبوع — تبني التقرير، تحفظه، ثمّ تقترح ترويجا إن كان له سقف.
 *
 * **والترتيبُ مقصود:** التقريرُ يُحفَظ أوّلا. فتوصيةٌ تُكتب ثمّ يفشل
 * حفظُ التقرير تترك مالكا يرى مبلغا مقترَحا **بلا الأرقام التي بُني
 * عليها** — وهو أسوأُ من ألّا يرى شيئا.
 */
import type { Db } from '../tokens'
import { readSettings } from '../settings'
import { listOrgs, OWNER_ORG } from '../tenancy'
import { buildWeekly, saveWeekly, weekBounds, type WeeklyReport } from './weekly'
import { pick, saveSuggestion, type PromoteOutcome } from './promote'

export interface WeeklyOutcome {
  readonly id: string
  readonly report: WeeklyReport
  /** هل كُتب الصفُّ الآن؟ و`false` تعني أنّ الأسبوع كان مكتوبا. */
  readonly written: boolean
  readonly promotion: PromoteOutcome
  /** هل صار للتوصية صفٌّ الآن؟ ومنشورٌ أُوصي به مرّةً لا يُعاد. */
  readonly suggested: boolean
}

/**
 * مفتاحُ تقرير المنظّمة (D-234): أسبوعُ المالك بمفتاحه القديم فلا تنكسر روابطُه،
 * ولغيره الأسبوعُ ومعه المنظّمة. فالمفتاحُ فريدٌ في الجدول والأسبوعُ واحد.
 */
export function reportId(org: string, week: string): string {
  return org === OWNER_ORG ? week : `${week}.${org}`
}

/** دورةُ أسبوعٍ لمنظّمةٍ واحدة: أرقامُها من منشوراتها وكلفتها وحدها. */
export async function runWeekly(db: Db, now: Date, org: string = OWNER_ORG): Promise<WeeklyOutcome> {
  const { from, to, id: week } = weekBounds(now)
  const id = reportId(org, week)
  const { report, posts } = await buildWeekly(db, org, from, to)
  const written = await saveWeekly(db, org, id, report)

  const settings = await readSettings(db)
  const promotion = pick(posts, settings.weeklyPromoCapUsd)
  const suggested =
    promotion.kind === 'suggested' ? await saveSuggestion(db, promotion.candidate) : false

  return { id, report, written, promotion, suggested }
}

/**
 * الدورةُ لكلّ منظّمة (D-234) — **وواحدةٌ تتعثّر لا توقف البقيّة**: سببُها
 * يُسجَّل باسمها، وتمضي الأخرى.
 */
export async function runWeeklyAll(db: Db, now: Date): Promise<WeeklyOutcome[]> {
  const out: WeeklyOutcome[] = []
  for (const org of await listOrgs(db)) {
    try {
      out.push(await runWeekly(db, now, org.id))
    } catch (error) {
      console.log({ job: 'report', org: org.id, failed: String(error) })
    }
  }
  return out
}
