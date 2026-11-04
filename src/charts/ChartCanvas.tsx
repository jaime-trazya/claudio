import { useEffect, useRef, useState } from 'react'
import { applyDefaults, Chart, themeColors, type ChartConfiguration } from './setup'

type Colors = ReturnType<typeof themeColors>

interface Props {
  /** Construye la configuración con los colores del tema actual */
  build: (colors: Colors) => ChartConfiguration
  height?: number
  /** Si no hay datos, se dibuja la gráfica vacía con este texto encima */
  emptyText?: string
  isEmpty?: boolean
  label: string
}

function useThemeVersion() {
  const [v, setV] = useState(0)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => setV((x) => x + 1)
    mq.addEventListener('change', on)
    const obs = new MutationObserver(on)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] })
    return () => {
      mq.removeEventListener('change', on)
      obs.disconnect()
    }
  }, [])
  return v
}

export function ChartCanvas({ build, height = 200, emptyText, isEmpty, label }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const theme = useThemeVersion()

  useEffect(() => {
    if (!ref.current) return
    applyDefaults()
    const config = build(themeColors())
    config.options = { responsive: true, maintainAspectRatio: false, ...config.options }
    if (chartRef.current) {
      // Actualiza sin recrear para que la animación sea suave
      const chart = chartRef.current
      if ((chart.config as ChartConfiguration).type === config.type) {
        chart.data = config.data
        chart.options = config.options ?? {}
        chart.update()
        return
      }
      chart.destroy()
    }
    chartRef.current = new Chart(ref.current, config)
  }, [build, theme])

  useEffect(
    () => () => {
      chartRef.current?.destroy()
      chartRef.current = null
    },
    [],
  )

  return (
    <div className="chart-box" style={{ height }}>
      <canvas ref={ref} role="img" aria-label={label} />
      {isEmpty && emptyText && <div className="chart-empty">{emptyText}</div>}
    </div>
  )
}
