-- garante o schema de negócio
create schema if not exists financas;

-- view no PUBLIC apontando para o dominio financas
do $$
begin
  if not exists (
    select 1 from pg_views where schemaname='public' and viewname='v_teste_ci'
  ) then
    create view public.v_teste_ci as
      select * from financas.teste_ci;
  end if;
end$$;

-- RLS na tabela de origem (se ainda não estiver ativo)
alter table financas.teste_ci enable row level security;

-- política de leitura para a role anon (front sem login). Remova/ajuste depois.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='financas' and tablename='teste_ci' and policyname='read_anon_teste_ci'
  ) then
    create policy "read_anon_teste_ci"
    on financas.teste_ci
    for select
    to anon
    using (true);
  end if;
end$$;
