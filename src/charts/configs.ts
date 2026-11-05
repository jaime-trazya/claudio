import type { ChartConfiguration } from './setup'
import type { themeColors } from './setup'
import { formatMoney } from '../lib/money'
import { monthShort } from '../lib/dates'

type Colors = ReturnType<typeof themeColors>

const euroTick = (currency: string) => (v: string | number) => formatMoney(Number(v) * 100, { currency, compact: true })
const monthTick = (key: string) => monthShort(Number(key.slice(5, 7)) - 1)

/** Escala "redonda" por encima del máximo para que la serie no toque el borde */
export function niceMax(values: number[]): number {
  const max = Math.max(0, ...values)
  if (max <= 0) return 100
  const pow = Math.pow(10, Math.floor(Math.log10(max)))
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * pow >= max * 1.05) return m * pow
  return 10 * pow
}

/** Atenúa los meses no elegidos para resaltar el seleccionado */
const dim = (color: string, i: number, selected: number | null | undefined) => (selected === null || selected === undefined || selected === i ? color : color + '55')

export function incomeExpenseBars(
  months: { key: string; income: number; expenses: number }[],
  currency: string,
  selected?: number | null,
): (c: Colors) => ChartConfiguration {
  return (c) => {
    const inc = months.map((m) => m.income / 100)
    const exp = months.map((m) => m.expenses / 100)
    return {
      type: 'bar',
      data: {
        labels: months.map((m) => monthTick(m.key)),
        datasets: [
          { label: 'Ingresos', data: inc, backgroundColor: months.map((_, i) => dim(c.income, i, selected)), borderRadius: 0, barPercentage: 0.85, categoryPercentage: 0.75 },
          { label: 'Gastos', data: exp, backgroundColor: months.map((_, i) => dim(c.accent, i, selected)), borderRadius: 0, barPercentage: 0.85, categoryPercentage: 0.75 },
        ],
      },
      options: {
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkip: months.length > 8, maxTicksLimit: months.length > 8 ? 6 : 12 } },
          y: { beginAtZero: true, max: niceMax([...inc, ...exp]), grid: { color: c.grid }, border: { display: false }, ticks: { maxTicksLimit: 4, callback: euroTick(currency) } },
        },
        plugins: {
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatMoney(Math.round(Number(ctx.raw) * 100), { currency })}` } },
        },
      },
    }
  }
}

export function lineSeries(
  points: { label: string; value: number }[],
  currency: string,
  opts: { second?: { label: string; values: number[] }; mainLabel?: string } = {},
): (c: Colors) => ChartConfiguration {
  return (c) => {
    const values = points.map((p) => p.value / 100)
    const second = opts.second?.values.map((v) => v / 100) ?? []
    const all = [...values, ...second]
    const min = Math.min(0, ...all)
    return {
      type: 'line',
      data: {
        labels: points.map((p) => p.label),
        datasets: [
          {
            label: opts.mainLabel ?? 'Saldo',
            data: values,
            borderColor: c.accent,
            backgroundColor: c.accent + '22',
            fill: true,
            borderWidth: 2,
            tension: 0,
            pointRadius: points.length === 1 ? 3 : 0,
            pointHoverRadius: 4,
          },
          ...(opts.second
            ? [{ label: opts.second.label, data: second, borderColor: c.faint, backgroundColor: c.faint, borderDash: [5, 4], borderWidth: 1.5, pointRadius: points.length === 1 ? 3 : 0, fill: false, tension: 0 }]
            : []),
        ],
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 5 } },
          y: { min: min < 0 ? -niceMax([-min]) : 0, max: niceMax(all), grid: { color: c.grid }, border: { display: false }, ticks: { maxTicksLimit: 5, callback: euroTick(currency) } },
        },
        plugins: {
          tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatMoney(Math.round(Number(ctx.raw) * 100), { currency })}` } },
        },
      },
    }
  }
}

