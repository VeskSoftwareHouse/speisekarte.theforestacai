-- =====================================================================
-- Cardápio Digital — schema do protótipo
-- Rode este arquivo inteiro no SQL Editor do Supabase (ou via supabase CLI:
-- supabase db execute -f supabase/schema.sql). É seguro rodar de novo a
-- qualquer momento (idempotente) — útil quando o schema evolui.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------
create table if not exists categories (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  ordem      int  not null default 0
);

-- traduções manuais do nome por idioma (mesmo formato de menu_items.nome_i18n).
alter table categories add column if not exists nome_i18n jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------
-- menu_items
-- ---------------------------------------------------------------------
create table if not exists menu_items (
  id               uuid primary key default gen_random_uuid(),
  categoria_id     uuid not null references categories(id) on delete cascade,
  nome             text not null,
  descricao        text,
  preco            numeric(10,2) not null check (preco >= 0),
  foto_url         text,
  disponivel       boolean not null default true,
  ordem            int not null default 0,
  -- limite combinado de seleções nos grupos de modifier marcados como
  -- `conta_para_limite` (ex: "escolha até 4 frutas/toppings"). null = sem limite.
  max_ingredientes int
);

alter table menu_items add column if not exists max_ingredientes int;
-- traduções manuais da descrição e do nome por idioma, ex: {"fr": "...", "it": "...", "en": "...", "pt": "...", "es": "..."}.
-- alemão continua vindo das colunas `descricao`/`nome` acima; idiomas ausentes aqui caem no alemão.
alter table menu_items add column if not exists descricao_i18n jsonb not null default '{}'::jsonb;
alter table menu_items add column if not exists nome_i18n jsonb not null default '{}'::jsonb;

create index if not exists idx_menu_items_categoria on menu_items(categoria_id);

-- ---------------------------------------------------------------------
-- modifiers (grupos de personalização, ex: "Frutas", "Toppings")
-- ---------------------------------------------------------------------
create table if not exists modifiers (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null,
  tipo               text not null check (tipo in ('obrigatorio', 'opcional')),
  selecao            text not null check (selecao in ('unica', 'multipla')),
  -- se true, as opções escolhidas neste grupo contam para o
  -- `menu_items.max_ingredientes` do item (ex: frutas e toppings comuns
  -- contam; toppings premium pagos não contam).
  conta_para_limite  boolean not null default false
);

alter table modifiers add column if not exists conta_para_limite boolean not null default false;
-- traduções manuais do nome por idioma (mesmo formato de menu_items.nome_i18n).
alter table modifiers add column if not exists nome_i18n jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------
-- modifier_options (opções dentro de um grupo, ex: "Morango", "+Nutella")
-- ---------------------------------------------------------------------
create table if not exists modifier_options (
  id               uuid primary key default gen_random_uuid(),
  modifier_id      uuid not null references modifiers(id) on delete cascade,
  nome             text not null,
  preco_adicional  numeric(10,2) not null default 0,
  ordem            int not null default 0
);

-- traduções manuais do nome por idioma (mesmo formato de menu_items.nome_i18n).
alter table modifier_options add column if not exists nome_i18n jsonb not null default '{}'::jsonb;

create index if not exists idx_modifier_options_modifier on modifier_options(modifier_id);

-- ---------------------------------------------------------------------
-- menu_item_modifiers (quais grupos de modifier se aplicam a qual item)
-- ---------------------------------------------------------------------
create table if not exists menu_item_modifiers (
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  modifier_id  uuid not null references modifiers(id) on delete cascade,
  primary key (menu_item_id, modifier_id)
);

-- ---------------------------------------------------------------------
-- tables (mesas/balcão do estabelecimento)
-- ---------------------------------------------------------------------
create table if not exists tables (
  id       uuid primary key default gen_random_uuid(),
  numero   text not null unique
);

