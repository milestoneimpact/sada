/**
 * D-393: مصنَّفٌ بورقتين — «خطة الشهر» و«الإرشادات» — يُقرأ أصيلًا فتُحفظ قواعدُه مع الخطّة، وبندُه المسكَّن «كما هو»
 * يُكتب من فكرته بتلك القواعد في مكانه، بصفٍّ في `cost_ledger` قبل النجاح، ولمن يعتمد وحده (D-318).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { fakeDb, type FakeDb } from '../../test/fakes'
import { seatPlan, sheetsTable, toTable } from './seat'
import { seatedIdeaPosts, writeSeatedPost } from './seatedWrite'
import { requiredRole } from '../access'
import { readXlsx } from '../package/xlsx'
import type { PlanFacts } from './import'

let db: FakeDb
const NOW = new Date('2099-01-01T08:00:00Z')
const facts = (): PlanFacts => ({ accounts: [], uploads: [], now: NOW, zone: 'Asia/Riyadh', publishable: new Set(['linkedin', 'x']) })

beforeEach(() => { db = fakeDb() })

/** zip بأجزاءٍ مخزَّنة (بلا ضغط) — يكفي قارئَ `unzip`، وCRC لا يُفحص. */
function zip(files: Record<string, string>): Uint8Array {
  const enc = new TextEncoder()
  const chunks: number[] = []
  const central: number[] = []
  const le = (n: number, size: number): number[] => Array.from({ length: size }, (_, i) => (n >>> (8 * i)) & 0xff)
  let count = 0
  for (const [name, text] of Object.entries(files)) {
    const n = [...enc.encode(name)]
    const data = [...enc.encode(text)]
    const offset = chunks.length
    chunks.push(...le(0x04034b50, 4), ...le(20, 2), ...le(0, 2), ...le(0, 2), ...le(0, 4), ...le(0, 4), ...le(data.length, 4), ...le(data.length, 4), ...le(n.length, 2), ...le(0, 2), ...n, ...data)
    central.push(...le(0x02014b50, 4), ...le(20, 2), ...le(20, 2), ...le(0, 2), ...le(0, 2), ...le(0, 4), ...le(0, 4), ...le(data.length, 4), ...le(data.length, 4),
      ...le(n.length, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0, 4), ...le(offset, 4), ...n)
    count += 1
  }
  const at = chunks.length
  return new Uint8Array([...chunks, ...central, ...le(0x06054b50, 4), ...le(0, 2), ...le(0, 2), ...le(count, 2), ...le(count, 2), ...le(central.length, 4), ...le(at, 4), ...le(0, 2)])
}

const esc = (v: string): string => v.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const col = (i: number): string => String.fromCharCode(65 + i)
const sheetXml = (rows: readonly (readonly string[])[]): string =>
  `<worksheet><sheetData>${rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => /^\d+(\.\d+)?$/.test(v)
    ? `<c r="${col(ci)}${ri + 1}"><v>${v}</v></c>`
    : `<c r="${col(ci)}${ri + 1}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`

function workbook(sheets: Record<string, readonly (readonly string[])[]>): Uint8Array {
  const names = Object.keys(sheets)
  const files: Record<string, string> = {
    'xl/workbook.xml': `<workbook><sheets>${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships>${names.map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`,
  }
  names.forEach((n, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(sheets[n]!) })
  return zip(files)
}

const serial = (day: string): string => String((Date.parse(day + 'T00:00:00Z') - Date.UTC(1899, 11, 30)) / 86_400_000)
const IDEA = 'المعلم نقطة قرار في رحلة الوقف'
const BOOK = workbook({
  'خطة الشهر': [['التاريخ', 'الوقت', 'المنصة', 'النص'], [serial('2099-01-04'), '0.375', 'LinkedIn', IDEA]],
  'الإرشادات': [['البند', 'LinkedIn', 'X'], ['الطول', '120 كلمة بلا وسوم', 'نفسها'], ['الممنوعات', 'لا روابط في المتن', '']],
})

describe('xlsx بورقتين (D-393)', () => {
  it('ورقةُ الخطّة جدولٌ بتاريخها ووقتها، وورقةُ «الإرشادات» قواعدُ لكلّ منصّة — بلا Workers AI ولا كلفة', async () => {
    const out = await toTable({ db, writer: { db, encKey: '', workerSecrets: {} } }, { name: 'خطة.xlsx', bytes: BOOK })
    expect(out).toMatchObject({ kind: 'table', cost: 0, via: 'sheet', csv: `التاريخ,الوقت,المنصة,النص\n2099-01-04,09:00,LinkedIn,${IDEA}` })
    if (out.kind !== 'table') throw new Error('لا جدول')
    expect(out.rules?.['LinkedIn']).toEqual([{ item: 'الطول', value: '120 كلمة بلا وسوم' }, { item: 'الممنوعات', value: 'لا روابط في المتن' }])
    expect(out.rules?.['X']).toEqual([{ item: 'الطول', value: '120 كلمة بلا وسوم' }])
  })
  it('الإرشاداتُ أوّلًا لا تصير خطّة، والمصنَّفُ بلا ورقة خطّةٍ يعود إلى قارئ المستندات', async () => {
    const swapped = await readXlsx(workbook({ 'الإرشادات': [['البند', 'X'], ['الطول', 'قصير']], 'Sheet2': [['التاريخ', 'الوقت', 'المنصة', 'النص'], ['2099-01-04', '09:00', 'X', IDEA]] }))
    expect(sheetsTable(swapped)).toMatchObject({ kind: 'table', rules: { X: [{ item: 'الطول', value: 'قصير' }] } })
    expect(sheetsTable(await readXlsx(workbook({ 'الإرشادات': [['البند', 'X']] })))).toBeNull()
  })
})

