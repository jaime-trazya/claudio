import {
  ArcElement, BarController, BarElement, CategoryScale, Chart, DoughnutController, Filler, LinearScale,
  LineController, LineElement, PointElement, Tooltip, type ChartConfiguration,
} from 'chart.js'

Chart.register(ArcElement, BarController, BarElement, CategoryScale, DoughnutController, Filler, LinearScale, LineController, LineElement, PointElement, Tooltip)

export { Chart }
export type { ChartConfiguration }

/** Lee los colores del tema actual (claro u oscuro) desde las variables CSS */
export function themeColors() {
  const s = getComputedStyle(document.documentElement)
  const v = (name: string) => s.getPropertyValue(name).trim()
  return {
    accent: v('--accent'),
    text: v('--text'),
    muted: v('--muted'),
    faint: v('--faint'),
    grid: v('--rule'),
    border: v('--border'),
    surface: v('--surface'),
    positive: v('--positive'),
    income: v('--chart-income'),
    negative: v('--negative'),
    chart2: v('--chart-2'),
  }
}

export function applyDefaults() {
  const c = themeColors()
  Chart.defaults.font.family = "'Manrope Variable', Manrope, system-ui, sans-serif"
  Chart.defaults.font.size = 11
  Chart.defaults.color = c.muted
  Chart.defaults.borderColor = c.grid
  // Se modifica la duración sin sustituir el objeto: si se reemplaza se pierde la curva (easing)
  // y Chart.js falla al animar una actualización
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) Chart.defaults.animation = false
  else if (Chart.defaults.animation) Chart.defaults.animation.duration = 350
  Chart.defaults.plugins.tooltip.backgroundColor = c.text
  Chart.defaults.plugins.tooltip.titleColor = c.surface
  Chart.defaults.plugins.tooltip.bodyColor = c.surface
  Chart.defaults.plugins.tooltip.padding = 10
  Chart.defaults.plugins.tooltip.cornerRadius = 10
  Chart.defaults.plugins.tooltip.displayColors = false
}
