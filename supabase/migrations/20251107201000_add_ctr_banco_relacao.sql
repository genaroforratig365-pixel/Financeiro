-- Adiciona relacionamento entre contas de receita e bancos
-- Permite vincular cada conta de receita a um banco para facilitar lançamentos por instituição.

ALTER TABLE financas.ctr_contas_receita
  ADD COLUMN IF NOT EXISTS ctr_ban_id bigint REFERENCES financas.ban_bancos(ban_id) ON DELETE SET NULL;

COMMENT ON COLUMN financas.ctr_contas_receita.ctr_ban_id IS 'Banco associado para recebimento.';

CREATE INDEX IF NOT EXISTS idx_ctr_ban_id ON financas.ctr_contas_receita(ctr_ban_id);

NOTIFY pgrst, 'reload schema';
