-- Cria tabela de lançamentos de cobrança por conta de receita
CREATE TABLE IF NOT EXISTS financas.cob_cobrancas (
  cob_id bigserial PRIMARY KEY,
  cob_ctr_id bigint NOT NULL REFERENCES financas.ctr_contas_receita(ctr_id) ON DELETE RESTRICT,
  cob_tpr_id bigint NOT NULL REFERENCES financas.tpr_tipos_receita(tpr_id) ON DELETE RESTRICT,
  cob_usr_id uuid NOT NULL REFERENCES financas.usr_usuarios(usr_id) ON DELETE RESTRICT,
  cob_data date NOT NULL,
  cob_valor numeric(15,2) NOT NULL CHECK (cob_valor >= 0),
  cob_observacao text,
  cob_criado_em timestamptz DEFAULT now(),
  cob_atualizado_em timestamptz DEFAULT now()
);

COMMENT ON TABLE financas.cob_cobrancas IS 'Lançamentos de cobrança por conta de receita e tipo de receita.';
COMMENT ON COLUMN financas.cob_cobrancas.cob_data IS 'Data prevista ou realizada da cobrança.';
COMMENT ON COLUMN financas.cob_cobrancas.cob_valor IS 'Valor monetário da cobrança.';

CREATE INDEX IF NOT EXISTS idx_cob_cobrancas_ctr_id ON financas.cob_cobrancas(cob_ctr_id);
CREATE INDEX IF NOT EXISTS idx_cob_cobrancas_tpr_id ON financas.cob_cobrancas(cob_tpr_id);
CREATE INDEX IF NOT EXISTS idx_cob_cobrancas_usr_id ON financas.cob_cobrancas(cob_usr_id);
CREATE INDEX IF NOT EXISTS idx_cob_cobrancas_data ON financas.cob_cobrancas(cob_data);

CREATE OR REPLACE FUNCTION financas.atualizar_timestamp_cobrancas()
RETURNS TRIGGER AS $$
BEGIN
  NEW.cob_atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cob_cobrancas_updated ON financas.cob_cobrancas;
CREATE TRIGGER trg_cob_cobrancas_updated
  BEFORE UPDATE ON financas.cob_cobrancas
  FOR EACH ROW
  EXECUTE FUNCTION financas.atualizar_timestamp_cobrancas();

ALTER TABLE financas.cob_cobrancas ENABLE ROW LEVEL SECURITY;

CREATE POLICY cob_cobrancas_select
  ON financas.cob_cobrancas
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY cob_cobrancas_insert
  ON financas.cob_cobrancas
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    cob_usr_id = (
      SELECT usr_id
      FROM financas.usr_usuarios
      WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
    )
  );

CREATE POLICY cob_cobrancas_update
  ON financas.cob_cobrancas
  FOR UPDATE
  TO anon, authenticated
  USING (
    cob_usr_id = (
      SELECT usr_id
      FROM financas.usr_usuarios
      WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
    )
  )
  WITH CHECK (
    cob_usr_id = (
      SELECT usr_id
      FROM financas.usr_usuarios
      WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
    )
  );

CREATE POLICY cob_cobrancas_delete
  ON financas.cob_cobrancas
  FOR DELETE
  TO anon, authenticated
  USING (
    cob_usr_id = (
      SELECT usr_id
      FROM financas.usr_usuarios
      WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
    )
  );

GRANT INSERT, UPDATE, DELETE ON financas.cob_cobrancas TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE financas.cob_cobrancas_cob_id_seq TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
