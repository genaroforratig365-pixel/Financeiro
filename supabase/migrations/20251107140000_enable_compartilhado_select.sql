-- Permite leitura compartilhada entre usuários em tabelas operacionais
DO $$
DECLARE
  alvo record;
  politicas CONSTANT jsonb := jsonb_build_object(
    'are_areas', 'usuarios_leem_areas_compartilhadas',
    'ctr_contas_receita', 'usuarios_leem_contas_compartilhadas',
    'ban_bancos', 'usuarios_leem_bancos_compartilhados',
    'pag_pagamentos_area', 'usuarios_leem_pagamentos_area_compartilhados',
    'rec_receitas', 'usuarios_leem_receitas_compartilhadas',
    'pbk_pagamentos_banco', 'usuarios_leem_pagamentos_banco_compartilhados',
    'sdb_saldo_banco', 'usuarios_leem_saldos_compartilhados'
  );
BEGIN
  FOR alvo IN SELECT key AS tabela, value AS politica FROM jsonb_each_text(politicas) LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'financas'
        AND table_name = alvo.tabela
    ) THEN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'financas'
          AND tablename = alvo.tabela
          AND policyname = alvo.politica
      ) THEN
        EXECUTE format(
          'create policy %I on financas.%I for select to anon, authenticated using (true);',
          alvo.politica,
          alvo.tabela
        );
      END IF;
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
