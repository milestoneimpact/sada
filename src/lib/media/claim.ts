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

function minutesBetween(from: string, to: Date): number {
  const started = Date.parse(from.includes('T') ? from : `${from.replace(' ', 'T')}Z`)
  if (Number.isNaN(started)) return Number.POSITIVE_INFINITY
  return (to.getTime() - started) / 60_000
}

/**
 * يحجز، أو يقول إنّ الحجزَ لغيرِك.
 *
 * **ولا يرمي على جدولٍ لم يُرحَّل**: يُعيد `claimed` — فنظامٌ قبل
 * الترحيل يعمل كما كان يعمل، بحارسه القديم، ولا يقف.
 */
export async function claimGeneration(
  db: Db,
  key: string,
  postId: string,
  kind: ClaimKind,
  now: Date,
): Promise<ClaimOutcome> {
  try {
    const inserted = await db
      .prepare(
        `INSERT INTO media_claims (idempotency_key, post_id, kind, claimed_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(idempotency_key) DO NOTHING`,
      )
      .bind(key, postId, kind, now.toISOString())
      .run()
    if (changedRows(inserted)) return { kind: 'claimed' }

    // قائمٌ: أشائخٌ هو؟
    const row = await db
      .prepare('SELECT claimed_at FROM media_claims WHERE idempotency_key = ?')
      .bind(key)
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
      .prepare('UPDATE media_claims SET claimed_at = ? WHERE idempotency_key = ? AND claimed_at = ?')
      .bind(now.toISOString(), key, row.claimed_at)
      .run()
    return changedRows(took) ? { kind: 'claimed' } : { kind: 'busy', since: row.claimed_at }
  } catch {
    return { kind: 'claimed' }
  }
}

/**
 * يُحرَّر عند الفشل — **لا عند النجاح**.
 *
 * الناجحُ يترك حجزَه قائما: صفُّ `media` صار موجودا، والفحصُ الذي قبل
 * الحجز يردّ «موجودةٌ» فلا يصل إلى هنا أصلا. **وتحريرُه يفتح البابَ
 * لتوليدٍ ثانٍ يُدفَع ثمنُه بلا داعٍ.**
 */
export async function releaseClaim(db: Db, key: string): Promise<void> {
  try {
    await db.prepare('DELETE FROM media_claims WHERE idempotency_key = ?').bind(key).run()
  } catch {
    // جدولٌ لم يُرحَّل، أو حجزٌ أُخذ منّا: الشيخوخةُ تكفله على كلّ حال
  }
}
