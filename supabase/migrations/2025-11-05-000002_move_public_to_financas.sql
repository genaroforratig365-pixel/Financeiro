-- Bootstrap do domínio
create schema if not exists financas;

-- Move a SEQUENCE do bigserial (se existir no public)
do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'S' and c.relname = 'teste_ci_id_seq' and n.nspname = 'public'
  ) then
    execute 'alter sequence public.teste_ci_id_seq set schema financas';
  end if;
end$$;

-- Move a TABELA (se existir no public)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'teste_ci'
  ) then
    execute 'alter table public.teste_ci set schema financas';
  end if;
end$$;

-- Garante o DEFAULT do id apontando para a sequence no novo schema
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'financas' and table_name = 'teste_ci' and column_name = 'id'
  ) then
    execute $$alter table financas.teste_ci
             alter column id set default nextval('financas.teste_ci_id_seq'::regclass)$$;
  end if;
end$$;
