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
-- marca os produtos escolhidos a dedo pela equipe para aparecer na página "Destaques" do cardápio.
alter table menu_items add column if not exists destaque boolean not null default false;
-- quando true, a descrição do produto (a receita/composição, ex: "Tapioka
-- Cremig, michpulver, kokosraspel...") é copiada para `order_items.descricao_item`
-- no momento do pedido e aparece na comanda da cozinha — útil pra combos
-- prontos sem modifiers, onde a "receita" não vem de escolha nenhuma do
-- cliente. Produtos com adicionais normalmente não precisam disto: a cozinha
-- já vê o que foi escolhido em `modifiers_selecionados`.
alter table menu_items add column if not exists descricao_na_comanda boolean not null default false;

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
  conta_para_limite  boolean not null default false,
  -- limite de quantas opções podem ser escolhidas dentro deste grupo
  -- (independente do `max_ingredientes` do produto). null = sem limite.
  -- só relevante quando `selecao = 'multipla'`.
  max_selecoes       int
);

alter table modifiers add column if not exists conta_para_limite boolean not null default false;
-- traduções manuais do nome por idioma (mesmo formato de menu_items.nome_i18n).
alter table modifiers add column if not exists nome_i18n jsonb not null default '{}'::jsonb;
alter table modifiers add column if not exists max_selecoes int;

-- ---------------------------------------------------------------------
-- modifier_options (opções dentro de um grupo, ex: "Morango", "+Nutella")
-- ---------------------------------------------------------------------
create table if not exists modifier_options (
  id               uuid primary key default gen_random_uuid(),
  modifier_id      uuid not null references modifiers(id) on delete cascade,
  nome             text not null,
  preco_adicional  numeric(10,2) not null default 0,
  ordem            int not null default 0,
  -- foto da opção (morango, Nutella...), mostrada ao cliente na hora de montar
  -- o pedido. Mesmo bucket das fotos de produto. null = só o nome.
  foto_url         text
);

-- traduções manuais do nome por idioma (mesmo formato de menu_items.nome_i18n).
alter table modifier_options add column if not exists nome_i18n jsonb not null default '{}'::jsonb;
alter table modifier_options add column if not exists foto_url text;

