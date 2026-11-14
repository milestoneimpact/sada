/**
 * مددُ الاحتفاظ والكنّاس (D-322) — **ما يُمحى في موعده، وما لا يُمَسّ أبدًا**.
 *
 * والأهمُّ في الثاني: `publish_attempts` (D-004 · محفّزا 0047) ومنشوراتُها ودفترُ الكلفة. وكنسُ صندوق التنبيهات لا يُعيد تنبيهًا
 * أُرسل: «لا يُرسَل حدثٌ مرّتين» يقوم على صفّه في الصندوق، فما يُمحى منه يجب ألّا يُجمَع ثانيةً.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { RETENTION, sweepRetention, truncateIp } from './retention'
import { collectAlerts, PUBLISH_ALERT_DAYS } from '../alerts/collect'
import { anyWeekAlert } from '../token/expiry'

let db: FakeDb

beforeEach(() => {
  db = fakeDb()
  db.raw.exec("INSERT INTO orgs (id, name, kind) VALUES ('org_b', 'شركة ب', 'agency')")
})

/** صفٌّ في سجلّ النشاط بعمره بالأيّام. */
function audit(org: string, action: string, days: number, ip: string | null = null): number {
  const r = db.raw
    .prepare(`INSERT INTO audit_log (org_id, actor, action, at, ip, ua) VALUES (?, 'panel', ?, datetime('now', ?), ?, 'UA/1')`)
    .run(org, action, `-${days} days`, ip)
  return Number(r.lastInsertRowid)
}

const count = (sql: string): number => (db.raw.prepare(sql).get() as { n: number }).n

describe('عنوانُ IP مقصَّرًا', () => {
  it.each([
    ['203.0.113.77', '203.0.113.0'],
    ['10.0.0.10', '10.0.0.0'],
    ['203.0.113.0', '203.0.113.0'],
    ['2001:db8:85a3:8d3:1319:8a2e:370:7348', '2001:db8:85a3::'],
    ['2001:0DB8:0000:0000:0000:0000:0000:0001', '2001:db8:0::'],
    ['2001:db8::1', '2001:db8:0::'],
    ['::1', '0:0:0::'],
    ['[2001:db8:85a3::7]', '2001:db8:85a3::'],
    ['fe80::1%eth0', 'fe80:0:0::'],
    ['::ffff:198.51.100.23', '198.51.100.0'],
    ['2001:db8:85a3::', '2001:db8:85a3::'],
  ])('%s ← %s', (raw, want) => {
    expect(truncateIp(raw)).toBe(want)
    // ‏والمقصَّرُ لا يتبدّل بكنسٍ ثانٍ
    expect(truncateIp(want)).toBe(want)
  })

  it.each(['unknown', '999.1.1.1', '1.2.3', '1:2:3', 'a::b::c', ''])('ما لا يُعرَف شكلُه يُمحى: %s', (raw) => {
    expect(truncateIp(raw)).toBeNull()
  })
})