/** يزيّف Anthropic وحده، ويحفظ ما أُرسل. */
let sent: string[] = []
const net = (text: string): typeof fetch => (async (input: unknown, init?: RequestInit): Promise<Response> => {
  const request = input instanceof Request ? input : null
  sent.push(request !== null ? await request.clone().text() : String(init?.body ?? ''))
  return new Response(JSON.stringify({
    id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5', stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify({ text, rationale: 'من الفكرة بقواعد العميل' }) }],
    usage: { input_tokens: 900, output_tokens: 400 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}) as unknown as typeof fetch

describe('البندُ المسكَّن يُكتب من فكرته بالقواعد المحفوظة (D-393)', () => {
  it('القواعدُ في خطّتها، والمسوّدةُ تُكتب في مكانها بمفتاحها، وصفُّ الدفتر قبل النجاح، والثانيةُ لا تُنادي', async () => {
    const table = await toTable({ db, writer: { db, encKey: '', workerSecrets: {} } }, { name: 'خطة.xlsx', bytes: BOOK })
    if (table.kind !== 'table') throw new Error('لا جدول')
    const seated = await seatPlan(db, 'org_owner', table.csv, facts(), new Map(), null, table.rules ?? null)
    expect(seated.seated).toBe(1)
    const row = db.raw.prepare('SELECT choices_json FROM plans WHERE id = ?').get(seated.planId!) as { choices_json: string }
    const choices = JSON.parse(row.choices_json) as { rules?: unknown }
    expect(choices.rules).toMatchObject({ LinkedIn: [{ item: 'الطول' }, { item: 'الممنوعات' }] })

    const [postId] = await seatedIdeaPosts(db, 'org_owner', seated.planId!)
    const before = db.raw.prepare('SELECT text, idempotency_key, plan_item_id FROM posts WHERE id = ?').get(postId!) as { text: string; idempotency_key: string; plan_item_id: string }
    expect(before.text).toBe(IDEA)

    sent = []
    const written = 'ن'.repeat(300)
    const deps = { db, encKey: '', workerSecrets: { ANTHROPIC_API_KEY: 'sk-test' }, fetchImpl: net(written), org: 'org_owner' }
    expect(await writeSeatedPost(deps, postId!)).toMatchObject({ kind: 'drafted', postId })
    // ‏الموجّهُ موجّهُ «من فكرتك» بقواعد منصّته من الإرشادات
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain('120 كلمة بلا وسوم')
    expect(sent[0]).toContain('لا روابط في المتن')
    expect(sent[0]).toContain(IDEA)
    const after = db.raw.prepare('SELECT text, model, status, idempotency_key, plan_item_id FROM posts WHERE id = ?').get(postId!) as Record<string, string>
    expect(after).toMatchObject({ text: written, status: 'draft', idempotency_key: before.idempotency_key, plan_item_id: before.plan_item_id })
    expect(after['model']).not.toBe('owner')
    expect(db.raw.prepare('SELECT ref_id, operation FROM cost_ledger').all()).toEqual([{ ref_id: 'post:' + postId!, operation: 'draft:linkedin:claude-opus-5' }])

    // ‏ما كُتب لا يُكتب ثانيةً ولا يُدفع نداؤه مرّتين، ولا يبقى في عدّ الزرّ
    expect(await writeSeatedPost(deps, postId!)).toEqual({ kind: 'already', postId })
    expect(sent).toHaveLength(1)
    expect(db.raw.prepare('SELECT count(*) AS n FROM cost_ledger').get()).toEqual({ n: 1 })
    expect(await seatedIdeaPosts(db, 'org_owner', seated.planId!)).toEqual([])
  })
  it('ما عدّله المالكُ بعد الطابور لا يُكتب فوقه، والرسالتان معًا تدفعان مرّةً (مراجعة D-393)', async () => {
    const table = await toTable({ db, writer: { db, encKey: '', workerSecrets: {} } }, { name: 'خطة.xlsx', bytes: BOOK })
    if (table.kind !== 'table') throw new Error('لا جدول')
    const seated = await seatPlan(db, 'org_owner', table.csv, facts(), new Map(), null, table.rules ?? null)
    const [postId] = await seatedIdeaPosts(db, 'org_owner', seated.planId!)
    sent = []
    const deps = { db, encKey: '', workerSecrets: { ANTHROPIC_API_KEY: 'sk-test' }, fetchImpl: net('ن'.repeat(300)), org: 'org_owner' }

    db.raw.prepare("UPDATE posts SET text = 'نصُّ المالك', edited_in_sada = 1 WHERE id = ?").run(postId!)
    expect(await writeSeatedPost(deps, postId!)).toEqual({ kind: 'already', postId })
    expect(sent).toHaveLength(0)
    expect(db.raw.prepare('SELECT text, model FROM posts WHERE id = ?').get(postId!)).toEqual({ text: 'نصُّ المالك', model: 'owner' })

    db.raw.prepare("UPDATE posts SET text = ?, edited_in_sada = 0 WHERE id = ?").run(IDEA, postId!)
    const both = await Promise.all([writeSeatedPost(deps, postId!), writeSeatedPost(deps, postId!)])
    expect(both.map((o) => o.kind).sort()).toEqual(['already', 'drafted'])
    expect(sent).toHaveLength(1)
    expect(db.raw.prepare('SELECT count(*) AS n FROM cost_ledger').get()).toEqual({ n: 1 })
  })

  it('الإنفاقُ لمن يعتمد (D-318): المحرّرُ لا يبدأ الكتابة', () => {
    expect(requiredRole('POST', '/panel/plan/review/write-seated')).toBe('publisher')
  })
})
