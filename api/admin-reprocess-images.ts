import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { requireCaller } from './_auth.js'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const BUCKET = 'menu-images'

// Mesmos parâmetros do upload novo (ver uploadImage em useMenuAdmin.ts) —
// isto é o reprocessamento em lote do que já estava no Storage antes dessa
// mudança, feito pra conter o estouro de cota de "cached egress" do
// Supabase.
const MAX_DIMENSION = 1600
const JPEG_QUALITY = 82
/** Abaixo disso não vale o esforço: já está pequeno o bastante. */
const SKIP_THRESHOLD_BYTES = 150 * 1024

function pathFromPublicUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  return decodeURIComponent(url.slice(idx + marker.length))
}

/**
 * Reprocessa em lote as imagens do cardápio já enviadas ao Storage antes da
 * compressão no upload existir: redimensiona pro mesmo teto (1600px) e
 * recomprime como JPEG, subindo de volta no MESMO caminho (upsert), então
 * nenhuma foto_url no banco precisa mudar. Só a equipe logada pode disparar
 * isto — é uma operação de manutenção, não uma rota do totem.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' })
    return
  }
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: 'Servidor não configurado (SUPABASE_SERVICE_ROLE_KEY ausente).' })
    return
  }
  const caller = await requireCaller(req)
  if (!caller) {
    res.status(401).json({ error: 'Faça login como equipe para rodar isto.' })
    return
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const [menuItemsRes, optionsRes] = await Promise.all([
    supabase.from('menu_items').select('foto_url').not('foto_url', 'is', null),
    supabase.from('modifier_options').select('foto_url').not('foto_url', 'is', null),
  ])
  if (menuItemsRes.error || optionsRes.error) {
    res.status(500).json({ error: (menuItemsRes.error ?? optionsRes.error)?.message })
    return
  }

  const urls = [...(menuItemsRes.data ?? []), ...(optionsRes.data ?? [])]
    .map((r) => r.foto_url as string)
    .filter(Boolean)
  const paths = [...new Set(urls.map(pathFromPublicUrl).filter((p): p is string => !!p))]

  const results: { path: string; status: 'reduced' | 'skipped_small' | 'skipped_no_gain' | 'error'; beforeKB?: number; afterKB?: number; error?: string }[] = []

  for (const path of paths) {
    try {
      const { data: blob, error: downloadErr } = await supabase.storage.from(BUCKET).download(path)
      if (downloadErr || !blob) {
        results.push({ path, status: 'error', error: downloadErr?.message ?? 'download vazio' })
        continue
      }
      const original = Buffer.from(await blob.arrayBuffer())
      if (original.byteLength < SKIP_THRESHOLD_BYTES) {
        results.push({ path, status: 'skipped_small', beforeKB: Math.round(original.byteLength / 1024) })
        continue
      }

      const processed = await sharp(original)
        .rotate() // respeita a orientação EXIF antes de descartá-la
        .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY })
        .toBuffer()

      if (processed.byteLength >= original.byteLength) {
        results.push({
          path,
          status: 'skipped_no_gain',
          beforeKB: Math.round(original.byteLength / 1024),
          afterKB: Math.round(processed.byteLength / 1024),
        })
        continue
      }

      const { error: uploadErr } = await supabase.storage.from(BUCKET).update(path, processed, {
        contentType: 'image/jpeg',
        cacheControl: '31536000',
        upsert: true,
      })
      if (uploadErr) {
        results.push({ path, status: 'error', error: uploadErr.message })
        continue
      }

      results.push({
        path,
        status: 'reduced',
        beforeKB: Math.round(original.byteLength / 1024),
        afterKB: Math.round(processed.byteLength / 1024),
      })
    } catch (err) {
      results.push({ path, status: 'error', error: err instanceof Error ? err.message : 'falha desconhecida' })
    }
  }

  const reduced = results.filter((r) => r.status === 'reduced')
  const totalBeforeKB = reduced.reduce((sum, r) => sum + (r.beforeKB ?? 0), 0)
  const totalAfterKB = reduced.reduce((sum, r) => sum + (r.afterKB ?? 0), 0)

  res.status(200).json({
    totalImages: paths.length,
    reduced: reduced.length,
    skippedSmall: results.filter((r) => r.status === 'skipped_small').length,
    skippedNoGain: results.filter((r) => r.status === 'skipped_no_gain').length,
    errors: results.filter((r) => r.status === 'error'),
    savedKB: totalBeforeKB - totalAfterKB,
    totalBeforeKB,
    totalAfterKB,
    results,
  })
}
