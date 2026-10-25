/**
 * نصوصُ المقطع تُكتب للمالك — **من جملةٍ يصف بها مقطعَه، لكلّ منصّةٍ نصُّها** (D-190).
 *
 * سأل المالك: «يُفترض أن تكون الكتابةُ أسهل، وتنشأ تلقائيًّا من نصٍّ أو كلماتٍ بسيطة
 * وشرحِ المقطع، ويكون النصُّ موائمًا مع المنصّة». وكان صفُّ المقطع مربّعًا واحدًا لنصٍّ
 * واحدٍ يُنشر على الثلاث: عنوانُ YouTube سطرُه الأوّل، ووصفُ TikTok هو نفسُه وصفُ Reel.
 *
 * فجملةٌ واحدةٌ من المالك ← **نداءٌ واحد** يعيد أربعةَ نصوص: عنوانُ YouTube ووصفُه،
 * ونصُّ TikTok، ونصُّ Instagram. **ولا يُنشأ منشورٌ هنا**: النصوصُ تُحفظ يومًا في KV
 * وتُعرَض في حقولٍ يحرّرها، ثمّ «أنشئ المنشورات» كما كان — والاعتمادُ قرارُه.
 *
 * ## والحرّاسُ حرّاسُ الكتابة نفسُها
 *
 * `writeOnce` (D-190): الإيقافُ وسقفُ الإنفاق (`draft`)، والمزوّدُ من توجيه المالك وسقفُه،
 * **والكلفةُ في الدفتر قبل أن يُقرأ الجواب** (D-008). ولا نداءَ بلا ضغطةٍ منه (D-006):
 * لا شيءَ هنا يُنادى من دورةٍ ولا من رفع. **وضغطةٌ ثانيةٌ بالوصف نفسِه لا تُنادي**: النصوصُ
 * المحفوظةُ تُعاد كما هي، فلا يُدفع ثمنُ الجملة نفسِها مرّتين. **إلّا «أعد كتابتها»**: تحمل
 * `at` النصوصِ التي على الشاشة (`replace`)، فتُكتب من جديد مرّةً — وإعادةُ إرسالها بعدئذٍ
 * تحمل `at` قديمًا فتعود «مكتوبةً» بلا نداء.
 *
 * ## ولا سرَّ في KV
 *
 * ما يُحفظ نصوصٌ يراها المالكُ في صفحته، واسمُ النموذج وكلفتُه — لا مفتاحَ ولا رمز (D-005).
 */
import { writeOnce, type WriterDeps } from '../draft/writer'
import { YT_TITLE_MAX } from '../publish/youtube'
import { captionProblem, titleProblem, youtubeShape, youtubeText, type VideoPlatform, type YouTubeShape } from './uploads'

/** ما يحتاجه الحفظ من KV — والحقيقيُّ يوافقه، والاختبارُ يقلّده. */
export interface CaptionStore {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
}

export interface VideoCaptions {
  /** الجملةُ التي كُتبت منها — تُعاد في حقلها، وبها يُعرَف أنّ الضغطةَ الثانيةَ هي الأولى. */
  readonly about: string
  readonly youtubeTitle: string
  readonly youtubeDescription: string
  readonly tiktok: string
  readonly instagram: string
  readonly model: string
  readonly cost: number
  readonly at: string
}

/** يومٌ واحد: يكفي ليراجع المالكُ ما كُتب ويُنشئ منه، ولا يبقى ما نسيه أسبوعًا. */
export const CAPTIONS_TTL = 86_400

/** أقصرُ وصفٍ وأطولُه بالمحرف بعد طيّ الفراغ. */
export const ABOUT_MIN = 4
export const ABOUT_MAX = 500

export function captionsKey(uploadId: string): string {
  return `captions:${uploadId}`
}

function normalizeAbout(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/gu, ' ').trim()
}

/** ما حُفظ — أو `null` إن انتهى يومُه أو فسد: صفٌّ لا يُقرأ يُعامَل كأن لم يُكتب. */
export async function readCaptions(kv: CaptionStore, uploadId: string): Promise<VideoCaptions | null> {
  let raw: string | null
  try {
    raw = await kv.get(captionsKey(uploadId))
  } catch {
    return null
  }
  if (raw === null) return null
  try {
    const v = JSON.parse(raw) as Partial<VideoCaptions>
    const text = (x: unknown): x is string => typeof x === 'string'
    if (!text(v.about) || !text(v.youtubeTitle) || !text(v.youtubeDescription) || !text(v.tiktok) ||
        !text(v.instagram) || !text(v.model) || typeof v.cost !== 'number' || !text(v.at)) return null
    return v as VideoCaptions
  } catch {
    return null
  }
}

