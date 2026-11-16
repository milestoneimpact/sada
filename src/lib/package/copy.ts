/**
 * نصوصُ الحزمة الجاهزة من `02-copy/*.md` (D-369) — **تُحفظ كما كُتبت، ولا كتابةَ مدفوعةً لما هو جاهز**.
 *
 * المادّةُ عنوانٌ «## NN — العنوان»، وتحته «**X**» و«**LinkedIn**» (وقد يحمل الوسمُ صيغته: «**X (سلسلة)**»). والسلسلةُ المرقّمة
 * «1/ … 2/ …» تُفصل بسطر `---` لتُنشر تغريداتٍ كما يقرؤها الناشر، ولا يتغيّر فيها حرف. والنصُّ الأطولُ من حدّ X يُعلَّم ولا يُقصّ،
 * وما لا يُفهم يُقال «لم أفهم هذا النصّ» ولا يُخمَّن. و«[رابط التسجيل]» علامةُ نقصٍ تمنع الاعتمادَ حتّى يُضاف الرابط.
 */
import { longestTweet, THREAD_SEPARATOR } from '../draft/thread'

export interface CopyPiece {
  readonly text: string
  /** الصيغةُ من الوسم («سلسلة»، «استطلاع») أو فارغة. */
  readonly form: string
  readonly problems: readonly string[]
}

export interface CopyItem {
  readonly item: string
  readonly title: string
  readonly x: CopyPiece | null
  readonly linkedin: CopyPiece | null
}

export interface CopyRead {
  readonly items: ReadonlyMap<string, CopyItem>
  /** عناوينُ لم تُفهم — تُعرض للمالكة. */
  readonly unparsed: readonly string[]
}

const X_LIMIT = 280
const PLACEHOLDER = /\[رابط[^\]]*\]/

/** «1/ … 2/ …» ← تغريداتٌ بسطر `---` — بلا مسّ النصّ نفسِه. */
export function threadify(text: string): string {
  const lines = text.split('\n')
  const out: string[] = []
  for (const line of lines) {
    if (/^\d{1,2}\/\s/.test(line) && out.some((l) => l.trim() !== '')) {
      while (out.length > 0 && out[out.length - 1]!.trim() === '') out.pop()
      out.push(THREAD_SEPARATOR)
    }
    out.push(line)
  }
  return out.join('\n').trim()
}

function piece(platform: 'x' | 'linkedin', body: string, form: string): CopyPiece {
  const text = platform === 'x' && /سلسلة/.test(form) ? threadify(body.trim()) : body.trim()
  const problems: string[] = []
  if (text === '') problems.push('لم أفهم هذا النصّ')
  if (platform === 'x' && text !== '') {
    const n = longestTweet('x', text)
    if (n > X_LIMIT) problems.push(`النصّ ${n} محرفًا و X تقبل ${X_LIMIT} — لم يُقصّ`)
  }
  if (PLACEHOLDER.test(text)) problems.push('ينقصه رابط التسجيل قبل النشر')
  return { text, form, problems }
}

/** يقسم ملفّ النصوص — نقيّة. */
export function parseCopy(md: string): CopyRead {
  const items = new Map<string, CopyItem>()
  const unparsed: string[] = []
  const sections = md.replace(/\r\n?/g, '\n').split(/^## /m).slice(1)
  for (const sec of sections) {
    const nl = sec.indexOf('\n')
    const heading = (nl < 0 ? sec : sec.slice(0, nl)).trim()
    const m = /^(\d{1,2})\s*[—–-]\s*(.+)$/.exec(heading)
    if (m === null) { unparsed.push(heading); continue }
    const body = (nl < 0 ? '' : sec.slice(nl + 1)).replace(/\n-{3,}\s*$/, '')
    const parts = body.split(/^\*\*(X|LinkedIn)(?:\s*\(([^)]*)\))?\*\*\s*$/m)
    let x: CopyPiece | null = null
    let li: CopyPiece | null = null
    for (let i = 1; i + 2 < parts.length; i += 3) {
      const which = parts[i]
      const form = parts[i + 1] ?? ''
      const text = (parts[i + 2] ?? '').replace(/\n---\s*$/, '')
      if (which === 'X') x = piece('x', text, form)
      else if (which === 'LinkedIn') li = piece('linkedin', text, form)
    }
    if (x === null && li === null) unparsed.push(heading)
    const item = m[1]!.padStart(2, '0')
    items.set(item, { item, title: m[2]!.trim(), x, linkedin: li })
  }
  return { items, unparsed }
}

/** رقمُ نسخة ملفّ النصوص («-v2.md» ← 2) — الترتيبُ نفسُه لـ`mergeCopies` ولبصمة النصّ في المراجعة. */
export const copyVersion = (p: string): number => Number(/-v(\d+)\.md$/i.exec(p)?.[1] ?? 0)

/** نصوصُ ملفّاتٍ عدّة — الأحدثُ نسخةً يغلب في المادّة نفسِها. */
export function mergeCopies(files: readonly { readonly path: string; readonly md: string }[]): CopyRead {
  const ver = copyVersion
  const items = new Map<string, CopyItem>()
  const unparsed: string[] = []
  for (const f of [...files].sort((a, b) => ver(a.path) - ver(b.path))) {
    const r = parseCopy(f.md)
    for (const [k, v] of r.items) items.set(k, v)
    unparsed.push(...r.unparsed)
  }
  return { items, unparsed }
}
