import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@shared/styles/base.css'
import './mesa.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/mesa/' }).catch(() => {
      /* instalabilidade é best-effort neste protótipo */
    })
  })
}
