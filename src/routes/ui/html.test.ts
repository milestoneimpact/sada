/**
 * قالبُ `html` (D-281): **ما يُقحَم يُهرَّب، وما وُسم يمرّ** — وبايتاتُه بايتاتُ `escapeHtml`.
 */
import { describe, expect, it } from 'vitest'
import { escapeHtml } from './escape'
import { Html, html, join, raw } from './html'

describe('قالب html — التهريبُ هو الأصل', () => {
  it('يهرّب نصًّا عاديًّا بالحروف الخمسة نفسِها', () => {
    const evil = `<script>alert("x")</script> & 'q'`
    expect(html`<p>${evil}</p>`.value).toBe(`<p>${escapeHtml(evil)}</p>`)
    expect(html`<p>${evil}</p>`.value).not.toContain('<script>')
  })

  it('ونصٌّ يحمل <script> يُهرَّب حتى في سمة', () => {
    const out = html`<a title="${'" onmouseover="x'}">x</a>`
    expect(out.value).toBe('<a title="&quot; onmouseover=&quot;x">x</a>')
  })

  it('الأرقامُ كما هي، وnull/undefined فراغ', () => {
    expect(html`<i>${3}|${0}|${null}|${undefined}</i>`.value).toBe('<i>3|0||</i>')
  })

  it('القالبُ المتداخل يمرّ بلا تهريبٍ ثانٍ', () => {
    const inner = html`<b>${'a<b'}</b>`
    expect(html`<p>${inner}</p>`.value).toBe('<p><b>a&lt;b</b></p>')
  })

  it('المصفوفةُ تُضَمّ بلا فاصل، وكلُّ عنصرٍ على حكمه', () => {
    const rows = ['x<', 'y'].map((v) => html`<li>${v}</li>`)
    expect(html`<ul>${rows}</ul>`.value).toBe('<ul><li>x&lt;</li><li>y</li></ul>')
    expect(html`<ul>${['<', html`<i></i>`]}</ul>`.value).toBe('<ul>&lt;<i></i></ul>')
  })

  it('raw يمرّ كما هو — وهو الاستثناءُ المسمّى', () => {
    const svg = raw('<svg aria-hidden="true"></svg>')
    expect(html`<span>${svg}</span>`.value).toBe('<span><svg aria-hidden="true"></svg></span>')
  })

  it('join يضمّ الموسومَ بفاصلٍ أو بلا فاصل', () => {
    const parts: readonly Html[] = [html`<i>${1}</i>`, html`<i>${2}</i>`]
    expect(join(parts).value).toBe('<i>1</i><i>2</i>')
    expect(join(parts, raw(' · ')).value).toBe('<i>1</i> · <i>2</i>')
    expect(html`<p>${join(parts)}</p>`.value).toBe('<p><i>1</i><i>2</i></p>')
  })

  it('ونصٌّ عاديٌّ يطابق حرفًا بحرف جزءًا رُسم قبله يُهرَّب — الثقةُ في الكائن لا في المحتوى', () => {
    const trusted = html`<b>${'x'}</b>`
    expect(html`<p>${trusted}</p>`.value).toBe('<p><b>x</b></p>')
    const lookalike: string = trusted.value
    expect(html`<p>${lookalike}</p>`.value).toBe('<p>&lt;b&gt;x&lt;/b&gt;</p>')
    expect(html`<p>${'<b>x</b>'}</p>`.value).toBe('<p>&lt;b&gt;x&lt;/b&gt;</p>')
  })

  it('والكائنُ مجمَّد، وtoString يعطي نصَّه للحدّ مع ما لم يُحوَّل', () => {
    const out = html`<p>${'x'}</p>`
    expect(out).toBeInstanceOf(Html)
    expect(Object.isFrozen(out)).toBe(true)
    expect(`${out}`).toBe('<p>x</p>')
    expect(out.toString()).toBe(out.value)
  })
})
