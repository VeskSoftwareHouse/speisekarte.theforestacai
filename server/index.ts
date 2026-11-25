/**
 * Servidor Node único: serve as telas (dist/) e as rotas /api/* no mesmo
 * domínio. Substitui a Vercel — os handlers em api/ continuam com o formato
 * (req, res) de lá; aqui só reproduzimos a parte de req/res que eles usam.
 *
 * Build:  npm run build   (gera dist/ e server-dist/index.mjs)
 * Start:  npm start       (lê PORT do ambiente; Hostinger define sozinha)
 */
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import adminUsers from '../api/admin-users'
import assistantChat from '../api/assistant-chat'
import balancaPedido from '../api/balanca-pedido'
import cancelOrder from '../api/cancel-order'
import createCashOrder from '../api/create-cash-order'
import createTwintOrder from '../api/create-twint-order'
import orderStatus from '../api/order-status'
import receipt from '../api/receipt'
import sumupConfirmPayment from '../api/sumup-confirm-payment'
import sumupCreateCheckout from '../api/sumup-create-checkout'
import translate from '../api/translate'
import tucoVoz from '../api/tuco-voz'

type Handler = (req: any, res: any) => unknown | Promise<unknown>

const routes: Record<string, Handler> = {
  'admin-users': adminUsers,
  'assistant-chat': assistantChat,
  'balanca-pedido': balancaPedido,
  'cancel-order': cancelOrder,
  'create-cash-order': createCashOrder,
  'create-twint-order': createTwintOrder,
  'order-status': orderStatus,
  receipt,
  'sumup-confirm-payment': sumupConfirmPayment,
  'sumup-create-checkout': sumupCreateCheckout,
  translate,
  'tuco-voz': tucoVoz,
}

// server-dist/index.mjs -> raiz do projeto é a pasta acima.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(root, 'dist')
const MAX_BODY = 15 * 1024 * 1024 // o assistente manda imagens em base64

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new Error('body-too-large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

/** Dá ao res do Node o status().json()/send() que os handlers esperam. */
function decorate(res: ServerResponse): any {
  const r = res as any
  r.status = (code: number) => {
    res.statusCode = code
    return r
  }
  r.json = (body: unknown) => {
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(body))
    return r
  }
  r.send = (body: unknown) => {
    if (body !== null && typeof body === 'object' && !Buffer.isBuffer(body)) return r.json(body)
    res.end(body as string | Buffer)
    return r
  }
  return r
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  const name = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '')
  const handler = Object.prototype.hasOwnProperty.call(routes, name) ? routes[name] : undefined
  if (!handler) return sendJson(res, 404, { error: 'Rota não encontrada.' })

  const r = req as any
  r.query = Object.fromEntries(url.searchParams)
  r.body = undefined
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      const raw = await readBody(req)
      const type = String(req.headers['content-type'] ?? '')
      if (raw.length === 0) r.body = undefined
      else if (type.includes('application/json')) r.body = JSON.parse(raw.toString('utf8'))
      else r.body = raw.toString('utf8')
    } catch (e) {
      const tooLarge = e instanceof Error && e.message === 'body-too-large'
      return sendJson(res, tooLarge ? 413 : 400, { error: tooLarge ? 'Corpo grande demais.' : 'JSON inválido.' })
    }
  }

  try {
    await handler(r, decorate(res))
  } catch (e) {
    console.error(`[api/${name}]`, e)
    if (!res.headersSent) sendJson(res, 500, { error: 'Erro interno.' })
    else res.end()
  }
}

async function serveStatic(req: IncomingMessage, res: ServerResponse, url: URL) {
  let rel: string
  try {
    rel = decodeURIComponent(url.pathname)
  } catch {
    res.statusCode = 400
    return res.end()
  }
  let file = path.join(distDir, rel)
  if (file !== distDir && !file.startsWith(distDir + path.sep)) {
    res.statusCode = 403
    return res.end()
  }

  let info = await stat(file).catch(() => null)
  if (info?.isDirectory()) {
    // /mesa -> /mesa/ (links relativos da página dependem da barra final)
    if (!rel.endsWith('/')) {
      res.statusCode = 301
      res.setHeader('Location', url.pathname + '/' + url.search)
      return res.end()
    }
    file = path.join(file, 'index.html')
    info = await stat(file).catch(() => null)
  }
  if (!info?.isFile()) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    return res.end('Não encontrado')
  }

  const ext = path.extname(file).toLowerCase()
  res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream')
  res.setHeader('Accept-Ranges', 'bytes')
  // O service worker e os HTMLs precisam revalidar sempre, senão uma versão
  // nova do app não chega nos aparelhos. Os assets têm hash no nome.
  const cache = file.includes(`${path.sep}assets${path.sep}`)
    ? 'public, max-age=31536000, immutable'
    : ext === '.html' || path.basename(file) === 'sw.js'
      ? 'no-cache'
      : 'public, max-age=3600'
  res.setHeader('Cache-Control', cache)

  // Range: Safari e WebViews Android só tocam vídeo/áudio com isso.
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''))
  let start = 0
  let end = info.size - 1
  if (range && (range[1] || range[2])) {
    if (range[1]) {
      start = Number(range[1])
      if (range[2]) end = Math.min(Number(range[2]), end)
    } else {
      start = Math.max(info.size - Number(range[2]), 0)
    }
    if (start > end || start >= info.size) {
      res.statusCode = 416
      res.setHeader('Content-Range', `bytes */${info.size}`)
      return res.end()
    }
    res.statusCode = 206
    res.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`)
  }
  res.setHeader('Content-Length', end - start + 1)
  if (req.method === 'HEAD') return res.end()
  createReadStream(file, { start, end }).pipe(res)
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url)
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405
      return res.end()
    }
    // A página inicial É o App da Mesa (mesma página de /mesa/, sem redirecionar,
    // para a URL ficar limpa). O seletor de apps continua em /apps.
    if (url.pathname === '/') url.pathname = '/mesa/index.html'
    if (url.pathname === '/apps' || url.pathname === '/apps/') url.pathname = '/index.html'
    await serveStatic(req, res, url)
  } catch (e) {
    console.error(e)
    if (!res.headersSent) res.statusCode = 500
    res.end()
  }
})

const port = Number(process.env.PORT) || 3000
server.listen(port, () => console.log(`Servidor no ar na porta ${port}`))