export async function saveCaptions(kv: CaptionStore, uploadId: string, c: VideoCaptions): Promise<void> {
  await kv.put(captionsKey(uploadId), JSON.stringify(c), { expirationTtl: CAPTIONS_TTL })
}

/**
 * ما يمنع كلَّ نصٍّ على منصّته — **بفحوص الإنشاء نفسِها** (`captionProblem` و`titleProblem`).
 *
 * يُقال تحت حقله قبل أن يضغط المالكُ «أنشئ»، لا بعده: نصٌّ دُفع ثمنُه لا يُرمى لأنّه
 * تجاوز حدًّا بمحرف، يُعرَض ومعه ما يقصّره. و`title` لعنوان YouTube وحدَه.
 */
export function captionIssues(c: Pick<VideoCaptions, 'youtubeTitle' | 'youtubeDescription' | 'tiktok' | 'instagram'>):
  Partial<Record<VideoPlatform | 'title', string>> {
  const out: Partial<Record<VideoPlatform | 'title', string>> = {}
  const title = titleProblem(c.youtubeTitle)
  if (title !== null) out.title = title
  const yt = captionProblem('youtube', youtubeText(c.youtubeTitle, c.youtubeDescription))
  if (yt !== null) out.youtube = yt
  for (const p of ['tiktok', 'instagram'] as const) {
    const why = captionProblem(p, c[p])
    if (why !== null) out[p] = why
  }
  return out
}

/**
 * الوصفُ الحاكم — **ثابتٌ لكلّ شكل**، فيُخزَّن عند المزوّد ولا يُحاسَب على إعادة إرساله.
 *
 * وما يتغيّر بالمقطع سطرٌ واحد: أيُختَم وصفُ YouTube بـ «#Shorts». YouTube يقرّر الـ Short
 * بشكل المقطع ومدّته، والوسمُ لا يصنعه — **لكنّه على فيديو عاديٍّ وعدٌ لا يُوفى**.
 */
export function captionSystem(shape: YouTubeShape): string {
  // ‏والمجهولُ لا يُوعَد ولا يُنفى: #Shorts لا يُكتب (D-190)، ولا يُقال إنّه «لن يكون Short»
  const shorts = shape === 'short' || shape === 'square'
    ? 'واختم الوصف بالوسم #Shorts: المقطع قصير ورأسيّ فيصير Short.'
    : shape === 'unknown'
      ? 'ولا تكتب #Shorts: شكل المقطع أو مدّتُه لم تُقرأ، فلا يُوعَد بـ Short قد لا يكون.'
      : 'ولا تكتب #Shorts: المقطع لن يكون Short.'
  return [
    'أنت تكتب نصوص مقطع فيديو باسم مالك الحساب، لا باسمك. فما تكتبه يخرج قولا له.',
    '',
    '## قيود لا تُخالَف',
    '',
    '**أنت لم تر المقطع.** وصف المالك له هو كلّ ما تعرفه عنه: فلا تصف مشهدًا ولا',
    'شخصًا ولا كلامًا لم يذكره.',
    '**لا رقم ولا اسم علم ولا تاريخ ولا اقتباس إلّا ما ورد في وصفه.** ورقم تخترعه',
    'يصير رقما قاله المالك — وهذا أسوأ ما يمكن أن يقع.',
    '**لا رابط ولا دعوة إلى منتَج ولا وعد بنتيجة.**',
    '**العربيّة فصيحة معاصرة**: لا عامّيّة، ولا تكلّف في الجزالة، ولا ترجمة حرفيّة.',
    'والمصطلح التقنيّ يبقى بحروفه اللاتينيّة إن كان ذلك أوضح.',
    '**ولا «<» ولا «>» في أيّ نصّ**: YouTube يردّ المقطع بهما بعد رفعه.',
    '',
    '## لكلّ منصّة نصُّها — ولا يُنسَخ نصّ من منصّة إلى أخرى',
    '',
    '### YouTube',
    `\`youtube_title\`: عنوان المقطع. يقف وحدَه ويقول موضوعه، **دون ${YT_TITLE_MAX} محرف** والأفضل`,
    'دون ستّين، بلا وسم ولا علامات تعجّب متكرّرة.',
    '`youtube_description`: سطران إلى أربعة تقول ما يستفيده المشاهد ولا تكرّر العنوان، ثمّ',
    'سطر فارغ، ثمّ وسمان أو ثلاثة في آخره.',
    shorts,
    '',
    '### TikTok',
    '`tiktok`: سطر أو سطران يُغريان بالمشاهدة ولا يشرحانها — ما بعد السطرين يُطوى ولا يُقرأ.',
    'ثمّ ثلاثة وسوم إلى خمسة ذات صلة بالموضوع في آخر النصّ، لا وسوم عامّة تُلصق بكلّ مقطع.',
    '',
    '### Instagram (Reel)',
    '`instagram`: جملة أولى تستوقف من يمرّ، ثمّ سطران أو ثلاثة تقول الفكرة، ثمّ سطر فارغ،',
    'ثمّ ثلاثة وسوم إلى خمسة في آخر النصّ وحدَه، لا داخل الجمل.',
    '',
    '## المخرَج',
    '',
    'أعد JSON بأربعة حقول لا غير: `youtube_title` و`youtube_description` و`tiktok` و`instagram`',
    '— كلّ نصُّه كما يُنشر، بلا عنوان ولا تعليق منك.',
  ].join('\n')
}

