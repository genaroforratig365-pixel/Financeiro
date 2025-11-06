-- MIGRATION SAFE: só habilita RLS / cria policy se a tabela existir

-- grants base do schema (não quebra se já existir)
create schema if not exists financas;
grant usage on schema financas to anon, authenticated;
grant select on all tables in schema financas to anon, authenticated;

-- MOVIMENTACOES (ajuste se sua tabela tiver outro nome)
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'financas' and table_name = 'movimentacoes'
  ) then
    alter table financas.movimentacoes enable row level security;
    drop policy if exists public_read_movimentacoes on financas.movimentacoes;
    create policy public_read_movimentacoes
      on financas.movimentacoes
      for select to anon, authenticated
      using (true);
  end if;
end $$;

-- OUTRAS TABELAS (copie o bloco e troque o nome):
/*
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='financas' and table_name='usr_usuarios') then
    alter table financas.usr_usuarios enable row level security;
    drop policy if exists public_read_usr_usuarios on financas.usr_usuarios;
    create policy public_read_usr_usuarios
      on financas.usr_usuarios for select to anon, authenticated using (true);
  end if;
end $$;
*/

-- Recarrega o cache do PostgREST
notify pgrst, 'reload schema';
