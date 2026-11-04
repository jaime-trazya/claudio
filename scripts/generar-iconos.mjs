/**
 * Genera el icono de la app, los iconos PWA y las pantallas de inicio (splash) de iOS.
 * Usa el Chromium de Playwright para convertir SVG/HTML a PNG.
 * Uso: npm run iconos
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

// Playwright no es dependencia del proyecto: se usa el instalado en el sistema (npx playwright o global)
const { chromium } = createRequire(import.meta.url)('playwright')

const ROOT = path.resolve(import.meta.dirname, '..')
const PUB = path.join(ROOT, 'public')

// Marca: una moneda abierta (una "C" gruesa) con el hueco hacia la derecha, sobre cobalto.
const mark = (size, { pad = 0, bg = '#1d5fd6', fg = '#ffffff', dot = '#dcf1ff', radius = 0.225 } = {}) => {
  const s = 512
  const inner = s - pad * 2
  const r = (inner * 0.29).toFixed(1)
  const sw = (inner * 0.13).toFixed(1)
  const cx = s / 2
  const cy = s / 2
  const a0 = (40 * Math.PI) / 180
  const a1 = (320 * Math.PI) / 180
  const x0 = cx + r * Math.cos(a0)
  const y0 = cy - r * Math.sin(a0)
  const x1 = cx + r * Math.cos(a1)
  const y1 = cy - r * Math.sin(a1)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" rx="${radius ? s * radius : 0}" fill="${bg}"/>
  <path d="M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 1 0 ${x1.toFixed(1)} ${y1.toFixed(1)}" fill="none" stroke="${fg}" stroke-width="${sw}" stroke-linecap="round"/>
  <circle cx="${(cx + r * 0.98).toFixed(1)}" cy="${cy}" r="${(inner * 0.052).toFixed(1)}" fill="${dot}"/>
</svg>`
}

fs.writeFileSync(path.join(PUB, 'favicon.svg'), mark(64))

const SPLASH = [
  // [ancho px, alto px, ancho CSS, alto CSS, densidad]
  [1320, 2868, 440, 956, 3],
  [1206, 2622, 402, 874, 3],
  [1290, 2796, 430, 932, 3],
  [1179, 2556, 393, 852, 3],
  [1284, 2778, 428, 926, 3],
  [1170, 2532, 390, 844, 3],
  [1125, 2436, 375, 812, 3],
  [1242, 2688, 414, 896, 3],
  [828, 1792, 414, 896, 2],
  [1242, 2208, 414, 736, 3],
  [750, 1334, 375, 667, 2],
]

const browser = await chromium.launch()
const page = await browser.newPage()

async function png(html, w, h, out) {
  await page.setViewportSize({ width: w, height: h })
  await page.setContent(`<!doctype html><html><body style="margin:0">${html}</body></html>`)
  await page.screenshot({ path: out, omitBackground: false })
}

const icon = (size, opts) => `<div style="width:${size}px;height:${size}px">${mark(size, opts)}</div>`
await png(icon(180, { radius: 0 }), 180, 180, path.join(PUB, 'icons/apple-touch-icon.png'))
await png(icon(192), 192, 192, path.join(PUB, 'icons/icon-192.png'))
await png(icon(512), 512, 512, path.join(PUB, 'icons/icon-512.png'))
await png(icon(512, { pad: 90, radius: 0 }), 512, 512, path.join(PUB, 'icons/icon-maskable-512.png'))

const links = []
for (const scheme of ['light', 'dark']) {
  const bg = scheme === 'light' ? '#f3f5f7' : '#0c0c0d'
  const ink = scheme === 'light' ? '#5c6064' : '#a3a6ab'
  for (const [w, h, cw, ch, dpr] of SPLASH) {
    const name = `splash-${w}x${h}-${scheme}.png`
    const iconSize = Math.round(w * 0.24)
    const html = `<div style="width:${w}px;height:${h}px;background:${bg};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(w * 0.04)}px;font-family:system-ui,-apple-system,sans-serif">
      ${mark(iconSize)}
      <div style="font-size:${Math.round(w * 0.042)}px;color:${ink};font-weight:600;letter-spacing:-0.01em">Claudio</div>
    </div>`
    await png(html, w, h, path.join(PUB, 'splash', name))
    links.push(
      `    <link rel="apple-touch-startup-image" media="screen and (device-width: ${cw}px) and (device-height: ${ch}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait) and (prefers-color-scheme: ${scheme})" href="splash/${name}" />`,
    )
  }
}
await browser.close()

const indexPath = path.join(ROOT, 'index.html')
const index = fs.readFileSync(indexPath, 'utf8')
const block = `<!--SPLASH-->\n${links.join('\n')}\n    <!--/SPLASH-->`
const next = index.includes('<!--/SPLASH-->')
  ? index.replace(/<!--SPLASH-->[\s\S]*<!--\/SPLASH-->/, block)
  : index.replace('<!--SPLASH-->', block)
fs.writeFileSync(indexPath, next)
console.log(`Iconos y ${links.length} pantallas de inicio generados`)
