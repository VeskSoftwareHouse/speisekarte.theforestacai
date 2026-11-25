// Arquivo de entrada para hospedagens que só pedem "arquivo de entrada"
// (Hostinger, preset Express): garante que o build existe e sobe o servidor.
// Se dist/ e server-dist/ já foram gerados (npm run build), só inicia.
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const pronto = () =>
  existsSync(path.join(root, 'server-dist', 'index.mjs')) && existsSync(path.join(root, 'dist', 'index.html'))

if (!pronto()) {
  console.log('Build não encontrado — gerando (npm run build)…')
  const opts = { cwd: root, stdio: 'inherit', shell: true }
  // O build precisa das dependências de desenvolvimento (vite, typescript, esbuild).
  spawnSync('npm install --include=dev', opts)
  const r = spawnSync('npm run build', opts)
  if (r.status !== 0 || !pronto()) {
    console.error('Falha no build; veja o log acima.')
    process.exit(1)
  }
}

// Sem `await` no topo: o LiteSpeed da Hostinger carrega este arquivo com
// require(), que recusa módulos ES com top-level await.
import('./server-dist/index.mjs').catch((e) => {
  console.error('Falha ao iniciar o servidor:', e)
  process.exit(1)
})
