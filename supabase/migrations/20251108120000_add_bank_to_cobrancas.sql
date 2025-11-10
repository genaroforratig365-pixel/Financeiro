-- Adiciona vínculo com banco aos lançamentos de cobrança
ALTER TABLE IF EXISTS financas.cob_cobrancas
ADD COLUMN IF NOT EXISTS cob_ban_id bigint;

COMMENT ON COLUMN financas.cob_cobrancas.cob_ban_id IS 'Identificador do banco relacionado ao lançamento de cobrança.';

DO $$
BEGIN
  ALTER TABLE financas.cob_cobrancas
    ADD CONSTRAINT cob_cobrancas_ban_id_fkey
    FOREIGN KEY (cob_ban_id)
    REFERENCES financas.ban_bancos(ban_id)
    ON DELETE RESTRICT;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END$$;

CREATE INDEX IF NOT EXISTS idx_cob_cobrancas_ban_id ON financas.cob_cobrancas(cob_ban_id);

NOTIFY pgrst, 'reload schema';
