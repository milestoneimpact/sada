/**
 * ‏**«صحّة صدى»** (D-321): المؤشّراتُ الثلاثة بهدفها وهامشها، وآخرُ نسخةٍ احتياطيّة، وعمرُ آخر دورة — ولا زرَّ أوّليًّا، وللمالك وحدَه.
 */
import { describe, expect, it } from 'vitest'
import { pulses } from '../lib/ops/heartbeat'
import { sli } from '../lib/ops/slo'
import { healthCard, machineCard, type HealthView } from './ui/parts'
import { emailLogin } from '../test/emailLogin'
import { toBase64 } from '../lib/crypto'
import { fakeDb, fakeKv } from '../test/fakes'
import { app } from '../index'

const NOW = new Date('2026-11-12T12:00:00.000Z')
const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString().slice(0, 19).replace('T', ' ')
const BEATS = pulses([
  { job: 'dispatch', at: ago(0.1), outcome: 'ok', detail: null },
  { job: 'renew', at: ago(0.1), outcome: 'ok', detail: null },
  { job: 'backup', at: ago(50), outcome: 'ok', detail: null },
], NOW)
const ROW = { id: 'b1', at: ago(50), status: 'ok' as const, objectKey: 'snapshots/x.sada', tables: 38, rows: 1204, bytes: 216_900, kid: 'c693c945', ms: 840, pruned: 0, detail: null }

function view(over: Partial<HealthView> = {}): HealthView {
  return { slis: [sli('on_time', 124, 125), sli('success', 40, 40, 2), sli('availability', 0, 0)], bound: true, last: ROW, lastOk: ROW, read: true, ...over }
}

describe('healthCard (D-321)', () => {
  it('المؤشّراتُ بنسبتها وعددها وهدفها وهامشها، و«لا قياس» يقول لماذا', () => {
    const html = healthCard(view(), BEATS, NOW)
    expect(html).toContain('id="health"')
    expect(html).toContain('صحّة صدى')
    // ‏‏124 من 125 = ‏99.2٪ والهدف ‏99٪: يجوز 1.25 خطأ، وُقع واحد ← بقي 20٪
    expect(html).toContain('<b>99.2٪</b> <span class="sub">124 من 125</span>')
    expect(html).toContain('بقي 20٪')
    expect(html).toContain('2 ردّتها المنصّة لا تُعدّ')
    expect(html).toContain('لم يُمسّ')
    expect(html).toContain('لا قياس: لم يسأل المراقب الخارجيّ بعد')
    // ‏ولا رمزَ مهمّةٍ في الواجهة (`audit_copy` · task-id): المهمّةُ بعنوانها في «ما عليك»
    expect(html).not.toMatch(/\bM-\d\d\b/)
    expect(html).toContain('99.5٪')
    expect(html).toContain('في أهدافها')
    // ‏آخرُ نسخةٍ قبل يومين بأعدادها، وعمرُ آخر دورة لما يقول «هل يعمل الآن»
    expect(html).toContain('آخر نسخة احتياطيّة')
    expect(html).toContain('38 جدولًا · 1204 صفًّا · 212KB')
    expect(html).toMatch(/آخر دورة: إرسال المجدول [^·]+ · تجديد الأذونات [^·]+ · النشر في الموعد لم تدُر بعد · النسخة الاحتياطيّة /)
    // ‏تقرأ ولا تفعل: لا زرَّ أوّليّ (audit_primary) ولا أرقامٌ شرقيّة (المعجم)
    expect(html).not.toContain('btn-primary')
    expect(html).not.toMatch(/[٠-٩]/)
  })

  it('هامشٌ نفد يُقال في رأس البطاقة، و0٪ لا تُقرَّب إلى ما فوقها', () => {
    const html = healthCard(view({ slis: [sli('on_time', 97, 100), sli('success', 9999, 10000), sli('availability', 10, 10)] }), BEATS, NOW)
    expect(html).toContain('نفد هامش مؤشّر')
    expect(html).toContain('نفد')
    // ‏‏99.99٪ تُقصّ ولا تصير «100.0٪»، و10 من 10 هي 100.0٪
    expect(html).toContain('<b>99.9٪</b> <span class="sub">9999 من 10000</span>')
    expect(html).toContain('<b>100.0٪</b> <span class="sub">10 من 10</span>')
  })

  it('بلا دلوٍ خاصّ: «لا نسخة احتياطيّة» وبابُها «ما عليك»؛ وفشلٌ بعد آخر نسخةٍ يُقال بسببه مهرَّبًا', () => {
    expect(healthCard(view({ bound: false, last: null, lastOk: null }), BEATS, NOW))
      .toContain('لا نسخة احتياطيّة</span> الدلو الخاصّ لم يُربط بعد — بابُه في <a href="/panel/tasks">ما عليك</a>.')
    const failed = { ...ROW, id: 'b2', at: ago(2), status: 'failed' as const, detail: '<script>x</script>' }
    const html = healthCard(view({ last: failed }), BEATS, NOW)
    expect(html).toContain('وفشلت محاولةٌ قبل ساعتين: &lt;script&gt;x&lt;/script&gt;')
    expect(healthCard(view({ lastOk: null, last: null }), BEATS, NOW)).toContain('لا نسخة بعد')
    expect(healthCard(view({ read: false }), BEATS, NOW)).toContain('سجلّ النسخ لم يُقرأ الآن')
  })
})

