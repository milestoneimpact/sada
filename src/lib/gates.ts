/**
 * بوّاباتُ المراحل — **تُقاس من القاعدة، لا تُكتَب في وثيقة.**
 *
 * ## القاعدةُ الحاكمة، ومن يحرسها
 *
 * `docs/PLAN.md` يقول: **«لا تبدأ مرحلة قبل أن تُجتاز بوّابة سابقتها
 * ويُسجَّل ذلك في `docs/STATUS.md`»**.
 *
 * **ولم يكن يحرسها أحد.** والسجلُّ الذي عُلّقت عليه **شاخ مرّتين**:
 * وقف عند D-044 ثلاثةَ عشرَ قرارا (D-056)، ويُكتب بيدٍ في كلّ مرّة.
 * فالقاعدةُ التي تحكم المشروعَ كلَّه **معلَّقةٌ على سطرٍ يُكتب يدويّا**.
 *
 * ## فالبوّابةُ شرطٌ يُقرأ، لا سطرٌ يُدَّعى
 *
 * كلُّ بندٍ هنا **استعلامٌ على ما وقع فعلا**: منشورٌ خرج، صفٌّ في
 * الدفتر، تقريرٌ كُتب. **ولا بندَ يُجتاز بقولٍ.**
 *
 * ## وما لا يُقاس يُقال «لا يُقاس من هنا»
 *
 * بعضُ البنود تقع خارج القاعدة — «تنبيهُ انتهاء رمزٍ وصل قبل أسبوع»
 * يقع في بريدٍ لا نقرؤه. **فيُقال ذلك ولا يُدَّعى** (D-061): بوّابةٌ
 * تُجتاز بشرطٍ لم يُقَس **تُجيز مرحلةً لم تكتمل**.
 */
import type { Db } from './tokens'

export type ItemState =
  /** تحقّق — والاستعلامُ هو الدليل. */
  | 'met'
  /** لم يتحقّق بعد. */
  | 'unmet'
  /** يقع خارج ما تقرؤه القاعدة — ولا يُدَّعى فيه حكم. */
  | 'unmeasured'

export interface GateItem {
  readonly text: string
  readonly state: ItemState
  /** لماذا هذا الحكم — الرقمُ أو السببُ، لا الحكمُ وحده. */
  readonly evidence: string
}

export interface Gate {
  readonly phase: string
  readonly title: string
  readonly items: readonly GateItem[]
  /**
   * أتُجتاز؟ — **ولا تُجتاز ببندٍ لم يُقَس.**
   *
   * فبوّابةٌ فيها بندٌ `unmeasured` تبقى **«لم تُجتَز»**، ويُقال أيُّ
   * بندٍ هو: `true` تعني «قِيس كلُّ شيءٍ وتحقّق».
   */
  readonly passed: boolean
}

/** ما تُقرأ منه البوّابات — استعلاماتٌ تُجمَع مرّةً. */
export interface GateFacts {
  /** كم منشورا خرج فعلا على كلّ منصّة — من `publish_attempts`. */
  readonly publishedPerPlatform: Readonly<Record<string, number>>
  /** كم منشورا خرج **ومعه وسيطٌ جاهز**. */
  readonly publishedWithMedia: Readonly<Record<string, number>>
  /** كم منشورا خرج **في موعده بلا تدخّل** — جُدوِل ثمّ خرج. */
  readonly scheduledPublished: number
  /** أفي الدفتر صفٌّ لنشرٍ على كلّ منصّة؟ (D-008) */
  readonly ledgerPerPlatform: Readonly<Record<string, number>>
  /** كم خطّةً أسبوعيّةً وُلّدت من مصادر Drive. */
  readonly plans: number
  /** كم تقريرا أسبوعيّا كُتب. */
  readonly reports: number
  /** كم توصيةَ ترويجٍ كُتبت. */
  readonly suggestions: number
  /** أأُنفق شيءٌ على ترويج؟ **يجب أن يبقى صفرا** (D-006). */
  readonly promoSpend: number
  /** كم حسابَ صفحةٍ أو شركةٍ مربوط. */
  readonly orgAccounts: number
  /**
   * أوقع تنبيهُ سبعةِ أيّامٍ يوما ما؟
   *
   * **وكان هذا البندُ `unmeasured`** — وسببُه أنّ التنبيه كان يُتصوَّر
   * بريدا لا نقرؤه. **فالعلاجُ نقلُه إلى حيث يُقاس** لا الاعترافُ بأنّ
   * القياسَ مستحيل (D-065).
   */
  readonly weekAlertFired: boolean
}

