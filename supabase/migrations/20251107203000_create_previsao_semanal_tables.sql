-- Cria estruturas para controle de previsão semanal importada de planilhas

CREATE TABLE IF NOT EXISTS financas.pvs_semanas (
  pvs_id bigserial PRIMARY KEY,
  pvs_usr_id uuid NOT NULL REFERENCES financas.usr_usuarios(usr_id) ON DELETE CASCADE,
  pvs_semana_inicio date NOT NULL,
  pvs_semana_fim date NOT NULL,
  pvs_status text NOT NULL DEFAULT 'rascunho' CHECK (pvs_status IN ('rascunho', 'importado', 'confirmado')),
  pvs_observacao text,
  pvs_criado_em timestamptz DEFAULT now(),
  pvs_atualizado_em timestamptz DEFAULT now(),
  CONSTRAINT uq_pvs_semana UNIQUE (pvs_usr_id, pvs_semana_inicio)
);

COMMENT ON TABLE financas.pvs_semanas IS 'Cabeçalho das previsões semanais importadas.';
COMMENT ON COLUMN financas.pvs_semanas.pvs_semana_inicio IS 'Data da segunda-feira da semana.';
COMMENT ON COLUMN financas.pvs_semanas.pvs_semana_fim IS 'Data da sexta-feira da semana.';
COMMENT ON COLUMN financas.pvs_semanas.pvs_status IS 'Status do processamento da semana (rascunho/importado/confirmado).';

CREATE INDEX IF NOT EXISTS idx_pvs_usr_id ON financas.pvs_semanas(pvs_usr_id);
CREATE INDEX IF NOT EXISTS idx_pvs_semana ON financas.pvs_semanas(pvs_semana_inicio, pvs_semana_fim);

CREATE OR REPLACE FUNCTION financas.atualizar_timestamp_pvs()
RETURNS TRIGGER AS $$
BEGIN
  NEW.pvs_atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pvs_semanas_updated ON financas.pvs_semanas;
CREATE TRIGGER trg_pvs_semanas_updated
  BEFORE UPDATE ON financas.pvs_semanas
  FOR EACH ROW
  EXECUTE FUNCTION financas.atualizar_timestamp_pvs();

CREATE TABLE IF NOT EXISTS financas.pvi_previsao_itens (
  pvi_id bigserial PRIMARY KEY,
  pvi_pvs_id bigint NOT NULL REFERENCES financas.pvs_semanas(pvs_id) ON DELETE CASCADE,
  pvi_usr_id uuid NOT NULL REFERENCES financas.usr_usuarios(usr_id) ON DELETE CASCADE,
  pvi_data date NOT NULL,
  pvi_tipo text NOT NULL CHECK (pvi_tipo IN ('receita', 'gasto', 'saldo_inicial', 'saldo_diario', 'saldo_acumulado')),
  pvi_categoria text NOT NULL,
  pvi_are_id bigint REFERENCES financas.are_areas(are_id) ON DELETE SET NULL,
  pvi_ctr_id bigint REFERENCES financas.ctr_contas_receita(ctr_id) ON DELETE SET NULL,
  pvi_tpr_id bigint REFERENCES financas.tpr_tipos_receita(tpr_id) ON DELETE SET NULL,
  pvi_ban_id bigint REFERENCES financas.ban_bancos(ban_id) ON DELETE SET NULL,
  pvi_valor numeric(15,2) NOT NULL,
  pvi_ordem integer,
  pvi_importado boolean DEFAULT true,
  pvi_observacao text,
  pvi_criado_em timestamptz DEFAULT now(),
  pvi_atualizado_em timestamptz DEFAULT now()
);

COMMENT ON TABLE financas.pvi_previsao_itens IS 'Itens diários da previsão semanal (receitas, gastos e saldos).';
COMMENT ON COLUMN financas.pvi_previsao_itens.pvi_tipo IS 'Classificação do item: receita, gasto ou variações de saldo.';
COMMENT ON COLUMN financas.pvi_previsao_itens.pvi_categoria IS 'Descrição original da linha importada.';

CREATE INDEX IF NOT EXISTS idx_pvi_pvs_id ON financas.pvi_previsao_itens(pvi_pvs_id);
CREATE INDEX IF NOT EXISTS idx_pvi_data ON financas.pvi_previsao_itens(pvi_data);
CREATE INDEX IF NOT EXISTS idx_pvi_tipo ON financas.pvi_previsao_itens(pvi_tipo);
CREATE INDEX IF NOT EXISTS idx_pvi_usr_id ON financas.pvi_previsao_itens(pvi_usr_id);

CREATE OR REPLACE FUNCTION financas.atualizar_timestamp_pvi()
RETURNS TRIGGER AS $$
BEGIN
  NEW.pvi_atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pvi_previsao_itens_updated ON financas.pvi_previsao_itens;
CREATE TRIGGER trg_pvi_previsao_itens_updated
  BEFORE UPDATE ON financas.pvi_previsao_itens
  FOR EACH ROW
  EXECUTE FUNCTION financas.atualizar_timestamp_pvi();

ALTER TABLE financas.pvs_semanas ENABLE ROW LEVEL SECURITY;
ALTER TABLE financas.pvi_previsao_itens ENABLE ROW LEVEL SECURITY;

-- Políticas permissivas com validação por usr_id
CREATE POLICY pvs_select
  ON financas.pvs_semanas
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY pvs_upsert
  ON financas.pvs_semanas
  FOR ALL
  TO anon, authenticated
  USING (pvs_usr_id = (
    SELECT usr_id
    FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ))
  WITH CHECK (pvs_usr_id = (
    SELECT usr_id
    FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

CREATE POLICY pvi_select
  ON financas.pvi_previsao_itens
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY pvi_upsert
  ON financas.pvi_previsao_itens
  FOR ALL
  TO anon, authenticated
  USING (pvi_usr_id = (
    SELECT usr_id
    FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ))
  WITH CHECK (pvi_usr_id = (
    SELECT usr_id
    FROM financas.usr_usuarios
    WHERE usr_identificador = current_setting('request.headers', true)::json->>'x-user-id'
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON financas.pvs_semanas TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON financas.pvi_previsao_itens TO anon, authenticated;

GRANT USAGE, SELECT ON SEQUENCE financas.pvs_semanas_pvs_id_seq TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE financas.pvi_previsao_itens_pvi_id_seq TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
