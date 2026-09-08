import { describe, expect, it } from 'vitest'
import { afterVault, readiness, PHASE_0_SECRETS, PHASE_1_SECRETS } from './env'

/**
 * **الجاهزيّةُ مرحلتان لا حالةٌ واحدة** — ونظامٌ ينشر ولا يفهم ليس معطلا.
 */
describe('قراءةُ البيئة', () => {
  it('بيئةٌ كاملةٌ تجتاز المرحلتين', () => {
    const full: Record<string, string> = { DRIVE_FOLDER_ID: 'f' }
    for (const name of [...PHASE_0_SECRETS, ...PHASE_1_SECRETS]) full[name] = 'v'
    const state = readiness(full)
    expect(state.phase0).toBe(true)
    expect(state.phase1).toBe(true)
    expect(state.missing).toEqual([])
  })

  it('وبيئةٌ فارغةٌ تسمّي كلَّ ناقصٍ ولا تكتفي بـ«غير جاهز»', () => {
    const state = readiness({})
    expect(state.phase0).toBe(false)
    expect(state.missing).toEqual([...PHASE_0_SECRETS, ...PHASE_1_SECRETS])
    expect(state.driveFolder).toBe(false)
  })

  it('وسرٌّ فارغٌ كسرٍّ غائب — لا يُعدّ حاضرا بوجود المفتاح', () => {
    expect(readiness({ TOKEN_ENC_KEY: '' }).missing).toContain('TOKEN_ENC_KEY')
  })
})


/**
 * **جوابٌ يناقض نفسَه أسوأُ من جوابٍ خاطئ** (D-095).
 *
 * كان `‎/ready` يقول في سطرين:
 *
 *     "missing_secrets": []              ← لا شيءَ ناقص
 *     "phase_0": false, "ready": false   ← وغيرُ جاهز
 *
 * لأنّ الحكمَ يُحسَب من بيئة Worker وحدَها، **وخزانةُ المزوّدين تسدّ
 * أكثرَه من اللوحة**. فإشارةٌ حمراءُ دائما تُتجاهَل — وهي حجّةٌ مكتوبةٌ
 * في سير النشر نفسِه.
 */
describe('الجاهزيّةُ بعد الخزانة (D-095)', () => {
  const BARE = { TOKEN_ENC_KEY: 'k', DRIVE_FOLDER_ID: 'f' }

  it('ما سُدّ من الخزانة يُجيز المرحلة — ولا يبقى الحكمُ أحمرَ بلا ناقص', () => {
    const state = readiness(BARE)
    expect(state.phase0).toBe(false)

    const sealed = afterVault(state, [
      'LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'X_CLIENT_ID', 'X_CLIENT_SECRET',
    ])
    expect(sealed.phase0).toBe(true)
    expect(sealed.missing).toEqual(['GOOGLE_SA_JSON', 'ANTHROPIC_API_KEY'])
  })

  it('**ولا يقول «لا ناقص» و«غيرُ جاهز» معا** — الجوابُ لا يناقض نفسَه', () => {
    const sealed = afterVault(readiness(BARE), [
      'LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'X_CLIENT_ID', 'X_CLIENT_SECRET',
      'GOOGLE_SA_JSON', 'ANTHROPIC_API_KEY',
    ])
    expect(sealed.missing).toEqual([])
    expect(sealed.phase0).toBe(true)
    expect(sealed.phase1).toBe(true)
  })

  it('وما لم يُسدّ يبقى ناقصا ويمنع مرحلتَه', () => {
    const sealed = afterVault(readiness(BARE), ['LINKEDIN_CLIENT_ID'])
    expect(sealed.phase0).toBe(false)
    expect(sealed.missing).toContain('X_CLIENT_ID')
    expect(sealed.missing).not.toContain('LINKEDIN_CLIENT_ID')
  })

  it('**والمجلَّدُ يبقى شرطا** — لا خزانةَ تسدّ متغيّرَ بيئة', () => {
    const noFolder = readiness({ TOKEN_ENC_KEY: 'k' })
    const sealed = afterVault(noFolder, [
      'LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'X_CLIENT_ID', 'X_CLIENT_SECRET',
      'GOOGLE_SA_JSON', 'ANTHROPIC_API_KEY',
    ])
    expect(sealed.phase0).toBe(true)
    expect(sealed.phase1).toBe(false)
    expect(sealed.driveFolder).toBe(false)
  })

  it('وبلا خزانةٍ لا يتغيّر شيء — الدالّةُ لا تُجيز ما لم يُسدّ', () => {
    const state = readiness(BARE)
    expect(afterVault(state, [])).toEqual(state)
  })

  it('و`TOKEN_ENC_KEY` لا تُسدّ من خزانةٍ تُفكّ به — فبدونه لا مرحلة', () => {
    const sealed = afterVault(readiness({ DRIVE_FOLDER_ID: 'f' }), [
      'LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'X_CLIENT_ID', 'X_CLIENT_SECRET',
    ])
    expect(sealed.phase0).toBe(false)
    expect(sealed.missing).toContain('TOKEN_ENC_KEY')
  })
})
