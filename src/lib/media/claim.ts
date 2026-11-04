/**
 * حجزُ نداءٍ مدفوعٍ قبل أن يُدفَع (D-004 · D-008).
 *
 * ## القيدُ الفريدُ كان يقع متأخّرا
 *
 * `media.idempotency_key` فريدٌ منذ `0010`. والترتيبُ كان:
 *
 *     اقرأ: أثمّ صفٌّ بهذا المفتاح؟  →  لا
 *     ولّد (وادفع)
 *     اكتب  →  هنا يقع القيد
 *
 * فطلبان متزامنان يقرآن «لا» كلاهما، **ويدفعان كلاهما**، ثمّ يُردّ
 * أحدُهما عند الكتابة. **والقيدُ منع الصفَّ المكرّر بعد أن وقع الدفعُ
 * المكرّر** — وهو ليس ما وُجد لأجله.
 *
 * ## وفي الفيديو ليست نافذةً بل دقائق
 *
 * حارسُ الفيديو كان صفّا `ready`، ولا يوجد إلّا بعد التوليد والسحب
 * والرفع. **فكلُّ نقرةٍ في تلك الدقائق تبدأ توليدا جديدا** — ومفتاحُه
 * كان مشتقّا من `uuid` فلا يتكرّر، فالقيدُ لا يقع أصلا.
 *
 * ## فالحجزُ يسبق
 *
 * يُكتب صفٌّ بمفتاح النداء **قبل** الإنفاق. من كتبه ولّد، ومن رُدَّ عُلم
 * أنّ نداءً جاريا فرُدّ بـ «جارٍ» لا بفشل — **والقاعدةُ هي التي تفصل**.
 *
 * ## وحجزٌ لا يُحرَّر يشيخ ولا يُخلَّد
 *
 * Worker يُقتل، وشبكةٌ تنقطع، ونداءٌ يعلق. فحجزٌ أقدمُ من نافذته
 * **يُؤخَذ** لا يُنتظَر: وإلّا أقفل بابَ التوليد على منشورٍ إلى الأبد.
 *
 * والنافذةُ بقدر النداء لا بقدرٍ واحد: الصورةُ ثوانٍ، والمقطعُ دقائق.
 *
 * ## وقاعدةٌ لا تردّ تغلق لا تفتح (D-291)
 *
 * كان العطلُ يُعاد «لك النداء» بحجّة جدولٍ لم يُرحَّل. والجدولُ مُرحَّلٌ منذ `0017`،
 * فما يقع هنا عطلٌ حقيقيّ، والبابُ المفتوحُ عنده يدفع مرّتين. فصار `unavailable`
 * بسببه، والمنادي يردّه فشلًا قابلًا للإعادة قبل أيّ إنفاق — كحجز التحليل (D-270).
 */
import { changedRows } from '../dbResult'
import type { Db } from '../tokens'

export type ClaimKind = 'image' | 'video'

/**
 * كم يبقى الحجزُ قائما بلا تحرير.
 *
 * **وأسخى ممّا يستغرقه النداءُ عادةً**: نافذةٌ ضيّقة تجعل ثانيا يبدأ
 * توليدا والأوّلُ لم يفرغ بعد — وهو عينُ ما وُجد الحجزُ ليمنعه.
 */
export const STALE_MINUTES: Readonly<Record<ClaimKind, number>> = {
  image: 10,
  video: 30,
}

export type ClaimOutcome =
  /** لك النداء: ولّد، ثمّ حرّر أو اكتب */
  | { readonly kind: 'claimed' }
  /** غيرُك يولّد الآن — **وليس فشلا**، فلا يُعاد ولا يُبلَّغ عطلا */
  | { readonly kind: 'busy'; readonly since: string }
  /**
   * القاعدةُ لم تردّ فلا حجزَ ولا نداء (D-291) — **مغلقٌ عند العطل** كحجز التحليل (D-270).
   *
   * كان يُعاد `claimed`: «جدولٌ لم يُرحَّل لا يوقف التوليد». لكنّ الترحيلَ قبل الدالّة قاعدةٌ
   * (CLAUDE.md)، وما يصل هنا فعلًا هو قاعدةٌ متعبة — وفتحُ الباب حينها يعني نداءين مدفوعين
   * لصورةٍ واحدة، وهو عينُ ما وُجد الحجزُ ليمنعه. والردُّ قابلٌ للإعادة: لم يُنفَق شيء.
   */
  | { readonly kind: 'unavailable'; readonly why: string }

