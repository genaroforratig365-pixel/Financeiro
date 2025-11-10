-- ============================================================================
-- TEMPLATE DE IMPORTAÇÃO DE SALDOS DIÁRIOS
-- ============================================================================
--
-- INSTRUÇÕES DE USO:
-- 1. Substitua @USER_ID pelo UUID do usuário (obtenha executando a query abaixo)
-- 2. Preencha as datas e valores nos INSERTs
-- 3. Execute este script no Supabase SQL Editor ou via cliente PostgreSQL
--
-- Para obter o USER_ID do usuário atual:
--    SELECT usr_id FROM financas.usr_usuarios
--    WHERE usr_identificador = 'seu_email@exemplo.com';
--
-- ============================================================================

-- Definir variáveis (substitua os valores)
DO $$
DECLARE
  v_user_id uuid := '@USER_ID'; -- SUBSTITUIR pelo UUID do usuário
  v_data_lancamento date := '2025-11-10'; -- Data dos lançamentos
BEGIN

  -- ============================================================================
  -- 1. PAGAMENTOS POR ÁREA (Gastos por departamento/área)
  -- ============================================================================
  -- Para cada área cadastrada, insira ou atualize o valor do dia

  -- Exemplo: Área "Administrativo" (substitua pelo ID real da área)
  INSERT INTO financas.pag_pagamentos_area (
    pag_usr_id,
    pag_are_id,
    pag_data,
    pag_valor
  ) VALUES (
    v_user_id,
    1, -- ID da área (consulte: SELECT are_id, are_nome FROM financas.are_areas WHERE are_usr_id = v_user_id)
    v_data_lancamento,
    1500.00 -- Valor do pagamento
  )
  ON CONFLICT (pag_usr_id, pag_are_id, pag_data)
  DO UPDATE SET
    pag_valor = EXCLUDED.pag_valor,
    pag_atualizado_em = now();

  -- Exemplo: Área "Operacional"
  INSERT INTO financas.pag_pagamentos_area (
    pag_usr_id, pag_are_id, pag_data, pag_valor
  ) VALUES (
    v_user_id, 2, v_data_lancamento, 2300.00
  )
  ON CONFLICT (pag_usr_id, pag_are_id, pag_data)
  DO UPDATE SET pag_valor = EXCLUDED.pag_valor, pag_atualizado_em = now();


  -- ============================================================================
  -- 2. RECEITAS (Por conta de receita)
  -- ============================================================================
  -- Para cada conta de receita, insira ou atualize o valor do dia

  -- Exemplo: Conta "Boleto" (código 200)
  INSERT INTO financas.rec_receitas (
    rec_usr_id,
    rec_ctr_id,
    rec_data,
    rec_valor
  ) VALUES (
    v_user_id,
    1, -- ID da conta de receita (consulte: SELECT ctr_id, ctr_codigo, ctr_nome FROM financas.ctr_contas_receita WHERE ctr_usr_id = v_user_id)
    v_data_lancamento,
    5000.00 -- Valor da receita
  )
  ON CONFLICT (rec_usr_id, rec_ctr_id, rec_data)
  DO UPDATE SET
    rec_valor = EXCLUDED.rec_valor,
    rec_atualizado_em = now();

  -- Exemplo: Conta "Depósito e PIX" (código 201)
  INSERT INTO financas.rec_receitas (
    rec_usr_id, rec_ctr_id, rec_data, rec_valor
  ) VALUES (
    v_user_id, 2, v_data_lancamento, 3200.00
  )
  ON CONFLICT (rec_usr_id, rec_ctr_id, rec_data)
  DO UPDATE SET rec_valor = EXCLUDED.rec_valor, rec_atualizado_em = now();


  -- ============================================================================
  -- 3. PAGAMENTOS BANCÁRIOS (Saídas por banco)
  -- ============================================================================
  -- Para cada banco, insira ou atualize o valor de pagamento do dia

  -- Exemplo: Banco "Banco do Brasil"
  INSERT INTO financas.pbk_pagamentos_banco (
    pbk_usr_id,
    pbk_ban_id,
    pbk_data,
    pbk_valor
  ) VALUES (
    v_user_id,
    1, -- ID do banco (consulte: SELECT ban_id, ban_nome FROM financas.ban_bancos WHERE ban_usr_id = v_user_id)
    v_data_lancamento,
    1800.00 -- Valor do pagamento
  )
  ON CONFLICT (pbk_usr_id, pbk_ban_id, pbk_data)
  DO UPDATE SET
    pbk_valor = EXCLUDED.pbk_valor,
    pbk_atualizado_em = now();


  -- ============================================================================
  -- 4. SALDOS BANCÁRIOS (Saldo final do dia por banco)
  -- ============================================================================
  -- Para cada banco, insira ou atualize o saldo final do dia

  -- Exemplo: Saldo Banco do Brasil
  INSERT INTO financas.sdb_saldo_banco (
    sdb_usr_id,
    sdb_ban_id,
    sdb_data,
    sdb_saldo
  ) VALUES (
    v_user_id,
    1, -- ID do banco
    v_data_lancamento,
    25300.00 -- Saldo final do dia
  )
  ON CONFLICT (sdb_usr_id, sdb_ban_id, sdb_data)
  DO UPDATE SET
    sdb_saldo = EXCLUDED.sdb_saldo,
    sdb_atualizado_em = now();

  RAISE NOTICE 'Importação concluída com sucesso para a data %', v_data_lancamento;
