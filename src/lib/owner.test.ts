/**
 * مهامُّ المالك — **والحارسُ يمنع القائمةَ أن تشيخ.**
 *
 * قائمةٌ مكتوبةٌ بيدٍ تشيخ، وقد شاخت فعلا: `STATUS.md` وقف عند D-044
 * ثلاثةَ عشرَ قرارا. **فما يُقاس وحده يبقى صادقا.**
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { OWNER_TASKS, ownerRows, pendingCount, type OwnerFacts } from './owner'

const DOC = readFileSync(new URL('../../docs/MANUAL-TASKS.md', import.meta.url), 'utf8')

/** عناوينُ المهامّ في الوثيقة — `## M-NN · …` */
const documented = new Set(
  [...DOC.matchAll(/^##+\s*(?:✅\s*)?(M-\d{2})\b/gm)].map((m) => m[1]!),
)

/**
 * مهامٌّ **وقعت وانقضت** — صفحتُها تبقى للسجلّ ولا صفَّ لها.
 *
 * **ولا يُضاف رمزٌ هنا بلا سطرٍ يقول لماذا، ومعه ما يُثبته.** قائمةُ
 * تقاعدٍ بلا بيّنةٍ تصير البابَ الذي يهرب منه ما لم يقع.
 */
const RETIRED = new Map([
  ['M-01', 'المستودعُ قائمٌ — وهذه الشيفرةُ فيه'],
  ['M-05', 'النطاقان يعملان و D1 و KV و R2 مربوطةٌ في `wrangler.toml`'],
  ['M-06', 'حسابُ الخدمة قائم — و`M-11` هي الحيّةُ منه (تدويرُ مفتاحه)'],
  ['M-10', 'سرُّ النشر مضبوط — **٤٢ تشغيلَ `deploy` ناجحا**، آخرُها اليوم'],
])

const empty: OwnerFacts = {
  secrets: new Set(), linked: new Set(), appsConfigured: new Set(),
  appsVerified: new Set(), vars: new Set(), providersReady: new Set(),
  anyPublished: false, videoPriced: false,
  // **مستحقّةٌ للمراجعة**: `empty` تعني «لا شيءَ تمّ»، فالرقمُ شائخٌ فيها
  linkedInVersionDue: true,
}

describe('السجلُّ والوثيقةُ لا يفترقان', () => {
  /**
   * **رمزٌ في السجلّ بلا صفحةٍ يترك المالكَ بعنوانٍ بلا خطوات.**
   */
  it('كلُّ مهمّةٍ في السجلّ لها صفحةٌ في الوثيقة', () => {
    for (const task of OWNER_TASKS) {
      expect(documented, `${task.code} في السجلّ ولا صفحةَ له في MANUAL-TASKS.md`)
        .toContain(task.code)
    }
  })

  /**
   * **والاتّجاهُ الثاني — وكان مفقودا.**
   *
   * ترويسةُ `owner.ts` تعد بحارسٍ «يردّ رمزا في الشيفرة بلا صفحةٍ في
   * الوثيقة، **وصفحةً بلا صفٍّ هنا**». والثاني لم يكن مكتوبا — **فنجا
   * منه `M-10`**: صفحةٌ كاملةٌ تقول «**يوقف بوّابة المرحلة ٠**»،
   * وجدولٌ مكتوبٌ بيدٍ يقول «مطلوبة الآن»، **ولا صفَّ لها في السجلّ**
   * فلا تبلغ `/panel/tasks` ولا تُعَدّ (D-073).
   *
   * وهي علّةُ D-063 نفسُها ناجيةً من حارسها لأنّه نصفُ حارس.
   */
  it('وكلُّ صفحةٍ في الوثيقة لها صفٌّ في السجلّ — أو سببٌ لتقاعدها', () => {
    const listed = new Set(OWNER_TASKS.map((t) => t.code))
    for (const code of documented) {
      if (RETIRED.has(code)) continue
      expect(listed, `${code} صفحةٌ في الوثيقة ولا صفَّ له في السجلّ`).toContain(code)
    }
  })

  /** ولا يُتقاعَد رمزٌ **لا صفحةَ له** — تقاعدُ ما ليس موجودا يُخفي خطأً. */
  it('ولا رمزَ متقاعدٌ بلا صفحة', () => {
    for (const code of RETIRED.keys()) {
      expect(documented, `${code} متقاعدٌ ولا صفحةَ له`).toContain(code)
    }
  })

  /** ولا رمزَ مكرّرٌ: صفحتان لمهمّةٍ تفترقان بعد شهر. */
  it('ولا رمزَ مكرّر', () => {
    const codes = OWNER_TASKS.map((t) => t.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  /** **والعنصرُ السادس إلزاميّ** (CLAUDE.md): ما يقع إن تُرك. */
  it('ولكلِّ مهمّةٍ «ما يقع إن تُرك» مكتوبا', () => {
    for (const task of OWNER_TASKS) {
      expect(task.ifLeft.length, `${task.code} بلا عنصرٍ سادس`).toBeGreaterThan(20)
    }
  })
})

describe('والحالُ يُشتقّ ولا يُكتَب', () => {
  /**
   * «تمّت» تُكتب بيدٍ **فتبقى مكتوبةً بعد أن تنقض**. فما أمكن اشتقاقُه
   * يُشتقّ من البيئة والقاعدة.
   */
  it('فحصٌ جائزٌ يُتمّ M-02، وربطٌ كذلك', () => {
    const byVerify = ownerRows({ ...empty, appsVerified: new Set(['linkedin']) })
    expect(byVerify.find((r) => r.code === 'M-02')!.state).toBe(true)

    const byLink = ownerRows({ ...empty, linked: new Set(['linkedin']) })
    expect(byLink.find((r) => r.code === 'M-02')!.state).toBe(true)
  })

  it('ومتغيّرا الكيان يُتمّان M-17 معا لا فرادى', () => {
    const one = ownerRows({ ...empty, vars: new Set(['LEGAL_ENTITY']) })
    expect(one.find((r) => r.code === 'M-17')!.state).toBe(false)

    const both = ownerRows({ ...empty, vars: new Set(['LEGAL_ENTITY', 'LEGAL_CONTACT']) })
    expect(both.find((r) => r.code === 'M-17')!.state).toBe(true)
  })

  /**
   * **ولا علامةَ صحٍّ على ما لم يُتحقَّق منه** (D-061).
   *
   * موافقةُ LinkedIn تقع عندها لا عندنا، ولا تُقرأ من هنا — فتبقى
   * `null`، **لا `false`**: «لم يُعرَف» ليست «لم تتمّ».
   */
  it('وما يقع عند المنصّة يبقى «لا يُعرَف» لا «لم تتمّ»', () => {
    const rows = ownerRows(empty)
    expect(rows.find((r) => r.code === 'M-03')!.state).toBeNull()
    expect(rows.find((r) => r.code === 'M-12')!.state).toBeNull()
  })

  it('والعدُّ لا يشمل ما لا يُعرَف', () => {
    const rows = ownerRows(empty)
    const unknown = rows.filter((r) => r.state === null).length
    expect(unknown).toBeGreaterThan(0)
    expect(pendingCount(empty)).toBe(rows.length - unknown)
  })
})

describe('والترتيبُ بما يفتح لا بترقيمه', () => {
  it('ما لم يتمّ أوّلا، ثمّ ما لا يُعرَف، ثمّ ما تمّ', () => {
    const rows = ownerRows({ ...empty, linked: new Set(['linkedin', 'youtube', 'tiktok']) })
    const rank = rows.map((r) => (r.state === false ? 0 : r.state === null ? 1 : 2))
    expect([...rank].sort((a, b) => a - b)).toEqual(rank)
  })

  /** والبوّابةُ تسبق القدرة: ما يوقف المشروعَ قبل ما يوسّعه. */
  it('والبوّابةُ تسبق القدرةَ عند تساوي الحال', () => {
    const rows = ownerRows(empty).filter((r) => r.state === false)
    const firstCapability = rows.findIndex((r) => r.unblocks === 'capability')
    const lastGate = rows.map((r) => r.unblocks).lastIndexOf('gate')
    if (firstCapability !== -1 && lastGate !== -1) {
      expect(lastGate).toBeLessThan(firstCapability)
    }
  })
})
