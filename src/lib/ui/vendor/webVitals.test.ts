/**
 * النسخةُ الحرفيّة من web-vitals لا تشيخ بصمت (D-299): تُقارَن بملفّ الحزمة المثبَّتة، ورقمُها مثبَّتٌ في package.json.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { WEB_VITALS_IIFE } from './webVitals'

const ROOT = new URL('../../../../', import.meta.url)

describe('web-vitals المضمَّنة', () => {
  it('تطابق ملفَّ الحزمة حرفًا بحرف', () => {
    const file = readFileSync(new URL('node_modules/web-vitals/dist/web-vitals.iife.js', ROOT), 'utf8').trim()
    expect(WEB_VITALS_IIFE).toBe(file)
  })

  it('والحزمةُ مثبَّتةٌ برقمٍ لا بمدًى، وتعرّف الثلاثةَ التي تُقاس', () => {
    const pkg = JSON.parse(readFileSync(new URL('package.json', ROOT), 'utf8')) as { devDependencies: Record<string, string> }
    expect(pkg.devDependencies['web-vitals']).toMatch(/^\d+\.\d+\.\d+$/)
    expect(WEB_VITALS_IIFE.startsWith('var webVitals=')).toBe(true)
    for (const fn of ['onLCP', 'onINP', 'onCLS']) expect(WEB_VITALS_IIFE).toContain(fn)
    expect(WEB_VITALS_IIFE).not.toMatch(/https?:\/\//)
  })
})