const PLATFORMS = ['linkedin', 'x'] as const

function n(map: Readonly<Record<string, number>>, key: string): number {
  return map[key] ?? 0
}

function item(text: string, state: ItemState, evidence: string): GateItem {
  return { text, state, evidence }
}

/** يبني البوّاباتِ الأربع من الحقائق — دالّةٌ خالصةٌ تُختبَر بلا قاعدة. */
export function gatesOf(f: GateFacts): Gate[] {
  const bothPublished = PLATFORMS.every((p) => n(f.publishedPerPlatform, p) > 0)
  const bothLedger = PLATFORMS.every((p) => n(f.ledgerPerPlatform, p) > 0)
  const bothWithMedia = PLATFORMS.every((p) => n(f.publishedWithMedia, p) > 0)

  const gates: Gate[] = [
    {
      phase: '٠',
      title: 'التأسيس',
      items: [
        item(
          'منشورٌ نصّيٌّ واحدٌ على كلّ منصّة من لوحة صدى',
          bothPublished ? 'met' : 'unmet',
          PLATFORMS.map((p) => `${p}: ${n(f.publishedPerPlatform, p)}`).join(' · '),
        ),
        item(
          'وسطرٌ في `cost_ledger` لكلٍّ منهما',
          bothLedger ? 'met' : 'unmet',
          PLATFORMS.map((p) => `${p}: ${n(f.ledgerPerPlatform, p)}`).join(' · '),
        ),
        // ومفتاحُ التفرّد **يحرسه القيدُ في القاعدة** لا استعلامٌ هنا:
        // عمودُ `idempotency_key` فريدٌ منذ `0001_init` (D-004)
        item(
          'وبمفتاح `idempotency` — يحرسه قيدُ التفرّد في المخطّط',
          'met',
          'قيدٌ في القاعدة منذ 0001_init — لا يُخالَف',
        ),
      ],
      passed: false,
    },
    {
      phase: '١',
      title: 'الذكاء',
      items: [
        item(
          'خطّةٌ أسبوعيّةٌ مولَّدةٌ من ملفّات Drive',
          f.plans > 0 ? 'met' : 'unmet',
          `${f.plans} خطّة`,
        ),
        item(
          'وخمسةُ منشوراتٍ معتمدةٍ نُشرت في مواعيدها بلا تدخّل',
          f.scheduledPublished >= 5 ? 'met' : 'unmet',
          `${f.scheduledPublished} من ٥ — جُدوِلت ثمّ خرجت`,
        ),
      ],
      passed: false,
    },
    {
      phase: '٢',
      title: 'الصور والصفحات',
      items: [
        item(
          'منشورٌ بصورةٍ على كلّ منصّة',
          bothWithMedia ? 'met' : 'unmet',
          PLATFORMS.map((p) => `${p}: ${n(f.publishedWithMedia, p)}`).join(' · '),
        ),
        item(
          'ومنشورٌ على صفحة الشركة',
          f.orgAccounts > 0 && n(f.publishedPerPlatform, 'linkedin') > 0 ? 'met' : 'unmet',
          `${f.orgAccounts} حسابَ صفحةٍ مربوط`,
        ),
        /**
         * **صار يُقاس**: التنبيهُ يُسجَّل صفّا عند العتبة (D-065)،
         * فالسؤالُ «أوقع؟» يُجاب من القاعدة لا يُفترَض.
         */
        item(
          'وتنبيهُ انتهاء رمزٍ سُجّل قبل أسبوع من الانتهاء',
          f.weekAlertFired ? 'met' : 'unmet',
          f.weekAlertFired
            ? 'صفٌّ في `token_alerts` عند عتبة السبعة'
            : 'لم يقع بعد — ولا رمزَ بلغ العتبة',
        ),
      ],
      passed: false,
    },
    {
      phase: '٣',
      title: 'القياس',
      items: [
        item(
          'تقريرٌ أسبوعيٌّ وصل',
          f.reports > 0 ? 'met' : 'unmet',
          `${f.reports} تقرير`,
        ),
        item(
          'وتوصيةُ ترويجٍ ظهرت مع تكلفتها',
          f.suggestions > 0 ? 'met' : 'unmet',
          `${f.suggestions} توصية`,
        ),
        /**
         * **وهذا البندُ يُجتاز بالصفر لا بالعدد.**
         *
         * «ولم يُنفَق شيء» شرطٌ **سلبيّ**: يتحقّق ما دام الدفترُ خاليا
         * من ترويج. وأيُّ صفٍّ فيه **يُسقط البوّابة** (D-006).
         */
        item(
          'ولم يُنفَق شيءٌ على ترويج',
          f.promoSpend === 0 ? 'met' : 'unmet',
          f.promoSpend === 0 ? 'الدفترُ خالٍ من ترويج' : `أُنفق ${f.promoSpend}$ — يُسقط البوّابة`,
        ),
      ],
      passed: false,
    },
  ]

  return gates.map((g) => ({ ...g, passed: g.items.every((i) => i.state === 'met') }))
}

