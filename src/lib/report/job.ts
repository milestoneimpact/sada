/**
 * دورةُ الأسبوع — تبني التقرير، تحفظه، ثمّ تقترح ترويجا إن كان له سقف.
 *
 * **والترتيبُ مقصود:** التقريرُ يُحفَظ أوّلا. فتوصيةٌ تُكتب ثمّ يفشل
 * حفظُ التقرير تترك مالكا يرى مبلغا مقترَحا **بلا الأرقام التي بُني
 * عليها** — وهو أسوأُ من ألّا يرى شيئا.
 */
import type { Db } from '../tokens'
import { readSettings } from '../settings'
import { OWNER_ORG } from '../tenancy'
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

// ‏الدورةُ لمنظّمة المالك وحدها حتى تمرّ المجدولاتُ على المنظّمات (D-227)
export async function runWeekly(db: Db, now: Date): Promise<WeeklyOutcome> {
  const { from, to, id } = weekBounds(now)
  const { report, posts } = await buildWeekly(db, from, to)
  const written = await saveWeekly(db, OWNER_ORG, id, report)

  const settings = await readSettings(db)
  const promotion = pick(posts, settings.weeklyPromoCapUsd)
  const suggested =
    promotion.kind === 'suggested' ? await saveSuggestion(db, promotion.candidate) : false

  return { id, report, written, promotion, suggested }
}