/** ما يُعطاه النموذج عن المقطع — وصفُ المالك، وما قرأه متصفّحُه من شكله، واسمُ الملفّ بتحفّظ. */
export function captionUser(input: {
  readonly name: string
  readonly about: string
  readonly shape: YouTubeShape
  readonly durationMs: number | null
}): string {
  const length = input.durationMs === null
    ? 'مدّتُه لم تُقرأ'
    : `مدّتُه ${Math.floor(Math.round(input.durationMs / 1000) / 60)}:${String(Math.round(input.durationMs / 1000) % 60).padStart(2, '0')}`
  const form = input.shape === 'wide' ? 'أفقيّ' : input.shape === 'unknown' ? 'شكلُه لم يُقرأ' : input.shape === 'square' ? 'مربّع' : 'رأسيّ'
  return [
    '# المقطع',
    `اسم الملفّ: ${input.name} (قد لا يعني شيئًا)`,
    `${form}، ${length}`,
    '',
    '## وصف المالك',
    input.about,
    '',
    'اكتب النصوص الأربعة من هذا الوصف وحده.',
  ].join('\n')
}

/** مخطَّطُ الجواب — والحدودُ في القارئ لا في المخطّط (D-164). */
export const CAPTIONS_SCHEMA = {
  type: 'object',
  properties: {
    youtube_title: { type: 'string', maxLength: YT_TITLE_MAX },
    youtube_description: { type: 'string' },
    tiktok: { type: 'string' },
    instagram: { type: 'string' },
  },
  required: ['youtube_title', 'youtube_description', 'tiktok', 'instagram'],
  additionalProperties: false,
} as const

/**
 * يقرأ الجواب — **بعد أن سُجّلت كلفتُه**. «<» و«>» تُنزَعان لا تُرَدّان: YouTube يردّ
 * المقطعَ بهما، ونزعُهما لا يغيّر المعنى، ونصٌّ دُفع ثمنُه لا يُرمى لحرفين. والعنوانُ
 * سطرٌ واحد. **وما سوى ذلك لا يُصحَّح**: طولٌ فوق الحدّ يُقال تحت حقله (`captionIssues`).
 */
export function parseCaptions(raw: unknown):
  | { ok: true; texts: Pick<VideoCaptions, 'youtubeTitle' | 'youtubeDescription' | 'tiktok' | 'instagram'> }
  | { ok: false; reason: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'الجواب ليس كائنا' }
  const v = raw as Record<string, unknown>
  const text = (k: string): string => (typeof v[k] === 'string' ? (v[k] as string) : '')
  const strip = (t: string): string => t.replace(/[<>]/g, '').replace(/\r\n?/g, '\n').trim()
  const texts = {
    youtubeTitle: strip(text('youtube_title')).replace(/\s*\n\s*/g, ' '),
    youtubeDescription: strip(text('youtube_description')),
    tiktok: strip(text('tiktok')),
    instagram: strip(text('instagram')),
  }
  if (Object.values(texts).every((t) => t === '')) return { ok: false, reason: 'النصوص فارغة' }
  return { ok: true, texts }
}

export type CaptionsOutcome =
  | { readonly kind: 'written'; readonly captions: VideoCaptions }
  /** الوصفُ نفسُه كُتب منه من قبل — النصوصُ المحفوظةُ كما هي، بلا نداءٍ ولا كلفة. */
  | { readonly kind: 'already'; readonly captions: VideoCaptions }
  | { readonly kind: 'blocked'; readonly reason: string }
  /** و`cost` ما دُفع في هذه الضغطة حين وقع النداءُ ثمّ رُدّ جوابُه — يُقال في الإشعار. */
  | { readonly kind: 'failed'; readonly reason: string; readonly retryable: boolean; readonly cost?: number }

