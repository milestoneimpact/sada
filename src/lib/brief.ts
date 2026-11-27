/**
 * موجزُ العميل (D-257) — **ماذا يريد، ولمن، وبأيّ نبرة، وكم مرّة، وما لا يُقال**.
 *
 * يُقرأ في موجّه الخطّة وموجّه الكتابة قسمًا واحدًا (`voiceSection`)، فيكتب صدى بصوت العميل. والموجزُ الفارغ لا يُضيف
 * شيئًا: الموجّهُ كما كان، فلا يتغيّر ما كُتب قبله. **والنصوصُ تُقصّ** عند الكتابة، فلا يصير الموجزُ بابًا لموجّهٍ بلا حدّ.
 */
import type { Db } from './tokens'
import type { PublishPlatform } from './oauth/providers'

/** القنواتُ التي تنشر اليوم — قائمةٌ مغلقة. */
export const BRIEF_CHANNELS: readonly PublishPlatform[] = ['linkedin', 'x', 'instagram', 'tiktok', 'youtube']

export interface Brief {
  readonly goal: string
  readonly audience: string
  readonly tone: string
  /** قنواتٌ من قائمةٍ مغلقة، مفصولةٌ بفاصلة. */
  readonly channels: readonly string[]
  readonly perWeek: number
  readonly avoid: string
}

export const EMPTY_BRIEF: Brief = { goal: '', audience: '', tone: '', channels: [], perWeek: 3, avoid: '' }

/** أطولُ ما يُحفظ في كلّ حقل — يكفي فقرةً، ولا يصير الموجّهُ كتابًا. */
export const BRIEF_MAX = 600

const clip = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, BRIEF_MAX)

export function readChannels(raw: readonly unknown[]): string[] {
  const allowed = new Set<string>(BRIEF_CHANNELS)
  return [...new Set(raw.map((x) => String(x)))].filter((x) => allowed.has(x))
}

export async function readBrief(db: Db, org: string): Promise<Brief> {
  const row = await db
    .prepare('SELECT goal, audience, tone, channels, per_week, avoid FROM briefs WHERE org_id = ?')
    .bind(org)
    .first<{ goal: string; audience: string; tone: string; channels: string; per_week: number; avoid: string }>()
    .catch(() => null)
  if (row === null) return EMPTY_BRIEF
  return {
    goal: row.goal, audience: row.audience, tone: row.tone,
    channels: readChannels(row.channels.split(',').filter((x) => x !== '')),
    perWeek: row.per_week, avoid: row.avoid,
  }
}

export async function writeBrief(db: Db, org: string, input: {
  goal?: unknown; audience?: unknown; tone?: unknown; channels?: readonly unknown[]; perWeek?: unknown; avoid?: unknown
}): Promise<Brief> {
  const n = Math.floor(Number(input.perWeek))
  const brief: Brief = {
    goal: clip(input.goal), audience: clip(input.audience), tone: clip(input.tone),
    channels: readChannels(input.channels ?? []),
    perWeek: Number.isFinite(n) ? Math.min(28, Math.max(0, n)) : EMPTY_BRIEF.perWeek,
    avoid: clip(input.avoid),
  }
  await db
    .prepare(
      `INSERT INTO briefs (org_id, goal, audience, tone, channels, per_week, avoid, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(org_id) DO UPDATE SET goal = excluded.goal, audience = excluded.audience, tone = excluded.tone,
         channels = excluded.channels, per_week = excluded.per_week, avoid = excluded.avoid, updated_at = excluded.updated_at`,
    )
    .bind(org, brief.goal, brief.audience, brief.tone, brief.channels.join(','), brief.perWeek, brief.avoid)
    .run()
  return brief
}

/** أفيه ما يُقال؟ — الموجزُ الفارغ لا يغيّر الموجّه. */
export function isEmptyBrief(b: Brief): boolean {
  return b.goal === '' && b.audience === '' && b.tone === '' && b.avoid === ''
}

/**
 * القسمُ الذي يُضاف إلى موجّه النموذج — **بيانٌ لا أمر**: ما يكتبه المالك يُقرأ وصفًا للعميل، والقيودُ قبله تبقى أعلى منه
 * (لا رقمَ يُخترَع ولا رابط). وفارغٌ إن لم يُكتب شيء.
 */
export function voiceSection(b: Brief): string {
  if (isEmptyBrief(b)) return ''
  return [
    '## صوت العميل (من موجزه — وصفٌ يُراعى، والقيودُ أعلاه أعلى منه)',
    b.goal === '' ? '' : `- الهدف: ${b.goal}`,
    b.audience === '' ? '' : `- الجمهور: ${b.audience}`,
    b.tone === '' ? '' : `- النبرة: ${b.tone}`,
    b.avoid === '' ? '' : `- ما لا يُقال: ${b.avoid}`,
  ].filter((l) => l !== '').join('\n')
}

/** ‏ما ينقص الموجزَ ليكتمل — بأسمائه كما تُقال. */
export type BriefPart = 'الوصف' | 'القنوات' | 'الإيقاع'

/**
 * **تعريفٌ واحدٌ لـ«الموجز مكتمل»** (D-438): وصفٌ مكتوب (هدفٌ أو جمهورٌ أو نبرةٌ أو محظور)، وقناةٌ مختارة على الأقلّ،
 * وإيقاعٌ فوق الصفر. تقرؤه محطّةُ الموجز وبطاقةُ الجاهزيّة معًا، فلا تقول إحداهما «جاهز» والأخرى «ناقص».
 */
export function briefGap(b: Brief): { readonly complete: boolean; readonly missing: readonly BriefPart[] } {
  const missing: BriefPart[] = []
  if (isEmptyBrief(b)) missing.push('الوصف')
  if (b.channels.length === 0) missing.push('القنوات')
  if (b.perWeek <= 0) missing.push('الإيقاع')
  return { complete: missing.length === 0, missing }
}
