/**
 * تصويرُ الشريحة — Browser Rendering بلهجة REST (D-085).
 *
 * ## العقدُ مقروءٌ من وثيقة Cloudflare لا من الذاكرة
 *
 *     POST /client/v4/accounts/{account}/browser-rendering/screenshot
 *     Authorization: Bearer {token}
 *     { "html": "…", "viewport": { "width": …, "height": … },
 *       "screenshotOptions": { "type": "jpeg", "quality": 88 } }
 *     ← بايتاتُ الصورة في الجسد مباشرةً (لا JSON)
 *
 * **والصلاحيّة `Browser Run · Edit`** — لا `Workers AI`. وهما إذنان
 * مختلفان، ورمزٌ يحمل أحدَهما يُردّ على نهاية الآخر.
 *
 * **واسمُها في قائمة الرمز غيرُ اسمِها في الوثيقة**: اللوحةُ تقول
 * «Browser Run» والوثيقةُ «Browser Rendering» — **والمسارُ باقٍ
 * `‎/browser-rendering/` رغم التبديل**. ومن بحث بالاسم الآخر لم يجده.
 *
 * ## ولماذا REST لا رابطُ Worker
 *
 * رابطُ `browser` يعمل، **ويحتاج `@cloudflare/puppeteer`** — حزمةً
 * ثقيلةً تُضاف إلى الحزمة لأجل لقطةٍ واحدة. و REST تعطي اللقطةَ نفسَها
 * بنداء `fetch` واحد، **ويُختبَر بلا حسابٍ ولا رابط** — وهو ما جعل هذه
 * الوحدة مغطّاةً باختبارات وهي لم تُنادَ مرّةً من هذه البيئة.
 *
 * ## حدٌّ يُقال قبل أن يُكتشَف
 *
 * `api.cloudflare.com` **محجوبٌ عن بيئة البناء** (ردَّ الوسيطُ
 * `connect_rejected`)، فما هنا مبنيٌّ على الوثيقة لا على نداءٍ مقيس.
 * **وأوّلُ توليدٍ في الإنتاج هو الذي يؤكّده.** وشكلُ الجواب يُفحَص ولا
 * يُفترَض: ما لم يُعرَف يُردّ بدل أن يُخمَّن.
 *
 * **والفشلُ هنا لا يُسقِط المنشور**: المنادي يُبقي الصورةَ بلا شريحة.
 */

/** أقصى ما نرسله من HTML — والشريحةُ تحمل الصورةَ `base64` في متنها. */
export const MAX_HTML_BYTES = 6 * 1024 * 1024

export class SlideError extends Error {
  override readonly name = 'SlideError'
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message)
  }
}

export interface SlideShot {
  readonly accountId: string
  readonly apiToken: string
  readonly html: string
  readonly width: number
  readonly height: number
  readonly fetchImpl?: typeof fetch
}

