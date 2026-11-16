/** الوقتُ المعروض بمنطقة المتصفّح واسمِها (D-378) — وبطاقةُ الحزمة لا تكتب UTC. */
import { describe, expect, it } from 'vitest'
import { localWhen, todayKey, zoneName } from './zone'
import { packageScreen } from '../../routes/ui/packageView'
import { teamScreen } from '../../routes/ui/teamView'
import type { PackageSource } from '../package/sync'

const RAW = '2026-11-16 19:06:00'

describe('localWhen (D-378)', () => {
  it('يحوّل وقت D1 إلى الرياض ويسمّيها', () => {
    expect(localWhen(RAW, 'Asia/Riyadh')).toBe('2026-11-16 10:06 م بتوقيت الرياض')
  })
  it('ويحوّله إلى لندن ويسمّيها', () => {
    expect(localWhen(RAW, 'Europe/London')).toBe('2026-11-16 7:06 م بتوقيت لندن')
  })
  it('و`null` احتياطُ الرياض، وصيغةُ ISO تُقرأ UTC', () => {
    expect(localWhen('2026-11-16T19:06:00Z', null)).toBe('2026-11-16 10:06 م بتوقيت الرياض')
  })
  it('واسمُ منطقةٍ لا جدولَ لها من معرّفها', () => {
    expect(zoneName('America/Los_Angeles')).toBe('Los Angeles')
  })
  it('واليومُ المحلّيّ لا يومُ غرينتش', () => {
    expect(todayKey(new Date('2026-11-16T22:30:00Z'), 'Asia/Riyadh')).toBe('2026-11-17')
  })
})

describe('بطاقة الحزمة (D-378)', () => {
  const source: PackageSource = {
    id: 's', org: 'o', owner: 'a', repo: 'b', branch: 'main', root: '', lastCommit: 'abcdef1234', lastTree: null,
    lastEtag: null, lastCheckedAt: RAW, status: 'ok', error: null, hasHook: false, sealedToken: null,
    variants: { x: 'dark', linkedin: 'light' }, followUpdates: true,
  }
  it('«فُحص» بالمنطقة واسمِها، لا الطابعُ الخام', () => {
    const out = packageScreen({ source, media: [], tokenReady: true, zone: 'Europe/London' })
    expect(out).toContain('فُحص <bdi>2026-11-16 7:06 م بتوقيت لندن</bdi>')
    expect(out).not.toContain(RAW)
  })
  it('وآخرُ دخول العضو بمنطقته', () => {
    const out = teamScreen({ zone: 'Asia/Riyadh', orgs: [], flash: null, members: [{ email: 'x@y.z', role: 'editor', orgs: '*', lastSeenAt: RAW } as never] })
    expect(out).toContain('10:06 م بتوقيت الرياض')
  })
})
