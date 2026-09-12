/**
 * فرقُ النصّين سطرًا سطرًا — **ما تغيّر قبل الاعتماد** (D-128).
 *
 * `edited` تقول إنّ تعديلًا وقع **ولا تقول ما هو**. والفرقُ يُحسَب هنا من
 * الأصل المحفوظ (`posts.original_text`) والنصّ المعتمَد، **ولا يُحفَظ**:
 * ما يُشتَقّ لا يُخزَّن (سنّةُ `publishCost` في D-069).
 *
 * ## والسطرُ وحدةُ الفرق لا الحرف
 *
 * المنشورُ فقراتٌ قصيرة، والمالكُ يبدّل جملةً أو يحذف سطرًا. وفرقٌ بالحرف
 * يقطّع الكلمةَ العربيّةَ فيُقرأ حروفًا منفكّة — **والوصلُ عملُ السطر**.
 *
 * ## والحسابُ أطولُ تتابعٍ مشترك
 *
 * `LCS` على الأسطر: ما في الاثنين يبقى، وما في الأصل وحدَه حُذف، وما في
 * المعتمَد وحدَه أُضيف. تربيعيٌّ في عدد الأسطر، **ومنشورٌ لا يتجاوز عشرات
 * الأسطر** — فلا حاجةَ إلى أذكى منه.
 */
export interface DiffLine {
  readonly kind: 'same' | 'del' | 'add'
  readonly text: string
}

function lines(s: string): string[] {
  const out = s.replace(/\r\n?/g, '\n').split('\n')
  // وسطرٌ أخيرٌ فارغٌ من نهاية النصّ ليس سطرًا
  if (out.length > 1 && out[out.length - 1] === '') out.pop()
  return out
}

export function diffLines(before: string, after: string): DiffLine[] {
  const a = lines(before)
  const b = lines(after)
  const n = a.length
  const m = b.length
  // جدولُ الأطوال: table[i][j] أطولُ مشتركٍ بين a[i..] و b[j..]
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i]![j] = a[i] === b[j]
        ? table[i + 1]![j + 1]! + 1
        : Math.max(table[i + 1]![j]!, table[i]![j + 1]!)
    }
  }
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i]! })
      i += 1
      j += 1
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      out.push({ kind: 'del', text: a[i]! })
      i += 1
    } else {
      out.push({ kind: 'add', text: b[j]! })
      j += 1
    }
  }
  while (i < n) out.push({ kind: 'del', text: a[i++]! })
  while (j < m) out.push({ kind: 'add', text: b[j++]! })
  return out
}

/** كم سطرًا تغيّر — للترويسة، لا للحكم. */
export function changedCount(diff: readonly DiffLine[]): number {
  return diff.filter((l) => l.kind !== 'same').length
}
