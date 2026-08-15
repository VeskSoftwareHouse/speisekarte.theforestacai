-- =====================================================================
-- Diagnóstico do banco: o que do schema.sql já está aplicado.
--
-- Rode este arquivo no SQL Editor do Supabase. Ele NÃO altera nada —
-- só lê e devolve uma tabela dizendo, item a item, OK ou FALTA.
--
-- Para corrigir qualquer FALTA: rode supabase/schema.sql inteiro. Ele é
-- idempotente (só `create ... if not exists`, `add column if not exists`,
-- e updates protegidos por condição), não contém nenhum delete ou
-- truncate, e portanto é seguro de rodar de novo com o cardápio populado.
--
-- Uma exceção que vale saber antes de rodar: o schema.sql apaga a tabela
-- `tables` e a coluna `orders.table_id`, porque a seleção de mesa foi
-- removida do sistema. Isso é intencional.
-- =====================================================================

select verificacao, situacao, detalhe from (

  -- Limite de adicionais por categoria (Painel da Equipe > Adicionais)
  select 1 as ord,
    'modifiers.max_selecoes' as verificacao,
    case when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'modifiers' and column_name = 'max_selecoes'
    ) then 'OK' else 'FALTA' end as situacao,
    'limite de adicionais por categoria' as detalhe

  union all

  -- Foto de cada adicional (morango, Nutella...)
  select 2,
    'modifier_options.foto_url',
    case when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'modifier_options' and column_name = 'foto_url'
    ) then 'OK' else 'FALTA' end,
    'imagem do adicional na tela do cliente'

  union all

  -- Remoção da seleção de mesa: a coluna não deve mais existir
  select 3,
    'orders.table_id removida',
    case when not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'orders' and column_name = 'table_id'
    ) then 'OK' else 'FALTA' end,
    'pedido identificado só pelo nome do cliente'

  union all

  -- ...e a tabela de mesas também não
  select 4,
    'tabela tables removida',
    case when not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'tables'
    ) then 'OK' else 'FALTA' end,
    'seleção de mesa foi removida do app'

  union all

  -- Realtime do cardápio: edição no Painel reflete na Mesa sem recarregar
  select 5,
    'realtime do cardápio',
    case when (
      select count(*) from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename in ('categories', 'menu_items', 'modifiers', 'modifier_options', 'menu_item_modifiers')
    ) = 5 then 'OK' else 'FALTA' end,
    (select concat(count(*), ' de 5 tabelas publicadas') from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public'
       and tablename in ('categories', 'menu_items', 'modifiers', 'modifier_options', 'menu_item_modifiers'))

  union all

  -- Realtime dos pedidos: o quadro da cozinha depende disso
  select 6,
    'realtime dos pedidos',
    case when (
      select count(*) from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename in ('orders', 'order_items')
    ) = 2 then 'OK' else 'FALTA' end,
    'quadro da cozinha em tempo real'

  union all

  -- Travessões removidos dos nomes de categoria e descrições de produto
  select 7,
    'travessões removidos',
    case when not exists (
      select 1 from categories where nome like '%—%' or nome_i18n::text like '%—%'
    ) and not exists (
      select 1 from menu_items where descricao like '%—%' or descricao_i18n::text like '%—%'
    ) then 'OK' else 'FALTA' end,
    (select concat(
       (select count(*) from categories where nome like '%—%' or nome_i18n::text like '%—%'),
       ' categoria(s) e ',
       (select count(*) from menu_items where descricao like '%—%' or descricao_i18n::text like '%—%'),
       ' produto(s) ainda com travessão'))

) checks
order by ord;
