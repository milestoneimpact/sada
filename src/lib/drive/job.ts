/**
 * مهمة المسح: من سرّ حساب الخدمة إلى صفوف في `sources`.
 *
 * تجمع الخطوات الثلاث في نداء واحد يستدعيه Cron ومسار التشغيل اليدوي معا،
 * فلا يتشعب المنطق بنسختين.
 */
import type { Db } from '../tokens'
import { accessToken, listFolder, parseServiceAccount, DriveError } from './client'
import { needsAnalysis, syncSources, type SyncResult } from './sync'
import { sendChunked, type BatchQueue } from '../queue/batch'
import { withTimeout } from '../net/timeout'

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
  // ‏**والمهلةُ هنا لا في `client.ts` وحده** (D-320): `deps.fetchImpl ?? fetch` كان يمرّر `fetch` عاريًا فيُسقط افتراضَه
  const call = withTimeout(deps.fetchImpl ?? fetch, 30_000)
  const token = await accessToken(sa, deps.now ?? new Date(), call)
  const files = await listFolder(token, deps.folderId, call)
  const result = await syncSources(deps.db, files)
  return { ...result, seen: files.length, toAnalyze: needsAnalysis(result) }
}

/**
 * ‏**الإدراجُ الآليّ بما بقي من السقف، دفعاتٍ دون حدّ الطابور** (D-320).
 *
 * ‏يُقصّ على المتبقّي قبل الإرسال لا بعده (الحدُّ الذي يُطبَّق بعد الإنفاق ليس حدًّا)، ويُرسَل مئةً مئة: كان دفعةً واحدةً
 * ‏بسقفٍ يبلغ خمسمئة، فيسقط كلُّه يومَ يزيد الجديدُ على مئة — **والمصادرُ كُتبت «جديدةً» قبله، فلا تُرسَل في الغد أبدًا**.
 */
export async function enqueueForAnalysis(
  queue: BatchQueue<{ body: { sourceId: string } }>,
  toAnalyze: readonly string[],
  room: number,
): Promise<number> {
  const batch = toAnalyze.slice(0, Math.max(0, room))
  return sendChunked(queue, batch.map((sourceId) => ({ body: { sourceId } })))
}
