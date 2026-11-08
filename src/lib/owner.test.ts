/**
 * مهامُّ المالك — **والحارسُ يمنع القائمةَ أن تشيخ.**
 *
 * قائمةٌ مكتوبةٌ بيدٍ تشيخ، وقد شاخت فعلا: `STATUS.md` وقف عند D-044
 * ثلاثةَ عشرَ قرارا. **فما يُقاس وحده يبقى صادقا.**
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { OWNER_TASKS, ownerRows, pendingCount, taskDoc, type OwnerFacts, secretCommand } from './owner'

const DOC = readFileSync(new URL('../../docs/MANUAL-TASKS.md', import.meta.url), 'utf8')

/** عناوينُ المهامّ في الوثيقة — `## M-NN · …` */
const headings = [...DOC.matchAll(/^##+\s*(?:✅\s*)?(M-\d{2})\b/gm)].map((m) => m[1]!)
const documented = new Set(headings)

/**
 * مهامٌّ **وقعت وانقضت** — صفحتُها تبقى للسجلّ ولا صفَّ لها.
 *
 * **ولا يُضاف رمزٌ هنا بلا سطرٍ يقول لماذا، ومعه ما يُثبته.** قائمةُ
 * تقاعدٍ بلا بيّنةٍ تصير البابَ الذي يهرب منه ما لم يقع.
 */
const RETIRED = new Map([
  ['M-01', 'المستودع قائم — وهذه الشيفرة فيه'],
  ['M-05', 'النطاقان يعملان و D1 و KV و R2 مربوطة في `wrangler.toml`'],
  ['M-06', 'حساب الخدمة قائم — و`M-11` هي الحيّة منه (تدوير مفتاحه)'],
  ['M-10', 'سرّ النشر مضبوط — **٤٢ تشغيل `deploy` ناجحا**، آخرُها اليوم'],
])

const empty: OwnerFacts = {
  secrets: new Set(), linked: new Set(), appsConfigured: new Set(),
  appsVerified: new Set(), vars: new Set(),
  anyPublished: false, videoPriced: false,
  // **مستحقّةٌ للمراجعة**: `empty` تعني «لا شيءَ تمّ»، فالرقمُ شائخٌ فيها
  linkedInVersionDue: true,
  // قراراتُ المالك على افتراضها: أربعُ بطاقاتٍ وسقفٌ صفر (D-130)
  tilesChosen: 4, promoCapUsd: 0,
}

describe('السجلّ والوثيقة لا يفترقان', () => {
  /**
   * **رمزٌ في السجلّ بلا صفحةٍ يترك المالكَ بعنوانٍ بلا خطوات.**
   */
  it('كلّ مهمّة في السجلّ لها صفحة في الوثيقة', () => {
    for (const task of OWNER_TASKS) {
      expect(documented, `${task.code} في السجلّ ولا صفحة له في MANUAL-TASKS.md`)
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
  it('وكلّ صفحة في الوثيقة لها صفّ في السجلّ — أو سبب لتقاعدها', () => {
    const listed = new Set(OWNER_TASKS.map((t) => t.code))
    for (const code of documented) {
      if (RETIRED.has(code)) continue
      expect(listed, `${code} صفحة في الوثيقة ولا صفّ له في السجلّ`).toContain(code)
    }
  })

  /** ولا يُتقاعَد رمزٌ **لا صفحةَ له** — تقاعدُ ما ليس موجودا يُخفي خطأً. */
  it('ولا رمز متقاعد بلا صفحة', () => {
    for (const code of RETIRED.keys()) {
      expect(documented, `${code} متقاعد ولا صفحة له`).toContain(code)
    }
  })

  /** ولا رمزَ مكرّرٌ: صفحتان لمهمّةٍ تفترقان بعد شهر. */
  it('ولا رمز مكرّر', () => {
    const codes = OWNER_TASKS.map((t) => t.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  /** **والعنصرُ السادس إلزاميّ** (CLAUDE.md): ما يقع إن تُرك. */
  it('ولكلّ مهمّة «ما يقع إن تُرك» مكتوبا', () => {
    for (const task of OWNER_TASKS) {
      expect(task.ifLeft.length, `${task.code} بلا عنصر سادس`).toBeGreaterThan(20)
    }
  })

  /*
   * ‏**وعناصرُ كلّ صفحةٍ تحت رأسها وبترتيبها** (بعد الموجة الرابعة): دمجُ قراراتٍ بُنيت معًا يُلحق كلٌّ منها صفحتَه بآخر
   * ‏الوثيقة، فخلط الدمجُ ثلاث صفحات: «٥» و«٦» من M-43 تحت رأس M-47، ورأسا «٥» لـM-45 وM-47 وجدولاهما سقطا، وبقيت
   * ‏صفوفُهما بلا رأسٍ بعد M-44. وكانت كلُّ صفحةٍ «تحمل» عناصرها الستّة عدًّا، فلم يسقط شيء. فالترتيبُ يُقرأ هنا: كلُّ صفحةٍ
   * ‏عناصرُها ١ إلى ٦ متتاليةً (أو مكرّرةً كذلك لصفحةٍ ذات أقسام، كـM-12)، وكلُّ «٥» يليه جدولٌ برأسه.
   */
  it('وعناصرُ كلّ صفحةٍ ستّةٌ تحت رأسها وبترتيبها، و«٥» بجدولٍ له رأس', () => {
    const pages = DOC.split(/(?=<a name="m-\d+"><\/a>)/).filter((p) => p.startsWith('<a name="m-'))
    expect(pages.length).toBeGreaterThan(40)
    for (const page of pages) {
      const code = page.match(/<a name="(m-\d+)">/)![1]!
      const marks = [...page.matchAll(/^\*\*([١٢٣٤٥٦]) ·/gm)].map((m) => m[1]).join('')
      if (marks === '') continue
      expect(marks.length % 6, `${code}: ${marks}`).toBe(0)
      expect(marks, `${code}: العناصرُ ليست ١ إلى ٦ متتالية`).toBe('١٢٣٤٥٦'.repeat(marks.length / 6))
      for (const m of page.matchAll(/^\*\*٥ · ماذا لو فشل\.\*\*\s*\n\s*\n(\|[^\n]*\|)\n(\|[^\n]*\|)/gm)) {
        expect(m[2], `${code}: جدولُ «ماذا لو فشل» بلا سطر الفصل تحت رأسه`).toMatch(/^\|[\s:|-]+\|$/)
      }
    }
  })
})

describe('والحال يُشتقّ ولا يُكتَب', () => {
  /**
   * «تمّت» تُكتب بيدٍ **فتبقى مكتوبةً بعد أن تنقض**. فما أمكن اشتقاقُه
   * يُشتقّ من البيئة والقاعدة.
   */
  it('فحص جائز يُتمّ M-02، وربط كذلك', () => {
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

  it('والعدّ لا يشمل ما لا يُعرَف', () => {
    const rows = ownerRows(empty)
    const unknown = rows.filter((r) => r.state === null).length
    expect(unknown).toBeGreaterThan(0)
    expect(pendingCount(empty)).toBe(rows.length - unknown)
  })
})

describe('والترتيب بما يفتح لا بترقيمه', () => {
  it('ما لم يتمّ أوّلا، ثمّ ما لا يُعرَف، ثمّ ما تمّ', () => {
    const rows = ownerRows({ ...empty, linked: new Set(['linkedin', 'youtube', 'tiktok']) })
    const rank = rows.map((r) => (r.state === false ? 0 : r.state === null ? 1 : 2))
    expect([...rank].sort((a, b) => a - b)).toEqual(rank)
  })

  /** والبوّابةُ تسبق القدرة: ما يوقف المشروعَ قبل ما يوسّعه. */
  it('والبوّابة تسبق القدرة عند تساوي الحال', () => {
    const rows = ownerRows(empty).filter((r) => r.state === false)
    const firstCapability = rows.findIndex((r) => r.unblocks === 'capability')
    const lastGate = rows.map((r) => r.unblocks).lastIndexOf('gate')
    if (firstCapability !== -1 && lastGate !== -1) {
      expect(lastGate).toBeLessThan(firstCapability)
    }
  })
})

describe('أمر السرّ (D-126)', () => {
  it('بصيغة MANUAL-TASKS.md حرفا، وللبيئة المعطاة', () => {
    expect(secretCommand('X_CLIENT_ID', 'staging')).toBe('npx wrangler secret put X_CLIENT_ID --env staging')
    expect(secretCommand('CF_BROWSER_TOKEN', 'production')).toBe('npx wrangler secret put CF_BROWSER_TOKEN --env production')
  })

  it('ومهمّة تمّت لا تحمل أمرا — والأسماء أسماء لا قيَم', () => {
    const rows = ownerRows({
      secrets: new Set(['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET']),
      vars: new Set(), linked: new Set(['linkedin']), appsConfigured: new Set(['linkedin']),
      appsVerified: new Set(['linkedin']), videoPriced: false, linkedInVersionDue: false,
    } as never)
    const m02 = rows.find((r) => r.code === 'M-02')!
    expect(m02.state).toBe(true)
    expect(m02.secrets).toEqual(['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'])
    for (const r of rows) for (const n of r.secrets ?? []) expect(n).toMatch(/^[A-Z0-9_]+$/)
  })
})

/**
 * **قراراتُ المالك تُقاس لا تُوصَف** (D-130): بوّابةُ الستّة وسقفُ الترويج
 * صفّان في «ما عليك» حالُهما من الإعدادات نفسِها، ولكلٍّ بابُه.
 */
describe('قرارات المالك (D-130)', () => {
  it('على الافتراض كلاهما عليك، ومع القرار يتمّان — والدليل يقول الرقم', () => {
    const before = ownerRows(empty)
    const six = before.find((r) => r.code === 'M-20')!
    const cap = before.find((r) => r.code === 'M-21')!
    expect(six.state).toBe(false)
    expect(six.measured).toBe('4 من 6 بطاقات مختارة')
    // ‏إلى منتقي البطاقات نفسِه، باسم الفعل (ر-1)
    expect(six).toMatchObject({ go: '/panel/settings#tiles', goLabel: 'اختر بطاقاتك' })
    expect(cap.state).toBe(false)
    expect(cap.measured).toBe('صفر — لا توصية تُكتب')

    const after = ownerRows({ ...empty, tilesChosen: 6, promoCapUsd: 20 })
    expect(after.find((r) => r.code === 'M-20')!.state).toBe(true)
    expect(after.find((r) => r.code === 'M-21')!).toMatchObject({ state: true, measured: 'السقف 20$ في الأسبوع' })
  })
})

describe('M-19 يكتمل بالسرّ لا بالمتغيّر (D-157)', () => {
  const m19 = OWNER_TASKS.find((t) => t.code === 'M-19')!
  it('السرّ مع معرّف الحساب يُكمله', () => {
    expect(m19.done({ ...empty, secrets: new Set(['CF_BROWSER_TOKEN']), vars: new Set(['CF_AI_ACCOUNT_ID']) })).toBe(true)
  })
  it('والسرّ وحده أو المعرّف وحده لا يكفي', () => {
    expect(m19.done({ ...empty, secrets: new Set(['CF_BROWSER_TOKEN']) })).toBe(false)
    expect(m19.done({ ...empty, vars: new Set(['CF_BROWSER_TOKEN', 'CF_AI_ACCOUNT_ID']) })).toBe(false)
  })
})

describe('رمز المهمّة لا يتكرّر (D-166)', () => {
  /**
   * كان «ربطُ Instagram» و«سعرُ نموذج الفيديو» كلاهما M-16، و`documented`
   * مجموعةٌ فابتلعت التكرار: صفحةُ Instagram بلا صفٍّ في «ما عليك» والحارسُ أخضر.
   */
  it('كلّ عنوان في الوثيقة برمز لا يحمله غيرُه', () => {
    const repeated = headings.filter((code, i) => headings.indexOf(code) !== i)
    expect(repeated).toEqual([])
  })
})

/*
 * ‏**مهامُّ الربط تحمل بابَها، والخطواتُ رابطٌ يُفتَح من الهاتف** (ر-1): كانت M-14 وM-15
 * ‏وM-24 «عليك» بلا زرّ، وM-24 تقول «ينتظر سرّيك» بعد حفظهما.
 */
describe('مهامّ الربط وخطواتُها (ر-1)', () => {
  const row = (facts: OwnerFacts, code: string) => ownerRows(facts).find((r) => r.code === code)!

  it('قبل السرّين: «اضبط» إلى حقل المعرّف، وبعدهما: «اربط» إلى المنصّة', () => {
    for (const [code, platform, label] of [['M-24', 'instagram', 'Instagram'], ['M-14', 'tiktok', 'TikTok'], ['M-15', 'youtube', 'YouTube']] as const) {
      expect(row(empty, code), code).toMatchObject({
        state: false, go: `/panel/channels/${platform}?tab=setup#ci-${platform}`, goLabel: `اضبط ${label}`,
        measured: 'ينقص سرّا التطبيق',
      })
      expect(row({ ...empty, appsConfigured: new Set([platform]) }, code), code).toMatchObject({
        state: false, go: `/oauth/${platform}/start`, goLabel: `اربط ${label}`,
        measured: 'سرّا التطبيق محفوظان — بقي «اربط»',
      })
      expect(row({ ...empty, appsConfigured: new Set([platform]), linked: new Set([platform]) }, code))
        .toMatchObject({ state: true, measured: '' })
    }
    // ‏والجملةُ الثابتةُ لا تقول ما يتبدّل
    expect(row(empty, 'M-24').ifLeft).not.toContain('سرّيك')
  })

  it('ولكلّ مهمّة مرساة في الوثيقة يقود إليها رابط خطواتها', () => {
    for (const task of OWNER_TASKS) {
      const anchor = taskDoc(task.code).split('#')[1]!
      expect(anchor).toBe(task.code.toLowerCase())
      // ‏وسطرٌ فارغٌ بعدها: بدونه يبتلع وسمُ HTML العنوانَ فيُعرَض «## M-…» حرفًا
      expect(DOC, task.code).toMatch(new RegExp(`<a name="${anchor}"></a>\\n\\n##+ (?:✅\\s*)?${task.code}\\b`))
    }
    expect(taskDoc('M-24')).toBe('https://github.com/milestoneimpact/sada/blob/main/docs/MANUAL-TASKS.md#m-24')
  })
})

/*
 * ‏**ودليلُ M-29 بحكم الناشر** (مراجعة D-190): قلبُ العلنيّ وحسابٌ بلا `video.publish` يبقى
 * ‏صندوقًا، فلا يُقال «مقلوبٌ بقرارك» وحدَها كأنّ الإجازةَ عملت.
 */
describe('دليل M-29', () => {
  const m29 = OWNER_TASKS.find((t) => t.code === 'M-29')!
  it('القلب بلا النطاق يُقال صندوقًا، وبالنطاق قرارًا', () => {
    expect(m29.evidence!({ ...empty, publicReach: new Set(['tiktok']), tiktokNoScope: true })).toContain('بلا video.publish')
    expect(m29.evidence!({ ...empty, publicReach: new Set(['tiktok']) })).toBe('النشر العلنيّ مقلوب بقرارك')
  })
})

/** ‏**M-30 من آخر نداء** (D-214): قبل أوّل تحريكٍ «لا يُعرَف»، لا «لم تتمّ» (D-061). */
describe('M-30 رصيد AI Gateway', () => {
  const m30 = OWNER_TASKS.find((t) => t.code === 'M-30')!
  it('لم يُجرَّب ← لا يُعرَف، ونفد ← لم تتمّ، وولّد ← تمّت', () => {
    expect(m30.done(empty)).toBeNull()
    expect(m30.done({ ...empty, gatewayCredit: 'short' })).toBe(false)
    expect(m30.done({ ...empty, gatewayCredit: 'ok' })).toBe(true)
    expect(m30.evidence!({ ...empty, gatewayCredit: 'short' })).toContain('نفاد الرصيد')
  })
})