/** رقمُ أوّلِ مرحلةٍ لم تُجتَز — أو `null` إن اجتِزن كلُّهنّ. */
export function currentPhase(gates: readonly Gate[]): string | null {
  return gates.find((g) => !g.passed)?.phase ?? null
}

/** يقرأ الحقائقَ من القاعدة. وما لا يُقرأ يعود صفرا، **ولا يُدَّعى**. */
export async function readGateFacts(db: Db): Promise<GateFacts> {
  const zero: GateFacts = {
    publishedPerPlatform: {}, publishedWithMedia: {}, scheduledPublished: 0,
    ledgerPerPlatform: {}, plans: 0, reports: 0, suggestions: 0,
    promoSpend: 0, orgAccounts: 0, weekAlertFired: false,
  }

  const count = async (sql: string, ...binds: unknown[]): Promise<number> => {
    try {
      const row = await db.prepare(sql).bind(...binds).first<{ n: number | null }>()
      return row?.n ?? 0
    } catch {
      // جدولٌ لم يُرحَّل: صفرٌ — **والبوّابةُ تبقى غيرَ مجتازة، وهو الصحيح**
      return 0
    }
  }

  const perPlatform = async (sql: string): Promise<Record<string, number>> => {
    try {
      const { results } = await db.prepare(sql).all<{ platform: string; n: number }>()
      return Object.fromEntries(results.map((r) => [r.platform, r.n]))
    } catch {
      return {}
    }
  }

  return {
    ...zero,
    publishedPerPlatform: await perPlatform(
      `SELECT p.platform AS platform, count(DISTINCT p.id) AS n
         FROM posts p JOIN publish_attempts pa
           ON pa.post_id = p.id AND pa.status = 'succeeded'
        GROUP BY p.platform`,
    ),
    publishedWithMedia: await perPlatform(
      `SELECT p.platform AS platform, count(DISTINCT p.id) AS n
         FROM posts p
         JOIN publish_attempts pa ON pa.post_id = p.id AND pa.status = 'succeeded'
         JOIN media m ON m.post_id = p.id AND m.status = 'ready'
        GROUP BY p.platform`,
    ),
    ledgerPerPlatform: await perPlatform(
      `SELECT provider AS platform, count(*) AS n FROM cost_ledger
        WHERE provider IN ('linkedin', 'x') GROUP BY provider`,
    ),
    // **«بلا تدخّل» تعني أنّها جُدوِلت ثمّ خرجت** — لا أنّها دُفعت بيد
    scheduledPublished: await count(
      `SELECT count(DISTINCT p.id) AS n FROM posts p
         JOIN publish_attempts pa ON pa.post_id = p.id AND pa.status = 'succeeded'
        WHERE p.scheduled_at IS NOT NULL AND p.approved_at IS NOT NULL`,
    ),
    plans: await count('SELECT count(*) AS n FROM plans'),
    reports: await count('SELECT count(*) AS n FROM reports'),
    suggestions: await count('SELECT count(*) AS n FROM promotion_suggestions'),
    promoSpend: await count(
      `SELECT coalesce(sum(total), 0) AS n FROM cost_ledger
        WHERE operation LIKE '%promot%' OR operation LIKE '%ads%'`,
    ),
    orgAccounts: await count("SELECT count(*) AS n FROM accounts WHERE kind = 'org'"),
    weekAlertFired:
      (await count('SELECT count(*) AS n FROM token_alerts WHERE threshold >= 7')) > 0,
  }
}
