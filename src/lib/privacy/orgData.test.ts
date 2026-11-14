/**
 * تصديرُ عميلٍ وحذفُه (D-322) — **لا سرَّ في الملفّ، ولا يمسّ الحذفُ عميلًا آخر ولا منظّمةَ المالك**.
 *
 * والمقياسُ في الأوّل قيمٌ مزروعةٌ بعلامةٍ في كلّ موضع سرّ (الأذونات، ومفاتيح المزوّدين، وأسرار التطبيقات، والعوامل، وقناة
 * التنبيهات، وعنوان IP): لا تظهر واحدةٌ منها في الملفّ. وفي الثاني كلُّ جدولٍ فيه `org_id`: يُفرَغ من العميل، ويبقى لغيره.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, fakeKv, type FakeDb } from '../../test/fakes'
import { deleteBlocker, deleteOrg, exportOrg, orgPrefixes } from './orgData'
import { purgeDeleted, type PurgeBucket } from './trash'

let db: FakeDb
let kv: ReturnType<typeof fakeKv>

const SECRET = 'SECRET-MARKER'

beforeEach(() => {
  db = fakeDb()
  kv = fakeKv()
  db.raw.exec(`INSERT INTO orgs (id, name, kind) VALUES ('org_a', 'شركة أ', 'agency'), ('org_b', 'شركة ب', 'agency')`)
  for (const org of ['org_a', 'org_b', 'org_owner']) seedOrg(org)
})

/** صفٌّ أو أكثر في كلّ جدولٍ يحمل `org_id` — وفي كلّ موضع سرٍّ علامةٌ تُبحث عنها. */
function seedOrg(org: string): void {
  const s = org
  // ‏`oauth_apps.platform` و`task_routes.task` مفتاحان أوّليّان لا لكلّ منظّمة: لكلٍّ قيمتُه
  const pick = { org_a: ['x', 'draft'], org_b: ['linkedin', 'analyze'], org_owner: ['tiktok', 'plan'] }[org] ?? ['youtube', 'image']
  db.raw.exec(`
    INSERT OR IGNORE INTO brands (id, org_id, name) VALUES ('brand_${s}', '${org}', 'علامة');
    INSERT OR REPLACE INTO briefs (org_id, goal) VALUES ('${org}', 'هدف ${s}');
    INSERT INTO accounts (id, platform, kind, external_id, display_name, status, org_id) VALUES ('acc_${s}', 'linkedin', 'member', 'ext_${s}', 'حساب', 'revoked', '${org}');
    INSERT INTO tokens (account_id, access_enc, access_iv, refresh_enc, refresh_iv, expires_at, scopes, org_id)
      VALUES ('acc_${s}', '${SECRET}-access', '${SECRET}-iv', '${SECRET}-refresh', '${SECRET}-riv', '2030-01-01', 'w', '${org}');
    INSERT INTO sources (id, drive_file_id, name, mime, content_hash, org_id, kind, file_key, text_key)
      VALUES ('src_${s}', 'upload:${s}', 'ملفّ', 'text/plain', 'h', '${org}', 'upload', 'sources/${org}/upload-${s}/original.txt', 'sources/${org}/upload-${s}/text.md');
    INSERT INTO content_items (id, source_id, summary, org_id) VALUES ('ci_${s}', 'src_${s}', 'خلاصة ${s}', '${org}');
    INSERT INTO analysis_claims (source_id, content_hash, org_id) VALUES ('src_${s}', 'h', '${org}');
    INSERT INTO plans (id, week_start, plan_json, model, org_id) VALUES ('plan_${s}', '2026-11-09', '{}', 'm', '${org}');
    INSERT INTO plan_versions (id, plan_id, version, plan_json, org_id) VALUES ('pv_${s}', 'plan_${s}', 1, '{}', '${org}');
    INSERT INTO posts (id, plan_id, account_id, platform, type, text, status, idempotency_key, approved_at, scheduled_at, org_id)
      VALUES ('post_${s}', 'plan_${s}', 'acc_${s}', 'linkedin', 'text', 'منشور ${s}', 'published', 'k_${s}', datetime('now'), datetime('now'), '${org}');
    INSERT INTO publish_attempts (id, post_id, idempotency_key, attempt_no, request_json, status, org_id)
      VALUES ('pa_${s}', 'post_${s}', 'k_${s}', 1, '{}', 'succeeded', '${org}');
    INSERT INTO metrics (post_id, window, impressions, org_id) VALUES ('post_${s}', '24h', 3, '${org}');
    INSERT INTO promotion_suggestions (post_id, suggested_budget, reason, org_id) VALUES ('post_${s}', 0, 'r', '${org}');
    INSERT INTO uploads (id, r2_key, name, mime, bytes, status, multipart_id, org_id)
      VALUES ('up_${s}', 'org/${org}/upload/up_${s}.mp4', 'مقطع', 'video/mp4', 9, 'ready', '${SECRET}-multipart', '${org}');
    INSERT INTO media (id, post_id, r2_key, mime, bytes, prompt, model, idempotency_key, upload_id, org_id)
      VALUES ('m_${s}', 'post_${s}', 'org/${org}/img/post_${s}/m.png', 'image/png', 9, 'p', 'm', 'mk_${s}', 'up_${s}', '${org}');
    INSERT INTO media_claims (idempotency_key, post_id, kind, org_id) VALUES ('mk_${s}', 'post_${s}', 'image', '${org}');
    INSERT INTO library_files (id, org_id, r2_key, name, mime, bytes) VALUES ('lf_${s}', '${org}', 'library/${org}/lf.png', 'شعار', 'image/png', 9);
    INSERT INTO reports (id, from_at, to_at, body_json, org_id) VALUES ('rep_${s}', '2026-11-02', '2026-11-09', '{}', '${org}');
    INSERT OR REPLACE INTO settings (key, value, org_id) VALUES ('alert_webhook', '${SECRET}-webhook', '${org}'), ('daily_spend_cap_usd', '5', '${org}');
    INSERT INTO providers (name, label, kind, key_enc, key_iv, hint, fingerprint, org_id)
      VALUES ('p_${s}', 'خدمة', 'openai_compat', '${SECRET}-key', '${SECRET}-kiv', '${SECRET}-hint', '${SECRET}-fp', '${org}');
    INSERT INTO task_routes (task, provider, model, org_id) VALUES ('${pick[1]}', 'p_${s}', 'm', '${org}');
    INSERT INTO oauth_apps (platform, client_id, secret_enc, secret_iv, hint, fingerprint, org_id)
      VALUES ('${pick[0]}', 'cid_${s}', '${SECRET}-app', '${SECRET}-aiv', '${SECRET}-ah', '${SECRET}-afp', '${org}');
    INSERT INTO alert_outbox (ref, kind, body, org_id) VALUES ('ref_${s}', 'budget', 'نصّ', '${org}');
    INSERT INTO notice_reads (ref, org_id) VALUES ('publish:x', '${org}');
    INSERT INTO web_vitals (org_id, metric, value, page, device) VALUES ('${org}', 'LCP', 1, '/panel', 'phone');
    INSERT INTO token_alerts (account_id, kind, threshold, expires_at, org_id) VALUES ('acc_${s}', 'access', 7, '2030-01-01', '${org}');
    INSERT INTO cost_ledger (id, provider, operation, units, unit_cost, total, currency, org_id, at) VALUES ('cl_${s}', 'anthropic', 'draft', 1, 1, 1, 'USD', '${org}', datetime('now', '-2 days'));
    INSERT INTO audit_log (org_id, actor, action, ip, ua) VALUES ('${org}', 'panel', 'draft.write', '203.0.113.${org.length}', '${SECRET}-ua');
  `)
}