END $$;


-- ============================================================================
-- QUERIES AUXILIARES PARA CONSULTAR IDS
-- ============================================================================

-- Listar áreas cadastradas (para preencher pag_are_id)
-- SELECT are_id, are_codigo, are_nome FROM financas.are_areas
-- WHERE are_usr_id = '@USER_ID' AND are_ativo = true
-- ORDER BY are_nome;

-- Listar contas de receita (para preencher rec_ctr_id)
-- SELECT ctr_id, ctr_codigo, ctr_nome FROM financas.ctr_contas_receita
-- WHERE ctr_usr_id = '@USER_ID' AND ctr_ativo = true
-- ORDER BY ctr_codigo, ctr_nome;

-- Listar bancos (para preencher pbk_ban_id e sdb_ban_id)
-- SELECT ban_id, ban_codigo, ban_nome FROM financas.ban_bancos
-- WHERE ban_usr_id = '@USER_ID' AND ban_ativo = true
-- ORDER BY ban_nome;

-- ============================================================================
-- VERIFICAR DADOS IMPORTADOS
-- ============================================================================

-- Ver pagamentos por área importados
-- SELECT
--   p.pag_data,
--   a.are_nome,
--   p.pag_valor,
--   p.pag_criado_em
-- FROM financas.pag_pagamentos_area p
-- JOIN financas.are_areas a ON a.are_id = p.pag_are_id
-- WHERE p.pag_usr_id = '@USER_ID'
--   AND p.pag_data = '2025-11-10'
-- ORDER BY a.are_nome;

-- Ver receitas importadas
-- SELECT
--   r.rec_data,
--   c.ctr_codigo,
--   c.ctr_nome,
--   r.rec_valor,
--   r.rec_criado_em
-- FROM financas.rec_receitas r
-- JOIN financas.ctr_contas_receita c ON c.ctr_id = r.rec_ctr_id
-- WHERE r.rec_usr_id = '@USER_ID'
--   AND r.rec_data = '2025-11-10'
-- ORDER BY c.ctr_codigo, c.ctr_nome;

-- Ver pagamentos bancários importados
-- SELECT
--   p.pbk_data,
--   b.ban_nome,
--   p.pbk_valor,
--   p.pbk_criado_em
-- FROM financas.pbk_pagamentos_banco p
-- JOIN financas.ban_bancos b ON b.ban_id = p.pbk_ban_id
-- WHERE p.pbk_usr_id = '@USER_ID'
--   AND p.pbk_data = '2025-11-10'
-- ORDER BY b.ban_nome;

-- Ver saldos bancários importados
-- SELECT
--   s.sdb_data,
--   b.ban_nome,
--   s.sdb_saldo,
--   s.sdb_criado_em
-- FROM financas.sdb_saldo_banco s
-- JOIN financas.ban_bancos b ON b.ban_id = s.sdb_ban_id
-- WHERE s.sdb_usr_id = '@USER_ID'
--   AND s.sdb_data = '2025-11-10'
-- ORDER BY b.ban_nome;