-- quantas porções desta opção o cliente pode pedir de uma vez (ex: "3x
-- Granola"). null ou 1 = só dá pra marcar/desmarcar, como sempre foi;
-- qualquer valor maior mostra um contador +/- no totem em vez de um toque
-- único. Preço, adicional e baixa de estoque (quantidade_padrao) escalam
-- juntos pela quantidade escolhida.
alter table modifier_options add column if not exists quantidade_maxima int;

create index if not exists idx_modifier_options_modifier on modifier_options(modifier_id);

-- ---------------------------------------------------------------------
-- menu_item_modifiers (quais grupos de modifier se aplicam a qual item)
-- ---------------------------------------------------------------------
create table if not exists menu_item_modifiers (
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  modifier_id  uuid not null references modifiers(id) on delete cascade,
  primary key (menu_item_id, modifier_id)
);

-- "copo pronto": produto com receita fixa (ex: um açaí já montado, sem o
-- cliente escolher nada) onde vale a pena mostrar os ingredientes antes de
-- pedir. Sem relação com menu_item_insumos (baixa de estoque) — aqui são os
-- mesmos adicionais já cadastrados (modifier_options), só como informação
-- pro cliente, ligados por menu_item_ingredientes logo abaixo.
alter table menu_items add column if not exists copo_pronto boolean not null default false;

-- ---------------------------------------------------------------------
-- menu_item_ingredientes (ingredientes fixos mostrados ao cliente num
-- "copo pronto" — ver menu_items.copo_pronto acima. `ordem` é a posição
-- escolhida no Painel da Equipe, não a ordem cadastrada do adicional.)
-- ---------------------------------------------------------------------
create table if not exists menu_item_ingredientes (
  menu_item_id       uuid not null references menu_items(id) on delete cascade,
  modifier_option_id uuid not null references modifier_options(id) on delete cascade,
  ordem              int not null default 0,
  primary key (menu_item_id, modifier_option_id)
);

-- ---------------------------------------------------------------------
-- tip_options (opções de gorjeta oferecidas no totem)
--
-- Eram quatro valores fixos no código, repetidos no App da Mesa e na função
-- que cobra — mudar a gorjeta exigia deploy, e as duas listas podiam divergir
-- em silêncio. Agora vivem aqui, e os dois lados leem daqui.
--
-- "Sem gorjeta" não é uma linha desta tabela: o totem sempre oferece essa
-- saída, e ela não é da conta de quem administra o cardápio.
-- ---------------------------------------------------------------------
create table if not exists tip_options (
  id     uuid primary key default gen_random_uuid(),
  -- 'fixo' = valor em francos; 'percentual' = fatia do subtotal do pedido.
  tipo   text not null check (tipo in ('fixo', 'percentual')),
  -- Em francos quando fixo, em pontos percentuais quando percentual.
  valor  numeric(10,2) not null check (valor > 0),
  ordem  int not null default 0,
  ativo  boolean not null default true
);

create index if not exists idx_tip_options_ordem on tip_options(ordem);

-- Semeia as quatro opções que estavam no código, para o totem não abrir sem
-- nenhuma gorjeta na primeira vez que este arquivo rodar.
insert into tip_options (tipo, valor, ordem)
select * from (values ('fixo', 5.00, 1), ('fixo', 10.00, 2), ('fixo', 20.00, 3)) as v(tipo, valor, ordem)
where not exists (select 1 from tip_options);

-- ---------------------------------------------------------------------
-- orders (pedidos)
-- ---------------------------------------------------------------------
create table if not exists orders (
  id            uuid primary key default gen_random_uuid(),
  status        text not null default 'aguardando_pagamento'
                  check (status in
                    ('aguardando_pagamento', 'aguardando_dinheiro', 'aguardando_twint', 'recebido', 'em_preparo', 'pronto', 'entregue', 'cancelado')),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- pedido só chega na cozinha depois que o pagamento é confirmado — pela SumUp
-- (aguardando_pagamento) ou pela equipe no caixa (aguardando_dinheiro / aguardando_twint).
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check check (status in
  ('aguardando_pagamento', 'aguardando_dinheiro', 'aguardando_twint', 'recebido', 'em_preparo', 'pronto', 'entregue', 'cancelado'));
alter table orders alter column status set default 'aguardando_pagamento';
alter table orders add column if not exists sumup_checkout_id text;
alter table orders add column if not exists valor_pago numeric(10,2);
alter table orders add column if not exists nome_cliente text;
alter table orders add column if not exists gorjeta numeric(10,2) not null default 0;

-- Relatórios: como o pedido foi pago. Para cartão é o que a SumUp reporta na
-- transação (ex: 'Cartão sem contato'), preenchido por
-- api/sumup-confirm-payment.ts; para dinheiro é 'Dinheiro', gravado junto com
-- `valor_recebido_dinheiro` quando a equipe confirma o troco no painel. Null
-- nos pedidos antigos e quando a SumUp não informa.
alter table orders add column if not exists forma_pagamento text;
-- Quanto o cliente entregou em espécie — só preenchido em pedidos pagos em
-- dinheiro. O troco é `valor_recebido_dinheiro - valor_pago`, calculado na
-- hora e nunca gravado por si (evita os dois números divergirem se alguém
-- editar um sem o outro).
alter table orders add column if not exists valor_recebido_dinheiro numeric(10,2);

-- Relatórios: marcos de tempo do pedido. `atualizado_em` sozinho não serve
-- porque muda a cada avanço de status; estas duas colunas congelam o instante
-- do pagamento e o da entrega, que é de onde sai o tempo médio de preparo.
alter table orders add column if not exists pago_em timestamptz;
alter table orders add column if not exists entregue_em timestamptz;

-- removido: seleção de mesa. Pedidos passaram a identificar o cliente só
-- pelo nome (nome_cliente); dropa a coluna e a tabela de mesas em bancos
-- que já existiam antes dessa mudança (drop da coluna primeiro, pra tirar
-- a foreign key antes de derrubar a tabela referenciada).
alter table orders drop column if exists table_id;
drop table if exists tables;

create index if not exists idx_orders_status on orders(status);
create index if not exists idx_orders_criado_em on orders(criado_em);
create index if not exists idx_orders_sumup_checkout on orders(sumup_checkout_id);

create or replace function set_atualizado_em()
returns trigger as $$
begin
  new.atualizado_em = now();
  -- Marcos usados nos relatórios (ver colunas pago_em/entregue_em acima).
  -- Só grava na primeira vez que o pedido entra no status, para que uma
  -- correção manual de status depois não reescreva o horário real.
  if new.status <> old.status then
    if new.status = 'recebido' and new.pago_em is null then
      new.pago_em = now();
    end if;
    if new.status = 'entregue' and new.entregue_em is null then
      new.entregue_em = now();
    end if;
  end if;
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

-- Descrição do produto no momento do pedido, só preenchida quando
-- `menu_items.descricao_na_comanda` era true na hora da compra — ver
-- comentário lá. Snapshot, igual `nome_item`: não muda se a descrição do
-- produto mudar depois.
alter table order_items add column if not exists descricao_item text;

create index if not exists idx_order_items_order on order_items(order_id);

-- ---------------------------------------------------------------------
-- Backfill dos marcos de tempo em pedidos anteriores às colunas
-- pago_em/entregue_em. Não temos o horário exato: aproximamos a entrega
-- pelo último `atualizado_em` e o pagamento pela criação do pedido. Só
-- preenche linhas ainda nulas, então roda uma vez e nunca mais mexe.
-- ---------------------------------------------------------------------
update orders set entregue_em = atualizado_em where status = 'entregue' and entregue_em is null;
update orders set pago_em = criado_em
  where status in ('recebido', 'em_preparo', 'pronto', 'entregue') and pago_em is null;

-- Relatórios varrem períodos inteiros de qualquer status (inclusive
-- aguardando_pagamento e cancelado, que viram carrinho abandonado e falha
-- de pagamento), então a varredura por data precisa ser indexada.
create index if not exists idx_orders_criado_em_status on orders(criado_em, status);

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
alter table menu_item_ingredientes enable row level security;
alter table tip_options         enable row level security;
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
drop policy if exists "public read menu_item_ingredientes"          on menu_item_ingredientes;
drop policy if exists "authenticated insert menu_item_ingredientes" on menu_item_ingredientes;
drop policy if exists "authenticated delete menu_item_ingredientes" on menu_item_ingredientes;
drop policy if exists "public read tip_options"          on tip_options;
drop policy if exists "authenticated insert tip_options" on tip_options;
drop policy if exists "authenticated update tip_options" on tip_options;
drop policy if exists "authenticated delete tip_options" on tip_options;
drop policy if exists "public read orders"              on orders;
drop policy if exists "public insert orders"             on orders;
drop policy if exists "public update orders"             on orders;
drop policy if exists "authenticated read orders"        on orders;
drop policy if exists "authenticated update orders"      on orders;
drop policy if exists "authenticated delete orders"      on orders;
drop policy if exists "public read order_items"          on order_items;
drop policy if exists "public insert order_items"        on order_items;
drop policy if exists "authenticated read order_items"    on order_items;

-- leitura pública do cardápio
create policy "public read categories"          on categories          for select using (true);
create policy "public read menu_items"          on menu_items          for select using (true);
create policy "public read modifiers"           on modifiers           for select using (true);
create policy "public read modifier_options"    on modifier_options    for select using (true);
create policy "public read menu_item_modifiers" on menu_item_modifiers for select using (true);
create policy "public read menu_item_ingredientes" on menu_item_ingredientes for select using (true);

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

create policy "authenticated insert menu_item_ingredientes" on menu_item_ingredientes for insert with check (auth.uid() is not null);
create policy "authenticated delete menu_item_ingredientes" on menu_item_ingredientes for delete using (auth.uid() is not null);

-- gorjetas: o totem lê para montar as opções; só a equipe logada edita.
create policy "public read tip_options"          on tip_options for select using (true);
create policy "authenticated insert tip_options" on tip_options for insert with check (auth.uid() is not null);
create policy "authenticated update tip_options" on tip_options for update using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated delete tip_options" on tip_options for delete using (auth.uid() is not null);

-- pedidos: só a equipe logada lê e avança status. O App da Mesa nunca grava
-- aqui com a chave anon — ele cria/paga pedidos via /api/sumup-create-checkout
-- e /api/sumup-confirm-payment, que usam a chave de serviço (bypassa RLS) e
-- reprecificam cada item a partir de menu_items antes de gravar. A página de
-- recibo lê pelo mesmo caminho, via /api/receipt.
--
-- Antes "public read/insert/update ... using(true)" deixava qualquer um, sem
-- login nenhum, ler o histórico inteiro de pedidos (nome de cliente, valores)
-- e sobrescrever o status de qualquer pedido direto pela API REST do
-- Supabase — inclusive marcando um pedido não pago como "recebido".
create policy "authenticated read orders"   on orders for select using (auth.uid() is not null);
create policy "authenticated update orders" on orders for update using (auth.uid() is not null) with check (auth.uid() is not null);
-- Só pra excluir pedido de teste (ver OrderCard "Excluir pedido") — apaga em
-- cascata os order_items (FK on delete cascade); os insumos já baixados são
-- estornados antes, com um lançamento de entrada, nunca apagando o histórico
-- de movimentacoes_estoque (ver excluirPedido em useOrders.ts).
create policy "authenticated delete orders" on orders for delete using (auth.uid() is not null);

create policy "authenticated read order_items" on order_items for select using (auth.uid() is not null);

-- =====================================================================
-- Realtime — habilita a publicação para o App da Equipe escutar inserts/
-- updates de pedidos, e para o App da Mesa escutar edições de cardápio,
-- sem polling.
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

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tip_options'
  ) then
    alter publication supabase_realtime add table tip_options;
  end if;

  -- cardápio: permite que o App da Mesa reflita edições feitas no Painel
  -- da Equipe (categorias, produtos, adicionais) sem precisar recarregar.
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'categories'
  ) then
    alter publication supabase_realtime add table categories;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'menu_items'
  ) then
    alter publication supabase_realtime add table menu_items;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'modifiers'
  ) then
    alter publication supabase_realtime add table modifiers;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'modifier_options'
  ) then
    alter publication supabase_realtime add table modifier_options;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'menu_item_modifiers'
  ) then
    alter publication supabase_realtime add table menu_item_modifiers;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'menu_item_ingredientes'
  ) then
    alter publication supabase_realtime add table menu_item_ingredientes;
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
  "fr": "Composez votre açaí, choisissez jusqu''à 4 ingrédients (fruits et garnitures).",
  "it": "Componi il tuo açaí, scegli fino a 4 ingredienti (frutta e topping).",
  "en": "Build your own açaí, choose up to 4 ingredients (fruits & toppings).",
  "pt": "Monte seu açaí, escolha até 4 ingredientes (frutas e coberturas).",
  "es": "Arma tu açaí, elige hasta 4 ingredientes (frutas y toppings)."
}'::jsonb where id = '00000000-0000-0000-0000-0000000000e1' and descricao_i18n = '{}'::jsonb;

