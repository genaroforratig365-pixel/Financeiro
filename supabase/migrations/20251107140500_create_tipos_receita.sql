-- Cria tabela de tipos de receita utilizados para cobranças
CREATE TABLE IF NOT EXISTS financas.tpr_tipos_receita (
  tpr_id bigserial PRIMARY KEY,
  tpr_codigo varchar(30) NOT NULL UNIQUE,
  tpr_nome varchar(120) NOT NULL,
  tpr_descricao text,
  tpr_ativo boolean DEFAULT true,
  tpr_usr_id uuid NOT NULL REFERENCES financas.usr_usuarios(usr_id) ON DELETE RESTRICT,
  tpr_criado_em timestamptz DEFAULT now(),
  tpr_atualizado_em timestamptz DEFAULT now()
);

COMMENT ON TABLE financas.tpr_tipos_receita IS 'Tipos de receita utilizados para configurações de cobrança.';
COMMENT ON COLUMN financas.tpr_tipos_receita.tpr_codigo IS 'Código de referência amigável.';
COMMENT ON COLUMN financas.tpr_tipos_receita.tpr_nome IS 'Nome do tipo de receita.';
COMMENT ON COLUMN financas.tpr_tipos_receita.tpr_ativo IS 'Indica se o registro está ativo para seleção.';

CREATE INDEX IF NOT EXISTS idx_tpr_codigo ON financas.tpr_tipos_receita(tpr_codigo);
CREATE INDEX IF NOT EXISTS idx_tpr_ativo ON financas.tpr_tipos_receita(tpr_ativo) WHERE tpr_ativo = true;
CREATE INDEX IF NOT EXISTS idx_tpr_usr_id ON financas.tpr_tipos_receita(tpr_usr_id);
CREATE INDEX IF NOT EXISTS idx_tpr_nome ON financas.tpr_tipos_receita(tpr_nome);

CREATE OR REPLACE FUNCTION financas.atualizar_timestamp_tipos_receita()
RETURNS TRIGGER AS $$
BEGIN
  NEW.tpr_atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tpr_tipos_receita_updated ON financas.tpr_tipos_receita;
CREATE TRIGGER trg_tpr_tipos_receita_updated
  BEFORE UPDATE ON financas.tpr_tipos_receita
  FOR EACH ROW
  EXECUTE FUNCTION financas.atualizar_timestamp_tipos_receita();

ALTER TABLE financas.tpr_tipos_receita ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS usuarios_leem_tipos_receita ON financas.tpr_tipos_receita;
CREATE POLICY usuarios_leem_tipos_receita
  ON financas.tpr_tipos_receita
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS usuarios_criam_tipos_receita ON financas.tpr_tipos_receita;
CREATE POLICY usuarios_criam_tipos_receita
  ON financas.tpr_tipos_receita
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    tpr_usr_id = (
      SELECT usr_id FROM financas.usr_usuarios
      WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
    )
  );

DROP POLICY IF EXISTS usuarios_atualizam_tipos_receita ON financas.tpr_tipos_receita;
CREATE POLICY usuarios_atualizam_tipos_receita
  ON financas.tpr_tipos_receita
  FOR UPDATE
  TO anon, authenticated
  USING (
    tpr_usr_id = (
      SELECT usr_id FROM financas.usr_usuarios
      WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
    )
  )
  WITH CHECK (
    tpr_usr_id = (
      SELECT usr_id FROM financas.usr_usuarios
      WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
    )
  );

DROP POLICY IF EXISTS usuarios_deletam_tipos_receita ON financas.tpr_tipos_receita;
CREATE POLICY usuarios_deletam_tipos_receita
  ON financas.tpr_tipos_receita
  FOR DELETE
  TO anon, authenticated
  USING (
    tpr_usr_id = (
      SELECT usr_id FROM financas.usr_usuarios
      WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
    )
  );

NOTIFY pgrst, 'reload schema';
