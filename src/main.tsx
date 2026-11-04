import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/manrope'
import './styles.css'
import { App } from './App'
import { requestPersistence } from './db/db'

// Pide almacenamiento persistente para que iOS no borre nunca los datos
void requestPersistence()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
