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
  const { results } = await db
    .prepare('SELECT id, drive_file_id, content_hash FROM sources')
    .bind()
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
      await db
        .prepare(
          `INSERT INTO sources (id, drive_file_id, name, mime, content_hash)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(sourceId(file.id), file.id, file.name, file.mimeType, file.contentHash)
        .run()
      added.push(file.id)
      continue
    }

    if (prior.content_hash !== file.contentHash) {
      await db
        .prepare(
          `UPDATE sources
              SET name = ?, mime = ?, content_hash = ?, last_seen_at = datetime('now')
            WHERE drive_file_id = ?`,
        )
        .bind(file.name, file.mimeType, file.contentHash, file.id)
        .run()
      changed.push(file.id)
      continue
    }

    await db
      .prepare(`UPDATE sources SET last_seen_at = datetime('now') WHERE drive_file_id = ?`)
      .bind(file.id)
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
