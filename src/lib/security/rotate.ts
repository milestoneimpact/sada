/**
 * **دورةُ تدوير `TOKEN_ENC_KEY`** (D-318) — تعيد تشفيرَ ما ليس على المفتاح الحاليّ، صفًّا صفًّا.
 *
 * ## متى تعمل
 *
 * **في التدوير وحده**: حين يُضبَط `TOKEN_ENC_KEY_PREV` (المفتاحُ القديم) بجانب `TOKEN_ENC_KEY` (الجديد). وخارجَه لا تمسّ
 * شيئًا: القديمُ (قبل D-318) يُقرأ بطريقته، ولا يُعاد تشفيرُه بلا سبب — فرجوعُ الشيفرة إلى ما قبل D-318 لا يُسقط إلّا ما
 * كُتب بعدها.
 *
 * ## ما تمسّ
 *
 * كلَّ حقلٍ مشفَّر: أذوناتُ المنصّات (`tokens`)، ومفاتيحُ خدمات الكتابة (`providers`)، وأسرارُ تطبيقات OAuth
 * (`oauth_apps`)، وسرُّ رمز التطبيق للمالك والأعضاء (`totp` و`member_totp`)، وقناةُ التنبيهات (`settings`). ولكلٍّ نطاقُه
 * وسياقُه كما كُتب، فلا يُفكّ صفٌّ بسياق غيره.
 *
 * ## وكيف لا تدهس كتابةً جارية
 *
 * التحديثُ مشروطٌ بأنّ النصَّ المشفَّر ما يزال هو هو (`WHERE rowid = ? AND <العمود> = ?`): تجديدُ إذنٍ وقع بين القراءة
 * والكتابة يغلب، ويُعدّ الصفُّ في الدورة التالية إن بقي على غير الحاليّ. **وما لم يُفكّ بمفتاحٍ في الحلقة لا يُمسّ** ويُعدّ
 * `failed` — فلا يُحذف `TOKEN_ENC_KEY_PREV` حتّى يصير `pending` صفرًا، **و`recovery` صفرًا** (رموزُ الاسترداد لا تُعاد
 * تهشيمًا: يجدّدها أصحابُها، مراجعة D-318).
 */
import { keyId, legacyOrgKey, LEGACY_RAW, openScoped, previousKey, sealScoped, tokenContext, type LegacyKey } from '../crypto'
import { tokenScope, type Db } from '../tokens'
import { keyContext, VAULT_SCOPE } from '../providers'
import { APPS_SCOPE, secretContext } from '../oauth/apps'
import type { Platform } from '../oauth/providers'
import { OWNER_EMAIL } from '../ownerEmail'
import { countStaleRecoveryCodes, TOTP_SCOPE, totpContext } from './factors'
import { rotateWebhook } from '../alerts/webhook'
import { changedRows } from '../dbResult'

interface Field {
  readonly enc: string
  readonly iv: string
  /** سياقُ هذا الحقل من صفّه. */
  readonly context: (row: Row) => string
}

interface Target {
  readonly table: string
  /** ما يُقرأ مع الحقول ليُبنى منه النطاقُ والسياق. */
  readonly extra: readonly string[]
  readonly fields: readonly Field[]
  readonly scope: (row: Row) => string
  readonly legacy: (row: Row) => LegacyKey
}

type Row = Record<string, string | number | null>