-- ---------------------------------------------------------------------
-- orders (pedidos)
-- ---------------------------------------------------------------------
create table if not exists orders (
  id            uuid primary key default gen_random_uuid(),
  table_id      uuid not null references tables(id),
  status        text not null default 'aguardando_pagamento'
                  check (status in
                    ('aguardando_pagamento', 'recebido', 'em_preparo', 'pronto', 'entregue', 'cancelado')),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- pedido só chega na cozinha depois que o pagamento SumUp é confirmado.
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check check (status in
  ('aguardando_pagamento', 'recebido', 'em_preparo', 'pronto', 'entregue', 'cancelado'));
alter table orders alter column status set default 'aguardando_pagamento';
alter table orders add column if not exists sumup_checkout_id text;
alter table orders add column if not exists valor_pago numeric(10,2);
alter table orders add column if not exists nome_cliente text;
alter table orders add column if not exists gorjeta numeric(10,2) not null default 0;

create index if not exists idx_orders_status on orders(status);
create index if not exists idx_orders_criado_em on orders(criado_em);
create index if not exists idx_orders_sumup_checkout on orders(sumup_checkout_id);

create or replace function set_atualizado_em()
returns trigger as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_orders_atualizado_em on orders;
create trigger trg_orders_atualizado_em
  before update on orders
  for each row execute function set_atualizado_em();

-- ---------------------------------------------------------------------
-- order_items (itens do pedido, com snapshot de nome/preço/modifiers)
-- ---------------------------------------------------------------------
create table if not exists order_items (
  id                     uuid primary key default gen_random_uuid(),
  order_id               uuid not null references orders(id) on delete cascade,
  menu_item_id           uuid references menu_items(id),
  nome_item              text not null,
  quantidade             int not null check (quantidade > 0),
  observacoes            text,
  modifiers_selecionados jsonb not null default '[]'::jsonb,
  preco_unitario         numeric(10,2) not null
);

create index if not exists idx_order_items_order on order_items(order_id);

-- =====================================================================
-- Row Level Security — protótipo sem autenticação: acesso público via
-- chave anon, restrito por operação (leitura livre; escrita apenas onde
-- cada app precisa). Policies são recriadas a cada execução (drop + create)
-- para que este arquivo possa ser rodado mais de uma vez com segurança.
-- =====================================================================

alter table categories          enable row level security;
alter table menu_items          enable row level security;
alter table modifiers           enable row level security;
alter table modifier_options    enable row level security;
alter table menu_item_modifiers enable row level security;
alter table tables              enable row level security;
alter table orders              enable row level security;
alter table order_items         enable row level security;

drop policy if exists "public read categories"          on categories;
drop policy if exists "public insert categories"        on categories;
drop policy if exists "public update categories"        on categories;
drop policy if exists "public delete categories"        on categories;
drop policy if exists "authenticated insert categories" on categories;
drop policy if exists "authenticated update categories" on categories;
drop policy if exists "authenticated delete categories" on categories;
drop policy if exists "public read menu_items"          on menu_items;
drop policy if exists "public insert menu_items"        on menu_items;
drop policy if exists "public update menu_items"        on menu_items;
drop policy if exists "public delete menu_items"        on menu_items;
drop policy if exists "authenticated insert menu_items" on menu_items;
drop policy if exists "authenticated update menu_items" on menu_items;
drop policy if exists "authenticated delete menu_items" on menu_items;
drop policy if exists "public read modifiers"                on modifiers;
drop policy if exists "authenticated insert modifiers"        on modifiers;
drop policy if exists "authenticated update modifiers"        on modifiers;
drop policy if exists "authenticated delete modifiers"        on modifiers;
drop policy if exists "public read modifier_options"          on modifier_options;
drop policy if exists "authenticated insert modifier_options" on modifier_options;
drop policy if exists "authenticated update modifier_options" on modifier_options;
drop policy if exists "authenticated delete modifier_options" on modifier_options;
drop policy if exists "public read menu_item_modifiers"          on menu_item_modifiers;
drop policy if exists "authenticated insert menu_item_modifiers" on menu_item_modifiers;
drop policy if exists "authenticated delete menu_item_modifiers" on menu_item_modifiers;
drop policy if exists "public read tables"              on tables;
drop policy if exists "public read orders"              on orders;
drop policy if exists "public insert orders"             on orders;
drop policy if exists "public update orders"             on orders;
drop policy if exists "public read order_items"          on order_items;
drop policy if exists "public insert order_items"        on order_items;

-- leitura pública do cardápio e das mesas
create policy "public read categories"          on categories          for select using (true);
create policy "public read menu_items"          on menu_items          for select using (true);
create policy "public read modifiers"           on modifiers           for select using (true);
create policy "public read modifier_options"    on modifier_options    for select using (true);
create policy "public read menu_item_modifiers" on menu_item_modifiers for select using (true);
create policy "public read tables"              on tables              for select using (true);

-- gestão do cardápio pelo Painel da Equipe: só usuários autenticados
-- (login da equipe, ver src/equipe/hooks/useAuth.ts) podem escrever.
create policy "authenticated insert categories" on categories for insert with check (auth.uid() is not null);
create policy "authenticated update categories" on categories for update using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated delete categories" on categories for delete using (auth.uid() is not null);

create policy "authenticated insert menu_items" on menu_items for insert with check (auth.uid() is not null);
create policy "authenticated update menu_items" on menu_items for update using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated delete menu_items" on menu_items for delete using (auth.uid() is not null);

-- gestão dos adicionais (grupos de modifier, opções e associação com produtos)
create policy "authenticated insert modifiers" on modifiers for insert with check (auth.uid() is not null);
create policy "authenticated update modifiers" on modifiers for update using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated delete modifiers" on modifiers for delete using (auth.uid() is not null);

create policy "authenticated insert modifier_options" on modifier_options for insert with check (auth.uid() is not null);
create policy "authenticated update modifier_options" on modifier_options for update using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated delete modifier_options" on modifier_options for delete using (auth.uid() is not null);

create policy "authenticated insert menu_item_modifiers" on menu_item_modifiers for insert with check (auth.uid() is not null);
create policy "authenticated delete menu_item_modifiers" on menu_item_modifiers for delete using (auth.uid() is not null);

-- pedidos: leitura pública (painel da equipe), criação pública (app da mesa),
-- atualização pública (equipe avança status)
create policy "public read orders"   on orders for select using (true);
create policy "public insert orders" on orders for insert with check (true);
create policy "public update orders" on orders for update using (true) with check (true);

create policy "public read order_items"   on order_items for select using (true);
create policy "public insert order_items" on order_items for insert with check (true);

-- =====================================================================
-- Realtime — habilita a publicação para o App da Equipe escutar inserts/
-- updates sem polling.
-- =====================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table orders;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_items'
  ) then
    alter publication supabase_realtime add table order_items;
  end if;
