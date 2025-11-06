-- ============================================================================
-- MIGRATION: Garantir privilégios de escrita para usr_usuarios
-- Data: 2025-11-07
-- Descrição: Concede INSERT/UPDATE para as roles públicas utilizadas
--            pelo PostgREST (anon/autenticated), desbloqueando o cadastro
--            de usuários via aplicativo sem autenticação tradicional.
-- ============================================================================

create schema if not exists financas;

-- Concede INSERT/UPDATE somente se a tabela existir
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'financas'
      AND table_name = 'usr_usuarios'
  ) THEN
    EXECUTE 'GRANT INSERT, UPDATE ON financas.usr_usuarios TO anon, authenticated;';
  END IF;
END
$$;

-- Opcionalmente mantenha o privilégio para novas colunas inseridas futuramente
ALTER DEFAULT PRIVILEGES IN SCHEMA financas
  GRANT INSERT, UPDATE ON TABLES TO anon, authenticated;

-- Recarrega o cache do PostgREST após alterar os privilégios
NOTIFY pgrst, 'reload schema';