describe('الكنسُ اليوميّ', () => {
  it('سجلُّ النشاط سنة، و«إرسالٌ رُدّ» تسعون يومًا — وما دونهما يبقى', async () => {
    const old = audit('org_owner', 'settings.write', RETENTION.auditDays + 5)
    const year = audit('org_owner', 'settings.write', RETENTION.auditDays - 5)
    const rejectOld = audit('org_owner', 'form.reject', RETENTION.formRejectDays + 5)
    const rejectNew = audit('org_owner', 'form.reject', RETENTION.formRejectDays - 5)
    const otherOrg = audit('org_b', 'settings.write', RETENTION.auditDays + 1)
    const report = await sweepRetention(db)
    const left = (db.raw.prepare('SELECT id FROM audit_log ORDER BY id').all() as { id: number }[]).map((r) => r.id)
    expect(left).toEqual([year, rejectNew])
    expect(left).not.toContain(old)
    expect(left).not.toContain(rejectOld)
    expect(left).not.toContain(otherOrg)
    expect(report).toMatchObject({ audit: 2, formRejects: 1 })
  })

  it('عنوانُ IP يُقصَّر بعد ثلاثين يومًا في كلّ منظّمة، والأحدثُ كاملٌ، والكنسُ الثاني لا يمسّ شيئًا', async () => {
    const v4 = audit('org_owner', 'session.open', RETENTION.ipDays + 1, '203.0.113.77')
    const v6 = audit('org_b', 'session.open', RETENTION.ipDays + 1, '2001:db8:85a3:8d3:1319:8a2e:370:7348')
    const odd = audit('org_owner', 'session.open', RETENTION.ipDays + 1, 'unknown')
    const fresh = audit('org_owner', 'session.open', RETENTION.ipDays - 1, '198.51.100.23')
    const first = await sweepRetention(db)
    const ip = (id: number): string | null => (db.raw.prepare('SELECT ip FROM audit_log WHERE id = ?').get(id) as { ip: string | null }).ip
    expect(ip(v4)).toBe('203.0.113.0')
    expect(ip(v6)).toBe('2001:db8:85a3::')
    expect(ip(odd)).toBeNull()
    expect(ip(fresh)).toBe('198.51.100.23')
    expect(first.ips).toBe(3)
    const second = await sweepRetention(db)
    expect(second.ips).toBe(0)
    // ‏والصفُّ نفسُه يبقى بفعله ووقته: يُقصَّر العنوانُ لا الأثر
    expect(count("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'session.open'")).toBe(4)
  })

  /*
   * ‏**وعنوانُ IPv6 ينتهي بـ«::» ليس مقصَّرًا بالضرورة**: ‏`2001:db8:85a3:8d3::` أربعُ مجموعاتٍ ثمّ أصفار — جهازٌ بعينه في شبكته.
   * ‏كان الاستعلامُ يتخطّى كلَّ ما ينتهي بـ«::» ظنًّا أنّه قُصّر، فيبقى كاملًا إلى الأبد. والمقصَّرُ شكلُه واحد: ثلاثُ مجموعاتٍ
   * ‏ثمّ «::» (أربعُ نقطتين).
   */
  it('وIPv6 ينتهي بـ«::» وفيه أكثرُ من ثلاث مجموعاتٍ يُقصَّر — لا يُظنّ مقصَّرًا', async () => {
    const four = audit('org_owner', 'session.open', RETENTION.ipDays + 1, '2001:db8:85a3:8d3::')
    const two = audit('org_owner', 'session.open', RETENTION.ipDays + 1, '2001:db8::')
    const done = audit('org_owner', 'session.open', RETENTION.ipDays + 1, '2001:db8:85a3::')
    const first = await sweepRetention(db)
    const ip = (id: number): string | null => (db.raw.prepare('SELECT ip FROM audit_log WHERE id = ?').get(id) as { ip: string | null }).ip
    expect(ip(four)).toBe('2001:db8:85a3::')
    expect(ip(two)).toBe('2001:db8:0::')
    expect(ip(done)).toBe('2001:db8:85a3::')
    expect(first.ips).toBe(2)
    expect((await sweepRetention(db)).ips).toBe(0)
  })

  it('جملةُ IPv4 في القاعدة تقصّر كما تقصّر الدالّة', async () => {
    const samples = ['1.2.3.4', '255.255.255.255', '10.20.30.40', '192.168.1.199']
    const ids = samples.map((s) => audit('org_owner', 'x', RETENTION.ipDays + 2, s))
    await sweepRetention(db)
    ids.forEach((id, i) => {
      const got = (db.raw.prepare('SELECT ip FROM audit_log WHERE id = ?').get(id) as { ip: string }).ip
      expect(got).toBe(truncateIp(samples[i]!))
    })
  })

  it('الصندوق: ما وصل تسعين يومًا، وما لم يصل مئةً وثمانين', async () => {
    const put = (ref: string, status: number | null, days: number): void => {
      db.raw.prepare(`INSERT INTO alert_outbox (ref, kind, body, status, at) VALUES (?, 'budget', 'نصّ', ?, datetime('now', ?))`)
        .run(ref, status, `-${days} days`)
    }
    put('sent-old', 200, RETENTION.outboxDeliveredDays + 1)
    put('sent-new', 204, RETENTION.outboxDeliveredDays - 1)
    put('failed-mid', 502, RETENTION.outboxDeliveredDays + 1)
    put('failed-old', null, RETENTION.outboxUndeliveredDays + 1)
    await sweepRetention(db)
    expect((db.raw.prepare('SELECT ref FROM alert_outbox ORDER BY ref').all() as { ref: string }[]).map((r) => r.ref))
      .toEqual(['failed-mid', 'sent-new'])
  })

  it('تنبيهاتُ الأذونات نصفَ سنة، وعدّاداتُ الدخول يومين', async () => {
    db.raw.exec("INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('a1', 'linkedin', 'member', 'x', 'ح', 'active')")
    const alert = (days: number, threshold: number): void => {
      db.raw.prepare(`INSERT INTO token_alerts (account_id, kind, threshold, expires_at, at) VALUES ('a1', 'access', ?, '2026-01-01', datetime('now', ?))`)
        .run(threshold, `-${days} days`)
    }
    // ‏(وعتبةُ السبعة شاهدُ بوّابةٍ يبقى — اختبارُه في «ما لا يمسّه الكنس» أدناه)
    alert(RETENTION.tokenAlertDays + 1, 3)
    alert(RETENTION.tokenAlertDays - 1, 1)
    db.raw.exec(`INSERT INTO auth_attempts (bucket, n, window_start) VALUES
      ('code:a@b.c:203.0.113.7', 3, datetime('now', '-3 days')), ('ip:198.51.100.1', 1, datetime('now', '-1 hours'))`)
    const report = await sweepRetention(db)
    expect(count('SELECT COUNT(*) AS n FROM token_alerts')).toBe(1)
    expect((db.raw.prepare('SELECT bucket FROM auth_attempts').all() as { bucket: string }[]).map((r) => r.bucket)).toEqual(['ip:198.51.100.1'])
    expect(report).toMatchObject({ tokenAlerts: 1, authAttempts: 1 })
  })
})