/** عوامل الدخول — لا منظّمةَ لها، ولا تخرج في أيّ ملفّ. */
function seedFactors(): void {
  db.raw.exec(`
    INSERT INTO passkeys (id, credential_id, public_key, alg, sign_count, label, email, rp_id) VALUES ('pk', '${SECRET}-cred', '${SECRET}-pub', -7, 0, 'l', 'm@x.com', 'sada2.basserh.com');
    INSERT INTO totp (id, secret_cipher, secret_iv) VALUES (1, '${SECRET}-totp', '${SECRET}-tiv');
    INSERT INTO member_totp (email, secret_cipher, secret_iv) VALUES ('m@x.com', '${SECRET}-mtotp', '${SECRET}-miv');
    INSERT INTO recovery_codes (hash, email) VALUES ('${SECRET}-hash', 'm@x.com');
    INSERT INTO members (email, role, orgs, invited_by) VALUES ('m@x.com', 'editor', 'org_a', 'owner'), ('both@x.com', 'viewer', 'org_a,org_b', 'owner'),
      ('all@x.com', 'admin', '*', 'owner'), ('other@x.com', 'viewer', 'org_b', 'owner');
  `)
}

/** كلُّ جدولٍ فيه `org_id` — من المخطّط لا من قائمةٍ تُكتب: جدولٌ يُضاف غدًا يدخل هذا الحساب وحدَه. */
function orgTables(): string[] {
  const tables = db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]
  return tables.map((t) => t.name).filter((t) =>
    (db.raw.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).some((c) => c.name === 'org_id'))
}