update menu_items set descricao_i18n = '{
  "fr": "Composez votre açaí, choisissez jusqu''à 5 ingrédients (fruits et garnitures).",
  "it": "Componi il tuo açaí, scegli fino a 5 ingredienti (frutta e topping).",
  "en": "Build your own açaí, choose up to 5 ingredients (fruits & toppings).",
  "pt": "Monte seu açaí, escolha até 5 ingredientes (frutas e coberturas).",
  "es": "Arma tu açaí, elige hasta 5 ingredientes (frutas y toppings)."
}'::jsonb where id = '00000000-0000-0000-0000-0000000000e2' and descricao_i18n = '{}'::jsonb;

update menu_items set descricao_i18n = '{
  "fr": "1 açaí 500 ml + 1 jus 300 ml.",
  "it": "1 açaí 500 ml + 1 succo 300 ml.",
  "en": "1 açaí 500 ml + 1 juice 300 ml.",
  "pt": "1 açaí 500 ml + 1 suco 300 ml.",
  "es": "1 açaí 500 ml + 1 zumo 300 ml."
}'::jsonb where id = '00000000-0000-0000-0000-0000000000e3' and descricao_i18n = '{}'::jsonb;

update menu_items set descricao_i18n = '{
  "fr": "Deux açaís 500 ml, parfait à partager à deux.",
  "it": "Due açaí da 500 ml, perfetti da condividere in due.",
  "en": "Two açaí bowls 500 ml, perfect to share as a couple.",
  "pt": "2 açaís 500 ml, perfeito para compartilhar a dois.",
  "es": "Dos açaís 500 ml, perfecto para compartir en pareja."
}'::jsonb where id = '00000000-0000-0000-0000-0000000000e4' and descricao_i18n = '{}'::jsonb;

