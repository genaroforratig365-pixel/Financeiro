-- Concede privilégios de escrita para tabelas de cadastros acessadas pelo front
-- e garante uso das sequências necessárias para inserções.

do $$
declare
  alvo text;
  tabelas constant text[] := array['are_areas', 'ctr_contas_receita', 'ban_bancos'];
begin
  foreach alvo in array tabelas loop
    if exists (
      select 1
      from information_schema.tables
      where table_schema = 'financas' and table_name = alvo
    ) then
      execute format(
        'grant insert, update on financas.%I to anon, authenticated;',
        alvo
      );
    end if;
  end loop;
end $$;

-- Sequências geradas automaticamente pelas tabelas acima (bigserial)
do $$
declare
  alvo text;
  sequencias constant text[] := array[
    'are_areas_are_id_seq',
    'ctr_contas_receita_ctr_id_seq',
    'ban_bancos_ban_id_seq'
  ];
begin
  foreach alvo in array sequencias loop
    if exists (
      select 1
      from information_schema.sequences
      where sequence_schema = 'financas' and sequence_name = alvo
    ) then
      execute format(
        'grant usage, select on sequence financas.%I to anon, authenticated;',
        alvo
      );
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
