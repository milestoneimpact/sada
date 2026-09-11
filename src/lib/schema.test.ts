/**
 * المخطَّطُ بعد كلّ الترحيلات — **وبناءٌ جديدٌ لا يمحو ما سبقه** (D-121).
 *
 * ## لماذا هذا الملفّ
 *
 * SQLite لا يبدّل قيدا، **فكلُّ توسيعِ `CHECK` يعيد بناءَ الجدول**. وقد
 * وقع ذلك أربعَ مرّاتٍ (0008 · 0013 · 0019 · 0020 · 0022)، **وفي كلّ مرّةٍ
 * يُنسَخ المخطَّطُ يدا**.
 *
 * **ونسخةٌ يدويّةٌ تنسى.** أوّلُ صياغةٍ لـ0022 نُسخت من 0020 فأسقطت
 * **خمسةَ فروق**: عمودَ `dispatched_at`، وعمودَي `verified_at` و
 * `verified_kind`، وقيمتَي `accounts.kind`، وقيدين من قيود D-009،
 * و`scheduled_at` الذي صار يقبل الفراغ.
 *
 * **ولا يُمسَك ذلك بالأنواع ولا بالمراجعة**: الجدولُ يُبنى، والصفوفُ
 * تُنقل، والاختباراتُ تمرّ — **حتّى يقع منشورٌ يحتاج ما مُحي**.
 *
 * ## وما يُحرَس هنا ما يُفقَد صامتا
 *
 * أعمدةٌ أُضيفت بعد أوّل بناء، وقيودٌ تحرس قرارا مكتوبا. **ورقمُ القيود
 * يُعَدّ**: قيدٌ يسقط لا يُغيّر شكلَ الجدول، ويفتح ما أُغلق بقرار.
 */
import { describe, expect, it } from 'vitest'
import { fakeDb } from '../test/fakes'

interface Meta { sql: string }

function schemaOf(name: string): string {
  const db = fakeDb()
  const row = db.raw
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?")
    .get(name) as Meta | undefined
  return row?.sql ?? ''
}

describe('أعمدةٌ أُضيفت بعد أوّل بناءٍ تبقى', () => {
  /** من 0009 — **وبناءٌ ينساه يمحو أثرَ كلّ إرسال**. */
  it('posts.dispatched_at', () => {
    expect(schemaOf('posts')).toContain('dispatched_at')
  })

  /** ومن ترحيل التحقّق — **وبناءٌ ينساهما يمحو أثرَ كلّ تحقّقٍ وقع**. */
  it('oauth_apps.verified_at و verified_kind', () => {
    const sql = schemaOf('oauth_apps')
    expect(sql).toContain('verified_at')
    expect(sql).toContain('verified_kind')
  })
})

describe('قيودُ D-009 أربعةٌ لا تنقص', () => {
  /**
   * **والعددُ يُعَدّ لا يُقرأ.** قيدٌ يسقط لا يُغيّر شكلَ الجدول ولا يكسر
   * اختبارا، **ويفتح ما أُغلق بقرار**: منشورٌ يُنشَر بلا موافقةٍ مسجّلة.
   */
  it('ثلاثةٌ تحرس النشرَ وواحدٌ يحرس السلسلة', () => {
    const sql = schemaOf('posts')
    const checks = sql.match(/CHECK\s*\(/g) ?? []
    // ثلاثةٌ على الأعمدة (platform · type · has_url · status) وأربعةٌ للجدول
    expect(checks.length).toBeGreaterThanOrEqual(8)
    expect(sql).toContain('OR approved_at IS NOT NULL')
    expect(sql).toContain('OR account_id IS NOT NULL')
    expect(sql).toContain('OR scheduled_at IS NOT NULL')
    expect(sql).toContain('(thread_id IS NULL) = (thread_order IS NULL)')
  })

  /** **ويُجرَّب القيدُ لا يُقرأ وحدَه**: نصٌّ يُقرأ صحيحا وقد لا يعمل. */
  it('ومنشورٌ بلا موافقةٍ يُردّ فعلا', () => {
    const db = fakeDb()
    db.raw.exec(
      `INSERT INTO accounts (id, platform, kind, external_id, display_name, status)
       VALUES ('a1','instagram','member','e1','حساب','active')`,
    )
    expect(() => db.raw.exec(
      `INSERT INTO posts (id, account_id, platform, type, text, scheduled_at,
                          status, idempotency_key)
       VALUES ('p1','a1','instagram','image','نصّ',datetime('now'),'published','k1')`,
    )).toThrow()
  })
})

describe('قيدُ المنصّة يتّسع بقدر ما بُني', () => {
  const PLATFORMS = ['linkedin', 'x', 'youtube', 'tiktok', 'instagram'] as const

  it('الحساباتُ تقبل الخمسَ', () => {
    const db = fakeDb()
    for (const [i, p] of PLATFORMS.entries()) {
      expect(() => db.raw.exec(
        `INSERT INTO accounts (id, platform, kind, external_id, display_name, status)
         VALUES ('a${i}','${p}','member','e${i}','حساب','active')`,
      ), p).not.toThrow()
    }
  })

  it('وأسرارُ التطبيقات كذلك', () => {
    const db = fakeDb()
    for (const p of PLATFORMS) {
      expect(() => db.raw.exec(
        `INSERT INTO oauth_apps (platform, client_id, secret_enc, secret_iv,
                                 hint, fingerprint, updated_by)
         VALUES ('${p}','id','enc','iv','hint','fp','test')`,
      ), p).not.toThrow()
    }
  })

  it('والمنشوراتُ كذلك', () => {
    const db = fakeDb()
    for (const [i, p] of PLATFORMS.entries()) {
      expect(() => db.raw.exec(
        `INSERT INTO posts (id, platform, type, text, status, idempotency_key)
         VALUES ('p${i}','${p}','text','نصّ','draft','k${i}')`,
      ), p).not.toThrow()
    }
  })

  /** **وما لم يُبنَ له سائقٌ يبقى مردودا** — الحارسُ يُفتَح بقدر ما بُني. */
  it('وما لم يُبنَ يبقى مردودا', () => {
    const db = fakeDb()
    expect(() => db.raw.exec(
      `INSERT INTO posts (id, platform, type, text, status, idempotency_key)
       VALUES ('p9','snapchat','text','نصّ','draft','k9')`,
    )).toThrow()
  })
})
