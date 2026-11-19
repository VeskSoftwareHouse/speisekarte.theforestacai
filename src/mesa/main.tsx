import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { LanguageProvider } from './i18n/LanguageContext'
import '@shared/styles/base.css'
import './mesa.css'
import { applyTotemMode, showDiagnostics } from './totem'

// Antes do primeiro render, para o layout já nascer na largura certa.
applyTotemMode()
showDiagnostics()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/mesa/' }).catch(() => {
      /* instalabilidade é best-effort neste protótipo */
    })
  })
}
