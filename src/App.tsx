import { useEffect, useState } from 'react'
import { ChartPie, House, Landmark, List, Settings as SettingsIcon } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { DataProvider } from './ui/data'
import { useData } from './ui/useData'
import { ToastProvider } from './ui/Toaster'
import { EditorCtx, type EditorApi } from './ui/editor'
import { accentVars, isValidHex } from './ui/theme'
import { navigate, routePath, useRoute } from './ui/router'
import type { Transaction } from './db/types'
import { Home } from './screens/Home'
import { Movements } from './screens/Movements'
import { Analysis } from './screens/Analysis'
import { Wealth, InvestmentDetail } from './screens/Wealth'
import { SettingsScreen } from './screens/Settings'
import { CategoriesScreen } from './screens/Categories'
import { RulesScreen } from './screens/Rules'
import { AccountsScreen, AccountEditor } from './screens/Accounts'
import { TemplatesScreen } from './screens/Templates'
import { HistoryScreen } from './screens/History'
import { ImportStatement } from './screens/ImportStatement'
import { TxEditor } from './screens/TxEditor'
import { InstallHint, InstallGuide } from './screens/Install'
import { AppLock } from './ui/AppLock'

const TABS = [
  { path: '/', label: 'Inicio', icon: House },
  { path: '/movimientos', label: 'Movimientos', icon: List },
  { path: '/analisis', label: 'Análisis', icon: ChartPie },
  { path: '/patrimonio', label: 'Patrimonio', icon: Landmark },
  { path: '/ajustes', label: 'Ajustes', icon: SettingsIcon },
]

function useTheme() {
  const { settings } = useData()
  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'claro') root.dataset.theme = 'light'
    else if (settings.theme === 'oscuro') root.dataset.theme = 'dark'
    else delete root.dataset.theme
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const keys = ['--accent', '--accent-soft', '--accent-ink', '--pill-accent-bg', '--pill-accent-ink']
      if (!isValidHex(settings.accentColor)) {
        keys.forEach((k) => root.style.removeProperty(k))
        return
      }
      const dark = settings.theme === 'oscuro' || (settings.theme === 'sistema' && mq.matches)
      for (const [k, v] of Object.entries(accentVars(settings.accentColor, dark))) root.style.setProperty(k, v)
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [settings.theme, settings.accentColor])
}

function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Comprueba si hay versión nueva cada hora mientras la app está abierta
      if (reg) window.setInterval(() => void reg.update(), 60 * 60 * 1000)
    },
  })
  if (!needRefresh) return null
  return (
    <div className="update-bar">
      <div className="toast" style={{ width: '100%', justifyContent: 'space-between' }}>
        <span>Hay una versión nueva. Tus datos se conservan.</span>
        <span className="row" style={{ gap: 14 }}>
          <button onClick={() => setNeedRefresh(false)}>Luego</button>
          <button onClick={() => void updateServiceWorker(true)}>Actualizar</button>
        </span>
      </div>
    </div>
  )
}

function Shell() {
  const route = useRoute()
  const path = routePath(route)
  const { ready } = useData()
  useTheme()
  const [editing, setEditing] = useState<{ tx?: Transaction; defaults?: Partial<Transaction> } | null>(null)
  const [accountEditing, setAccountEditing] = useState<{ id?: string } | null>(null)
  const [editor] = useState<EditorApi>(() => ({
    openTx: (tx, defaults) => setEditing({ tx, defaults }),
    openAccount: (id) => setAccountEditing({ id }),
  }))

  const fullScreen = path.startsWith('/importar')
  const tab = TABS.slice(1).find((t) => path.startsWith(t.path))?.path ?? (path === '/' ? '/' : '')

  let screen: React.ReactNode
  if (!ready) screen = <div className="screen" aria-busy="true" />
  else if (path === '/') screen = <Home />
  else if (path === '/movimientos') screen = <Movements route={route} />
  else if (path === '/analisis') screen = <Analysis route={route} />
  else if (path === '/patrimonio') screen = <Wealth />
  else if (path.startsWith('/patrimonio/')) screen = <InvestmentDetail id={path.split('/')[2]} />
  else if (path === '/ajustes') screen = <SettingsScreen />
  else if (path === '/ajustes/categorias') screen = <CategoriesScreen />
  else if (path === '/ajustes/reglas') screen = <RulesScreen />
  else if (path === '/ajustes/cuentas') screen = <AccountsScreen />
  else if (path === '/ajustes/plantillas') screen = <TemplatesScreen />
  else if (path === '/ajustes/instalar') screen = <InstallGuide />
  else if (path === '/ajustes/historial') screen = <HistoryScreen />
  else if (path === '/importar') screen = <ImportStatement route={route} />
  else {
    screen = null
    queueMicrotask(() => navigate('/', true))
  }

  return (
    <EditorCtx.Provider value={editor}>
      <div className="app">
        {screen}
        {!fullScreen && (
          <nav className="tabbar" aria-label="Navegación principal">
            <div className="tabbar-inner">
              {TABS.map((t) => {
                const Icon = t.icon
                const active = tab === t.path
                return (
                  <a key={t.path} className="tab" href={`#${t.path}`} aria-current={active ? 'page' : undefined}>
                    <Icon size={23} strokeWidth={active ? 2.1 : 1.8} />
                    {t.label}
                  </a>
                )
              })}
            </div>
          </nav>
        )}
        {editing && <TxEditor tx={editing.tx} defaults={editing.defaults} onClose={() => setEditing(null)} />}
        {accountEditing && <AccountEditor id={accountEditing.id} onClose={() => setAccountEditing(null)} />}
        {ready && <InstallHint />}
        {/* Se monta cuando los ajustes ya están cargados: así arranca bloqueada si toca */}
        {ready && <AppLock />}
        <UpdatePrompt />
      </div>
    </EditorCtx.Provider>
  )
}

export function App() {
  return (
    <DataProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </DataProvider>
  )
}