end $$;

-- =====================================================================
-- Storage — bucket público para fotos de produto enviadas pelo Painel
-- da Equipe (gestão de cardápio).
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do nothing;

drop policy if exists "public read menu-images"          on storage.objects;
drop policy if exists "public upload menu-images"        on storage.objects;
drop policy if exists "public update menu-images"        on storage.objects;
drop policy if exists "public delete menu-images"        on storage.objects;
drop policy if exists "authenticated upload menu-images" on storage.objects;
drop policy if exists "authenticated update menu-images" on storage.objects;
drop policy if exists "authenticated delete menu-images" on storage.objects;

-- leitura pública (o cardápio do App da Mesa precisa exibir as fotos),
-- escrita só para usuários autenticados (equipe logada)
create policy "public read menu-images"          on storage.objects for select using (bucket_id = 'menu-images');
create policy "authenticated upload menu-images" on storage.objects for insert with check (bucket_id = 'menu-images' and auth.uid() is not null);
create policy "authenticated update menu-images" on storage.objects for update using (bucket_id = 'menu-images' and auth.uid() is not null) with check (bucket_id = 'menu-images' and auth.uid() is not null);
create policy "authenticated delete menu-images" on storage.objects for delete using (bucket_id = 'menu-images' and auth.uid() is not null);

-- =====================================================================
-- Backfill: traduções de descrição dos 15 itens originais do cardápio
-- impresso (migradas do antigo src/mesa/i18n/menuTranslations.ts para a
-- coluna menu_items.descricao_i18n). Só preenche linhas ainda vazias,
-- então não sobrescreve edições feitas depois pelo Painel da Equipe.
-- =====================================================================

