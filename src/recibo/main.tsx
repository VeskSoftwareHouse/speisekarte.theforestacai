import ReactDOM from 'react-dom/client'
import Receipt from './Receipt'
import '@shared/styles/base.css'
import './recibo.css'

// Sem StrictMode aqui de propósito: em desenvolvimento ele monta duas vezes, e
// esta página faz uma consulta ao abrir. Numa tela de comprovante, que é só
// leitura e some em segundos, o barulho não paga o benefício.
ReactDOM.createRoot(document.getElementById('root')!).render(<Receipt />)
