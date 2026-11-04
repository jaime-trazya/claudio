/** Colores de la app a partir del color principal elegido en Ajustes */

export const ACCENT_PRESETS: { name: string; color: string }[] = [
  { name: 'Cobalto', color: '#1d5fd6' },
  { name: 'Azul CaixaBank', color: '#007eae' },
  { name: 'Verde', color: '#2f8a4c' },
  { name: 'Turquesa', color: '#0f8a8a' },
  { name: 'Naranja', color: '#d4621a' },
  { name: 'Rojo', color: '#c8323c' },
  { name: 'Rosa', color: '#c43d7a' },
  { name: 'Grafito', color: '#3f4650' },
]

const hex = (c: string) => {
  const m = c.trim().replace('#', '')
  const full = m.length === 3 ? m.split('').map((x) => x + x).join('') : m
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const toHex = (rgb: number[]) => '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')

/** Mezcla dos colores: ratio = peso del primero (0-1) */
export function mix(a: string, b: string, ratio: number): string {
  const x = hex(a)
  const y = hex(b)
  return toHex(x.map((v, i) => v * ratio + y[i] * (1 - ratio)))
}

export function isValidHex(c: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.trim())
}

/** Variables CSS para el color elegido, en claro u oscuro */
export function accentVars(color: string, dark: boolean): Record<string, string> {
  if (dark) {
    const accent = mix(color, '#ffffff', 0.72)
    const soft = mix(color, '#18181a', 0.26)
    const ink = mix(color, '#ffffff', 0.35)
    return { '--accent': accent, '--accent-soft': soft, '--accent-ink': ink, '--pill-accent-bg': soft, '--pill-accent-ink': ink }
  }
  const soft = mix(color, '#ffffff', 0.15)
  const ink = mix(color, '#000000', 0.55)
  return { '--accent': color, '--accent-soft': soft, '--accent-ink': ink, '--pill-accent-bg': soft, '--pill-accent-ink': ink }
}
