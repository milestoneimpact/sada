/**
 * قارئُ xlsx أصيل (D-368) — **بلا مكتبةٍ ولا نداءٍ مدفوع**: الملفُّ zip، فيُقرأ الفهرسُ المركزيّ، وتُفكّ الأجزاءُ بـ
 * `DecompressionStream('deflate-raw')` الموجود في Workers وNode، ثمّ تُقرأ `workbook.xml` وروابطُها و`sharedStrings.xml`
 * (إن وُجدت) وكلُّ ورقةٍ بخلاياها المضمَّنة (`inlineStr`) والمشتركة والرقميّة.
 *
 * والناتجُ أوراقٌ بأسمائها، وكلُّ ورقةٍ صفوفُ نصوص. وتاريخُ Excel التسلسليّ يُحوَّل في `excelDate` لا هنا: الخليّةُ لا تعرف أنّها تاريخ.
 */

export interface Sheet { readonly name: string; readonly rows: readonly (readonly string[])[] }

const u16 = (b: Uint8Array, o: number): number => b[o]! | (b[o + 1]! << 8)
const u32 = (b: Uint8Array, o: number): number => (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** أجزاءُ الأرشيف بأسمائها — والمضغوطُ بغير deflate أو المخزَّنُ يُرفض بسبب. */
export async function unzip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i -= 1) {
    if (u32(bytes, i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('ليس ملفّ xlsx')
  const count = u16(bytes, eocd + 10)
  let at = u32(bytes, eocd + 16)
  const out = new Map<string, Uint8Array>()
  const dec = new TextDecoder()
  for (let n = 0; n < count; n += 1) {
    if (u32(bytes, at) !== 0x02014b50) throw new Error('فهرس xlsx تالف')
    const method = u16(bytes, at + 10)
    const size = u32(bytes, at + 20)
    const nameLen = u16(bytes, at + 28)
    const extraLen = u16(bytes, at + 30)
    const commentLen = u16(bytes, at + 32)
    const local = u32(bytes, at + 42)
    const name = dec.decode(bytes.subarray(at + 46, at + 46 + nameLen))
    at += 46 + nameLen + extraLen + commentLen
    const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28)
    const raw = bytes.subarray(start, start + size)
    if (method === 0) out.set(name, raw)
    else if (method === 8) out.set(name, await inflate(raw))
    else throw new Error('ضغطٌ لا أعرفه في xlsx')
  }
  return out
}

const ENTITY: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
export function unescapeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
    return ENTITY[e] ?? m
  })
}

/** نصُّ عنصرٍ قد يحمل أكثر من `<t>` (نصٌّ منسَّق). */
const texts = (xml: string): string => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1]!)).join('')

/** «C12» ← 2 (العمودُ من الصفر). */
function columnOf(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A'
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function readSheet(xml: string, shared: readonly string[]): string[][] {
  const rows: string[][] = []
  for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = []
    for (const c of r[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]!
      const body = c[2] ?? ''
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? ''
      const type = /\bt="([a-zA-Z]+)"/.exec(attrs)?.[1] ?? 'n'
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
      let value = ''
      if (type === 'inlineStr') value = texts(body)
      else if (type === 's') value = shared[Number(v)] ?? ''
      else if (v !== undefined) value = unescapeXml(v)
      const i = ref === '' ? row.length : columnOf(ref)
      while (row.length < i) row.push('')
      row[i] = value
    }
    rows.push(row)
  }
  return rows
}

/** أوراقُ المصنَّف بترتيبها وأسمائها. */
export async function readXlsx(bytes: Uint8Array): Promise<Sheet[]> {
  const parts = await unzip(bytes)
  const dec = new TextDecoder()
  const part = (name: string): string | null => {
    const b = parts.get(name.replace(/^\//, ''))
    return b === undefined ? null : dec.decode(b)
  }
  const book = part('xl/workbook.xml')
  if (book === null) throw new Error('ليس ملفّ xlsx')
  const rels = part('xl/_rels/workbook.xml.rels') ?? ''
  const target = new Map([...rels.matchAll(/<Relationship\b([^>]*)\/?>/g)].map((m) => {
    const id = /\bId="([^"]+)"/.exec(m[1]!)?.[1] ?? ''
    const t = /\bTarget="([^"]+)"/.exec(m[1]!)?.[1] ?? ''
    return [id, t.startsWith('/') ? t.slice(1) : 'xl/' + t]
  }))
  const sharedXml = part('xl/sharedStrings.xml')
  const shared = sharedXml === null ? [] : [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]!))
  const out: Sheet[] = []
  for (const s of book.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = unescapeXml(/\bname="([^"]*)"/.exec(s[1]!)?.[1] ?? '')
    const rid = /\br:id="([^"]+)"/.exec(s[1]!)?.[1] ?? ''
    const xml = part(target.get(rid) ?? '')
    if (xml !== null) out.push({ name, rows: readSheet(xml, shared) })
  }
  return out
}

/** تاريخُ Excel التسلسليّ («46348») ← «2026-11-22»، وما ليس رقمًا يمرّ كما هو. */
export function excelDate(v: string): string {
  if (!/^\d{5}(\.\d+)?$/.test(v.trim())) return v
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(v)) * 86_400_000)
  return d.toISOString().slice(0, 10)
}

/** وقتُ Excel الكسريّ («0.395833») ← «09:30»، وما ليس كسرًا يمرّ. */
export function excelTime(v: string): string {
  if (!/^0?\.\d+$/.test(v.trim())) return v
  const mins = Math.round(Number(v) * 1440)
  return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0')
}
