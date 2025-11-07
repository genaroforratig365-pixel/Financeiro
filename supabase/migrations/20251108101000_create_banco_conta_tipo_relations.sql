-- Estruturas auxiliares para relacionar bancos, contas e tipos de receita
CREATE TABLE IF NOT EXISTS financas.bcr_banco_conta (
  bcr_id bigserial PRIMARY KEY,
  bcr_ban_id bigint NOT NULL REFERENCES financas.ban_bancos(ban_id) ON DELETE CASCADE,
  bcr_ctr_id bigint NOT NULL REFERENCES financas.ctr_contas_receita(ctr_id) ON DELETE CASCADE,
  bcr_usr_id uuid NOT NULL REFERENCES financas.usr_usuarios(usr_id) ON DELETE RESTRICT,
  bcr_criado_em timestamptz DEFAULT now(),
  bcr_atualizado_em timestamptz DEFAULT now(),
  CONSTRAINT uq_bcr_banco_conta UNIQUE (bcr_ban_id, bcr_ctr_id)
);

COMMENT ON TABLE financas.bcr_banco_conta IS 'Associação de contas de receita aos bancos para lançamentos de cobrança.';

CREATE INDEX IF NOT EXISTS idx_bcr_ban_id ON financas.bcr_banco_conta(bcr_ban_id);
CREATE INDEX IF NOT EXISTS idx_bcr_ctr_id ON financas.bcr_banco_conta(bcr_ctr_id);

CREATE OR REPLACE FUNCTION financas.atualizar_timestamp_bcr()
RETURNS TRIGGER AS $$
BEGIN
  NEW.bcr_atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bcr_updated ON financas.bcr_banco_conta;
CREATE TRIGGER trg_bcr_updated
  BEFORE UPDATE ON financas.bcr_banco_conta
  FOR EACH ROW
  EXECUTE FUNCTION financas.atualizar_timestamp_bcr();

DROP TRIGGER IF EXISTS trg_bcr_define_usuario ON financas.bcr_banco_conta;
CREATE TRIGGER trg_bcr_define_usuario
  BEFORE INSERT ON financas.bcr_banco_conta
  FOR EACH ROW
  EXECUTE FUNCTION financas.definir_usuario_sessao('bcr_usr_id');

ALTER TABLE financas.bcr_banco_conta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bcr_select ON financas.bcr_banco_conta;
CREATE POLICY bcr_select
  ON financas.bcr_banco_conta
  FOR SELECT
  TO anon, authenticated
  USING (financas.current_session_user_id() IS NOT NULL);

DROP POLICY IF EXISTS bcr_write ON financas.bcr_banco_conta;
CREATE POLICY bcr_write
  ON financas.bcr_banco_conta
  FOR ALL
  TO anon, authenticated
  USING (financas.current_session_user_id() IS NOT NULL)
  WITH CHECK (financas.current_session_user_id() IS NOT NULL);

GRANT INSERT, UPDATE, DELETE ON financas.bcr_banco_conta TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE financas.bcr_banco_conta_bcr_id_seq TO anon, authenticated;

-- Vincula tipos às contas de receita
CREATE TABLE IF NOT EXISTS financas.ctp_conta_tipo_receita (
  ctp_id bigserial PRIMARY KEY,
  ctp_ctr_id bigint NOT NULL REFERENCES financas.ctr_contas_receita(ctr_id) ON DELETE CASCADE,
  ctp_tpr_id bigint NOT NULL REFERENCES financas.tpr_tipos_receita(tpr_id) ON DELETE CASCADE,
  ctp_usr_id uuid NOT NULL REFERENCES financas.usr_usuarios(usr_id) ON DELETE RESTRICT,
  ctp_criado_em timestamptz DEFAULT now(),
  ctp_atualizado_em timestamptz DEFAULT now(),
  CONSTRAINT uq_ctp_conta_tipo UNIQUE (ctp_ctr_id, ctp_tpr_id)
);

COMMENT ON TABLE financas.ctp_conta_tipo_receita IS 'Mapeia quais tipos de receita estão disponíveis para cada conta.';

CREATE INDEX IF NOT EXISTS idx_ctp_ctr_id ON financas.ctp_conta_tipo_receita(ctp_ctr_id);
CREATE INDEX IF NOT EXISTS idx_ctp_tpr_id ON financas.ctp_conta_tipo_receita(ctp_tpr_id);

CREATE OR REPLACE FUNCTION financas.atualizar_timestamp_ctp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.ctp_atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ctp_updated ON financas.ctp_conta_tipo_receita;
CREATE TRIGGER trg_ctp_updated
  BEFORE UPDATE ON financas.ctp_conta_tipo_receita
  FOR EACH ROW
  EXECUTE FUNCTION financas.atualizar_timestamp_ctp();

DROP TRIGGER IF EXISTS trg_ctp_define_usuario ON financas.ctp_conta_tipo_receita;
CREATE TRIGGER trg_ctp_define_usuario
  BEFORE INSERT ON financas.ctp_conta_tipo_receita
  FOR EACH ROW
  EXECUTE FUNCTION financas.definir_usuario_sessao('ctp_usr_id');

ALTER TABLE financas.ctp_conta_tipo_receita ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ctp_select ON financas.ctp_conta_tipo_receita;
CREATE POLICY ctp_select
  ON financas.ctp_conta_tipo_receita
  FOR SELECT
  TO anon, authenticated
  USING (financas.current_session_user_id() IS NOT NULL);

DROP POLICY IF EXISTS ctp_write ON financas.ctp_conta_tipo_receita;
CREATE POLICY ctp_write
  ON financas.ctp_conta_tipo_receita
  FOR ALL
  TO anon, authenticated
  USING (financas.current_session_user_id() IS NOT NULL)
  WITH CHECK (financas.current_session_user_id() IS NOT NULL);

GRANT INSERT, UPDATE, DELETE ON financas.ctp_conta_tipo_receita TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE financas.ctp_conta_tipo_receita_ctp_id_seq TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