update menu_items set descricao_i18n = '{
  "fr": "2 açaís 500 ml + 2 jus 500 ml, pour toute la famille.",
  "it": "2 açaí da 500 ml + 2 succhi da 500 ml, per tutta la famiglia.",
  "en": "2 açaí bowls 500 ml + 2 juices 500 ml, for the whole family.",
  "pt": "2 açaís 500 ml + 2 sucos 500 ml, para toda a família.",
  "es": "2 açaís 500 ml + 2 zumos 500 ml, para toda la familia."
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
  "fr": "Jus Classiques",
  "it": "Succhi Classici",
  "en": "Juices Classics",
  "pt": "Sucos Clássicos",
  "es": "Zumos Clásicos"
}'::jsonb where id = '00000000-0000-0000-0000-0000000000c3' and nome_i18n = '{}'::jsonb;

update categories set nome_i18n = '{
  "fr": "Jus Exotiques",
  "it": "Succhi Esotici",
  "en": "Juices Exotic",
  "pt": "Sucos Exóticos",
  "es": "Zumos Exóticos"
}'::jsonb where id = '00000000-0000-0000-0000-0000000000c4' and nome_i18n = '{}'::jsonb;

update categories set nome_i18n = '{
  "fr": "Jus Premium",
  "it": "Succhi Premium",
  "en": "Juices Premium",
  "pt": "Sucos Premium",
  "es": "Zumos Premium"
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

-- =====================================================================
-- Fix: remove o travessão "—" usado como separador em nomes de categoria
-- e no alemão base, e o troca por vírgula dentro de frases de descrição.
-- Ao contrário dos backfills acima, roda sempre (não só em linhas vazias),
-- para corrigir dados que já foram semeados antes desta mudança.
-- =====================================================================

update categories
set nome = replace(nome, ' — ', ' ')
where nome like '%—%';

update categories
set nome_i18n = replace(nome_i18n::text, ' — ', ' ')::jsonb
where nome_i18n::text like '%—%';

update menu_items
set descricao = replace(descricao, ' — ', ', ')
where descricao like '%—%';

update menu_items
set descricao_i18n = replace(descricao_i18n::text, ' — ', ', ')::jsonb
where descricao_i18n::text like '%—%';

-- =====================================================================
-- Gestão de estoque — Fase 0: fornecedores, insumos, composição dos
-- produtos e vínculo de insumo nas misturas (modifier_options).
--
-- Estas tabelas são só de back-office (controle de compras/estoque pela
-- equipe) — ninguém no totem ou no cardápio público precisa ler nada
-- daqui, por isso a RLS abaixo é autenticado-only tanto pra leitura
-- quanto pra escrita, diferente de categories/menu_items/modifiers (que
-- o totem lê sem login).
-- =====================================================================

