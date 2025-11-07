-- Estrutura para armazenar previsões semanais importadas do Excel
CREATE TABLE IF NOT EXISTS financas.pvw_previsao_semana (
  psw_id bigserial PRIMARY KEY,
  psw_semana_inicio date NOT NULL,
  psw_data date NOT NULL,
  psw_categoria text NOT NULL,
  psw_tipo text NOT NULL CHECK (psw_tipo IN ('RECEITA', 'DESPESA', 'SALDO')),
  psw_valor numeric(15,2) NOT NULL,
  psw_codigo varchar(50),
  psw_are_id bigint REFERENCES financas.are_areas(are_id) ON DELETE SET NULL,
  psw_ctr_id bigint REFERENCES financas.ctr_contas_receita(ctr_id) ON DELETE SET NULL,
  psw_usr_id uuid NOT NULL REFERENCES financas.usr_usuarios(usr_id) ON DELETE RESTRICT,
  psw_observacao text,
  psw_criado_em timestamptz DEFAULT now(),
  psw_atualizado_em timestamptz DEFAULT now()
);

COMMENT ON TABLE financas.pvw_previsao_semana IS 'Linhas da previsão semanal importadas a partir de planilhas.';
COMMENT ON COLUMN financas.pvw_previsao_semana.psw_semana_inicio IS 'Segunda-feira que representa a semana da previsão.';
COMMENT ON COLUMN financas.pvw_previsao_semana.psw_codigo IS 'Código auxiliar para casar com contas de receita ou áreas.';

CREATE INDEX IF NOT EXISTS idx_pvw_semana_data ON financas.pvw_previsao_semana(psw_semana_inicio, psw_data);
CREATE INDEX IF NOT EXISTS idx_pvw_usr ON financas.pvw_previsao_semana(psw_usr_id);
CREATE INDEX IF NOT EXISTS idx_pvw_tipo ON financas.pvw_previsao_semana(psw_tipo);

CREATE OR REPLACE FUNCTION financas.atualizar_timestamp_pvw()
RETURNS TRIGGER AS $$
BEGIN
  NEW.psw_atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pvw_updated ON financas.pvw_previsao_semana;
CREATE TRIGGER trg_pvw_updated
  BEFORE UPDATE ON financas.pvw_previsao_semana
  FOR EACH ROW
  EXECUTE FUNCTION financas.atualizar_timestamp_pvw();

DROP TRIGGER IF EXISTS trg_pvw_define_usuario ON financas.pvw_previsao_semana;
CREATE TRIGGER trg_pvw_define_usuario
  BEFORE INSERT ON financas.pvw_previsao_semana
  FOR EACH ROW
  EXECUTE FUNCTION financas.definir_usuario_sessao('psw_usr_id');

ALTER TABLE financas.pvw_previsao_semana ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pvw_select ON financas.pvw_previsao_semana;
CREATE POLICY pvw_select
  ON financas.pvw_previsao_semana
  FOR SELECT
  TO anon, authenticated
  USING (financas.current_session_user_id() IS NOT NULL);

DROP POLICY IF EXISTS pvw_write ON financas.pvw_previsao_semana;
CREATE POLICY pvw_write
  ON financas.pvw_previsao_semana
  FOR ALL
  TO anon, authenticated
  USING (financas.current_session_user_id() IS NOT NULL)
  WITH CHECK (financas.current_session_user_id() IS NOT NULL);

GRANT INSERT, UPDATE, DELETE ON financas.pvw_previsao_semana TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE financas.pvw_previsao_semana_psw_id_seq TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
