-- Concede privilégios de escrita para tabelas operacionais acessadas pelo frontend
-- Inclui sequências necessárias para inserções.

DO $$
DECLARE
  alvo text;
  tabelas CONSTANT text[] := ARRAY[
    'pag_pagamentos_area',
    'rec_receitas',
    'pbk_pagamentos_banco',
    'sdb_saldo_banco',
    'cob_cobrancas'
  ];
BEGIN
  FOREACH alvo IN ARRAY tabelas LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'financas'
        AND table_name = alvo
    ) THEN
      EXECUTE format(
        'GRANT INSERT, UPDATE, DELETE ON financas.%I TO anon, authenticated;',
        alvo
      );
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  alvo text;
  sequencias CONSTANT text[] := ARRAY[
    'pag_pagamentos_area_pag_id_seq',
    'rec_receitas_rec_id_seq',
    'pbk_pagamentos_banco_pbk_id_seq',
    'sdb_saldo_banco_sdb_id_seq',
    'cob_cobrancas_cob_id_seq'
  ];
BEGIN
  FOREACH alvo IN ARRAY sequencias LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.sequences
      WHERE sequence_schema = 'financas'
        AND sequence_name = alvo
    ) THEN
      EXECUTE format(
        'GRANT USAGE, SELECT ON SEQUENCE financas.%I TO anon, authenticated;',
        alvo
      );
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
