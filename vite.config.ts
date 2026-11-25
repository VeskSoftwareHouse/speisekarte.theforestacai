import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Multi-page app: duas PWAs instaláveis e duas páginas simples, tudo no
// mesmo código-fonte.
//   /            -> landing page (escolhe o app)
//   /mesa/       -> App da Mesa (cliente, faz e paga o pedido)
//   /equipe/     -> App da Equipe (staff)
//   /recibo/     -> comprovante que o QR do totem abre no celular do cliente
//   /cardapio/   -> cardápio só para consulta, sem carrinho nem pagamento
//   /balanca/    -> estação self-service: lê a balança e cobra pelo peso
export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: false,
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    // Painéis Android de sinalização (totem) vêm com WebView antigo (~Chrome 83).
    // Com este alvo o esbuild reescreve CSS novo na forma antiga — ex.: `inset`
    // vira top/right/bottom/left —, senão as camadas de tela cheia quebravam lá.
    cssTarget: ['chrome80', 'safari14'],
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        mesa: resolve(__dirname, 'mesa/index.html'),
        equipe: resolve(__dirname, 'equipe/index.html'),
        recibo: resolve(__dirname, 'recibo/index.html'),
        cardapio: resolve(__dirname, 'cardapio/index.html'),
        balanca: resolve(__dirname, 'balanca/index.html'),
      },
    },
  },
})
