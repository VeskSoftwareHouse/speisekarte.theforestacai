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
  status        text not null default 'recebido'
                  check (status in ('recebido', 'em_preparo', 'pronto', 'entregue')),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_orders_status on orders(status);
create index if not exists idx_orders_criado_em on orders(criado_em);

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
drop policy if exists "public read modifiers"           on modifiers;
drop policy if exists "public read modifier_options"    on modifier_options;
drop policy if exists "public read menu_item_modifiers" on menu_item_modifiers;
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