const TARGETS: readonly Target[] = [
  {
    table: 'tokens',
    extra: ['account_id', 'org_id'],
    fields: [
      { enc: 'access_enc', iv: 'access_iv', context: (r) => tokenContext(String(r['account_id']), 'access') },
      { enc: 'refresh_enc', iv: 'refresh_iv', context: (r) => tokenContext(String(r['account_id']), 'refresh') },
    ],
    scope: (r) => tokenScope(String(r['org_id'])),
    legacy: (r) => legacyOrgKey(String(r['org_id'])),
  },
  {
    table: 'providers',
    extra: ['name'],
    fields: [{ enc: 'key_enc', iv: 'key_iv', context: (r) => keyContext(String(r['name'])) }],
    scope: () => VAULT_SCOPE,
    legacy: () => LEGACY_RAW,
  },
  {
    table: 'oauth_apps',
    extra: ['platform'],
    fields: [{ enc: 'secret_enc', iv: 'secret_iv', context: (r) => secretContext(String(r['platform']) as Platform) }],
    scope: () => APPS_SCOPE,
    legacy: () => LEGACY_RAW,
  },
  {
    table: 'totp',
    extra: [],
    fields: [{ enc: 'secret_cipher', iv: 'secret_iv', context: () => totpContext(OWNER_EMAIL) }],
    scope: () => TOTP_SCOPE,
    legacy: () => LEGACY_RAW,
  },
  {
    table: 'member_totp',
    extra: ['email'],
    fields: [{ enc: 'secret_cipher', iv: 'secret_iv', context: (r) => totpContext(String(r['email'])) }],
    scope: () => TOTP_SCOPE,
    legacy: () => LEGACY_RAW,
  },
]

export interface RotationReport {
  /** معرّفُ المفتاح الحاليّ والسابق (إن كان) — بصمتان لا تُعكَسان، ليُعرف أيُّهما يعمل. */
  readonly kid: string
  readonly previous: string | null
  /**
   * **ما لا يُقرأ بعد حذف السابق** (مراجعة D-318): في التدوير كلُّ حقلٍ ليس على الحاليّ (ما على السابق، والقديمُ قبل D-318
   * — شُفِّر بالمفتاح القديم نفسِه)؛ وخارجَه ما على معرّفٍ غيرِ الحاليّ وحدَه — **وهو صفرٌ في نظامٍ سليم**. كان يعدّ القديمَ
   * خارج التدوير أيضًا، فيقول `/admin/ready` إلى الأبد إنّ شيئًا على مفتاحٍ آخر وهو يُقرأ بالحاليّ.
   */
  readonly pending: number
  /** حقولٌ بصيغة ما قبل D-318 (بلا معرّف مفتاح) — تُقرأ بالحاليّ خارج التدوير، وتُعاد في التدوير. للعلم لا للإنذار. */
  readonly legacy: number
  /**
   * **رموزُ استردادٍ غيرُ مستهلَكة على غير الحاليّ** (مراجعة D-318): تُهشَّم بمفتاحٍ مشتقٍّ من `TOKEN_ENC_KEY` ولا يُعاد
   * تهشيمُها (الرمزُ نفسُه لا يُعرَف)، فتبطل كلُّها عند حذف السابق. لا تنقص بالدورة: ينقصها أصحابُها بـ«ولّد مجموعةً جديدة».
   */
  readonly recovery: number
  readonly rotated: number
  /** حقولٌ لم يفتحها مفتاحٌ في الحلقة في هذه الدورة — لا تُمسّ، وتبقى في `pending`. */
  readonly failed: number
}

function notCurrent(field: Field): string {
  return `(${field.enc} IS NOT NULL AND ${field.enc} NOT LIKE ?)`
}

/**
 * كم حقلًا «باقيًا» وكم «قديمًا» — للجاهزيّة (`/admin/ready`) ولقرار حذف السابق. والقديمُ (بلا `v2:`) باقٍ في التدوير
 * وحدَه: خارجَه يُقرأ بالحاليّ.
 */
async function countFields(db: Db, prefix: string, rotating: boolean): Promise<{ pending: number; legacy: number }> {
  let pending = 0
  let legacy = 0
  for (const target of TARGETS) {
    for (const field of target.fields) {
      const old = `${field.enc} IS NOT NULL AND ${field.enc} NOT LIKE 'v2:%'`
      const other = rotating
        ? `${field.enc} IS NOT NULL AND ${field.enc} NOT LIKE ?`
        : `${field.enc} LIKE 'v2:%' AND ${field.enc} NOT LIKE ?`
      const row = await db
        .prepare(`SELECT SUM(CASE WHEN ${other} THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN ${old} THEN 1 ELSE 0 END) AS legacy FROM ${target.table}`)
        .bind(prefix)
        .first<{ pending: number | null; legacy: number | null }>()
      pending += row?.pending ?? 0
      legacy += row?.legacy ?? 0
    }
  }
  return { pending, legacy }
}

