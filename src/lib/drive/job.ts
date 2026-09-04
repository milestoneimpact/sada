/**
 * مهمة المسح: من سرّ حساب الخدمة إلى صفوف في `sources`.
 *
 * تجمع الخطوات الثلاث في نداء واحد يستدعيه Cron ومسار التشغيل اليدوي معا،
 * فلا يتشعب المنطق بنسختين.
 */
import type { Db } from '../tokens'
import { accessToken, listFolder, parseServiceAccount, DriveError } from './client'
import { needsAnalysis, syncSources, type SyncResult } from './sync'

export interface ScanReport extends SyncResult {
  /** ما قرأه من Drive قبل التوفيق. */
  readonly seen: number
  /** ما يستحق تحليلا — وهو ما يكلف نداء Claude. */
  readonly toAnalyze: string[]
}

export interface ScanDeps {
  readonly db: Db
  readonly serviceAccountJson: string
  readonly folderId: string
  readonly now?: Date
  readonly fetchImpl?: typeof fetch
}

/**
 * يمسح المجلد ويوفّقه مع القاعدة.
 *
 * لا يحلل ولا ينادي Claude: يفصل «ما تغيّر» عن «ما يُفعل به»، فيبقى المسح
 * رخيصا ويمكن تشغيله يوميا بلا حساب.
 */
export async function scanDrive(deps: ScanDeps): Promise<ScanReport> {
  if (deps.folderId.length === 0) {
    throw new DriveError('DRIVE_FOLDER_ID غير مضبوط على هذه البيئة', 503)
  }
  const sa = parseServiceAccount(deps.serviceAccountJson)
  const token = await accessToken(sa, deps.now ?? new Date(), deps.fetchImpl ?? fetch)
  const files = await listFolder(token, deps.folderId, deps.fetchImpl ?? fetch)
  const result = await syncSources(deps.db, files)
  return { ...result, seen: files.length, toAnalyze: needsAnalysis(result) }
}
