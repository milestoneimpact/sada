/**
 * **عنوانٌ لا يُنادى** (D-318) — مضيفٌ محلّيٌّ أو خاصٌّ أو محجوز، بأيّ كتابةٍ كُتب.
 *
 * ## ما كان
 *
 * حارسان بقائمتين: `urlGuard` بتعابيرَ على النصّ (`^127\.`، `^\[?fc00:`…)، و`parseLink` يردّ كلَّ IPv4 نقطيّةٍ وكلَّ IPv6.
 * والنصُّ يُطبَّع قبل أن يصلهما (`new URL`): `0x7f.1` و`2130706433` و`0177.0.0.1` تصير `127.0.0.1` فتُمسَك — **لكنّ
 * `[::ffff:127.0.0.1]` تصير `[::ffff:7f00:1]`** فلا تطابق تعبيرًا، وكذلك `[::]` و`100.64/10` و`198.18/15` والمتعدّدةُ
 * والمحجوزة. فالحارسُ كان يمسك ما كُتب على صورةٍ واحدة.
 *
 * ## ما صار
 *
 * المضيفُ يُحلَّل عددًا لا نصًّا: IPv4 بكلّ كتابةٍ يقبلها `inet_aton` (عشريّةٌ واحدة، وثُمانيّةٌ ببادئة ‏0، وستّ عشريّةٌ
 * بـ ‏0x، ومختصرةٌ بجزأين أو ثلاثة)، وIPv6 بكلّ اختصار (`::`، وذيلٌ نقطيّ) — ثمّ يُقابَل بالنطاقات (RFC 6890). وIPv6
 * **قائمةُ سماح**: ما خارج ‏2000::/3 يُردّ كلُّه، وما حُجز داخلها يُردّ باسمه. فالكتابةُ لا تغيّر الحكم، قبل التطبيع وبعده.
 *
 * ## وما يبقى (موثَّقٌ في D-318)
 *
 * **Workers لا يحلّ الاسمَ قبل `fetch`**: اسمٌ عامٌّ يشير سجلُّه إلى `127.0.0.1` لا يُرى هنا. والأثرُ أصغر في Workers لأنّ
 * خروجَها لا يبلغ شبكةً خاصّةً لنا (لا خادمَ داخليَّ ولا خدمةَ بياناتٍ وصفيّة)، وCloudflare تردّ الاتّصالَ بعناوينها
 * الداخليّة — لكنّه مسدودٌ بالاسم والعدد وحدهما، لا بالعنوان المحلول.
 */

type Range = readonly [base: number, bits: number, why: string]

/** نطاقاتُ IPv4 التي لا تُنادى (RFC 6890 وما بعده). */
const V4_BLOCKED: readonly Range[] = [
  [0x00000000, 8, 'هذه الشبكة (0/8)'],
  [0x0a000000, 8, 'شبكة خاصّة (10/8)'],
  [0x64400000, 10, 'شبكة المزوّد المشتركة (100.64/10)'],
  [0x7f000000, 8, 'الحلقة المحلّيّة (127/8)'],
  [0xa9fe0000, 16, 'المحلّيّة الرابطة وخدمة البيانات الوصفيّة (169.254/16)'],
  [0xac100000, 12, 'شبكة خاصّة (172.16/12)'],
  [0xc0000000, 24, 'محجوزة للبروتوكول (192.0.0/24)'],
  [0xc0000200, 24, 'للتوثيق (192.0.2/24)'],
  [0xc0586300, 24, 'مرحِّل 6to4 (192.88.99/24)'],
  [0xc0a80000, 16, 'شبكة خاصّة (192.168/16)'],
  [0xc6120000, 15, 'لقياس الأداء (198.18/15)'],
  [0xc6336400, 24, 'للتوثيق (198.51.100/24)'],
  [0xcb007100, 24, 'للتوثيق (203.0.113/24)'],
  [0xe0000000, 4, 'متعدّدة البثّ (224/4)'],
  [0xf0000000, 4, 'محجوزة (240/4)'],
]

function inRange(ip: number, [base, bits]: Range): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return ((ip & mask) >>> 0) === ((base & mask) >>> 0)
}

function v4Reason(ip: number): string | null {
  const hit = V4_BLOCKED.find((r) => inRange(ip, r))
  return hit === undefined ? null : hit[2]
}

/** جزءٌ عدديٌّ كما يقرؤه `inet_aton`: ‏0x ستّ عشريّ، و‏0 ثُمانيّ، وإلّا عشريّ — وما سوى ذلك ليس عددًا. */
function numberPart(part: string): number | null {
  if (/^0x[0-9a-f]*$/.test(part)) return part.length === 2 ? 0 : Number.parseInt(part.slice(2), 16)
  if (/^0[0-7]*$/.test(part)) return part.length === 1 ? 0 : Number.parseInt(part.slice(1), 8)
  if (/^[1-9][0-9]*$/.test(part)) return Number(part)
  return null
}

/** IPv4 بكلّ كتابةٍ يقبلها `inet_aton` — أو `null` إن لم يكن عددًا. */
export function parseIPv4(host: string): number | null {
  const parts = host.split('.')
  if (parts.length > 1 && parts[parts.length - 1] === '') parts.pop()
  if (parts.length === 0 || parts.length > 4) return null
  const nums = parts.map(numberPart)
  if (nums.some((n) => n === null || !Number.isFinite(n))) return null
  const values = nums as number[]
  const last = values[values.length - 1]!
  const lead = values.slice(0, -1)
  if (lead.some((n) => n > 255)) return null
  if (last >= 2 ** (8 * (5 - values.length))) return null
  let ip = 0
  for (const [i, n] of lead.entries()) ip += n * 2 ** (8 * (3 - i))
  return (ip + last) >>> 0
}

