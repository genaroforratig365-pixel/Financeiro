-- Garante acesso compartilhado entre todos os operadores às tabelas operacionais
DO $$
DECLARE
  alvo record;
  pol record;
BEGIN
  FOR alvo IN
    SELECT unnest(ARRAY[
      'usr_usuarios',
      'are_areas',
      'ctr_contas_receita',
      'ban_bancos',
      'pag_pagamentos_area',
      'rec_receitas',
      'pbk_pagamentos_banco',
      'sdb_saldo_banco',
      'tpr_tipos_receita'
    ]) AS tabela
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'financas'
        AND table_name = alvo.tabela
    ) THEN
      EXECUTE format('alter table financas.%I enable row level security;', alvo.tabela);
      FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'financas'
          AND tablename = alvo.tabela
      LOOP
        EXECUTE format('drop policy if exists %I on financas.%I;', pol.policyname, alvo.tabela);
      END LOOP;
      EXECUTE format(
        'create policy %I on financas.%I for all to anon, authenticated using (true) with check (true);',
        'acesso_total_' || alvo.tabela,
        alvo.tabela
      );
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
