/**
 * قسمُ الأمان — الجلساتُ والمفاتيحُ وسجلُّ التدقيق.
 *
 * وقاموسُ الأفعال هنا **ناقصٌ عمدا**: فعلٌ لا اسمَ له بالعربيّة يُعرض
 * باسمه الحرفيّ لا بـ«غير معروف». سجلٌّ يُخفي ما لا يفهمه ليس سجلّا.
 */
import { relativeTime } from '../../../lib/format'
import type { PanelData } from '../../panelView'
import { escapeHtml } from '../escape'
import { actionLabel, targetLabel } from '../../../lib/audit'
import { pathArrows, status } from '../parts'



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

export interface SecurityMarkup {
  readonly sessions: string
  readonly passkeys: string
  readonly audit: string
}

export function securitySection(d: PanelData): SecurityMarkup {
  const sessions = d.sessions.map((x) => `<tr>
    <td><div class="nm">${escapeHtml(shortUa(x.ua))}${
      x.current ? ' <span class="chip">هذا الجهاز</span>' : ''}${
      x.via === 'passkey' ? ' <span class="chip">مفتاح مرور</span>' : ''}</div>
      <div class="mono">${escapeHtml(x.ip === '' ? 'عنوان غير معروف' : x.ip)}</div></td>
    <td data-label="فُتحت"><span title="${escapeHtml(x.at)} UTC">${escapeHtml(relativeTime(x.at, d.now))}</span></td>
    <td data-label="">${x.current
      ? status('ok', '●', 'جلستك')
      : `<form class="inline" method="POST" action="/panel/sessions/revoke"
             data-confirm="إبطال هذه الجلسة؟ سيُطلب من ذلك الجهاز الدخول من جديد.">
           <input type="hidden" name="handle" value="${escapeHtml(x.handle)}">
           <button class="d sm" type="submit">أبطلها</button></form>`}</td>
  </tr>`).join('')

  const passkeys = d.factors.passkeys.map((k) => `<tr>
    <td><div class="nm">${escapeHtml(k.label)}</div></td>
    <td data-label="سُجّل"><span title="${escapeHtml(k.createdAt)} UTC">${escapeHtml(relativeTime(k.createdAt, d.now))}</span></td>
    <td data-label="آخر استعمال">${k.lastUsedAt === null
      ? status('idle', '○', 'لم يُستعمل')
      : `<span title="${escapeHtml(k.lastUsedAt)} UTC">${escapeHtml(relativeTime(k.lastUsedAt, d.now))}</span>`}</td>
    <td><button class="d sm pk-del" type="button" data-id="${escapeHtml(k.id)}"
          data-label="${escapeHtml(k.label)}">احذف</button></td>
  </tr>`).join('')

  const audit = d.audit.map((a) => `<tr>
    <td><span title="${escapeHtml(a.at)} UTC">${escapeHtml(relativeTime(a.at, d.now))}</span></td>
    <td data-label="الفعل"><div class="nm">${escapeHtml(actionLabel(a.action))}</div>
      <div class="mono">${escapeHtml(a.action)}</div></td>
    <td data-label="على ماذا">${a.target === null ? '<span class="mono">—</span>' : `<span class="chip">${escapeHtml(targetLabel(a.target))}</span>`}
      ${a.detail === null ? '' : `<div class="sub">${pathArrows(escapeHtml(a.detail))}</div>`}</td>
    <td data-label="العنوان"><span class="mono">${escapeHtml(a.ip ?? '—')}</span></td>
  </tr>`).join('')
  return { sessions, passkeys, audit }
}