describe('ما لا يمسّه الكنسُ أبدًا (D-004 · D-008)', () => {
  it('محاولاتُ النشر ومنشوراتُها ودفترُ الكلفة تبقى مهما قدُمت', async () => {
    db.raw.exec(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, approved_at, scheduled_at, created_at)
      VALUES ('p1', 'linkedin', 'text', 'نصّ', 'draft', 'k1', NULL, NULL, datetime('now', '-900 days'))`)
    db.raw.exec(`INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, status, at)
      VALUES ('pa1', 'p1', 'k1', 1, '{}', 'failed', datetime('now', '-900 days')),
             ('pa2', 'p1', 'k1', 2, '{}', 'succeeded', datetime('now', '-899 days'))`)
    db.raw.exec(`INSERT INTO cost_ledger (id, provider, operation, units, unit_cost, total, currency, at)
      VALUES ('c1', 'anthropic', 'draft', 1, 0.01, 0.01, 'USD', datetime('now', '-900 days'))`)
    await sweepRetention(db)
    expect(count('SELECT COUNT(*) AS n FROM publish_attempts')).toBe(2)
    expect(count('SELECT COUNT(*) AS n FROM posts')).toBe(1)
    expect(count('SELECT COUNT(*) AS n FROM cost_ledger')).toBe(1)
    // ‏والمحفّزُ (0047) ما زال يحرس: صفُّ `succeeded` الباقي يردّ محاولةً ثانيةً بالمفتاح نفسِه
    expect(() => db.raw.exec(`INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, status)
      VALUES ('pa3', 'p1', 'k1', 3, '{}', 'sent')`)).toThrow(/d004_once/)
  })

  it('**وتنبيهُ نشرٍ فشل وأُرسل لا يُعاد بعد أن يُكنَس صفُّه**', async () => {
    const days = RETENTION.outboxDeliveredDays + 10
    db.raw.exec(`INSERT INTO posts (id, platform, type, text, status, idempotency_key, created_at)
      VALUES ('old', 'x', 'text', 'قديم', 'failed', 'k-old', datetime('now', '-${days} days')),
             ('new', 'x', 'text', 'جديد', 'failed', 'k-new', datetime('now', '-1 days'))`)
    db.raw.exec(`INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, status, at)
      VALUES ('a-old', 'old', 'k-old', 1, '{}', 'failed', datetime('now', '-${days} days')),
             ('a-new', 'new', 'k-new', 1, '{}', 'failed', datetime('now', '-1 days'))`)
    db.raw.exec(`INSERT INTO alert_outbox (ref, kind, body, status, at) VALUES ('publish:old', 'publish', 'نصّ', 200, datetime('now', '-${days} days'))`)
    await sweepRetention(db)
    expect(count("SELECT COUNT(*) AS n FROM alert_outbox WHERE ref = 'publish:old'")).toBe(0)
    const refs = (await collectAlerts(db, new Date(), 0)).map((a) => a.ref)
    expect(refs).toContain('publish:new')
    expect(refs).not.toContain('publish:old')
  })

  /*
   * ‏**وبندُ بوّابة المرحلة ٢ يقرأ `token_alerts`** (`anyWeekAlert`: «تنبيهٌ قبل أسبوعٍ من الانتهاء وقع يومًا ما»). كنسُ الصفوف
   * ‏كلِّها بعد نصف سنة كان يُرجع البندَ «لم يقع بعد» وقد وقع — بوّابةٌ مجتازةٌ تعود فتُغلق. فيبقى أحدثُ صفّ عتبة السبعة شاهدًا.
   */
  it('وشاهدُ بوّابة «تنبيه قبل أسبوع» يبقى — أحدثُ صفّ عتبة السبعة وحدَه', async () => {
    db.raw.exec("INSERT INTO accounts (id, platform, kind, external_id, display_name, status) VALUES ('a1', 'linkedin', 'member', 'x', 'ح', 'active')")
    const alert = (days: number, threshold: number, expires: string): void => {
      db.raw.prepare(`INSERT INTO token_alerts (account_id, kind, threshold, expires_at, at) VALUES ('a1', 'refresh', ?, ?, datetime('now', ?))`)
        .run(threshold, expires, `-${days} days`)
    }
    alert(RETENTION.tokenAlertDays + 60, 7, '2026-01-01')
    alert(RETENTION.tokenAlertDays + 30, 7, '2026-02-01')
    alert(RETENTION.tokenAlertDays + 20, 1, '2026-02-01')
    expect(await anyWeekAlert(db)).toBe(true)
    const report = await sweepRetention(db)
    expect(await anyWeekAlert(db)).toBe(true)
    expect((db.raw.prepare('SELECT threshold, expires_at FROM token_alerts').all() as { threshold: number; expires_at: string }[]))
      .toEqual([{ threshold: 7, expires_at: '2026-02-01' }])
    expect(report.tokenAlerts).toBe(2)
  })

  it('ونافذةُ جمع تنبيه النشر أقصرُ من مدّة الصندوق — وإلّا عاد ما كُنس', () => {
    expect(PUBLISH_ALERT_DAYS).toBeLessThan(RETENTION.outboxDeliveredDays)
    expect(PUBLISH_ALERT_DAYS).toBeLessThan(RETENTION.outboxUndeliveredDays)
  })
})
