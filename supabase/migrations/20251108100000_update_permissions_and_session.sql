-- Ajusta helpers de sessão e políticas para habilitar lançamentos por qualquer operador selecionado
CREATE OR REPLACE FUNCTION financas.current_request_headers()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_headers text;
BEGIN
  BEGIN
    v_headers := current_setting('request.headers', true);
  EXCEPTION
    WHEN others THEN
      RETURN '{}'::jsonb;
  END;

  IF v_headers IS NULL OR trim(v_headers) = '' THEN
    RETURN '{}'::jsonb;
  END IF;

  RETURN v_headers::jsonb;
END;
$$;

CREATE OR REPLACE FUNCTION financas.current_session_identificador()
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_headers jsonb := financas.current_request_headers();
  v_ident text;
BEGIN
  v_ident := nullif(trim(both from coalesce(v_headers->>'x-user-id', '')), '');
  RETURN v_ident;
END;
$$;

CREATE OR REPLACE FUNCTION financas.current_session_user_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_ident text := financas.current_session_identificador();
  v_usr_id uuid;
BEGIN
  IF v_ident IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT usr_id
    INTO v_usr_id
  FROM financas.usr_usuarios
  WHERE usr_identificador = v_ident
    AND coalesce(usr_ativo, true)
  ORDER BY usr_criado_em DESC
  LIMIT 1;

  RETURN v_usr_id;
END;
$$;

CREATE OR REPLACE FUNCTION financas.assert_session_user()
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_usr_id uuid := financas.current_session_user_id();
BEGIN
  IF v_usr_id IS NULL THEN
    RAISE EXCEPTION 'Operador não identificado. Selecione um usuário antes de lançar dados.'
      USING ERRCODE = '42501';
  END IF;
  RETURN v_usr_id;
END;
$$;

CREATE OR REPLACE FUNCTION financas.definir_usuario_sessao()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_coluna text := TG_ARGV[0];
  v_usr_id uuid := financas.assert_session_user();
BEGIN
  IF v_coluna IS NULL THEN
    RAISE EXCEPTION 'A função financas.definir_usuario_sessao exige a coluna alvo como argumento.'
      USING ERRCODE = '39P18';
  END IF;

  NEW := jsonb_populate_record(NEW, jsonb_build_object(v_coluna, v_usr_id));
  RETURN NEW;
END;
$$;

-- Atualiza triggers para garantir atribuição automática do usuário
DO $$
DECLARE
  alvo record;
BEGIN
  FOR alvo IN
    SELECT schemaname,
           tablename,
           columnname,
           trigger_name
    FROM (
      VALUES
        ('financas', 'pag_pagamentos_area', 'pag_usr_id', 'trg_pag_define_usuario'),
        ('financas', 'rec_receitas', 'rec_usr_id', 'trg_rec_define_usuario'),
        ('financas', 'pbk_pagamentos_banco', 'pbk_usr_id', 'trg_pbk_define_usuario'),
        ('financas', 'sdb_saldo_banco', 'sdb_usr_id', 'trg_sdb_define_usuario'),
        ('financas', 'cob_cobrancas', 'cob_usr_id', 'trg_cob_define_usuario')
    ) AS cfg(schemaname, tablename, columnname, trigger_name)
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I.%I;', alvo.trigger_name, alvo.schemaname, alvo.tablename);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT ON %I.%I FOR EACH ROW EXECUTE FUNCTION financas.definir_usuario_sessao(%L);',
      alvo.trigger_name,
      alvo.schemaname,
      alvo.tablename,
      alvo.columnname
    );
  END LOOP;
END $$;

-- Remove políticas permissivas antigas e cria novas baseadas na sessão
DO $$
DECLARE
  alvo record;
BEGIN
  FOR alvo IN
    SELECT tablename
    FROM (
      VALUES
        ('pag_pagamentos_area'),
        ('rec_receitas'),
        ('pbk_pagamentos_banco'),
        ('sdb_saldo_banco'),
        ('cob_cobrancas')
    ) AS t(tablename)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS acesso_total_%I ON financas.%I;', alvo.tablename, alvo.tablename);
    EXECUTE format('DROP POLICY IF EXISTS usuarios_full_access_%I ON financas.%I;', alvo.tablename, alvo.tablename);
  END LOOP;
END $$;

CREATE POLICY pag_pagamentos_area_select
  ON financas.pag_pagamentos_area
  FOR SELECT
  TO anon, authenticated
  USING (financas.current_session_user_id() IS NOT NULL);

CREATE POLICY pag_pagamentos_area_write
  ON financas.pag_pagamentos_area
  FOR ALL
  TO anon, authenticated
  USING (financas.current_session_user_id() IS NOT NULL)
  WITH CHECK (financas.current_session_user_id() IS NOT NULL);

CREATE POLICY rec_receitas_select
  ON financas.rec_receitas
  FOR SELECT
  TO anon, authenticated
  USING (financas.current_session_user_id() IS NOT NULL);

CREATE POLICY rec_receitas_write
  ON financas.rec_receitas
  FOR ALL
  TO anon, authenticated
  USING (financas.current_session_user_id() IS NOT NULL)
  WITH CHECK (financas.current_session_user_id() IS NOT NULL);

CREATE POLICY pbk_pagamentos_banco_select
  ON financas.pbk_pagamentos_banco
  FOR SELECT
  TO anon, authenticated
  USING (financas.current_session_user_id() IS NOT NULL);

CREATE POLICY pbk_pagamentos_banco_write
  ON financas.pbk_pagamentos_banco
  FOR ALL
  TO anon, authenticated
  USING (financas.current_session_user_id() IS NOT NULL)
  WITH CHECK (financas.current_session_user_id() IS NOT NULL);

CREATE POLICY sdb_saldo_banco_select
  ON financas.sdb_saldo_banco
  FOR SELECT
  TO anon, authenticated
  USING (financas.current_session_user_id() IS NOT NULL);

CREATE POLICY sdb_saldo_banco_write
  ON financas.sdb_saldo_banco
  FOR ALL
  TO anon, authenticated
  USING (financas.current_session_user_id() IS NOT NULL)
  WITH CHECK (financas.current_session_user_id() IS NOT NULL);

CREATE POLICY cob_cobrancas_select
  ON financas.cob_cobrancas
  FOR SELECT
  TO anon, authenticated
  USING (financas.current_session_user_id() IS NOT NULL);

CREATE POLICY cob_cobrancas_write
  ON financas.cob_cobrancas
  FOR ALL
  TO anon, authenticated
  USING (financas.current_session_user_id() IS NOT NULL)
  WITH CHECK (financas.current_session_user_id() IS NOT NULL);

NOTIFY pgrst, 'reload schema';