export function savingsRateLine(points: { key: string; rate: number | null }[], selected?: number | null): (c: Colors) => ChartConfiguration {
  return (c) => ({
    type: 'bar',
    data: {
      labels: points.map((p) => monthTick(p.key)),
      datasets: [
        {
          label: 'Tasa de ahorro',
          // Se corta en ±100 %: un −800 % aplasta el resto de meses y no dice nada útil
          data: points.map((p) => (p.rate === null ? null : Math.max(-100, Math.min(100, Math.round(p.rate * 100))))),
          backgroundColor: points.map((p, i) => dim(p.rate !== null && p.rate < 0 ? c.negative : c.accent, i, selected)),
          borderRadius: 0,
          barPercentage: 0.6,
        },
      ],
    },
    options: {
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkip: points.length > 8, maxTicksLimit: points.length > 8 ? 6 : 12 } },
        y: { min: points.some((p) => p.rate !== null && p.rate < 0) ? -100 : 0, suggestedMax: 50, max: 100, grid: { color: c.grid }, border: { display: false }, ticks: { maxTicksLimit: 5, callback: (v) => `${v} %` } },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const r = points[ctx.dataIndex]?.rate
              if (r === null || r === undefined) return 'Sin ingresos'
              return r < -1 ? `Gastaste ${(1 - r).toFixed(1).replace('.', ',')} veces lo que entró` : `Ahorro: ${Math.round(r * 100)} %`
            },
          },
        },
      },
    },
  })
}

export function donut(slices: { label: string; value: number; color: string }[], currency: string, onPick?: (i: number) => void): (c: Colors) => ChartConfiguration {
  return (c) => {
    const empty = slices.length === 0
    return {
      type: 'doughnut',
      data: {
        labels: empty ? ['Sin gastos'] : slices.map((s) => s.label),
        datasets: [
          {
            data: empty ? [1] : slices.map((s) => s.value / 100),
            backgroundColor: empty ? [c.grid] : slices.map((s) => s.color),
            borderColor: c.surface,
            borderWidth: empty ? 0 : 2,
            hoverOffset: empty ? 0 : 6,
          },
        ],
      },
      options: {
        cutout: '78%',
        layout: { padding: 6 },
        onClick: (_e, els) => {
          if (!empty && els[0] && onPick) onPick(els[0].index)
        },
        plugins: {
          tooltip: {
            enabled: !empty,
            callbacks: { label: (ctx) => `${ctx.label}: ${formatMoney(Math.round(Number(ctx.raw) * 100), { currency })}` },
          },
        },
      },
    }
  }
}

export function singleBars(points: { key: string; amount: number }[], currency: string, color?: string): (c: Colors) => ChartConfiguration {
  return (c) => {
    const data = points.map((p) => p.amount / 100)
    return {
      type: 'bar',
      data: { labels: points.map((p) => monthTick(p.key)), datasets: [{ label: 'Gasto', data, backgroundColor: color ?? c.accent, borderRadius: 0, barPercentage: 0.7 }] },
      options: {
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkip: points.length > 8, maxTicksLimit: 6 } },
          y: { beginAtZero: true, max: niceMax(data), grid: { color: c.grid }, border: { display: false }, ticks: { maxTicksLimit: 4, callback: euroTick(currency) } },
        },
        plugins: { tooltip: { callbacks: { label: (ctx) => formatMoney(Math.round(Number(ctx.raw) * 100), { currency }) } } },
      },
    }
  }
}

/** Gasto acumulado del mes día a día frente al mes anterior (línea discontinua) */
export function cumulativeMonth(current: number[], previous: number[], totalDays: number, currency: string, prevLabel: string): (c: Colors) => ChartConfiguration {
  return (c) => {
    const labels = Array.from({ length: Math.max(totalDays, previous.length) }, (_, i) => String(i + 1))
    const cur = current.map((v) => v / 100)
    const prev = previous.map((v) => v / 100)
    return {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Este mes', data: cur, borderColor: c.accent, backgroundColor: c.accent + '22', fill: true, borderWidth: 2, tension: 0.25, pointRadius: 0, pointHoverRadius: 4 },
          { label: prevLabel, data: prev, borderColor: c.faint, backgroundColor: c.faint, borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.25 },
        ],
      },
      options: {
        animation: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
          y: { min: 0, max: niceMax([...cur, ...prev]), grid: { color: c.grid }, border: { display: false }, ticks: { maxTicksLimit: 4, callback: euroTick(currency) } },
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { title: (items) => `Día ${items[0]?.label ?? ''}`, label: (ctx) => `${ctx.dataset.label}: ${formatMoney(Math.round(Number(ctx.raw) * 100), { currency })}` } },
        },
      },
    }
  }
}