update menu_items set descricao_i18n = '{
  "fr": "Composez votre açaí — choisissez jusqu''à 4 ingrédients (fruits et garnitures).",
  "it": "Componi il tuo açaí — scegli fino a 4 ingredienti (frutta e topping).",
  "en": "Build your own açaí — choose up to 4 ingredients (fruits & toppings).",
  "pt": "Monte seu açaí — escolha até 4 ingredientes (frutas e coberturas).",
  "es": "Arma tu açaí — elige hasta 4 ingredientes (frutas y toppings)."
}'::jsonb where id = '00000000-0000-0000-0000-0000000000e1' and descricao_i18n = '{}'::jsonb;

update menu_items set descricao_i18n = '{
  "fr": "Composez votre açaí — choisissez jusqu''à 5 ingrédients (fruits et garnitures).",
  "it": "Componi il tuo açaí — scegli fino a 5 ingredienti (frutta e topping).",
  "en": "Build your own açaí — choose up to 5 ingredients (fruits & toppings).",
  "pt": "Monte seu açaí — escolha até 5 ingredientes (frutas e coberturas).",
  "es": "Arma tu açaí — elige hasta 5 ingredientes (frutas y toppings)."
}'::jsonb where id = '00000000-0000-0000-0000-0000000000e2' and descricao_i18n = '{}'::jsonb;

update menu_items set descricao_i18n = '{
  "fr": "1 açaí 500 ml + 1 jus 300 ml.",
  "it": "1 açaí 500 ml + 1 succo 300 ml.",
  "en": "1 açaí 500 ml + 1 juice 300 ml.",
  "pt": "1 açaí 500 ml + 1 suco 300 ml.",
  "es": "1 açaí 500 ml + 1 zumo 300 ml."
}'::jsonb where id = '00000000-0000-0000-0000-0000000000e3' and descricao_i18n = '{}'::jsonb;

update menu_items set descricao_i18n = '{
  "fr": "Deux açaís 500 ml — parfait à partager à deux.",
  "it": "Due açaí da 500 ml — perfetti da condividere in due.",
  "en": "Two açaí bowls 500 ml — perfect to share as a couple.",
  "pt": "2 açaís 500 ml — perfeito para compartilhar a dois.",
  "es": "Dos açaís 500 ml — perfecto para compartir en pareja."
}'::jsonb where id = '00000000-0000-0000-0000-0000000000e4' and descricao_i18n = '{}'::jsonb;

update menu_items set descricao_i18n = '{
  "fr": "2 açaís 500 ml + 2 jus 500 ml — pour toute la famille.",
  "it": "2 açaí da 500 ml + 2 succhi da 500 ml — per tutta la famiglia.",
  "en": "2 açaí bowls 500 ml + 2 juices 500 ml — for the whole family.",
  "pt": "2 açaís 500 ml + 2 sucos 500 ml — para toda a família.",
  "es": "2 açaís 500 ml + 2 zumos 500 ml — para toda la familia."
}'::jsonb where id = '00000000-0000-0000-0000-0000000000e5' and descricao_i18n = '{}'::jsonb;

update menu_items set descricao_i18n = '{
  "fr": "Jus d''ananas fraîchement pressé.",
  "it": "Succo di ananas appena spremuto.",
  "en": "Freshly squeezed pineapple juice.",
  "pt": "Suco de abacaxi espremido na hora.",
  "es": "Zumo de piña recién exprimido."
}'::jsonb where id = '00000000-0000-0000-0000-0000000000e6' and descricao_i18n = '{}'::jsonb;

update menu_items set descricao_i18n = '{
  "fr": "Jus de mangue crémeux, 100% fruit.",
  "it": "Succo di mango cremoso, 100% frutta.",
  "en": "Creamy mango juice, 100% fruit.",
  "pt": "Suco cremoso de manga, 100% fruta.",
  "es": "Zumo cremoso de mango, 100% fruta."
}'::jsonb where id = '00000000-0000-0000-0000-0000000000e7' and descricao_i18n = '{}'::jsonb;

