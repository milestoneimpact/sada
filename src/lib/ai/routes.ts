/**
 * توجيه المهامّ — من الشيفرة إلى المالك.
 *
 * كان ثابتا في `registry.ts`. وصار جدولا يقرؤه المالك ويكتبه من اللوحة:
 * يجرّب الرخيص في الفهم ويُبقي الغالي في الكتابة، **بلا نشرٍ ولا شيفرة**.
 *
 * والشيفرة تبقى مرجع الافتراض حين لا صفّ — فنظامٌ بجدولٍ فارغ يعمل، ولا
 * ينتظر أن يُملأ.
 */
import { IMPLEMENTED, ROUTES, type TaskName } from './registry'
import type { Db } from '../tokens'

export interface TaskRoute {
  readonly task: TaskName
  readonly provider: string
  readonly model: string
  readonly why: string
  readonly implemented: boolean
  /** أمن اللوحة هو أم من الافتراض في الشيفرة؟ */
  readonly custom: boolean
}

export async function readRoutes(db: Db): Promise<TaskRoute[]> {
  let saved = new Map<string, { provider: string; model: string }>()
  try {
    const { results } = await db
      .prepare('SELECT task, provider, model FROM task_routes')
      .all<{ task: string; provider: string; model: string }>()
    saved = new Map(results.map((r) => [r.task, { provider: r.provider, model: r.model }]))
  } catch {
    saved = new Map()
  }

  return (Object.keys(ROUTES) as TaskName[]).map((task) => {
    const fallback = ROUTES[task]
    const chosen = saved.get(task)
    return {
      task,
      provider: chosen?.provider ?? fallback.provider,
      model: chosen?.model ?? fallback.model,
      why: fallback.why,
      implemented: IMPLEMENTED.has(task),
      custom: chosen !== undefined,
    }
  })
}

export async function routeFor(db: Db, task: TaskName): Promise<{ provider: string; model: string }> {
  const routes = await readRoutes(db)
  const found = routes.find((r) => r.task === task)
  return found ?? { provider: ROUTES[task].provider, model: ROUTES[task].model }
}

export async function writeRoute(
  db: Db,
  task: TaskName,
  provider: string,
  model: string,
  by: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO task_routes (task, provider, model, updated_by, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(task) DO UPDATE SET
         provider = excluded.provider, model = excluded.model,
         updated_by = excluded.updated_by, updated_at = datetime('now')`,
    )
    .bind(task, provider, model, by)
    .run()
}
