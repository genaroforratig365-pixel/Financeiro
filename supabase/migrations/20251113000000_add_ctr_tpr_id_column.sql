-- Adiciona relacionamento entre contas de receita e tipos de receita
-- Permite vincular cada conta de receita a um tipo para facilitar classificação e análise.

ALTER TABLE financas.ctr_contas_receita
  ADD COLUMN IF NOT EXISTS ctr_tpr_id bigint REFERENCES financas.tpr_tipos_receita(tpr_id) ON DELETE SET NULL;

COMMENT ON COLUMN financas.ctr_contas_receita.ctr_tpr_id IS 'Tipo de receita associado a esta conta.';

CREATE INDEX IF NOT EXISTS idx_ctr_tpr_id ON financas.ctr_contas_receita(ctr_tpr_id);

NOTIFY pgrst, 'reload schema';
