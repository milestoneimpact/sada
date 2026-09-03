/**
 * ربط بيئة Worker.
 *
 * الأسرار (Secrets) لا تظهر في wrangler.toml ولا تكتب في سجل. أسماؤها هنا
 * فقط، وقيمها تدخل بـ `wrangler secret put <NAME> --env <staging|production>`.
 *
 * أنواع Cloudflare تُستورَد صراحة لا اعتمادا على النطاق العام، حتى يمر هذا
 * الملف في فحص الاختبارات أيضا وهو لا يحمّل أنواع Workers.
 */
import type {
  D1Database,
  KVNamespace,
  Queue,
  R2Bucket,
} from '@cloudflare/workers-types'
export interface Env {
  // متغيرات عادية من wrangler.toml
  readonly SADA_ENV: 'staging' | 'production'
  readonly PUBLIC_BASE_URL: string

  // موارد Cloudflare
  readonly DB: D1Database
  readonly MEDIA: R2Bucket
  readonly KV: KVNamespace
  readonly PUBLISH_QUEUE: Queue
  readonly GENERATE_QUEUE: Queue

  // أسرار Worker
  readonly TOKEN_ENC_KEY: string
  readonly LINKEDIN_CLIENT_ID: string
  readonly LINKEDIN_CLIENT_SECRET: string
  readonly X_CLIENT_ID: string
  readonly X_CLIENT_SECRET: string
  readonly ANTHROPIC_API_KEY: string
  readonly GEMINI_API_KEY: string
  readonly GOOGLE_SA_JSON: string
}

/** أسماء الأسرار المطلوبة لتشغيل المرحلة صفر. المرجع الوحيد. */
export const REQUIRED_SECRETS = [
  'TOKEN_ENC_KEY',
  'LINKEDIN_CLIENT_ID',
  'LINKEDIN_CLIENT_SECRET',
  'X_CLIENT_ID',
  'X_CLIENT_SECRET',
] as const

/**
 * يفحص وجود الأسرار دون كشف قيمها.
 * يعيد أسماء الناقص فقط، ولا يعيد قيمة سر قط.
 */
export function missingSecrets(env: Partial<Env>): string[] {
  return REQUIRED_SECRETS.filter((name) => {
    const value = env[name]
    return typeof value !== 'string' || value.length === 0
  })
}