/**
 * يعيد تشفيرَ ما ليس على المفتاح الحاليّ — **حين يكون التدويرُ جاريًا وحده** (`apply` يقرّره المنادي من وجود السابق).
 * ودفعةٌ محدودةٌ في كلّ جدولٍ في كلّ دورة: الدورةُ التالية تُكمل.
 *
 * **والدفعةُ تمضي في الجدول بـ`rowid`** (مراجعة D-318): كانت كلُّ دورةٍ تختار أوّلَ `limit` صفًّا ليست على الحاليّ، وما لا يُفكّ
 * لا يُمسّ فيبقى في رأس الاختيار — فمئةُ صفٍّ لا تُفكّ تحجب ما بعدها إلى الأبد، ولا يصير `pending` صفرًا. فالصفُّ الذي لم
 * يُفكّ لا يُحسَب من الدفعة، والقراءةُ تتقدّم بعده حتّى يُعاد `limit` صفًّا أو ينتهي الجدول (وعشرةُ أضعافه سقفُ ما يُقرأ).
 */
export async function rotateKeys(db: Db, encKey: string, options: { readonly apply?: boolean; readonly limit?: number } = {}): Promise<RotationReport> {
  const kid = await keyId(encKey)
  const previous = previousKey(encKey)
  const apply = options.apply ?? previous !== null
  const limit = Math.max(1, Math.min(500, options.limit ?? 100))
  const prefix = `v2:${kid}:%`
  let rotated = 0
  let failed = 0

  if (apply) {
    for (const target of TARGETS) {
      const columns = [...target.extra, ...target.fields.flatMap((f) => [f.enc, f.iv])].join(', ')
      const where = target.fields.map(notCurrent).join(' OR ')
      let after = 0
      let budget = limit
      let scanned = 0
      while (budget > 0 && scanned < limit * 10) {
        const { results } = await db
          .prepare(`SELECT rowid AS _rowid, ${columns} FROM ${target.table} WHERE (${where}) AND rowid > ? ORDER BY rowid LIMIT ?`)
          .bind(...target.fields.map(() => prefix), after, limit)
          .all<Row>()
        for (const row of results) {
          after = Number(row['_rowid'])
          scanned += 1
          const sets: string[] = []
          const values: unknown[] = []
          const guards: string[] = []
          const guardValues: unknown[] = []
          for (const field of target.fields) {
            const ciphertext = row[field.enc]
            const iv = row[field.iv]
            if (typeof ciphertext !== 'string' || typeof iv !== 'string') continue
            if (ciphertext.startsWith(prefix.slice(0, -1))) continue
            try {
              const plain = await openScoped(encKey, target.scope(row), { ciphertext, iv }, field.context(row), target.legacy(row))
              const sealed = await sealScoped(encKey, target.scope(row), plain, field.context(row))
              sets.push(`${field.enc} = ?`, `${field.iv} = ?`)
              values.push(sealed.ciphertext, sealed.iv)
              guards.push(`${field.enc} = ?`)
              guardValues.push(ciphertext)
            } catch {
              failed += 1
            }
          }
          if (sets.length === 0) continue
          const result = await db
            .prepare(`UPDATE ${target.table} SET ${sets.join(', ')} WHERE rowid = ? AND ${guards.join(' AND ')}`)
            .bind(...values, row['_rowid'], ...guardValues)
            .run()
          // ‏صفٌّ تبدّل بين القراءة والكتابة لا يُعدّ: الدورةُ التالية تجده إن بقي على غير الحاليّ
          if (changedRows(result)) {
            rotated += 1
            budget -= 1
          }
        }
        if (results.length < limit) break
      }
    }
  }

  const hook = await rotateWebhook(db, encKey, apply)
  const fields = await countFields(db, prefix, previous !== null)
  return {
    kid,
    previous: previous === null ? null : await keyId(previous),
    pending: fields.pending + hook.pending,
    legacy: fields.legacy + hook.legacy,
    recovery: await countStaleRecoveryCodes(db, encKey),
    rotated: rotated + hook.rotated,
    failed: failed + hook.failed,
  }
}
