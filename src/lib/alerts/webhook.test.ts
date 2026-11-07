/**
 * عنوانُ قناة التنبيهات سرٌّ حاملٌ (D-318): من قرأه كتب في قناة المالك. فيُخزَّن مشفَّرًا بـ AES-GCM كالأذونات (D-005)،
 * ويُعرَض مقنَّعًا (البروتوكولُ والمضيفُ وآخرُ أربعة محارف)، والقديمُ المقروءُ يُشفَّر عند أوّل قراءة.
 */
import { describe, expect, it } from 'vitest'
import { toBase64 } from '../crypto'
import { fakeDb } from '../../test/fakes'
import { readSettings, writeSetting } from '../settings'
import { maskWebhook, readWebhookUrl, saveWebhook } from './webhook'

const KEY = toBase64(crypto.getRandomValues(new Uint8Array(32)))
const HOOK = 'https://hooks.slack.com/services/T00/B00/zz9SECRETpart'

function stored(db: ReturnType<typeof fakeDb>): string | null {
  const row = db.raw.prepare("SELECT value FROM settings WHERE key = 'alert_webhook' AND org_id = 'org_owner'").get() as { value: string } | undefined
  return row?.value ?? null
}

describe('قناةُ التنبيهات سرٌّ (D-318)', () => {
  it('القناعُ: البروتوكولُ والمضيفُ وآخرُ أربعة محارف — ولا شيءَ من المسار', () => {
    expect(maskWebhook(HOOK)).toBe('https://hooks.slack.com/…part')
    expect(maskWebhook(HOOK)).not.toContain('SECRET')
    expect(maskWebhook('')).toBe('')
    expect(maskWebhook('ليس عنوانا')).toBe('…وانا')
  })

  it('يُحفَظ مشفَّرًا، ويُقرأ بالمفتاح، والإعداداتُ لا تحمل إلّا قناعَه', async () => {
    const db = fakeDb()
    const saved = await saveWebhook(db, KEY, HOOK, 'panel')
    expect(saved).toEqual({ kind: 'set', hint: 'https://hooks.slack.com/…part' })
    const raw = stored(db)!
    expect(raw).not.toContain('SECRET')
    expect(raw).not.toContain('/services/')
    expect(await readWebhookUrl(db, KEY)).toBe(HOOK)
    expect((await readSettings(db)).alertWebhook).toBe('https://hooks.slack.com/…part')
    // ‏ومفتاحٌ آخر لا يفتحه: لا قناةَ بدل نداءٍ إلى ما لا يُعرَف
    expect(await readWebhookUrl(db, toBase64(crypto.getRandomValues(new Uint8Array(32))))).toBe('')
  })

  it('والقديمُ المقروءُ يُقرأ مرّةً ثمّ يُشفَّر في مكانه', async () => {
    const db = fakeDb()
    db.raw.prepare("INSERT INTO settings (key, value, updated_by, org_id) VALUES ('alert_webhook', ?, 'panel', 'org_owner')").run(HOOK)
    expect((await readSettings(db)).alertWebhook).toBe('https://hooks.slack.com/…part')
    expect(await readWebhookUrl(db, KEY)).toBe(HOOK)
    expect(stored(db)).not.toContain('SECRET')
    expect(await readWebhookUrl(db, KEY)).toBe(HOOK)
  })

  it('والقديمُ المقروءُ الذي يردّه الحارسُ اليومَ يُشفَّر كذلك — ولا يُنادى', async () => {
    const db = fakeDb()
    // ‏حُفظ قبل أن يُشدَّد الحارس: لا يُرسَل إليه شيء، ولا يبقى سرُّه مقروءًا في القاعدة
    db.raw.prepare("INSERT INTO settings (key, value, updated_by, org_id) VALUES ('alert_webhook', ?, 'panel', 'org_owner')")
      .run('https://100.64.0.9/hooks/SECRETold')
    expect(await readWebhookUrl(db, KEY)).toBe('')
    expect(stored(db)).not.toContain('SECRET')
    expect((await readSettings(db)).alertWebhook).toBe('https://100.64.0.9/…Told')
  })

  it('والعنوانُ الداخليُّ يُردّ، والفراغُ يُزيل القناة', async () => {
    const db = fakeDb()
    expect((await saveWebhook(db, KEY, 'http://169.254.169.254/x', 'panel')).kind).toBe('refused')
    expect(stored(db)).toBeNull()
    await saveWebhook(db, KEY, HOOK, 'panel')
    expect((await saveWebhook(db, KEY, '  ', 'panel')).kind).toBe('cleared')
    expect(await readWebhookUrl(db, KEY)).toBe('')
    expect((await readSettings(db)).alertWebhook).toBe('')
  })

  it('ولا يُكتب العنوانُ مقروءًا من باب الإعدادات العامّ', async () => {
    await expect(writeSetting(fakeDb(), 'alert_webhook', HOOK, 'panel')).rejects.toThrow()
  })
})