update menu_items set descricao_i18n = '{
  "fr": "Jus de goyave rafraîchissant.",
  "it": "Succo di guava rinfrescante.",
  "en": "Refreshing guava juice.",
  "pt": "Suco refrescante de goiaba.",
  "es": "Zumo refrescante de guayaba."
}'::jsonb where id = '00000000-0000-0000-0000-0000000000e8' and descricao_i18n = '{}'::jsonb;

update menu_items set descricao_i18n = '{
  "fr": "Jus d''acérola riche en vitamine C.",
  "it": "Succo di acerola ricco di vitamina C.",
  "en": "Vitamin C-rich acerola juice.",
  "pt": "Suco de acerola rico em vitamina C.",
  "es": "Zumo de acerola rico en vitamina C."
}'::jsonb where id = '00000000-0000-0000-0000-0000000000e9' and descricao_i18n = '{}'::jsonb;

update menu_items set descricao_i18n = '{
  "fr": "Jus crémeux de cupuaçu amazonien.",
  "it": "Succo cremoso di cupuaçu amazzonico.",
  "en": "Creamy Amazonian cupuaçu juice.",
  "pt": "Suco cremoso de cupuaçu amazônico.",
  "es": "Zumo cremoso de cupuaçu amazónico."
}'::jsonb where id = '00000000-0000-0000-0000-0000000000ea' and descricao_i18n = '{}'::jsonb;

update menu_items set descricao_i18n = '{
  "fr": "Jus de cajou brésilien fruité.",
  "it": "Succo di anacardio brasiliano fruttato.",
  "en": "Fruity Brazilian cashew juice.",
  "pt": "Suco frutado de caju brasileiro.",
  "es": "Zumo afrutado de anacardo brasileño."
}'::jsonb where id = '00000000-0000-0000-0000-0000000000eb' and descricao_i18n = '{}'::jsonb;

update menu_items set descricao_i18n = '{
  "fr": "Jus exotique de cajá.",
  "it": "Succo esotico di cajá.",
  "en": "Exotic cajá fruit juice.",
  "pt": "Suco exótico de cajá.",
  "es": "Zumo exótico de cajá."
}'::jsonb where id = '00000000-0000-0000-0000-0000000000ec' and descricao_i18n = '{}'::jsonb;

update menu_items set descricao_i18n = '{
  "fr": "Jus crémeux de graviola (corossol).",
  "it": "Succo cremoso di graviola (guanabana).",
  "en": "Creamy soursop (graviola) juice.",
  "pt": "Suco cremoso de graviola.",
  "es": "Zumo cremoso de graviola (guanábana)."
}'::jsonb where id = '00000000-0000-0000-0000-0000000000ed' and descricao_i18n = '{}'::jsonb;

update menu_items set descricao_i18n = '{
  "fr": "Jus de fruit de la passion aigre-doux.",
  "it": "Succo di frutto della passione agrodolce.",
  "en": "Sweet and tangy passion fruit juice.",
  "pt": "Suco agridoce de maracujá.",
  "es": "Zumo agridulce de maracuyá."
}'::jsonb where id = '00000000-0000-0000-0000-0000000000ee' and descricao_i18n = '{}'::jsonb;

update menu_items set descricao_i18n = '{
  "fr": "Jus de baies sauvages riche en antioxydants.",
  "it": "Succo di frutti di bosco ricco di antiossidanti.",
  "en": "Antioxidant-rich wild berry juice.",
  "pt": "Suco de frutas silvestres rico em antioxidantes.",
  "es": "Zumo de frutos del bosque rico en antioxidantes."
}'::jsonb where id = '00000000-0000-0000-0000-0000000000ef' and descricao_i18n = '{}'::jsonb;

-- =====================================================================
-- Backfill: traduções de nome das 5 categorias originais (migradas do
-- antigo src/mesa/i18n/labelTranslations.ts para categories.nome_i18n).
-- Só preenche linhas ainda vazias.
-- =====================================================================

update categories set nome_i18n = '{
  "fr": "Açaí en bol",
  "it": "Açaí in coppa",
  "en": "Açaí Bowls",
  "pt": "Açaí na Tigela",
  "es": "Açaí en Bol"
}'::jsonb where id = '00000000-0000-0000-0000-0000000000c1' and nome_i18n = '{}'::jsonb;

