/**
 * ‏**«صحّة صدى» في جملةٍ واحدة** (D-321): المؤشّراتُ الثلاثة (`slo.ts`) وسجلُّ النسخ (`backup.ts`) أعمدةٌ في `SELECT` واحد — رحلةٌ
 * ‏واحدةٌ إلى D1 لبطاقةٍ في «الضبط»، فلا يزيد حِملُه (`panelLoad.test.ts`) إلّا جملة. وجملةٌ تسقط: «لا قياس» و«لم يُقرأ»، والصفحةُ تُرسَم.
 */
import type { Db } from '../tokens'
import { BACKUP_COLUMNS, backupsOf, type BackupRow } from './backup'
import { SLI_COLUMNS, sliBinds, slisOf, type Sli } from './slo'

export interface HealthFacts {
  readonly slis: readonly Sli[]
  readonly last: BackupRow | null
  readonly lastOk: BackupRow | null
  /** ‏قُرئت الجملة؟ — `false` قاعدةٌ لم تردّ. */
  readonly read: boolean
}

export async function readHealth(db: Db, now: Date): Promise<HealthFacts> {
  try {
    const row = await db.prepare(`SELECT ${SLI_COLUMNS}, ${BACKUP_COLUMNS}`).bind(...sliBinds(now))
      .first<{ on_time: unknown; success: unknown; availability: unknown; backups: unknown }>()
    return { slis: slisOf(row, now), ...backupsOf(row?.backups), read: true }
  } catch (error) {
    console.error({ job: 'health', failed: error instanceof Error ? error.message : 'unexpected_error' })
    return { slis: slisOf(null, now), last: null, lastOk: null, read: false }
  }
}
