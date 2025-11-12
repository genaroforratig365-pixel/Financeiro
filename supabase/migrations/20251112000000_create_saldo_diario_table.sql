-- ============================================================================
-- MIGRATION: Criar tabela de saldo diário (snapshots)
-- Data: 2025-11-12
-- Descrição: Tabela sdd_saldo_diario para armazenar saldos inicial e final
--            da movimentação diária realizada (valores reais, não previstos)
-- ============================================================================

-- ============================================================================
-- TABELA: sdd_saldo_diario (Saldo Diário)
-- ============================================================================

CREATE TABLE IF NOT EXISTS financas.sdd_saldo_diario (
  sdd_id bigserial PRIMARY KEY,
  sdd_data date NOT NULL,
  sdd_saldo_inicial numeric(15,2) NOT NULL DEFAULT 0,
  sdd_saldo_final numeric(15,2) NOT NULL DEFAULT 0,
  sdd_descricao text,
  sdd_observacao text,
  sdd_usr_id uuid NOT NULL REFERENCES financas.usr_usuarios(usr_id) ON DELETE RESTRICT,
  sdd_criado_em timestamptz DEFAULT now(),
  sdd_atualizado_em timestamptz DEFAULT now(),

  -- Constraint para garantir um único registro por dia
  CONSTRAINT uq_sdd_data UNIQUE(sdd_data)
);

-- Comentários
COMMENT ON TABLE financas.sdd_saldo_diario IS 'Snapshots de saldo inicial e final da movimentação diária realizada';
COMMENT ON COLUMN financas.sdd_saldo_diario.sdd_id IS 'ID único do registro';
COMMENT ON COLUMN financas.sdd_saldo_diario.sdd_data IS 'Data de referência do saldo';
COMMENT ON COLUMN financas.sdd_saldo_diario.sdd_saldo_inicial IS 'Saldo inicial do dia (pode ser negativo)';
COMMENT ON COLUMN financas.sdd_saldo_diario.sdd_saldo_final IS 'Saldo final do dia (pode ser negativo)';
COMMENT ON COLUMN financas.sdd_saldo_diario.sdd_descricao IS 'Descrição ou contexto do saldo';
COMMENT ON COLUMN financas.sdd_saldo_diario.sdd_observacao IS 'Observações adicionais sobre a movimentação';
COMMENT ON COLUMN financas.sdd_saldo_diario.sdd_usr_id IS 'Usuário que registrou o saldo';
COMMENT ON COLUMN financas.sdd_saldo_diario.sdd_criado_em IS 'Data/hora de criação do registro';
COMMENT ON COLUMN financas.sdd_saldo_diario.sdd_atualizado_em IS 'Data/hora da última atualização';

-- Índices
CREATE INDEX IF NOT EXISTS idx_sdd_data ON financas.sdd_saldo_diario(sdd_data DESC);
CREATE INDEX IF NOT EXISTS idx_sdd_usr_id ON financas.sdd_saldo_diario(sdd_usr_id);

-- Trigger para atualizar timestamp
CREATE OR REPLACE FUNCTION financas.atualizar_timestamp_saldo_diario()
RETURNS TRIGGER AS $$
BEGIN
  NEW.sdd_atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sdd_updated ON financas.sdd_saldo_diario;
CREATE TRIGGER trg_sdd_updated
  BEFORE UPDATE ON financas.sdd_saldo_diario
  FOR EACH ROW
  EXECUTE FUNCTION financas.atualizar_timestamp_saldo_diario();

-- RLS (Row Level Security)
ALTER TABLE financas.sdd_saldo_diario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuarios_veem_seus_saldos_diarios"
  ON financas.sdd_saldo_diario FOR SELECT
  TO anon, authenticated
  USING (sdd_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

CREATE POLICY "usuarios_criam_saldos_diarios"
  ON financas.sdd_saldo_diario FOR INSERT
  TO anon, authenticated
  WITH CHECK (sdd_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

CREATE POLICY "usuarios_atualizam_seus_saldos_diarios"
  ON financas.sdd_saldo_diario FOR UPDATE
  TO anon, authenticated
  USING (sdd_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ))
  WITH CHECK (sdd_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

CREATE POLICY "usuarios_deletam_seus_saldos_diarios"
  ON financas.sdd_saldo_diario FOR DELETE
  TO anon, authenticated
  USING (sdd_usr_id = (
    SELECT usr_id FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

-- ============================================================================
-- FUNÇÕES AUXILIARES
-- ============================================================================

-- Função para obter saldo inicial de uma data específica
CREATE OR REPLACE FUNCTION financas.obter_saldo_inicial(
  p_data date DEFAULT CURRENT_DATE
)
RETURNS numeric AS $$
DECLARE
  v_saldo_inicial numeric;
BEGIN
  SELECT sdd_saldo_inicial INTO v_saldo_inicial
  FROM financas.sdd_saldo_diario
  WHERE sdd_data = p_data;

  RETURN COALESCE(v_saldo_inicial, 0);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION financas.obter_saldo_inicial IS 'Retorna o saldo inicial registrado para uma data específica';

-- Função para obter saldo final de uma data específica
CREATE OR REPLACE FUNCTION financas.obter_saldo_final(
  p_data date DEFAULT CURRENT_DATE
)
RETURNS numeric AS $$
DECLARE
  v_saldo_final numeric;
BEGIN
  SELECT sdd_saldo_final INTO v_saldo_final
  FROM financas.sdd_saldo_diario
  WHERE sdd_data = p_data;

  RETURN COALESCE(v_saldo_final, 0);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION financas.obter_saldo_final IS 'Retorna o saldo final registrado para uma data específica';

-- Função para calcular resultado do dia (saldo final - saldo inicial)
CREATE OR REPLACE FUNCTION financas.calcular_resultado_dia(
  p_data date DEFAULT CURRENT_DATE
)
RETURNS numeric AS $$
DECLARE
  v_saldo_inicial numeric;
  v_saldo_final numeric;
BEGIN
  SELECT sdd_saldo_inicial, sdd_saldo_final INTO v_saldo_inicial, v_saldo_final
  FROM financas.sdd_saldo_diario
  WHERE sdd_data = p_data;

  RETURN COALESCE(v_saldo_final, 0) - COALESCE(v_saldo_inicial, 0);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION financas.calcular_resultado_dia IS 'Calcula o resultado do dia (variação entre saldo final e inicial)';