update categories set nome_i18n = '{
  "fr": "Formules",
  "it": "Combo",
  "en": "Combos",
  "pt": "Combos",
  "es": "Combos"
}'::jsonb where id = '00000000-0000-0000-0000-0000000000c2' and nome_i18n = '{}'::jsonb;

update categories set nome_i18n = '{
  "fr": "Jus — Classiques",
  "it": "Succhi — Classici",
  "en": "Juices — Classics",
  "pt": "Sucos — Clássicos",
  "es": "Zumos — Clásicos"
}'::jsonb where id = '00000000-0000-0000-0000-0000000000c3' and nome_i18n = '{}'::jsonb;

update categories set nome_i18n = '{
  "fr": "Jus — Exotiques",
  "it": "Succhi — Esotici",
  "en": "Juices — Exotic",
  "pt": "Sucos — Exóticos",
  "es": "Zumos — Exóticos"
}'::jsonb where id = '00000000-0000-0000-0000-0000000000c4' and nome_i18n = '{}'::jsonb;

update categories set nome_i18n = '{
  "fr": "Jus — Premium",
  "it": "Succhi — Premium",
  "en": "Juices — Premium",
  "pt": "Sucos — Premium",
  "es": "Zumos — Premium"
}'::jsonb where id = '00000000-0000-0000-0000-0000000000c5' and nome_i18n = '{}'::jsonb;

-- =====================================================================
-- Backfill: traduções de nome dos grupos e opções de adicionais que já
-- existiam (migradas do antigo src/mesa/i18n/labelTranslations.ts).
-- Grupos têm ID estável; opções não (são recriadas a cada reseed), então
-- o match é pelo nome em alemão. Só preenche linhas ainda vazias.
-- =====================================================================

update modifiers set nome_i18n = '{
  "fr": "Fruits",
  "it": "Frutta",
  "en": "Fruits",
  "pt": "Frutas",
  "es": "Frutas"
}'::jsonb where id = '00000000-0000-0000-0000-0000000000d1' and nome_i18n = '{}'::jsonb;

update modifiers set nome_i18n = '{
  "fr": "Taille",
  "it": "Formato",
  "en": "Size",
  "pt": "Tamanho",
  "es": "Tamaño"
}'::jsonb where id = '00000000-0000-0000-0000-0000000000d4' and nome_i18n = '{}'::jsonb;

update modifier_options set nome_i18n = '{
  "fr": "Fraise",
  "it": "Fragola",
  "en": "Strawberry",
  "pt": "Morango",
  "es": "Fresa"
}'::jsonb where nome = 'Erdbeere' and nome_i18n = '{}'::jsonb;

update modifier_options set nome_i18n = '{
  "fr": "Myrtille",
  "it": "Mirtillo",
  "en": "Blueberry",
  "pt": "Mirtilo",
  "es": "Arándano"
}'::jsonb where nome = 'Blaubeere' and nome_i18n = '{}'::jsonb;

update modifier_options set nome_i18n = '{
  "fr": "Banane",
  "it": "Banana",
  "en": "Banana",
  "pt": "Banana",
  "es": "Plátano"
}'::jsonb where nome = 'Banane' and nome_i18n = '{}'::jsonb;

update modifier_options set nome_i18n = '{
  "fr": "Poudre de lait",
  "it": "Latte in polvere",
  "en": "Milk powder",
  "pt": "Leite em pó",
  "es": "Leche en polvo"
}'::jsonb where nome = 'Milchpulver' and nome_i18n = '{}'::jsonb;

update modifier_options set nome_i18n = '{
  "fr": "Cacahuètes",
  "it": "Arachidi",
  "en": "Peanuts",
  "pt": "Amendoim",
  "es": "Cacahuete"
}'::jsonb where nome = 'Erdnüsse' and nome_i18n = '{}'::jsonb;

update modifier_options set nome_i18n = '{
  "fr": "Lait concentré",
  "it": "Latte condensato",
  "en": "Condensed milk",
  "pt": "Leite condensado",
  "es": "Leche condensada"
}'::jsonb where nome = 'Kondensmilch' and nome_i18n = '{}'::jsonb;
