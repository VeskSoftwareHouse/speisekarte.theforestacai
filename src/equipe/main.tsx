import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@shared/styles/base.css'
import './equipe.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Sem service worker aqui de propósito: só o App da Mesa é instalável nos tablets.
// Remove qualquer registro antigo (de versões anteriores deste protótipo) para
// não deixar o Equipe "instalável" em dispositivos que já visitaram a página.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      if (registration.scope.includes('/equipe/')) registration.unregister()
    }
  })
}
