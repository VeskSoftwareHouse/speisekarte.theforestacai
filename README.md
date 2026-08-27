# Forest Açaí — Cardápio Digital (Protótipo)

Protótipo funcional de cardápio digital para tablets, com dois apps no mesmo
projeto:

- **App da Mesa** (`/mesa/`) — cliente navega o cardápio e envia pedidos.
  **Instalável como PWA** ("Adicionar à tela inicial").
- **App da Equipe** (`/equipe/`) — cozinha/atendimento recebe pedidos em
  tempo real (quadro Kanban), avança o status, gerencia o cardápio e vê os
  **relatórios** (vendas, produtos, operação e conversão, com exportação em
  CSV e impressão em PDF). Fica como página web comum,
  **não é instalável de propósito** — normalmente roda numa tela/tablet fixo
  da cozinha, então instalabilidade não agrega nada ali.

Sincronização em tempo real via Supabase Realtime (sem polling). Sem
autenticação, pagamento ou modo offline nesta fase.

## Stack

- React + TypeScript + Vite (multi-page: `index.html`, `mesa/index.html`, `equipe/index.html`)
- Supabase (Postgres + Realtime) via `@supabase/supabase-js`
- PWA instalável **apenas no App da Mesa** (manifest + service worker)
- CSS puro, sem framework de UI, com alvos de toque grandes

## 1. Configurar o Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. No **SQL Editor**, rode o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) — cria as tabelas, RLS e habilita Realtime em `orders`/`order_items`. Rode de novo sempre que o schema mudar: o arquivo é idempotente. Para conferir o que já está aplicado sem alterar nada, rode [`supabase/check-schema.sql`](supabase/check-schema.sql).
3. Rode o conteúdo de [`supabase/seed.sql`](supabase/seed.sql) — popula categorias, itens e modifiers de exemplo.
4. Em **Settings → API**, copie a **Project URL** e a **anon/publishable key**.

## 2. Configurar o projeto

```bash
npm install
cp .env.example .env.local
```

Edite `.env.local` com os valores do passo anterior:

```
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-ou-publishable
```

## 3. Rodar

```bash
npm run dev
```

- App da Mesa: `http://localhost:5173/mesa/`
- App da Equipe: `http://localhost:5173/equipe/`
- Landing (escolher qual abrir): `http://localhost:5173/`

Abra os dois em abas/tablets diferentes. Um pedido enviado pelo App da Mesa
deve aparecer automaticamente no App da Equipe, sem recarregar a página.

Para testar em um tablet físico na mesma rede, rode `npm run dev -- --host`
e acesse pelo IP da máquina (ex: `http://192.168.0.10:5173/mesa/`).

## 4. Instalar como PWA (só o App da Mesa)

No tablet do cliente, em Chrome (Android) ou Safari (iOS), abra `/mesa/` e
use "Adicionar à tela inicial" / "Instalar app". O App da Equipe não tem
manifest nem service worker — abre como página normal, sem opção de
instalar (é assim de propósito, ver acima).

Os ícones em `public/mesa/icons` são gerados por script a partir do logo
real (`npm run gen-icons` roda `scripts/generate-icons.ps1`, que recorta o
logo da Forest Açaí sobre um fundo escuro). Troque pela arte final quando
tiver ícones oficiais em alta resolução.

## Estrutura

```
mesa/index.html, equipe/index.html, recibo/index.html
                                     entry points do Vite (multi-page)
src/mesa/                            App da Mesa (cliente) — instalável
src/equipe/                          App da Equipe (staff, realtime) — não instalável
src/recibo/                          comprovante que o QR da confirmação abre no celular do cliente
src/shared/                          cliente Supabase, tipos, hooks e estilos comuns
public/mesa/                         manifest.webmanifest + ícones (só a Mesa é PWA)
public/equipe/                       apenas ícone de favicon, sem manifest
public/brand/                        logo e fotos de produto recortadas do cardápio impresso
public/sw.js                         service worker, registrado só pelo App da Mesa
src/equipe/reportMetrics.ts          contas dos relatórios (funções puras, sem React)
supabase/schema.sql                  tabelas, RLS, realtime
supabase/seed.sql                    cardápio real da Forest Açaí
```

## Modelo de dados

Segue o sugerido no briefing: `categories`, `menu_items`, `modifiers`,
`modifier_options`, `menu_item_modifiers`, `orders`, `order_items`.
`order_items.modifiers_selecionados` grava um snapshot (JSONB) das opções
escolhidas — nome e preço no momento do pedido, independente de o cardápio
mudar depois.

## Fora de escopo (por enquanto)

Autenticação, pagamento, impressão de comanda, multi-tenant e funcionamento
offline — ver briefing original.
