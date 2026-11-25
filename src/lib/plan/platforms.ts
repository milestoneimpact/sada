/**
 * **منصّاتُ الخطّة لكلّ منظّمة** (D-399 · ROADMAP-3 §4 البند ٧): LinkedIn وX دائمًا، وInstagram وTikTok **خلف بوّابة** —
 * تدخلان `PLAN_NOW` للمنظّمة إن رُبط حسابُها (حسابٌ نشط) أو فُتح علمُها صراحةً في `plan_platform_flags` (0069).
 * وبلا أيٍّ منهما يبقى السلوكُ كما كان، وتقول الشاشةُ ما يفتحه الربط.
 *
 * ومتطلّباتُ الوسيط هنا مصدرُها الواحد: Instagram لا ينشر نصًّا وحده (صورةٌ أو مقطع)، وTikTok مقطعٌ لا غير
 * (`docs/PLATFORMS.md`). و`planChecks` يمنع بها البندَ الذي ينقصه وسيطُه.
 */
import type { Db } from '../tokens'
import type { PlanPlatform } from './prompt'

/** ما يُخطَّط له لكلّ منظّمة بقرار المالك. */
export const PLAN_BASE: readonly PlanPlatform[] = ['linkedin', 'x']
/** ما يدخل الخطّةَ بالربط أو بالعلم (M-14 · M-24). */
export const PLAN_GATED: readonly PlanPlatform[] = ['instagram', 'tiktok']

/** `PLAN_NOW` للمنظّمة: الأساسُ، ثمّ كلُّ مبوَّبةٍ مربوطةٍ أو مفتوحٍ علمُها. */
export function planNowFor(linked: readonly string[], flagged: readonly string[] = []): PlanPlatform[] {
  return [...PLAN_BASE, ...PLAN_GATED.filter((p) => linked.includes(p) || flagged.includes(p))]
}

/** ما يفتحه ربطُ المبوَّبة — يُقال في الشاشة حين لا تدخل الخطّة. */
export const GATED_UNLOCKS: Readonly<Record<string, string>> = {
  instagram: 'اربط Instagram لتُضاف إلى خطّتك منشوراتٌ بصورةٍ أو مقطع',
  tiktok: 'اربط TikTok لتُضاف إلى خطّتك مقاطعُ قصيرة',
}

export type MediaKind = 'image' | 'video' | 'none'
export type MediaNeed = 'visual' | 'video' | null

/** ما تحتاجه المنصّة من وسيط: Instagram صورةً أو مقطعًا، وTikTok مقطعًا، والبقيّةُ لا شيء. */
export function mediaNeed(platform: string): MediaNeed {
  return platform === 'instagram' ? 'visual' : platform === 'tiktok' ? 'video' : null
}

/** سببُ المنع إن لم يفِ الوسيطُ بحاجة منصّته — أو `null`. والوسيطُ المجهول (`undefined`) لا يُحكم عليه هنا. */
export function mediaProblem(platform: string, media: MediaKind | null | undefined): string | null {
  const need = mediaNeed(platform)
  if (need === null || media === undefined) return null
  if (need === 'video' && media !== 'video') return 'TikTok ينشر مقطعًا، وهذا البندُ بلا مقطع'
  if (need === 'visual' && (media === null || media === 'none')) return 'Instagram لا ينشر نصًّا وحده — أضف صورةً أو مقطعًا'
  return null
}

/** الأعلامُ المفتوحة للمنظّمة. وغيابُ الجدول (قبل 0069) «لا علم»، فلا ينكسر شيء. */
export async function readPlanFlags(db: Db, org: string): Promise<string[]> {
  return db.prepare('SELECT platform FROM plan_platform_flags WHERE org_id = ? AND enabled = 1').bind(org)
    .all<{ platform: string }>().then((r) => r.results.map((x) => x.platform)).catch(() => [])
}
