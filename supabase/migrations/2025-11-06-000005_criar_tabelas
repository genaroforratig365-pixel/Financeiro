-- ============================================================================
-- MIGRATION: Criar tabela de usuários (sessão sem login)
-- Data: 2025-11-06
-- Descrição: Tabela usr_usuarios para armazenar usuários identificados por UUID
--            gerado no browser, sem necessidade de autenticação tradicional
-- Ajustado
-- ============================================================================

-- Criar tabela de usuários
CREATE TABLE IF NOT EXISTS financas.usr_usuarios (
  usr_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usr_identificador varchar(100) NOT NULL UNIQUE,
  usr_nome varchar(100),
  usr_ativo boolean DEFAULT true,
  usr_criado_em timestamptz DEFAULT now(),
  usr_atualizado_em timestamptz DEFAULT now()
);

-- Comentários descritivos
COMMENT ON TABLE financas.usr_usuarios IS 'Usuários do sistema identificados por UUID de sessão';
COMMENT ON COLUMN financas.usr_usuarios.usr_id IS 'ID único do usuário (UUID)';
COMMENT ON COLUMN financas.usr_usuarios.usr_identificador IS 'UUID gerado no frontend para identificação';
COMMENT ON COLUMN financas.usr_usuarios.usr_nome IS 'Nome ou apelido opcional do usuário';
COMMENT ON COLUMN financas.usr_usuarios.usr_ativo IS 'Indica se o usuário está ativo';
COMMENT ON COLUMN financas.usr_usuarios.usr_criado_em IS 'Data/hora de criação do registro';
COMMENT ON COLUMN financas.usr_usuarios.usr_atualizado_em IS 'Data/hora da última atualização';

-- Índices para otimização de queries
CREATE INDEX IF NOT EXISTS idx_usr_identificador
  ON financas.usr_usuarios(usr_identificador);

CREATE INDEX IF NOT EXISTS idx_usr_ativo
  ON financas.usr_usuarios(usr_ativo)
  WHERE usr_ativo = true;

-- Function para atualizar timestamp automaticamente
CREATE OR REPLACE FUNCTION financas.atualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.usr_atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar timestamp em UPDATE
DROP TRIGGER IF EXISTS trg_usr_usuarios_updated ON financas.usr_usuarios;
CREATE TRIGGER trg_usr_usuarios_updated
  BEFORE UPDATE ON financas.usr_usuarios
  FOR EACH ROW
  EXECUTE FUNCTION financas.atualizar_timestamp();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Habilitar RLS
ALTER TABLE financas.usr_usuarios ENABLE ROW LEVEL SECURITY;

-- Política: Todos podem ver todos os usuários (para listagens, se necessário)
-- Ajuste conforme necessidade de privacidade
CREATE POLICY "usuarios_publicos"
  ON financas.usr_usuarios
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Política: Qualquer um pode se registrar (INSERT)
CREATE POLICY "usuarios_podem_se_registrar"
  ON financas.usr_usuarios
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Política: Usuário só pode atualizar seus próprios dados
CREATE POLICY "usuarios_atualizam_apenas_seus"
  ON financas.usr_usuarios
  FOR UPDATE
  TO anon, authenticated
  USING (usr_identificador = current_setting('request.headers', true)::json->>'x-user-id')
  WITH CHECK (usr_identificador = current_setting('request.headers', true)::json->>'x-user-id');

-- ============================================================================
-- DADOS INICIAIS (SEED) - Opcional
-- ============================================================================

-- Inserir usuário de exemplo para testes
INSERT INTO financas.usr_usuarios (usr_identificador, usr_nome, usr_ativo)
VALUES ('00000000-0000-0000-0000-000000000000', 'Usuário Sistema', true)
ON CONFLICT (usr_identificador) DO NOTHING;
