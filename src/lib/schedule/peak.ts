/**
 * ساعاتُ الذروة — **مقيسةٌ أو لا تُقال** (D-106).
 *
 * ## القاعدة
 *
 * «أفضلُ وقتٍ للنشر ٩ صباحا» جملةٌ تُقرأ في كلّ مدوّنةِ تسويق، **وليست
 * قياسا لهذا الحساب**. واقتراحٌ مخترَعٌ أسوأُ من حقلٍ خامّ: **الخامُّ يقول
 * «قرّر أنت»، والمخترَعُ يقول «قِسنا لك» وهو لم يقس**.
 *
 * فلا يُقترَح شيءٌ حتّى تُقاس **ثماني** محاولاتِ نشرٍ ناجحةٍ لها قياس.
 * ودون ذلك تُقال العلّةُ نصّا: «لم يُقَس بعد — وهذه ثلاثةٌ من ثمانٍ».
 *
 * ## ولماذا الوسيطُ لا المتوسّط — **ولماذا ثلاثةٌ في الساعة**
 *
 * منشورٌ واحدٌ انتشر يرفع متوسّطَ ساعته فيصير الاقتراحُ صدى **حادثةٍ لا
 * عادة**.
 *
 * **والوسيطُ وحدَه لا يكفي**: وسيطُ عيّنةٍ من اثنين هو متوسّطُهما بعينه.
 * فلا تُرشَّح ساعةٌ دون ثلاثةِ منشورات — **وثلاثةٌ أوّلُ عددٍ تُبتلَع فيه
 * الشاذّةُ في طرفٍ ولا تُزيح المركز**.
 *
 * ## والساعةُ UTC — والصندوقُ UTC
 *
 * ولا تحويلَ في الخادم: المنطقةُ تُقرأ في المتصفّح وحدَه (D-106)، **والرقمُ
 * يُعرَض بالوسم فيصير سطرين** كسائر المواعيد.
 */
import type { Db } from '../tokens'

/** ما لا يُقترَح دونه — **وثمانٍ ليست ذوقا**: انظر الشرح أسفله. */
export const MIN_SAMPLES = 8

export interface PeakHour {
  /** ساعةُ اليوم بـ UTC، ‏٠ إلى ‏٢٣. */
  readonly hour: number
  /** وسيطُ التفاعل في هذه الساعة. */
  readonly median: number
  readonly posts: number
}

export interface Peaks {
  readonly samples: number
  /** أعلى ثلاثِ ساعاتٍ — أو فارغةٌ إن لم تبلغ العيّنةُ الحدّ. */
  readonly hours: readonly PeakHour[]
  /** سببُ الصمت حين تكون `hours` فارغة — ونصٌّ يُقرأ لا رمز. */
  readonly why: string | null
}

function median(xs: readonly number[]): number {
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * يقرأ ساعاتِ الذروة لمنصّةٍ من تاريخها هي.
 *
 * **ولكلّ منصّةٍ ذروتُها**: جمهورُ LinkedIn في ساعات العمل، وجمهورُ X
 * ليلا. **وخلطُهما يعطي وسطا لا يصف أيّا منهما.**
 */
export async function readPeaks(db: Db, org: string, platform: string): Promise<Peaks> {
  /*
   * **والتفاعلُ لا الظهور** (D-048 · D-058).
   *
   * LinkedIn لا يعطي الظهورَ لمنشور عضو، **فترتيبٌ عليه يرتّب المنصّاتِ
   * بما تفصح عنه لا بما وقع**. والتفاعلُ يُقاس في الأربع كلِّها.
   *
   * و`COALESCE` هنا صفرٌ مقصود: عمودٌ `null` في نافذةٍ قِيست يعني «لا
   * يُقاس هذا الحقل»، **والصفُّ نفسُه قِيس** — فلا يُطرَح من العيّنة.
   */
  const { results } = await db
    .prepare(
      `SELECT CAST(strftime('%H', min(pa.at)) AS INTEGER) AS hour,
              COALESCE(m.reactions, 0) + COALESCE(m.comments, 0)
                + COALESCE(m.shares, 0) AS engagement
         FROM posts p
         JOIN publish_attempts pa ON pa.post_id = p.id AND pa.org_id = p.org_id AND pa.status = 'succeeded'
         JOIN metrics m ON m.post_id = p.id AND m.org_id = p.org_id AND m.window = '24h'
        WHERE p.org_id = ? AND p.platform = ?
        GROUP BY p.id`,
    )
    .bind(org, platform)
    .all<{ hour: number; engagement: number }>()
    .catch(() => ({ results: [] as { hour: number; engagement: number }[] }))

  const samples = results.length
  if (samples < MIN_SAMPLES) {
    return {
      samples,
      hours: [],
      why: `لم تُقَس بعد — ${samples} من ${MIN_SAMPLES} منشورات نُشرت وقِيست`,
    }
  }

  const byHour = new Map<number, number[]>()
  for (const r of results) {
    const list = byHour.get(r.hour) ?? []
    list.push(r.engagement)
    byHour.set(r.hour, list)
  }

  /*
   * **وثلاثةٌ في الساعة لا اثنان — والاختبارُ هو الذي صحّح الرقم.**
   *
   * كُتب الحدُّ اثنين أوّلا، وكُتب معه تعليلٌ يقول إنّ الوسيطَ لا تحرّكه
   * شاذّة. **فسقط الاختبارُ الذي جُعل ليثبته**: وسيطُ عيّنةٍ من اثنين
   * **هو متوسّطُهما بعينه** — فمنشورٌ واحدٌ انتشر يرفع ساعتَه إلى القمّة،
   * وهي العلّةُ التي رُدَّ بها المتوسّط أصلا.
   *
   * **فالوسيطُ لا يقاوم شيئا قبل الثالث.** وثلاثةٌ أوّلُ عددٍ يصير فيه
   * الوسيطُ قيمةً وسطى تُحيط بها قيمتان، **فتُبتلَع الشاذّةُ في طرفٍ ولا
   * تُزيح المركز**.
   *
   * وثمنُه أنّ ثمانيَ عيّنةٍ تُرشِّح ساعتين على الأكثر. **وساعتان مقيستان
   * خيرٌ من أربعٍ إحداهنّ حادثة.**
   */
  const PER_HOUR = 3
  const hours = [...byHour.entries()]
    .filter(([, xs]) => xs.length >= PER_HOUR)
    .map(([hour, xs]) => ({ hour, median: median(xs), posts: xs.length }))
    .sort((a, b) => b.median - a.median || b.posts - a.posts)
    .slice(0, 3)

  if (hours.length === 0) {
    return {
      samples,
      hours: [],
      why: `قِيست العيّنة ولم تبلغ ساعة ${PER_HOUR} منشورات — ولا عادة في موعد لم يتكرّر`,
    }
  }
  return { samples, hours, why: null }
}