function minutesBetween(from: string, to: Date): number {
  const started = Date.parse(from.includes('T') ? from : `${from.replace(' ', 'T')}Z`)
  if (Number.isNaN(started)) return Number.POSITIVE_INFINITY
  return (to.getTime() - started) / 60_000
}

/**
 * يحجز، أو يقول إنّ الحجزَ لغيرِك، أو إنّ القاعدةَ لم تردّ فلا نداء.
 *
 * **ولا يرمي**: عطلُ القاعدة يعود `unavailable` بسببه، والمنادي يردّه فشلًا يُعاد
 * **قبل** أن يُنفَق شيء (D-291).
 */
export async function claimGeneration(
  db: Db,
  org: string,
  key: string,
  postId: string,
  kind: ClaimKind,
  now: Date,
): Promise<ClaimOutcome> {
  try {
    const inserted = await db
      .prepare(
        // ‏والحجزُ في منظّمة منشوره (D-277)
        `INSERT INTO media_claims (idempotency_key, post_id, kind, claimed_at, org_id)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(idempotency_key) DO NOTHING`,
      )
      .bind(key, postId, kind, now.toISOString(), org)
      .run()
    if (changedRows(inserted)) return { kind: 'claimed' }

    // قائمٌ: أشائخٌ هو؟
    const row = await db
      .prepare('SELECT claimed_at FROM media_claims WHERE idempotency_key = ? AND org_id = ?')
      .bind(key, org)
      .first<{ claimed_at: string }>()
    if (row === null) return { kind: 'claimed' }

    const age = minutesBetween(row.claimed_at, now)
    if (age < STALE_MINUTES[kind]) return { kind: 'busy', since: row.claimed_at }

    /*
     * **والأخذُ مشروطٌ بما قُرئ.** لو كُتب `UPDATE ... WHERE key = ?`
     * وحدَه، لأخذه اثنان قرآ الشيخوخةَ معا. فالشرطُ على `claimed_at`
     * القديم: **يكتبه من قرأه**، والآخرُ يُردّ.
     */
    const took = await db
      .prepare('UPDATE media_claims SET claimed_at = ? WHERE idempotency_key = ? AND org_id = ? AND claimed_at = ?')
      .bind(now.toISOString(), key, org, row.claimed_at)
      .run()
    return changedRows(took) ? { kind: 'claimed' } : { kind: 'busy', since: row.claimed_at }
  } catch (error) {
    console.warn({ job: 'media-claim', key, failed: String(error) })
    return { kind: 'unavailable', why: String(error).slice(0, 120) }
  }
}

/** ردُّ المنادي حين لا تردّ القاعدة — جملةٌ واحدةٌ للصورة والمقطع (D-291). */
export const CLAIM_UNAVAILABLE = 'تعذّر حجزُ التوليد: القاعدة لم تردّ، ولم يُنفَق شيء — أعد المحاولة بعد قليل'

/**
 * يُحرَّر عند الفشل — **لا عند النجاح**.
 *
 * الناجحُ يترك حجزَه قائما: صفُّ `media` صار موجودا، والفحصُ الذي قبل
 * الحجز يردّ «موجودةٌ» فلا يصل إلى هنا أصلا. **وتحريرُه يفتح البابَ
 * لتوليدٍ ثانٍ يُدفَع ثمنُه بلا داعٍ.**
 */
export async function releaseClaim(db: Db, org: string, key: string): Promise<void> {
  try {
    await db.prepare('DELETE FROM media_claims WHERE idempotency_key = ? AND org_id = ?').bind(key, org).run()
  } catch {
    // جدولٌ لم يُرحَّل، أو حجزٌ أُخذ منّا: الشيخوخةُ تكفله على كلّ حال
  }
}
