import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/manrope'
import './styles.css'
import { App } from './App'
import { requestPersistence, syncDefaults } from './db/db'
import { dailyRestorePoint } from './db/history'

// Pide almacenamiento persistente para que iOS no borre nunca los datos
void requestPersistence()
// Trae las categorías y reglas predefinidas nuevas de esta versión (sin tocar las tuyas)
// y guarda la foto diaria para poder "volver a como estaba hace X días"
void syncDefaults().then(() => dailyRestorePoint()).catch(() => undefined)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