/** IPv6 إلى ثمانِ خاناتٍ بستّة عشر بتًّا — والذيلُ النقطيّ (`::ffff:1.2.3.4`) معه. أو `null`. */
export function parseIPv6(raw: string): number[] | null {
  let host = raw
  if (host.includes('%')) return null
  let tail: number[] = []
  const dotted = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(host)
  if (dotted !== null) {
    const v4 = parseIPv4(dotted[2]!)
    if (v4 === null || dotted[2]!.split('.').some((p) => !/^\d{1,3}$/.test(p))) return null
    tail = [v4 >>> 16, v4 & 0xffff]
    host = dotted[1]!.endsWith('::') ? dotted[1]! : dotted[1]!.slice(0, -1)
  }
  const halves = host.split('::')
  if (halves.length > 2) return null
  const group = (s: string): number[] | null => {
    if (s === '') return []
    const out: number[] = []
    for (const g of s.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null
      out.push(Number.parseInt(g, 16))
    }
    return out
  }
  const head = group(halves[0]!)
  const rest = halves.length === 2 ? group(halves[1]!) : []
  if (head === null || rest === null) return null
  const known = head.length + rest.length + tail.length
  if (halves.length === 1 && known !== 8) return null
  if (halves.length === 2 && known > 7) return null
  return [...head, ...Array.from({ length: 8 - known }, () => 0), ...rest, ...tail]
}

function v6Reason(g: readonly number[]): string | null {
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = g
  if (g.every((x) => x === 0)) return 'غير محدَّد (::)'
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return 'الحلقة المحلّيّة (::1)'
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0xffff) return 'مُعيَّنة IPv4 (::ffff:0:0/96)'
  if (a === 0 && b === 0 && c === 0 && d === 0 && e === 0 && f === 0) return 'متوافقة IPv4 (::/96)'
  if (a === 0x64 && b === 0xff9b) return 'ترجمة NAT64 (64:ff9b::/96)'
  if (a === 0x0100 && b === 0 && c === 0 && d === 0) return 'للإسقاط (100::/64)'
  if (a === 0x2001 && b === 0x0db8) return 'للتوثيق (2001:db8::/32)'
  if (a === 0x2001 && b === 0) return 'نفق Teredo (2001::/32)'
  // ‏بروتوكولاتُ IETF (‏ORCHID والقياسُ والمرحِّلات…): لا تُوجَّه في الإنترنت
  if (a === 0x2001 && (b & 0xfe00) === 0) return 'محجوزة لبروتوكولات IETF (2001::/23)'
  if (a === 0x2002) {
    const inner = v4Reason(((b << 16) >>> 0) + c)
    if (inner !== null) return `6to4 إلى ${inner}`
  }
  if (a === 0x3fff && (b & 0xf000) === 0) return 'للتوثيق (3fff::/20)'
  if (a === 0x5f00) return 'معرّفات SRv6 (5f00::/16)'
  if ((a & 0xfe00) === 0xfc00) return 'شبكة خاصّة (fc00::/7)'
  if ((a & 0xffc0) === 0xfe80) return 'المحلّيّة الرابطة (fe80::/10)'
  if ((a & 0xffc0) === 0xfec0) return 'محلّيّة الموقع (fec0::/10)'
  if ((a & 0xff00) === 0xff00) return 'متعدّدة البثّ (ff00::/8)'
  /*
   * ‏**وما خارج 2000::/3 كلُّه** (IANA: «Global Unicast» وحدَها توجَّه في الإنترنت): كانت القائمةُ تعدّ المحجوزَ اسمًا اسمًا،
   * ‏فمرّت المترجَمةُ ‏`::ffff:0:a.b.c.d` (RFC 2765) وكلُّ ‏::/8 و‏400::/6 وما فوق ‏4000::. فالقاعدةُ صارت قائمةَ سماحٍ لا منع.
   */
  if ((a & 0xe000) !== 0x2000) return 'خارج نطاق الإنترنت في IPv6 (2000::/3)'
  return null
}

/**
 * لماذا لا يُنادى هذا المضيف — أو `null` لمضيفٍ عامّ. ويقبل المضيفَ كما يعيده `URL.hostname` (‏IPv6 بين قوسين) أو بلا
 * قوسين، وبأيّ كتابة.
 */
export function nonPublicHost(raw: string): string | null {
  let host = raw.trim().toLowerCase()
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)
  if (host.endsWith('.')) host = host.slice(0, -1)
  if (host === '') return 'مضيفٌ فارغ'
  if (host.includes(':')) {
    const groups = parseIPv6(host)
    return groups === null ? 'عنوان IPv6 لا يُقرأ' : v6Reason(groups)
  }
  const v4 = parseIPv4(host)
  if (v4 !== null) return v4Reason(v4)
  // ‏آخرُ جزءٍ عدديٌّ والباقي ليس عنوانًا: WHATWG يردّه، وهنا لا يُخمَّن
  if (/^(0x[0-9a-f]*|\d+)$/.test(host.split('.').pop() ?? '')) return 'عنوانٌ عدديٌّ لا يُقرأ'
  if (host === 'localhost' || host.endsWith('.localhost')) return 'الخادم نفسه (localhost)'
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa') || host.endsWith('.lan')) {
    return `نطاقٌ داخليّ (${host})`
  }
  if (!host.includes('.')) return `المضيف «${host}» ليس نطاقًا عامًّا`
  return null
}
