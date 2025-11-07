-- Adiciona relacionamento direto com banco às cobranças
ALTER TABLE financas.cob_cobrancas
  ADD COLUMN IF NOT EXISTS cob_ban_id bigint REFERENCES financas.ban_bancos(ban_id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_cob_cobrancas_ban_id ON financas.cob_cobrancas(cob_ban_id);

UPDATE financas.cob_cobrancas c
SET cob_ban_id = sub.bcr_ban_id
FROM (
  SELECT bcr_ctr_id, MIN(bcr_ban_id) AS bcr_ban_id
  FROM financas.bcr_banco_conta
  GROUP BY bcr_ctr_id
) sub
WHERE c.cob_ban_id IS NULL
  AND sub.bcr_ctr_id = c.cob_ctr_id;

-- Mantém coluna como obrigatória apenas após tentativa de preenchimento automático
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM financas.cob_cobrancas WHERE cob_ban_id IS NULL
  ) THEN
    RAISE NOTICE 'Existem cobranças sem banco associado. Ajuste manualmente antes de tornar a coluna obrigatória.';
  ELSE
    EXECUTE 'ALTER TABLE financas.cob_cobrancas ALTER COLUMN cob_ban_id SET NOT NULL;';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
