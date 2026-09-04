/**
 * بدائل للاختبار وحده. لا تُستورد من شيفرة Worker.
 *
 * `fakeDb` ليس محاكاة: هو SQLite حقيقي يُشغّل عليه الترحيل نفسه، فما يمر
 * في الاختبار يمر على المخطط الحقيقي بقيوده — لا على مخطط متخيَّل.
 */
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import type { Db, DbStatement } from '../lib/tokens'
import type { StateStore } from '../lib/oauth/state'

const MIGRATION = readFileSync(new URL('../../migrations/0001_init.sql', import.meta.url), 'utf8')

export interface FakeDb extends Db {
  readonly raw: DatabaseSync
}

export function fakeDb(): FakeDb {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(MIGRATION)

  const prepare = (query: string): DbStatement => {
    let bound: unknown[] = []
    const statement: DbStatement = {
      bind(...values: unknown[]) {
        bound = values
        return statement
      },
      async first<T = unknown>() {
        const row = db.prepare(query).get(...(bound as never[]))
        return (row ?? null) as T | null
      },
      async run() {
        return db.prepare(query).run(...(bound as never[]))
      },
    }
    return statement
  }

  return { prepare, raw: db }
}

/** KV في الذاكرة، مع دعم انتهاء الصلاحية بساعة يتحكم بها الاختبار. */
export function fakeKv(clock: () => number = Date.now): StateStore & {
  readonly size: () => number
} {
  const entries = new Map<string, { value: string; expiresAt: number }>()

  const alive = (key: string): string | null => {
    const entry = entries.get(key)
    if (entry === undefined) return null
    if (entry.expiresAt <= clock()) {
      entries.delete(key)
      return null
    }
    return entry.value
  }

  return {
    async get(key) {
      return alive(key)
    },
    async put(key, value, options) {
      const ttl = options?.expirationTtl ?? 86_400
      entries.set(key, { value, expiresAt: clock() + ttl * 1000 })
    },
    async delete(key) {
      entries.delete(key)
    },
    size: () => entries.size,
  }
}

export interface StubbedCall {
  readonly url: string
  readonly method: string
  readonly headers: Record<string, string>
  readonly body: string
}

/**
 * `fetch` مزيف يجيب حسب العنوان، ويسجل كل نداء ليُفحص.
 * أي عنوان غير معرّف يرمي — فلا يمر طلب شبكة لم يقصده الاختبار.
 */
export function fakeFetch(
  routes: Record<string, { status?: number; json: unknown }>,
): typeof fetch & { readonly calls: StubbedCall[] } {
  const calls: StubbedCall[] = []
  const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString()
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
      headers[k] = v
    }
    calls.push({
      url,
      method: init?.method ?? 'GET',
      headers,
      body: init?.body === undefined ? '' : String(init.body),
    })
    const route = routes[url]
    if (route === undefined) throw new Error(`نداء غير متوقع: ${url}`)
    return new Response(JSON.stringify(route.json), {
      status: route.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return Object.assign(impl as unknown as typeof fetch, { calls })
}
