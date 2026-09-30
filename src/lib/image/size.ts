/**
 * أبعادُ الصورة من بايتاتها — **تُقرأ من الترويسة ولا تُفكّ الصورة** (D-174).
 *
 * PNG يكتبهما في `IHDR` بعد التوقيع مباشرةً، وJPEG في مقطع SOF (‏0xC0 إلى 0xCF
 * عدا 0xC4 و0xC8 و0xCC). وما لا يُقرأ يعيد `null`: بُعدٌ مخمَّنٌ أسوأُ من غائب.
 */
export function imageSize(bytes: Uint8Array): { readonly width: number; readonly height: number } | null {
  // PNG: ‏89 50 4E 47 ثمّ IHDR — العرضُ عند 16 والارتفاعُ عند 20
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const width = view.getUint32(16, false)
    const height = view.getUint32(20, false)
    return width > 0 && height > 0 ? { width, height } : null
  }
  // JPEG: ‏FF D8 ثمّ مقاطعُ حتّى SOF
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null
      const marker = bytes[i + 1]!
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2
        continue
      }
      const length = (bytes[i + 2]! << 8) | bytes[i + 3]!
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const height = (bytes[i + 5]! << 8) | bytes[i + 6]!
        const width = (bytes[i + 7]! << 8) | bytes[i + 8]!
        return width > 0 && height > 0 ? { width, height } : null
      }
      if (length < 2) return null
      i += 2 + length
    }
  }
  return null
}
