-- Remove coluna de descrição do saldo diário, conforme solicitado
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'financas'
      AND table_name = 'sdb_saldo_banco'
      AND column_name = 'sdb_descricao'
  ) THEN
    ALTER TABLE financas.sdb_saldo_banco
      DROP COLUMN sdb_descricao;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