/**
 * نداءٌ واحدٌ ← أربعةُ نصوصٍ محفوظةٍ يومًا لهذا المقطع.
 *
 * و`replace` لـ«أعد كتابتها» وحدَها: `at` النصوصِ التي على الشاشة. **يطابق المحفوظَ فيُكتب
 * من جديد** ولو بالوصف نفسِه — طلبٌ صريحٌ بنصوصٍ أخرى، بحرّاس `writeOnce` كلِّها. وضغطتان
 * منه تحملان `at` واحدًا: الأولى تكتب وتُبدّله، والثانيةُ لا تطابق فتعود «مكتوبةً» بلا كلفة.
 */
export async function captionsFor(
  deps: WriterDeps & { readonly kv: CaptionStore; readonly now?: Date; /** منظّمةُ الجلسة — المقطعُ يُقرأ فيها وحدَها (D-271). */ readonly org: string },
  uploadId: string,
  rawAbout: string,
  replace = '',
): Promise<CaptionsOutcome> {
  const about = normalizeAbout(rawAbout)
  if (about.length < ABOUT_MIN) return { kind: 'failed', reason: 'صف المقطع بجملة أوّلًا: ما فيه، وعمّ يتحدّث', retryable: false }
  if (about.length > ABOUT_MAX) return { kind: 'failed', reason: `الوصف أطول من ${ABOUT_MAX} محرف — جملة أو جملتان تكفيان`, retryable: false }

  const row = await deps.db
    .prepare('SELECT name, width, height, duration_ms, status FROM uploads WHERE id = ? AND org_id = ?')
    .bind(uploadId, deps.org)
    .first<{ name: string; width: number | null; height: number | null; duration_ms: number | null; status: string }>()
  if (row === null || row.status !== 'ready') return { kind: 'failed', reason: 'المقطع لم يكتمل رفعُه', retryable: false }

  // ‏الضغطةُ الثانيةُ بالوصف نفسِه هي الأولى — لا نداءَ ولا كلفة. إلّا «أعد كتابتها» لهذه النصوص بعينها
  const cached = await readCaptions(deps.kv, uploadId)
  if (cached !== null && cached.about === about && (replace === '' || replace !== cached.at)) {
    return { kind: 'already', captions: cached }
  }

  const shape = youtubeShape({ width: row.width, height: row.height, durationMs: row.duration_ms })
  const out = await writeOnce(deps, {
    system: captionSystem(shape),
    user: captionUser({ name: row.name, about, shape, durationMs: row.duration_ms }),
    schema: CAPTIONS_SCHEMA,
    operation: 'captions',
    refId: uploadId,
  })
  if (out.kind !== 'written') return out

  // ‏القراءةُ بعد التسجيل: جوابٌ مشوَّه لا يُلغي كلفةً وقعت — ويُقال ما دُفع فيه
  let parsed: unknown
  try {
    parsed = JSON.parse(out.text)
  } catch {
    return { kind: 'failed', reason: 'جواب النموذج ليس JSON صالحا', retryable: true, cost: out.cost }
  }
  const read = parseCaptions(parsed)
  if (!read.ok) return { kind: 'failed', reason: read.reason, retryable: true, cost: out.cost }

  const captions: VideoCaptions = {
    about, ...read.texts, model: out.model, cost: out.cost, at: (deps.now ?? new Date()).toISOString(),
  }
  /*
   * ‏**وحفظٌ سقط بعد الدفع يُقال ولا يُرمى خطأً** — كما تفعل `insertDraft`: كان استثناءُ KV
   * ‏يصعد إلى ‏500 خامّ بلا أثرٍ في السجلّ ولا إشعار، والكلفةُ في الدفتر. والنصوصُ لا تُعاد
   * ‏`written`: الصفحةُ تقرؤها من KV، فما لم يُحفظ لا يُرى.
   */
  try {
    await saveCaptions(deps.kv, uploadId, captions)
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error)
    return {
      kind: 'failed',
      reason: `كُتبت النصوص وسُجّلت كلفتُها في الدفتر، وتعذّر حفظُها: ${why}`.slice(0, 300),
      retryable: true,
      cost: out.cost,
    }
  }
  return { kind: 'written', captions }
}
