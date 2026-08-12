import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Multi-page app: two separately installable PWAs sharing one codebase.
//   /            -> landing page (choose Mesa or Equipe)
//   /mesa/       -> App da Mesa (cliente)
//   /equipe/     -> App da Equipe (staff)
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
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        mesa: resolve(__dirname, 'mesa/index.html'),
        equipe: resolve(__dirname, 'equipe/index.html'),
      },
    },
  },
})
