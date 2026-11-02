/**
 * مزامنة Drive مع جدول `sources`.
 *
 * القاعدة: **ما تغيّر فقط**. الملف الذي لم تتغير بصمته لا يُعاد تحليله —
 * وتحليله يكلّف نداء Claude يُسجَّل في `cost_ledger`. مسحٌ يوميّ لعشرين
 * ملفا بلا هذه القاعدة يعني عشرين نداء كل يوم بلا فائدة.
 *
 * ولا يُحذف صف من `sources` حين يختفي الملف من Drive: المنشورات تشير إليه
 * بـ `source_refs`، وحذفه يقطع أثر منشور نُشر فعلا. يُعلَّم غائبا ويبقى.
 */
import type { Db } from '../tokens'
import { OWNER_ORG } from '../tenancy'
import type { DriveFile } from './client'

export interface SyncResult {
  readonly added: string[]
  readonly changed: string[]
  readonly unchanged: string[]
  readonly missing: string[]
}

interface SourceRow {
  id: string
  drive_file_id: string
  content_hash: string
}

/** معرّف ثابت مشتق من معرّف Drive، فلا يتكرر الصف عند إعادة المزامنة. */
/**
 * رابطُ الملفّ في Drive — **ولا يُبنى من نصٍّ يكتبه أحد** (D-126).
 *
 * المعرِّفُ يأتي من Drive نفسِه، وصيغتُه حروفٌ وأرقامٌ وشرطتان. **وما خالف
 * الصيغةَ لا يصير رابطًا**: يُعاد `null` فلا يُرسَم زرٌّ يقود إلى عنوانٍ
 * مصنوع.
 */
export function driveFileUrl(driveFileId: string): string | null {
  return /^[A-Za-z0-9_-]{8,}$/.test(driveFileId)
    ? `https://drive.google.com/file/d/${driveFileId}/view`
    : null
}

export function sourceId(driveFileId: string): string {
  return `src:${driveFileId}`
}

/**
 * يوفّق ما في Drive مع ما في `sources`، ويعيد التصنيف.
 *
 * `added` و`changed` وحدهما يستحقان تحليلا. `unchanged` يُلمس تاريخه فقط.
 */
export async function syncSources(db: Db, files: readonly DriveFile[]): Promise<SyncResult> {
  const existing = new Map<string, SourceRow>()
  // ‏مجلّدُ Drive مجلّدُ المالك، فمصادرُه تسكن منظّمته وتُقرأ منها وحدها (D-233 · D-277)
  const { results } = await db
    // ‏ومصادرُ Drive وحدَها (D-284): المرفوعُ والرابطُ ليسا في المجلّد، فلا يُعَدّان «غائبَين» عنه
    .prepare("SELECT id, drive_file_id, content_hash FROM sources WHERE org_id = ? AND kind = 'drive'")
    .bind(OWNER_ORG)
    .all<SourceRow>()
  for (const row of results) existing.set(row.drive_file_id, row)

  const added: string[] = []
  const changed: string[] = []
  const unchanged: string[] = []
  const seen = new Set<string>()

  for (const file of files) {
    seen.add(file.id)
    const prior = existing.get(file.id)

    if (prior === undefined) {
    // ‏مجلّدُ Drive مجلّدُ المالك، فمصادرُه لمنظّمته حتى يصير لكلّ منظّمةٍ مجلّدُها (D-233)
      await db
        .prepare(
          `INSERT INTO sources (id, drive_file_id, name, mime, content_hash, org_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(sourceId(file.id), file.id, file.name, file.mimeType, file.contentHash, OWNER_ORG)
        .run()
      added.push(file.id)
      continue
    }

    if (prior.content_hash !== file.contentHash) {
      await db
        .prepare(
          `UPDATE sources
              SET name = ?, mime = ?, content_hash = ?, last_seen_at = datetime('now')
            WHERE drive_file_id = ? AND org_id = ?`,
        )
        .bind(file.name, file.mimeType, file.contentHash, file.id, OWNER_ORG)
        .run()
      changed.push(file.id)
      continue
    }

    await db
      .prepare(`UPDATE sources SET last_seen_at = datetime('now') WHERE drive_file_id = ? AND org_id = ?`)
      .bind(file.id, OWNER_ORG)
      .run()
    unchanged.push(file.id)
  }

  // ما كان في القاعدة ولم يعد في Drive: يبقى، ويُبلَّغ عنه
  const missing = [...existing.keys()].filter((id) => !seen.has(id))

  return { added, changed, unchanged, missing }
}

/**
 * الملفات التي تستحق تحليلا: ما أُضيف وما تغيّر، ولا شيء غيرهما.
 */
export function needsAnalysis(result: SyncResult): string[] {
  return [...result.added, ...result.changed]
}
