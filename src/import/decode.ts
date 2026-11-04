/**
 * Decodifica un archivo de texto probando UTF-8 y, si falla, Latin-1 (Windows-1252),
 * que es la codificación que usan muchos bancos españoles para sus CSV.
 */
export function decodeText(bytes: ArrayBuffer | Uint8Array): string {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  // BOM UTF-16
  if (data[0] === 0xff && data[1] === 0xfe) return new TextDecoder('utf-16le').decode(data)
  if (data[0] === 0xfe && data[1] === 0xff) return new TextDecoder('utf-16be').decode(data)
  try {
    return stripBom(new TextDecoder('utf-8', { fatal: true }).decode(data))
  } catch {
    return new TextDecoder('windows-1252').decode(data)
  }
}

const stripBom = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s)