-- ---------------------------------------------------------------------
-- fornecedores
-- ---------------------------------------------------------------------
create table if not exists fornecedores (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  contato     text,
  telefone    text,
  email       text,
  observacoes text,
  -- desativar em vez de excluir preserva o histórico de compras já
  -- registradas com este fornecedor.
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- insumos (ingredientes/matérias-primas controladas em estoque)
-- ---------------------------------------------------------------------
create table if not exists insumos (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  unidade        text not null check (unidade in ('kg', 'g', 'l', 'ml', 'unidade')),
  -- abaixo deste saldo, o insumo aparece como "saldo baixo" no dashboard
  -- de estoque (Fase 4). null = sem alerta configurado.
  estoque_minimo numeric(10,3),
  -- desativar em vez de excluir preserva compras/movimentações/perdas já
  -- registradas com este insumo.
  ativo          boolean not null default true,
  ordem          int not null default 0,
  criado_em      timestamptz not null default now()
);

-- peso de 1 litro deste insumo, em gramas (ex: açaí puro ≈ 1030) — só faz
-- sentido quando `unidade` é 'l' ou 'ml'. Permite montar a composição do
-- produto (menu_item_insumos) em gramas mesmo controlando o estoque em
-- volume; a baixa de estoque continua sempre na unidade de controle (ver
-- src/shared/insumoConversao.ts). null = composição na própria unidade.
alter table insumos add column if not exists gramas_por_litro numeric(10,2);

-- capacidade máxima de estoque, na unidade de controle — usada só pra
-- mostrar o quanto uma compra preenche do estoque. null = sem limite.
alter table insumos add column if not exists estoque_maximo numeric(10,3);

-- preço de referência por unidade de controle (CHF), pra pré-preencher o
-- valor unitário ao lançar uma compra deste insumo.
alter table insumos add column if not exists valor_unitario_padrao numeric(10,2);

create index if not exists idx_insumos_ordem on insumos(ordem);

-- ---------------------------------------------------------------------
-- modifier_options: vínculo opcional com o insumo que a opção consome, e
-- quanto (na mesma unidade do insumo, ex: insumo "Banana" em 'g',
-- quantidade_padrao 200 na opção "Banane"). Uma opção sem vínculo (null)
-- simplesmente fica fora da baixa automática de estoque no fechamento —
-- não bloqueia a venda nem o fechamento dos demais itens.
-- ---------------------------------------------------------------------
alter table modifier_options add column if not exists insumo_id uuid references insumos(id) on delete set null;
alter table modifier_options add column if not exists quantidade_padrao numeric(10,3);

create index if not exists idx_modifier_options_insumo on modifier_options(insumo_id);

-- ---------------------------------------------------------------------
-- menu_item_insumos (composição/receita fixa do produto, ex: Açaí 500ml
-- = 400g de açaí + 1 copo + 1 colher — consumida em toda venda,
-- independente das misturas escolhidas pelo cliente)
-- ---------------------------------------------------------------------
create table if not exists menu_item_insumos (
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  insumo_id    uuid not null references insumos(id) on delete cascade,
  quantidade   numeric(10,3) not null check (quantidade > 0),
  primary key (menu_item_id, insumo_id)
);

-- =====================================================================
-- RLS — fornecedores/insumos/menu_item_insumos: só a equipe logada lê e
-- escreve (sem policy pública).
-- =====================================================================

alter table fornecedores      enable row level security;
alter table insumos           enable row level security;
alter table menu_item_insumos enable row level security;

drop policy if exists "authenticated read fornecedores"   on fornecedores;
drop policy if exists "authenticated insert fornecedores" on fornecedores;
drop policy if exists "authenticated update fornecedores" on fornecedores;
drop policy if exists "authenticated delete fornecedores" on fornecedores;

create policy "authenticated read fornecedores"   on fornecedores for select using (auth.uid() is not null);
create policy "authenticated insert fornecedores" on fornecedores for insert with check (auth.uid() is not null);
create policy "authenticated update fornecedores" on fornecedores for update using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated delete fornecedores" on fornecedores for delete using (auth.uid() is not null);

drop policy if exists "authenticated read insumos"   on insumos;
drop policy if exists "authenticated insert insumos" on insumos;
drop policy if exists "authenticated update insumos" on insumos;
drop policy if exists "authenticated delete insumos" on insumos;

create policy "authenticated read insumos"   on insumos for select using (auth.uid() is not null);
create policy "authenticated insert insumos" on insumos for insert with check (auth.uid() is not null);
create policy "authenticated update insumos" on insumos for update using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated delete insumos" on insumos for delete using (auth.uid() is not null);

drop policy if exists "authenticated read menu_item_insumos"   on menu_item_insumos;
drop policy if exists "authenticated insert menu_item_insumos" on menu_item_insumos;
drop policy if exists "authenticated delete menu_item_insumos" on menu_item_insumos;

create policy "authenticated read menu_item_insumos"   on menu_item_insumos for select using (auth.uid() is not null);
create policy "authenticated insert menu_item_insumos" on menu_item_insumos for insert with check (auth.uid() is not null);
create policy "authenticated delete menu_item_insumos" on menu_item_insumos for delete using (auth.uid() is not null);

-- =====================================================================
-- Gestão de estoque — Fase 1: pedidos de compra e movimentações de
-- estoque.
--
-- O saldo de um insumo nunca é gravado numa coluna própria: é sempre a
-- soma de `movimentacoes_estoque.quantidade` (positiva = entrada, negativa
-- = saída), exposta pela view `insumo_saldos`. Isso evita todo o problema
-- de manter um saldo cacheado sincronizado com o histórico — para o volume
-- desta loja, somar as movimentações na hora é instantâneo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- pedidos_compra / pedido_compra_itens
-- ---------------------------------------------------------------------
create table if not exists pedidos_compra (
  id            uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references fornecedores(id),
  status        text not null default 'rascunho'
                  check (status in ('rascunho', 'aguardando_recebimento', 'recebido', 'cancelado')),
  observacoes   text,
  criado_em     timestamptz not null default now(),
  recebido_em   timestamptz
);

create index if not exists idx_pedidos_compra_fornecedor on pedidos_compra(fornecedor_id);
create index if not exists idx_pedidos_compra_status on pedidos_compra(status);

create table if not exists pedido_compra_itens (
  id               uuid primary key default gen_random_uuid(),
  pedido_compra_id uuid not null references pedidos_compra(id) on delete cascade,
  insumo_id        uuid not null references insumos(id),
  quantidade       numeric(10,3) not null check (quantidade > 0),
  valor_unitario   numeric(10,2)
);

create index if not exists idx_pedido_compra_itens_pedido on pedido_compra_itens(pedido_compra_id);

-- ---------------------------------------------------------------------
-- movimentacoes_estoque — trilha de auditoria imutável (só insert/select,
-- ver policies abaixo). `quantidade` é sempre assinada: positiva numa
-- entrada, negativa numa saída, para que a soma dê o saldo direto.
-- `origem_tipo`/`origem_id` são uma referência solta (não FK) para o que
-- gerou o movimento — pedido de compra, pedido de venda (Fase 3),
-- inventário ou perda (Fase 2) — ou nulos num lançamento manual.
-- ---------------------------------------------------------------------
create table if not exists movimentacoes_estoque (
  id          uuid primary key default gen_random_uuid(),
  insumo_id   uuid not null references insumos(id),
  quantidade  numeric(10,3) not null check (quantidade <> 0),
  tipo        text not null check (tipo in (
                'entrada_compra', 'entrada_manual', 'entrada_ajuste_inventario',
                'saida_manual', 'saida_ajuste_inventario', 'saida_venda', 'saida_perda'
              )),
  origem_tipo text,
  origem_id   uuid,
  observacoes text,
  criado_em   timestamptz not null default now(),
  criado_por  uuid references auth.users(id)
);

create index if not exists idx_movimentacoes_estoque_insumo on movimentacoes_estoque(insumo_id);
create index if not exists idx_movimentacoes_estoque_criado_em on movimentacoes_estoque(criado_em);

-- security_invoker: sem isto, uma view no Postgres/Supabase roda com o
-- privilégio de quem a criou, não de quem consulta — o que bypassaria a
-- RLS de movimentacoes_estoque e deixaria o saldo legível sem login.
create or replace view insumo_saldos
  with (security_invoker = true) as
  select insumo_id, coalesce(sum(quantidade), 0) as saldo_atual
  from movimentacoes_estoque
  group by insumo_id;

-- =====================================================================
-- RLS — pedidos_compra/pedido_compra_itens: CRUD completo pela equipe
-- logada (mesmo padrão de fornecedores/insumos). movimentacoes_estoque:
-- só insert + select — sem update/delete, igual order_items, pra manter a
-- trilha de auditoria confiável.
-- =====================================================================

alter table pedidos_compra       enable row level security;
alter table pedido_compra_itens  enable row level security;
alter table movimentacoes_estoque enable row level security;

drop policy if exists "authenticated read pedidos_compra"   on pedidos_compra;
drop policy if exists "authenticated insert pedidos_compra" on pedidos_compra;
drop policy if exists "authenticated update pedidos_compra" on pedidos_compra;
drop policy if exists "authenticated delete pedidos_compra" on pedidos_compra;

create policy "authenticated read pedidos_compra"   on pedidos_compra for select using (auth.uid() is not null);
create policy "authenticated insert pedidos_compra" on pedidos_compra for insert with check (auth.uid() is not null);
create policy "authenticated update pedidos_compra" on pedidos_compra for update using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated delete pedidos_compra" on pedidos_compra for delete using (auth.uid() is not null);

drop policy if exists "authenticated read pedido_compra_itens"   on pedido_compra_itens;
drop policy if exists "authenticated insert pedido_compra_itens" on pedido_compra_itens;
drop policy if exists "authenticated update pedido_compra_itens" on pedido_compra_itens;
drop policy if exists "authenticated delete pedido_compra_itens" on pedido_compra_itens;

create policy "authenticated read pedido_compra_itens"   on pedido_compra_itens for select using (auth.uid() is not null);
create policy "authenticated insert pedido_compra_itens" on pedido_compra_itens for insert with check (auth.uid() is not null);
create policy "authenticated update pedido_compra_itens" on pedido_compra_itens for update using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated delete pedido_compra_itens" on pedido_compra_itens for delete using (auth.uid() is not null);

drop policy if exists "authenticated read movimentacoes_estoque"   on movimentacoes_estoque;
drop policy if exists "authenticated insert movimentacoes_estoque" on movimentacoes_estoque;

create policy "authenticated read movimentacoes_estoque"   on movimentacoes_estoque for select using (auth.uid() is not null);
create policy "authenticated insert movimentacoes_estoque" on movimentacoes_estoque for insert with check (auth.uid() is not null);

-- =====================================================================
-- Gestão de estoque — Fase 2: inventário (contagem física) e perdas.
--
-- Um inventário não tem rascunho: nasce e termina no mesmo lançamento (a
-- equipe conta tudo de uma vez e confirma). Cada diferença encontrada vira
-- uma movimentação de ajuste; toda diferença NEGATIVA (faltou estoque)
-- também vira um registro em `perdas`, com o motivo.
-- =====================================================================

create table if not exists inventarios (
  id            uuid primary key default gen_random_uuid(),
  observacoes   text,
  criado_em     timestamptz not null default now(),
  finalizado_em timestamptz,
  criado_por    uuid references auth.users(id)
);

create table if not exists inventario_itens (
  id            uuid primary key default gen_random_uuid(),
  inventario_id uuid not null references inventarios(id) on delete cascade,
  insumo_id     uuid not null references insumos(id),
  -- saldo no instante da contagem — congelado aqui, nunca recalculado depois.
  saldo_sistema numeric(10,3) not null,
  saldo_contado numeric(10,3) not null,
  -- só preenchido quando saldo_contado < saldo_sistema (faltou estoque).
  motivo        text check (motivo in (
                  'desperdicio', 'perda', 'produto_danificado', 'produto_vencido',
                  'erro_operacional', 'falta_de_controle', 'outros'
                ))
);

create index if not exists idx_inventario_itens_inventario on inventario_itens(inventario_id);

-- ---------------------------------------------------------------------
-- perdas — trilha de auditoria imutável (só insert/select, ver policies).
--
-- Quando nasce de um inventário (origem_tipo='inventario'), é só metadado
-- de categorização: quem já tirou o insumo do saldo foi o ajuste de
-- inventário (movimentacoes_estoque tipo 'saida_ajuste_inventario').
-- Quando é lançada solta (origem_tipo='manual', ver
-- useEstoquePerdas.lancarPerdaManual), ELA MESMA precisa gerar a
-- movimentação (tipo 'saida_perda') — senão o saldo não desce.
-- ---------------------------------------------------------------------
create table if not exists perdas (
  id          uuid primary key default gen_random_uuid(),
  insumo_id   uuid not null references insumos(id),
  quantidade  numeric(10,3) not null check (quantidade > 0),
  motivo      text not null check (motivo in (
                'desperdicio', 'perda', 'produto_danificado', 'produto_vencido',
                'erro_operacional', 'falta_de_controle', 'outros'
              )),
  observacoes text,
  origem_tipo text not null default 'manual' check (origem_tipo in ('manual', 'inventario')),
  origem_id   uuid,
  criado_em   timestamptz not null default now(),
  criado_por  uuid references auth.users(id)
);

create index if not exists idx_perdas_insumo on perdas(insumo_id);
create index if not exists idx_perdas_criado_em on perdas(criado_em);

-- =====================================================================
-- RLS — inventarios/inventario_itens: CRUD completo pela equipe logada
-- (mesmo padrão de fornecedores/insumos/compras). perdas: só insert +
-- select — sem update/delete, mesma trilha de auditoria imutável de
-- movimentacoes_estoque.
-- =====================================================================

alter table inventarios      enable row level security;
alter table inventario_itens enable row level security;
alter table perdas           enable row level security;

drop policy if exists "authenticated read inventarios"   on inventarios;
drop policy if exists "authenticated insert inventarios" on inventarios;
drop policy if exists "authenticated update inventarios" on inventarios;
drop policy if exists "authenticated delete inventarios" on inventarios;

create policy "authenticated read inventarios"   on inventarios for select using (auth.uid() is not null);
create policy "authenticated insert inventarios" on inventarios for insert with check (auth.uid() is not null);
create policy "authenticated update inventarios" on inventarios for update using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated delete inventarios" on inventarios for delete using (auth.uid() is not null);

drop policy if exists "authenticated read inventario_itens"   on inventario_itens;
drop policy if exists "authenticated insert inventario_itens" on inventario_itens;
drop policy if exists "authenticated update inventario_itens" on inventario_itens;
drop policy if exists "authenticated delete inventario_itens" on inventario_itens;

create policy "authenticated read inventario_itens"   on inventario_itens for select using (auth.uid() is not null);
create policy "authenticated insert inventario_itens" on inventario_itens for insert with check (auth.uid() is not null);
create policy "authenticated update inventario_itens" on inventario_itens for update using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated delete inventario_itens" on inventario_itens for delete using (auth.uid() is not null);

drop policy if exists "authenticated read perdas"   on perdas;
drop policy if exists "authenticated insert perdas" on perdas;

create policy "authenticated read perdas"   on perdas for select using (auth.uid() is not null);
create policy "authenticated insert perdas" on perdas for insert with check (auth.uid() is not null);

-- =====================================================================
-- Gestão de estoque — Fase 3: fechamento (baixa automática de estoque a
-- partir dos pedidos que já vêm do totem/mesa — sem tela de venda nova).
--
-- Não vira um status novo em `orders.status`/ORDER_STATUS_FLOW de
-- propósito: o quadro da cozinha (useOrders) filtra por esse array, e um
-- 5º status bagunçaria o quadro. `estoque_baixado` é um controle à parte,
-- só do módulo de estoque — um pedido pode estar `entregue` há dias e
-- ainda não ter sido fechado.
-- =====================================================================

alter table orders add column if not exists estoque_baixado boolean not null default false;
alter table orders add column if not exists baixado_em timestamptz;

create index if not exists idx_orders_estoque_baixado on orders(estoque_baixado);

-- Linha única (singleton) de configurações do módulo de estoque. Hoje só
-- guarda o interruptor de fechamento automático — em vez de esperar a
-- revisão manual, dá baixa assim que o pedido é confirmado (cartão ou
-- dinheiro). Uma tabela em vez de uma coluna solta em algum outro lugar,
-- pra deixar espaço pra outras configurações do módulo no futuro.
create table if not exists configuracoes_estoque (
  id                     uuid primary key default '00000000-0000-0000-0000-000000000001',
  fechamento_automatico  boolean not null default false
);
insert into configuracoes_estoque (id) values ('00000000-0000-0000-0000-000000000001') on conflict do nothing;

alter table configuracoes_estoque enable row level security;

drop policy if exists "staff le configuracoes estoque" on configuracoes_estoque;
drop policy if exists "staff edita configuracoes estoque" on configuracoes_estoque;

create policy "staff le configuracoes estoque" on configuracoes_estoque for select using (auth.uid() is not null);
create policy "staff edita configuracoes estoque" on configuracoes_estoque for update using (auth.uid() is not null) with check (auth.uid() is not null);

-- =====================================================================
-- Gestão de estoque — impostos.
--
-- Um imposto pode ser vinculado a um insumo específico (ex: taxa de
-- importação do açaí) ou ficar solto (insumo_id null — um imposto
-- genérico, só de registro). Quando vinculado, o valor entra no cálculo
-- de custo de uma compra desse insumo (ver valorUnitarioComImposto no
-- painel da equipe) — sempre calculado na hora a partir da taxa atual,
-- nunca gravado dentro do pedido, mesmo espírito de insumo_saldos: a fonte
-- da verdade é o cadastro, não um valor congelado.
-- =====================================================================

create table if not exists impostos (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  tipo      text not null check (tipo in ('fixo', 'percentual')),
  valor     numeric(10,2) not null check (valor > 0),
  insumo_id uuid references insumos(id) on delete cascade,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

create index if not exists idx_impostos_insumo on impostos(insumo_id);

alter table impostos enable row level security;

drop policy if exists "authenticated read impostos"   on impostos;
drop policy if exists "authenticated insert impostos" on impostos;
drop policy if exists "authenticated update impostos" on impostos;
drop policy if exists "authenticated delete impostos" on impostos;

create policy "authenticated read impostos"   on impostos for select using (auth.uid() is not null);
create policy "authenticated insert impostos" on impostos for insert with check (auth.uid() is not null);
create policy "authenticated update impostos" on impostos for update using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authenticated delete impostos" on impostos for delete using (auth.uid() is not null);

-- =====================================================================
-- Assistente de IA — histórico de conversa.
--
-- Uma linha por usuário (a "conversa" é sempre uma só, sem múltiplas
-- threads nomeadas). `contents` é o histórico bruto no formato do Gemini
-- (o mesmo que viaja entre cliente e servidor em api/assistant-chat.ts) —
-- reenviado inteiro a cada turno pro modelo ter memória, e reconstituído
-- na tela ao carregar a aba/o widget. RLS aqui é defesa em profundidade:
-- o endpoint sempre usa a chave de serviço, mas mantém cada usuário só
-- lendo/escrevendo a própria linha caso algo um dia consulte direto.
-- =====================================================================

-- Uma linha por CONVERSA (não por usuário): o painel guarda o histórico de
-- cada conversa separada, pra dar pra reabrir uma antiga sem perder a atual.
create table if not exists assistente_conversas (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references auth.users(id) on delete cascade,
  contents      jsonb not null default '[]'::jsonb,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Migra quem já rodou a versão anterior (uma linha por usuário, sem `id`)
-- pro novo formato, sem apagar o que já tiver salvo.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'assistente_conversas' and column_name = 'id'
  ) then
    alter table assistente_conversas add column id uuid not null default gen_random_uuid();
    alter table assistente_conversas add column criado_em timestamptz not null default now();
    alter table assistente_conversas drop constraint if exists assistente_conversas_pkey;
    alter table assistente_conversas add primary key (id);
  end if;
end $$;

create index if not exists assistente_conversas_usuario_idx on assistente_conversas (usuario_id, atualizado_em desc);

alter table assistente_conversas enable row level security;

drop policy if exists "own conversa read"    on assistente_conversas;
drop policy if exists "own conversa insert"  on assistente_conversas;
drop policy if exists "own conversa update"  on assistente_conversas;
drop policy if exists "own conversa delete"  on assistente_conversas;
drop policy if exists "own conversas read"   on assistente_conversas;
drop policy if exists "own conversas insert" on assistente_conversas;
drop policy if exists "own conversas update" on assistente_conversas;
drop policy if exists "own conversas delete" on assistente_conversas;

create policy "own conversas read"   on assistente_conversas for select using (auth.uid() = usuario_id);
create policy "own conversas insert" on assistente_conversas for insert with check (auth.uid() = usuario_id);
create policy "own conversas update" on assistente_conversas for update using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);
create policy "own conversas delete" on assistente_conversas for delete using (auth.uid() = usuario_id);
