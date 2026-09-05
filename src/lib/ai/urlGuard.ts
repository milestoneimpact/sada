/**
 * حارس عنوان المزوّد.
 *
 * حين يُكتب العنوان من اللوحة، يصير الخادم يرسل **مفتاح المالك ونصّ
 * مستنداته** إلى ما كُتب. وخطأٌ مطبعيّ في المضيف يرسل ذلك إلى حيث لا
 * يريد — **ورقابةُ الحرف أرخص من استرجاع مفتاحٍ سُرّب.**
 *
 * وأخطر من الخطأ المطبعيّ عنوانٌ داخليّ: `169.254.169.254` تسأل خدمةَ
 * البيانات الوصفيّة عن اعتماداتِ البيئة نفسها، و`localhost` تدور على
 * الخادم. فالمنع هنا ليس تضييقا — هو ما يمنع طلبا خارجيّا من أن يصير
 * بابا إلى الداخل.
 */

export type UrlVerdict =
  | { readonly ok: true; readonly url: string; readonly host: string }
  | { readonly ok: false; readonly reason: string }

/** نطاقاتٌ لا يُنادى فيها مزوّدٌ خارجيّ بحال. */
const BLOCKED_HOSTS: readonly RegExp[] = [
  /^localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./, // خدمة البيانات الوصفيّة — أخطرها
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^\[?::1\]?$/,
  /^\[?fc00:/i,
  /^\[?fd/i,
  /^\[?fe80:/i,
]

export function checkProviderUrl(raw: string): UrlVerdict {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return { ok: false, reason: 'العنوان فارغ' }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return { ok: false, reason: 'العنوان غير صالح — يبدأ بـ https://' }
  }

  if (url.protocol !== 'https:') {
    return { ok: false, reason: 'https وحدها — المفتاح لا يُرسل على اتّصالٍ غير مشفَّر' }
  }
  if (url.username !== '' || url.password !== '') {
    return { ok: false, reason: 'لا اعتمادات في العنوان — المفتاح يُرسل في ترويسة' }
  }

  const host = url.hostname
  for (const blocked of BLOCKED_HOSTS) {
    if (blocked.test(host)) {
      return { ok: false, reason: `عنوانٌ داخليّ (${host}) — المزوّد خارجيّ لا داخل الشبكة` }
    }
  }
  // مضيفٌ بلا نقطة ليس اسم نطاقٍ عامّ: `metadata` أو `db` أسماءُ داخلٍ
  if (!host.includes('.')) {
    return { ok: false, reason: `المضيف «${host}» ليس نطاقا عامّا` }
  }

  // تُزال الشرطة الأخيرة فلا يصير المسار `//chat/completions`
  const normalized = `${url.origin}${url.pathname.replace(/\/+$/, '')}`
  return { ok: true, url: normalized, host }
}
