/**
 * قسمُ الأمان — الجلساتُ والمفاتيحُ وسجلُّ التدقيق.
 *
 * وقاموسُ الأفعال هنا **ناقصٌ عمدا**: فعلٌ لا اسمَ له بالعربيّة يُعرض
 * باسمه الحرفيّ لا بـ«غير معروف». سجلٌّ يُخفي ما لا يفهمه ليس سجلّا.
 */
import { stamp } from '../../../lib/time/zone'
import { relativeTime } from '../../../lib/format'
import type { PanelData } from '../../panelView'
import { escapeHtml } from '../escape'
import { html, join, raw } from '../html'
import { actionLabel, targetLabel } from '../../../lib/audit'
import { pathArrows } from '../parts'
import { statusBadge } from '../components/badge'



/** متصفّحٌ يُختصر إلى ما يُميّزه. الترويسة كاملةً سطرٌ لا يُقرأ. */
function shortUa(ua: string): string {
  if (ua === '') return 'غير معروف'
  const os = /Windows/i.test(ua) ? 'Windows'
    : /iPhone|iPad/i.test(ua) ? 'iOS'
    : /Android/i.test(ua) ? 'Android'
    : /Mac OS X|Macintosh/i.test(ua) ? 'macOS'
    : /Linux/i.test(ua) ? 'Linux' : ''
  const browser = /Edg\//i.test(ua) ? 'Edge'
    : /OPR\//i.test(ua) ? 'Opera'
    : /Firefox\//i.test(ua) ? 'Firefox'
    : /Chrome\//i.test(ua) ? 'Chrome'
    : /Safari\//i.test(ua) ? 'Safari' : ''
  const parts = [browser, os].filter((x) => x !== '')
  return parts.length === 0 ? ua.slice(0, 40) : parts.join(' · ')
}

/** صفوفٌ مرسومة — نصًّا، لأنّ `panelView` لم تُحوَّل بعدُ إلى القالب وتُقحِمها في قالبٍ عاديّ (D-281). */
export interface SecurityMarkup {
  readonly sessions: string
  readonly passkeys: string
  readonly audit: string
}

/** ما يقرؤه القسمُ من بيانات اللوحة — **وهذا كلُّه** (D-280). */
export type SecurityData = Pick<PanelData, 'sessions' | 'factors' | 'audit' | 'now' | 'zone'>

export function securitySection(d: SecurityData): SecurityMarkup {
  // ‏`statusBadge` من العُدّة ترسم HTML ولم تُحوَّل بعدُ إلى القالب: تُوثَق عند الحدّ (D-281)
  const sessions = join(d.sessions.map((x) => html`<tr>
    <td><div class="nm">${shortUa(x.ua)}${
      x.current ? html` <span class="chip">هذا الجهاز</span>` : ''}${
      x.via === 'passkey' ? html` <span class="chip">مفتاح مرور</span>` : x.via === 'email_code' ? html` <span class="chip">رمز البريد</span>` : ''}</div>
      <div class="mono">${x.ip === '' ? 'عنوان غير معروف' : x.ip}</div></td>
    <td data-label="فُتحت"><span title="${stamp(x.at, d.zone ?? null)}">${relativeTime(x.at, d.now)}</span></td>
    <td data-label="">${x.current
      ? raw(statusBadge('ok', '●', 'جلستك'))
      : html`<form class="inline" method="POST" action="/panel/sessions/revoke"
             data-confirm="إبطال هذه الجلسة؟ سيُطلب من ذلك الجهاز الدخول من جديد.">
           <input type="hidden" name="handle" value="${x.handle}">
           <button class="btn btn-danger btn-sm" type="submit">أبطلها</button></form>`}</td>
  </tr>`))

  const passkeys = join(d.factors.passkeys.map((k) => html`<tr>
    <td><div class="nm">${k.label}</div></td>
    <td data-label="سُجّل"><span title="${stamp(k.createdAt, d.zone ?? null)}">${relativeTime(k.createdAt, d.now)}</span></td>
    <td data-label="آخر استعمال">${k.lastUsedAt === null
      ? raw(statusBadge('idle', '○', 'لم يُستعمل'))
      : html`<span title="${stamp(k.lastUsedAt, d.zone ?? null)}">${relativeTime(k.lastUsedAt, d.now)}</span>`}</td>
    <td><button class="btn btn-danger btn-sm pk-del" type="button" data-id="${k.id}"
          data-label="${k.label}">احذف</button></td>
  </tr>`))

  // ‏`pathArrows` تأخذ نصًّا مهرَّبًا وتُدخل أسهمَها وسومًا، فمخرَجُها موثوق (D-281)
  const audit = join(d.audit.map((a) => html`<tr>
    <td><span title="${stamp(a.at, d.zone ?? null)}">${relativeTime(a.at, d.now)}</span></td>
    <td data-label="الفعل"><div class="nm" title="${a.action}">${actionLabel(a.action)}</div>${
      a.byEmail === undefined || a.byEmail === null ? '' : html`<div class="sub"><bdi dir="ltr">${a.byEmail}</bdi></div>`}</td>
    <td data-label="على ماذا">${a.target === null ? html`<span class="mono">—</span>` : html`<span class="chip">${targetLabel(a.target)}</span>`}
      ${a.detail === null ? '' : html`<div class="sub">${raw(pathArrows(escapeHtml(a.detail)))}</div>`}</td>
    <td data-label="العنوان"><span class="mono">${a.ip ?? '—'}</span></td>
  </tr>`))
  return { sessions: sessions.value, passkeys: passkeys.value, audit: audit.value }
}