const rowsOf = (table: string, org: string): number =>
  (db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE org_id = ?`).get(org) as { n: number }).n

describe('التصدير', () => {
  it('**لا سرَّ فيه**: لا أذونات ولا مفاتيح ولا أسرار تطبيقات ولا عوامل ولا قناة تنبيهات ولا IP ولا متصفّح', async () => {
    seedFactors()
    const file = JSON.stringify(await exportOrg(db, 'org_a'))
    expect(file).not.toContain(SECRET)
    expect(file).not.toContain('203.0.113.')
    const data = JSON.parse(file) as { tables: Record<string, unknown> }
    for (const t of ['tokens', 'oauth_apps', 'passkeys', 'totp', 'member_totp', 'recovery_codes', 'auth_attempts']) expect(t in data.tables, t).toBe(false)
  })

  it('وفيه ما للعميل وحدَه: منشوراتُه ومصادرُه وملفّاتُه، ولا صفَّ من عميلٍ آخر', async () => {
    seedFactors()
    const data = (await exportOrg(db, 'org_a'))!
    expect(data.org).toMatchObject({ id: 'org_a', name: 'شركة أ' })
    expect(data.tables['posts']!.map((r) => r['id'])).toEqual(['post_org_a'])
    expect(data.tables['content_items']!.map((r) => r['summary'])).toEqual(['خلاصة org_a'])
    expect(data.tables['settings']!.map((r) => r['key'])).toEqual(['daily_spend_cap_usd'])
    expect(JSON.stringify(data)).not.toContain('org_b')
    expect(data.files.map((f) => f.key).sort()).toEqual([
      'library/org_a/lf.png', 'org/org_a/img/post_org_a/m.png', 'org/org_a/upload/up_org_a.mp4',
      'sources/org_a/upload-org_a/original.txt', 'sources/org_a/upload-org_a/text.md',
    ])
    // ‏ومن يدخله: المحصورُ فيه والمفتوحُ له كلُّه — لا من لغيره وحدَه
    expect(data.members.map((m) => m['email']).sort()).toEqual(['all@x.com', 'both@x.com', 'm@x.com'])
    expect(Object.keys(data.not_exported)).toContain('tokens')
    // ‏وكلُّ جدولٍ فيه `org_id` إمّا في الملفّ أو مسمًّى بسببه في «ما لا يُصدَّر»
    for (const t of orgTables()) expect(t in data.tables || t in data.not_exported, t).toBe(true)
  })

  it('وعميلٌ لا وجودَ له `null`', async () => {
    expect(await exportOrg(db, 'org_none')).toBeNull()
  })
})

describe('شروطُ الحذف', () => {
  it('منظّمةُ المالك لا تُحذف أبدًا، ولو كُتب اسمُها وصُدّرت', async () => {
    db.raw.exec(`INSERT INTO audit_log (org_id, actor, action, target) VALUES ('org_owner', 'panel', 'org.export', 'org_owner')`)
    const name = (db.raw.prepare("SELECT name FROM orgs WHERE id = 'org_owner'").get() as { name: string }).name
    expect(await deleteBlocker(db, 'org_owner', name)).toContain('لا تُحذف')
    const out = await deleteOrg({ db, kv }, 'org_owner', name)
    expect(out.ok).toBe(false)
    expect(rowsOf('posts', 'org_owner')).toBe(1)
  })

  it('بلا تصديرٍ في آخر يوم، أو باسمٍ لا يطابق، أو بحسابٍ مربوط — لا', async () => {
    expect(await deleteBlocker(db, 'org_a', 'شركة')).toContain('اكتب اسمَ العميل')
    expect(await deleteBlocker(db, 'org_a', 'شركة أ')).toContain('صدّر')
    db.raw.exec(`INSERT INTO audit_log (org_id, actor, action, target, at) VALUES ('org_owner', 'panel', 'org.export', 'org_a', datetime('now', '-2 days'))`)
    expect(await deleteBlocker(db, 'org_a', 'شركة أ')).toContain('صدّر')
    // ‏وتصديرُ عميلٍ آخر لا يفتح هذا
    db.raw.exec(`INSERT INTO audit_log (org_id, actor, action, target) VALUES ('org_owner', 'panel', 'org.export', 'org_b')`)
    expect(await deleteBlocker(db, 'org_a', 'شركة أ')).toContain('صدّر')
    db.raw.exec(`INSERT INTO audit_log (org_id, actor, action, target) VALUES ('org_owner', 'panel', 'org.export', 'org_a')`)
    db.raw.exec(`UPDATE accounts SET status = 'active' WHERE org_id = 'org_a'`)
    expect(await deleteBlocker(db, 'org_a', 'شركة أ')).toContain('افصل حساباته')
    db.raw.exec(`UPDATE accounts SET status = 'revoked' WHERE org_id = 'org_a'`)
    expect(await deleteBlocker(db, 'org_a', '  شركة   أ ')).toBeNull()
  })

  /*
   * ‏**وإنفاقُ اليوم يُعَدّ في السقف العامّ** (D-277): جملُ السقف تقرأ `cost_ledger` على `org_id IN (SELECT id FROM orgs)`، فعميلٌ
   * ‏يُحذف في يومٍ أنفق فيه يسقط إنفاقُه من سقف ذلك اليوم ويُفتح بقدره بابُ إنفاقٍ جديد (D-006 · D-008). فلا يُحذف حتّى يبدأ يومٌ
   * ‏جديد بتوقيت القاعدة — والدفترُ نفسُه يبقى كما كان.
   */
  it('ولا يُحذف عميلٌ أنفق اليوم — إنفاقُه يُعَدّ في سقف اليوم العامّ', async () => {
    db.raw.exec(`INSERT INTO audit_log (org_id, actor, action, target) VALUES ('org_owner', 'panel', 'org.export', 'org_a')`)
    db.raw.exec(`INSERT INTO cost_ledger (id, provider, operation, units, unit_cost, total, currency, org_id)
      VALUES ('cl_today', 'anthropic', 'draft', 1, 0.2, 0.2, 'USD', 'org_a')`)
    expect(await deleteBlocker(db, 'org_a', 'شركة أ')).toContain('أنفق اليوم')
    const out = await deleteOrg({ db, kv }, 'org_a', 'شركة أ')
    expect(out.ok).toBe(false)
    expect(rowsOf('posts', 'org_a')).toBe(1)
    // ‏وإنفاقُ عميلٍ آخر اليوم لا يمنعه
    db.raw.exec(`UPDATE cost_ledger SET org_id = 'org_b' WHERE id = 'cl_today'`)
    expect(await deleteBlocker(db, 'org_a', 'شركة أ')).toBeNull()
  })
})

describe('الحذف', () => {
  async function ready(): Promise<void> {
    seedFactors()
    db.raw.exec(`INSERT INTO audit_log (org_id, actor, action, target) VALUES ('org_owner', 'panel', 'org.export', 'org_a')`)
  }

  it('**كلُّ جدولٍ فيه `org_id` يُفرَغ من العميل، ويبقى لغيره كما كان** — إلّا دفترَ الكلفة', async () => {
    await ready()
    const before = Object.fromEntries(orgTables().flatMap((t) => [['b:' + t, rowsOf(t, 'org_b')], ['o:' + t, rowsOf(t, 'org_owner')]]))
    const out = await deleteOrg({ db, kv }, 'org_a', 'شركة أ')
    expect(out).toMatchObject({ ok: true, name: 'شركة أ' })
    for (const t of orgTables()) {
      expect(rowsOf(t, 'org_a'), t).toBe(t === 'cost_ledger' ? 1 : 0)
      expect(rowsOf(t, 'org_b'), 'org_b ' + t).toBe(before['b:' + t])
      // ‏وسجلُّ المالك يزيد بسطر التصدير الذي زرعناه وحدَه — لا يُمحى منه شيء
      expect(rowsOf(t, 'org_owner'), 'owner ' + t).toBe(before['o:' + t])
    }
    expect(db.raw.prepare("SELECT id FROM orgs WHERE id = 'org_a'").get()).toBeUndefined()
    // ‏وعواملُ الدخول لا تُمَسّ: ليست للعميل
    expect((db.raw.prepare('SELECT COUNT(*) AS n FROM passkeys').get() as { n: number }).n).toBe(1)
  })

  it('ودعواتُ الأعضاء: من لم يبقَ له غيرُه أُلغي، ومن له غيرُه بقي له، و«الكلّ» لا يُمَسّ', async () => {
    await ready()
    const out = await deleteOrg({ db, kv }, 'org_a', 'شركة أ')
    expect(out.ok && out.members).toBe(2)
    const m = Object.fromEntries((db.raw.prepare('SELECT email, orgs, revoked_at FROM members').all() as { email: string; orgs: string; revoked_at: string | null }[])
      .map((r) => [r.email, { orgs: r.orgs, revoked: r.revoked_at !== null }]))
    expect(m['m@x.com']).toEqual({ orgs: '', revoked: true })
    expect(m['both@x.com']).toEqual({ orgs: 'org_b', revoked: false })
    expect(m['all@x.com']).toEqual({ orgs: '*', revoked: false })
    expect(m['other@x.com']).toEqual({ orgs: 'org_b', revoked: false })
  })

  it('وملفّاتُه تُمحى بسوابقه في الكنس، وملفّاتُ غيره باقية', async () => {
    await ready()
    await deleteOrg({ db, kv }, 'org_a', 'شركة أ')
    const objects = new Set([
      'org/org_a/img/post_org_a/m.png', 'org/org_a/upload/up_org_a.mp4', 'library/org_a/lf.png', 'sources/org_a/upload-org_a/text.md',
      'org/org_b/img/post_org_b/m.png', 'library/org_b/lf.png', 'img/post_org_owner/m.png', 'org/org_ab/x.png',
    ])
    const r2: PurgeBucket = {
      async delete(k) { for (const key of [k].flat()) objects.delete(key) },
      async list({ prefix }) { return { objects: [...objects].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), truncated: false } },
    }
    await purgeDeleted({ db, kv, bucket: r2 })
    expect([...objects].sort()).toEqual(['img/post_org_owner/m.png', 'library/org_b/lf.png', 'org/org_ab/x.png', 'org/org_b/img/post_org_b/m.png'])
    expect(orgPrefixes('org_a').every((p) => p.endsWith('/'))).toBe(true)
  })

  it('والجلساتُ التي كانت فيه تنتقل إلى منظّمة المالك', async () => {
    await ready()
    await kv.put('session:s1', JSON.stringify({ v: 2, at: new Date().toISOString(), bind: 'b', csrf: 'c', pending: false, via: 'passkey', org: 'org_a' }))
    await kv.put('session:s2', JSON.stringify({ v: 2, at: new Date().toISOString(), bind: 'b', csrf: 'c', pending: false, via: 'passkey', org: 'org_b' }))
    const out = await deleteOrg({ db, kv }, 'org_a', 'شركة أ')
    const org = async (k: string): Promise<unknown> => (JSON.parse((await kv.get(k)) ?? '{}') as { org?: string }).org
    expect(out.ok && out.sessions).toBe(1)
    expect(await org('session:s1')).toBe('org_owner')
    expect(await org('session:s2')).toBe('org_b')
  })
})
