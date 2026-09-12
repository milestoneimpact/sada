/**
 * قسمُ الأمان — الجلساتُ والمفاتيحُ وسجلُّ التدقيق.
 *
 * وقاموسُ الأفعال هنا **ناقصٌ عمدا**: فعلٌ لا اسمَ له بالعربيّة يُعرض
 * باسمه الحرفيّ لا بـ«غير معروف». سجلٌّ يُخفي ما لا يفهمه ليس سجلّا.
 */
import { relativeTime } from '../../../lib/format'
import type { PanelData } from '../../panelView'
import { escapeHtml } from '../shell'
import { platformLabel } from '../../../lib/oauth/providers'
import { PROVIDERS } from '../../../lib/ai/registry'

/**
 * «على ماذا» يُقرأ اسما لا مفتاحا (D-125).
 *
 * هدفُ الفعل في `audit_log` مفتاحٌ بحرفه: `anthropic` لمفتاح مزوّد،
 * و`linkedin` لحساب. **والمزوّدُ له اسمٌ بجانب تعريفه والمنصّةُ كذلك**،
 * فيُقرآن من هناك. وما ليس مزوّدا ولا منصّةً — معرِّفُ مسوّدةٍ أو مفتاحُ
 * ضبط — يُعرَض بحرفه: القاموسُ ناقصٌ عمدا.
 */
function targetLabel(target: string): string {
  const provider = (PROVIDERS as Readonly<Record<string, { readonly name: string }>>)[target]
  return provider?.name ?? platformLabel(target)
}

const ACTION_LABEL: Readonly<Record<string, string>> = {
  'session.open': 'فُتحت جلسة',
  'session.pending': 'دخولٌ ينتظر العامل الثاني',
  'csrf.reject': 'طلبٌ بلا رمز نموذج',
  'passkey.denied': 'مفتاح مرورٍ مرفوض',
  'passkey.rejected': 'رُفض تسجيل مفتاح',
  'passkey.add': 'سُجّل مفتاح مرور',
  'passkey.delete': 'حُذف مفتاح مرور',
  '2fa.passkey': 'عاملٌ ثانٍ بمفتاح مرور',
  '2fa.totp': 'عاملٌ ثانٍ برمز تطبيق',
  '2fa.recovery': 'دخولٌ برمز استرداد',
  '2fa.denied': 'عاملٌ ثانٍ مرفوض',
  'totp.start': 'بدأ ضبط رمز التطبيق',
  'totp.confirm': 'أُكّد رمز التطبيق',
  'totp.remove': 'أُزيل رمز التطبيق',
  'recovery.issue': 'وُلّدت رموز استرداد',
  'session.close': 'أُغلقت جلسة',
  'session.revoke': 'أُبطلت جلسة',
  'session.revoke_all': 'أُبطلت كلّ الجلسات',
  'login.denied': 'محاولة دخول مرفوضة',
  'settings.write': 'تغيير إعداد',
  'drive.scan': 'مسح Drive',
  'source.analyze': 'تحليل مصدر',
  'provider.upsert': 'إضافة مزوّد أو تعديله',
  'provider.key': 'تبديل مفتاح',
  'provider.verify': 'اختبار مفتاح',
  'provider.toggle': 'تفعيل أو تعطيل',
  'provider.delete': 'حذف مزوّد',
  'route.write': 'توجيه مهمّة',
}

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
      ? '<span class="st ok"><span class="g">●</span>جلستك</span>'
      : `<form class="inline" method="POST" action="/panel/sessions/revoke"
             data-confirm="إبطال هذه الجلسة؟ سيُطلب من ذلك الجهاز الدخول من جديد.">
           <input type="hidden" name="id" value="${escapeHtml(x.id)}">
           <button class="d sm" type="submit">أبطلها</button></form>`}</td>
  </tr>`).join('')

  const passkeys = d.factors.passkeys.map((k) => `<tr>
    <td><div class="nm">${escapeHtml(k.label)}</div></td>
    <td data-label="سُجّل"><span title="${escapeHtml(k.createdAt)} UTC">${escapeHtml(relativeTime(k.createdAt, d.now))}</span></td>
    <td data-label="آخر استعمال">${k.lastUsedAt === null
      ? '<span class="st idle"><span class="g">○</span>لم يُستعمل</span>'
      : `<span title="${escapeHtml(k.lastUsedAt)} UTC">${escapeHtml(relativeTime(k.lastUsedAt, d.now))}</span>`}</td>
    <td><button class="d sm pk-del" type="button" data-id="${escapeHtml(k.id)}"
          data-label="${escapeHtml(k.label)}">احذف</button></td>
  </tr>`).join('')

  const audit = d.audit.map((a) => `<tr>
    <td><span title="${escapeHtml(a.at)} UTC">${escapeHtml(relativeTime(a.at, d.now))}</span></td>
    <td data-label="الفعل"><div class="nm">${escapeHtml(ACTION_LABEL[a.action] ?? a.action)}</div>
      <div class="mono">${escapeHtml(a.action)}</div></td>
    <td data-label="على ماذا">${a.target === null ? '<span class="mono">—</span>' : `<span class="chip">${escapeHtml(targetLabel(a.target))}</span>`}
      ${a.detail === null ? '' : `<div class="sub">${escapeHtml(a.detail)}</div>`}</td>
    <td data-label="العنوان"><span class="mono">${escapeHtml(a.ip ?? '—')}</span></td>
  </tr>`).join('')
  return { sessions, passkeys, audit }
}