describe('الترحيل 0046 — العنوانُ يخرج من سجلّ النشاط (D-318)', () => {
  it('صفوفُ الحفظ القديمة تبقى بمضيفها وحدَه، وما سواها لا يُمسّ', async () => {
    const { readFileSync } = await import('node:fs')
    const db = fakeDb()
    const add = db.raw.prepare('INSERT INTO audit_log (actor, action, target, detail) VALUES (?, ?, ?, ?)')
    add.run('panel', 'settings.write', 'alert_webhook', `← ${HOOK}`)
    add.run('panel', 'settings.write', 'alert_webhook', '← ')
    add.run('panel', 'settings.write', 'paused', '← true')
    db.raw.exec(readFileSync(new URL('../../../migrations/0046_scrub_webhook_audit.sql', import.meta.url), 'utf8'))
    const rows = db.raw.prepare('SELECT detail FROM audit_log ORDER BY id').all() as { detail: string }[]
    expect(rows.map((r) => r.detail)).toEqual(['← https://hooks.slack.com/… (أُخفي المسار في D-318)', '← ', '← true'])
    expect(JSON.stringify(rows)).not.toContain('SECRET')
  })

  it('ولا يبقى من العنوان ما بعد المضيف — سؤالًا كان أو مرسًى أو اسمَ دخول', async () => {
    const { readFileSync } = await import('node:fs')
    const db = fakeDb()
    const add = db.raw.prepare('INSERT INTO audit_log (actor, action, target, detail) VALUES (?, ?, ?, ?)')
    for (const url of ['https://h.example?token=SECRET1', 'https://h.example#SECRET2', 'https://u:SECRET3@h.example/x', 'https://h.example']) {
      add.run('panel', 'settings.write', 'alert_webhook', `← ${url}`)
    }
    db.raw.exec(readFileSync(new URL('../../../migrations/0046_scrub_webhook_audit.sql', import.meta.url), 'utf8'))
    const rows = db.raw.prepare('SELECT detail FROM audit_log ORDER BY id').all() as { detail: string }[]
    expect(JSON.stringify(rows)).not.toContain('SECRET')
    expect(rows.map((r) => r.detail)).toEqual(Array.from({ length: 4 }, () => '← https://h.example/… (أُخفي المسار في D-318)'))
  })
})

describe('(مراجعة D-318) سببُ الردّ بكلمات القناة لا بكلمات خدمة الكتابة', () => {
  it('لا «مزوّد» ولا «مفتاح» في سبب ردّ عنوان القناة', async () => {
    const db = fakeDb()
    for (const [raw, says] of [
      ['http://hooks.slack.com/services/x', 'https'],
      ['https://100.64.0.1/hook', 'داخليّ'],
      ['https://user:pw@hooks.slack.com/x', 'اسم دخول'],
      ['https://hooks.slack.com/{TOKEN}', 'قالب'],
      ['ليس عنوانا', 'https://'],
    ] as const) {
      const saved = await saveWebhook(db, KEY, raw, 'panel')
      expect(saved.kind, raw).toBe('refused')
      const reason = saved.kind === 'refused' ? saved.reason : ''
      expect(reason, raw).toContain(says)
      expect(reason, raw).not.toMatch(/مزوّد|المفتاح/)
    }
  })
})