describe('«هل الآلة تعمل؟» والنسخة (مراجعة D-321)', () => {
  it('النسخةُ بلا دلوٍ خاصّ تُرسم «لا تعمل بعد» محايدةً لا «في موعدها» — وما سواها من `skipped` كما كان', () => {
    const html = machineCard(pulses([
      { job: 'backup', at: ago(2), outcome: 'skipped', detail: 'لا دلو خاصّ مربوط بعد — بابُه في «ما عليك»' },
      { job: 'dispatch', at: ago(0.1), outcome: 'skipped', detail: 'موقوف مؤقّتًا' },
    ], NOW), NOW)
    const row = (label: string) => html.split('<li').find((li) => li.includes(label)) ?? ''
    expect(row('النسخة الاحتياطيّة')).toContain('لا تعمل بعد')
    expect(row('النسخة الاحتياطيّة')).not.toContain('في موعدها')
    expect(row('إرسال المجدول')).toContain('في موعدها')
    // ‏وتُرسم بعد أوّل نسخةٍ «في موعدها» كما تقول علامةُ النجاح في M-51 · ٤
    const done = machineCard(pulses([{ job: 'backup', at: ago(2), outcome: 'ok', detail: '38 جدولًا' }], NOW), NOW)
    expect(done.split('<li').find((li) => li.includes('النسخة الاحتياطيّة'))).toContain('في موعدها')
  })
})

describe('«الضبط» يرسمها للمالك (D-321)', () => {
  it('بطاقةٌ بلا قياسٍ على قاعدةٍ فارغة، تحت «هل الآلة تعمل؟»', async () => {
    const env = {
      SADA_ENV: 'staging', PUBLIC_BASE_URL: 'https://sada2.basserh.com', DRIVE_FOLDER_ID: 'f', DB: fakeDb(), KV: fakeKv(),
      TOKEN_ENC_KEY: toBase64(crypto.getRandomValues(new Uint8Array(32))), ADMIN_TOKEN: 'Yk3pQ9vX2mLsA7nR4tWfZ8cB6dH1jG0e',
    }
    const r = await emailLogin(app, env)
    const cookie = (r.headers.get('Set-Cookie') ?? '').split(';')[0]!
    const html = await (await app.request('/panel/settings', { headers: { Cookie: cookie } }, env)).text()
    expect(html.indexOf('id="health"')).toBeGreaterThan(html.indexOf('id="machine"'))
    expect(html).toContain('لا قياس بعد')
    expect(html).toContain('لا نسخة احتياطيّة')
  })
})