export interface SlideBytes {
  readonly bytes: Uint8Array
  readonly mime: string
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

/**
 * يصوّر صفحةً ويعيد بايتاتها.
 *
 * **والجواب يأتي بأحد شكلين**، فيُقبَل الاثنان ولا يُفترَض أحدُهما:
 * بايتاتٌ خامٌّ (وهو المعتاد لهذه النهاية)، أو غلافُ Cloudflare
 * `{ success, result: { screenshot: base64 } }`.
 */
export async function screenshotSlide(shot: SlideShot): Promise<SlideBytes> {
  if (shot.accountId.trim() === '' || shot.apiToken.trim() === '') {
    throw new SlideError('حسابُ Cloudflare أو رمزُ المتصفّح غيرُ مضبوط', false)
  }
  // القصُّ عندنا لا عندهم: طلبٌ فوق الحدّ يُردّ بخطأٍ لا يقول إنّ السببَ الحجم
  if (shot.html.length > MAX_HTML_BYTES) {
    throw new SlideError('صفحةُ الشريحة أكبر من الحدّ', false)
  }

  const call = shot.fetchImpl ?? fetch
  let response: Response
  try {
    response = await call(
      `https://api.cloudflare.com/client/v4/accounts/${shot.accountId.trim()}/browser-rendering/screenshot`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${shot.apiToken.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          html: shot.html,
          viewport: { width: shot.width, height: shot.height },
          screenshotOptions: { type: 'jpeg', quality: 88 },
          /*
           * **`networkidle0` لا `domcontentloaded`** — والفرقُ نصفُ ثانيةٍ
           * تشتري يقينا.
           *
           * الخطُّ مضمَّنٌ `data:` فلا شبكةَ فيه، **لكنّ فكَّ ترميزه
           * وتخطيطَ النصّ به يقعان بعد `domcontentloaded`**. ولقطةٌ
           * تسبقه لا تعطي خطّا بديلا — `font-display: block` تُخفي
           * النصَّ حتّى يصل الخطُّ الصحيح — **فتخرج شريحةٌ بلا عنوان**.
           *
           * و`networkidle0` تنتظر خمسَ مئةِ جزءٍ بلا طلبِ شبكة. وصفحتُنا
           * بلا طلباتٍ أصلا، **فهي نصفُ ثانيةٍ ثابتةٌ تُغلق البابَ كلَّه**.
           */
          gotoOptions: { waitUntil: 'networkidle0', timeout: 20_000 },
        }),
      },
    )
  } catch (error) {
    throw new SlideError(
      `تعذّر الوصول: ${error instanceof Error ? error.message : 'عطل شبكة'}`,
      true,
    )
  }

  if (!response.ok) {
    // الرمزُ يقرّر الإعادة، لا نصُّ الرسالة
    const retryable = response.status === 429 || response.status >= 500
    /*
     * **والاسمُ يُقال بوجهيه** — بدّلت Cloudflare اسمَ المنتج ولم تبدّل
     * مسارَ نهايته: القائمةُ في اللوحة تقول «Browser Run»، والوثيقةُ
     * تقول «Browser Rendering»، والمسارُ باقٍ `/browser-rendering/`.
     * فمن قرأ اسما وبحث عنه بالآخر لم يجده — وقد وقع.
     */
    const hint =
      response.status === 401 || response.status === 403
        ? ' — والصلاحيّةُ المطلوبة: Browser Run (وتُسمّى Browser Rendering في الوثيقة) · Edit'
        : ''
    throw new SlideError(`تصويرُ الشريحة ردّ ${response.status}${hint}`, retryable)
  }

  const type = response.headers.get('Content-Type') ?? ''
  if (type.includes('json')) {
    let payload: Record<string, unknown>
    try {
      payload = (await response.json()) as Record<string, unknown>
    } catch {
      throw new SlideError('جوابُ التصوير ليس JSON ولا بايتات', false)
    }
    if (payload['success'] === false) throw new SlideError('تصويرُ الشريحة ردّ فشلا', false)
    const result = (payload['result'] ?? {}) as Record<string, unknown>
    const shotB64 = result['screenshot']
    if (typeof shotB64 !== 'string' || shotB64.length === 0) {
      throw new SlideError('جوابٌ بلا لقطة', false)
    }
    let bytes: Uint8Array
    try {
      bytes = decodeBase64(shotB64)
    } catch {
      throw new SlideError('اللقطةُ ليست base64 صالحا', false)
    }
    if (bytes.length === 0) throw new SlideError('لقطةٌ فارغة', true)
    return { bytes, mime: 'image/jpeg' }
  }

  const buffer = await response.arrayBuffer()
  if (buffer.byteLength === 0) throw new SlideError('لقطةٌ فارغة', true)
  return {
    bytes: new Uint8Array(buffer),
    // ما نطلبه jpeg؛ وترويسةٌ تقول غيرَه تُصدَّق — هي أعلمُ بما أرسلت
    mime: type.startsWith('image/') ? type.split(';')[0]!.trim() : 'image/jpeg',
  }
}
