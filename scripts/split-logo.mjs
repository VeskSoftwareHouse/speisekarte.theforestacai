/**
 * Fatia a logo do Forest Açaí em camadas animáveis para a sidebar do app da Mesa.
 *
 *   node scripts/split-logo.mjs <entrada.bin> <pasta-de-saida>
 *
 * A entrada e a saída são buffers BGRA crus de 1254x1254; a conversão de/para
 * PNG fica com scripts/png-raw.ps1, que usa System.Drawing. Rodar tudo:
 *
 *   npm run split-logo
 *
 * Gera três PNGs que se empilham exatamente na mesma caixa:
 *
 *   logo-base.png  tucano completo, mas com a asa e a mandíbula inferior
 *                  trocadas por preenchimento escuro — é o que aparece por
 *                  baixo quando as peças se afastam (sombra do corpo e
 *                  interior da boca). O alfa é idêntico ao da logo original,
 *                  então também serve de máscara para o brilho.
 *   logo-wing.png  o grupo de penas roxas claras (as coberteiras), que gira
 *                  em torno do ombro.
 *   logo-beak.png  a mandíbula inferior, que gira em torno do canto da boca.
 *
 * Os pivôs em pixels — ombro (735, 395) e canto da boca (676, 292) — estão
 * repetidos em % no mesa.css. Se os recortes mudarem, os dois têm que andar
 * juntos, senão as peças giram fora da junta.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const W = 1254, H = 1254
const IN = process.argv[2]
const OUT_DIR = process.argv[3]
if (!IN || !OUT_DIR) {
  console.error('uso: node scripts/split-logo.mjs <entrada.bin> <pasta-de-saida>')
  process.exit(1)
}

const src = readFileSync(IN)
if (src.length !== W * H * 4) {
  console.error(`esperava ${W}x${H} BGRA (${W * H * 4} bytes), recebi ${src.length}`)
  process.exit(1)
}
const R = (i) => src[i * 4 + 2], G = (i) => src[i * 4 + 1], B = (i) => src[i * 4], A = (i) => src[i * 4 + 3]

// A paleta da logo é chapada o bastante para classificar cada pixel por cor.
// '?' são os pixels de transição entre duas áreas (antialias e degradês).
function classify(i) {
  const a = A(i); if (a < 40) return '.'
  const r = R(i), g = G(i), b = B(i)
  if (r < 90 && g < 90 && b < 90) return 'K'          // preto do bico e contornos
  if (r > 200 && g > 140 && b < 90) return 'Y'        // amarelo da mandíbula superior
  if (r > 200 && g >= 60 && g <= 140 && b < 80) return 'O' // laranja
  if (r > 200 && g > 190 && b > 190) return 'W'       // branco do rosto
  if (b > 120 && r < 190 && g < 110) return 'P'       // roxo vibrante das penas
  if (b > 60 && r < 120) return 'D'                   // roxo escuro do corpo
  return '?'
}
const cls = new Uint8Array(W * H)
for (let i = 0; i < W * H; i++) cls[i] = classify(i).charCodeAt(0)
const is = (i, ch) => cls[i] === ch.charCodeAt(0)

function flood(seeds, accept, box) {
  const [x0, y0, x1, y1] = box
  const mask = new Uint8Array(W * H)
  const stack = []
  for (const [sx, sy] of seeds) { mask[sy * W + sx] = 1; stack.push(sy * W + sx) }
  while (stack.length) {
    const i = stack.pop(), x = i % W, y = (i / W) | 0
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy
      if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue
      const j = ny * W + nx
      if (mask[j] || !accept(j)) continue
      mask[j] = 1; stack.push(j)
    }
  }
  return mask
}

// Cresce a máscara sobre pixels de transição, senão a peça recortada leva junto
// uma franja da cor de trás na borda.
function grow(mask, rounds, accept) {
  let cur = mask
  for (let r = 0; r < rounds; r++) {
    const next = cur.slice()
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x
      if (cur[i] || !accept(i)) continue
      if (cur[i - 1] || cur[i + 1] || cur[i - W] || cur[i + W]) next[i] = 1
    }
    cur = next
  }
  return cur
}

function morph(mask, r, mode) {
  const offs = []
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy <= r * r) offs.push(dy * W + dx)
  }
  const out = new Uint8Array(W * H)
  for (let y = r; y < H - r; y++) for (let x = r; x < W - r; x++) {
    const i = y * W + x
    if (mode === 'dilate') {
      for (const o of offs) if (mask[i + o]) { out[i] = 1; break }
    } else {
      let all = 1
      for (const o of offs) if (!mask[i + o]) { all = 0; break }
      out[i] = all
    }
  }
  return out
}
const closing = (m, r) => morph(morph(m, r, 'dilate'), r, 'erode')
const opening = (m, r) => morph(morph(m, r, 'erode'), r, 'dilate')

// Tapa buracos internos: o que não é alcançável a partir da borda da caixa.
function fillHoles(mask, box) {
  const [x0, y0, x1, y1] = box
  const outside = new Uint8Array(W * H)
  const stack = []
  const push = (x, y) => { const i = y * W + x; if (!outside[i] && !mask[i]) { outside[i] = 1; stack.push(i) } }
  for (let x = x0; x <= x1; x++) { push(x, y0); push(x, y1) }
  for (let y = y0; y <= y1; y++) { push(x0, y); push(x1, y) }
  while (stack.length) {
    const i = stack.pop(), x = i % W, y = (i / W) | 0
    if (x > x0) push(x - 1, y); if (x < x1) push(x + 1, y)
    if (y > y0) push(x, y - 1); if (y < y1) push(x, y + 1)
  }
  const out = mask.slice()
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x
    if (!mask[i] && !outside[i]) out[i] = 1
  }
  return out
}

// ---------------------------------------------------------------- mandíbula --
// A cor sozinha não acha a linha da boca: a mandíbula superior tem uma faixa de
// sombra do mesmo laranja e, onde as duas quase se encostam, o preenchimento
// vaza para cima e o céu da boca sai serrilhado. Então o preenchimento serve só
// para estimar onde fica a linha; o recorte de verdade é feito por uma curva
// suavizada (mediana contra os vazamentos, depois média móvel).
const BEAK_BOX = [280, 150, 700, 420]
const rawLower = flood([[550, 310], [600, 300], [500, 330]], (i) => is(i, 'O'), BEAK_BOX)

const topOf = new Float64Array(W).fill(NaN)
for (let x = 0; x < W; x++) {
  for (let y = BEAK_BOX[1]; y <= BEAK_BOX[3]; y++) {
    if (rawLower[y * W + x]) { topOf[x] = y; break }
  }
}
const filled = []
for (let x = 0; x < W; x++) if (!Number.isNaN(topOf[x])) filled.push(x)
const xMin = filled[0], xMax = filled[filled.length - 1]

function smoothCurve(values, win, kind) {
  const out = new Float64Array(W).fill(NaN)
  for (let x = xMin; x <= xMax; x++) {
    const vals = []
    for (let d = -win; d <= win; d++) {
      const v = values[x + d]
      if (x + d >= xMin && x + d <= xMax && !Number.isNaN(v)) vals.push(v)
    }
    if (!vals.length) continue
    if (kind === 'median') { vals.sort((a, b) => a - b); out[x] = vals[vals.length >> 1] }
    else out[x] = vals.reduce((a, b) => a + b, 0) / vals.length
  }
  return out
}
const mouthLine = smoothCurve(smoothCurve(topOf, 30, 'median'), 22, 'mean')

let lower = new Uint8Array(W * H)
for (let x = xMin; x <= xMax; x++) {
  const c = mouthLine[x]
  if (Number.isNaN(c)) continue
  for (let y = Math.round(c); y <= BEAK_BOX[3]; y++) {
    const i = y * W + x
    if (A(i) < 40) break // chegou na borda externa do bico
    lower[i] = 1
  }
}
lower = fillHoles(lower, BEAK_BOX)

// ---------------------------------------------------------------------- asa --
// Só o grupo de penas claras. As escuras ficam paradas na base, e isso é o que
// dá o efeito certo: as coberteiras levantando sobre as primárias.
const WING_BOX = [225, 330, 790, 700]
let wing = flood([[600, 440], [500, 500], [400, 580], [660, 400], [300, 640]], (i) => is(i, 'P'), WING_BOX)
wing = closing(wing, 4)
wing = opening(wing, 3)
wing = fillHoles(wing, WING_BOX)
wing = grow(wing, 2, (i) => is(i, '?') || is(i, 'P'))

// ------------------------------------------------------------------ camadas --
// Cor média do roxo escuro do corpo: é com ela que o vão da asa é tapado, para
// que qualquer fresta pareça sombra do próprio pássaro.
let sr = 0, sg = 0, sb = 0, n = 0
for (let y = 430; y < 620; y++) for (let x = 780; x < 860; x++) {
  const i = y * W + x
  if (A(i) > 200 && B(i) > 60 && R(i) < 120) { sb += B(i); sg += G(i); sr += R(i); n++ }
}
const BODY = n ? [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)] : [43, 2, 86]
const MOUTH = [38, 8, 28] // interior da boca: quase preto, levemente quente

const blank = () => Buffer.alloc(W * H * 4)
const put = (out, i, r, g, b, a) => {
  out[i * 4] = b; out[i * 4 + 1] = g; out[i * 4 + 2] = r; out[i * 4 + 3] = a
}

// O alfa original é sempre preservado: preenchimento escuro só onde a arte já
// era opaca, senão a silhueta do pássaro engordaria com uma franja.
const base = blank()
for (let i = 0; i < W * H; i++) {
  const a = A(i)
  if (lower[i]) put(base, i, MOUTH[0], MOUTH[1], MOUTH[2], a)
  else if (wing[i]) put(base, i, BODY[0], BODY[1], BODY[2], a)
  else put(base, i, R(i), G(i), B(i), a)
}
const extract = (mask) => {
  const out = blank()
  for (let i = 0; i < W * H; i++) if (mask[i]) put(out, i, R(i), G(i), B(i), A(i))
  return out
}

writeFileSync(join(OUT_DIR, 'logo-base.bin'), base)
writeFileSync(join(OUT_DIR, 'logo-wing.bin'), extract(wing))
writeFileSync(join(OUT_DIR, 'logo-beak.bin'), extract(lower))

const count = (m) => m.reduce((a, v) => a + v, 0)
console.log(`roxo do corpo ${BODY}  |  asa ${count(wing)}px  |  mandibula ${count(lower)}px`)
