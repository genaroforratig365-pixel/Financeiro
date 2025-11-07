# Banco de Dados - Sistema Financeiro

## 📊 Modelo de Dados

### Convenções de Nomenclatura

1. **Tabelas:** Nome em português, prefixo de 3 letras (sigla)
2. **Colunas:** `<sigla>_<nome_campo>`
3. **Primary Keys:** `<sigla>_id`
4. **Foreign Keys:** `<sigla>_<tabela_origem>_id`
5. **Timestamps:** `<sigla>_criado_em`, `<sigla>_atualizado_em`
6. **Usuário:** `<sigla>_usr_id` (referência ao usr_usuarios)

### Schema Principal: `financas`

Todas as tabelas do sistema estão no schema `financas`.

---

## 📋 Tabelas de Cadastro (Mestres)

### 1. `usr_usuarios` - Usuários (Sessão Sem Login)

**Sigla:** USR

```sql
CREATE TABLE financas.usr_usuarios (
  usr_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usr_identificador varchar(100) NOT NULL UNIQUE,  -- UUID gerado no frontend
  usr_nome varchar(100),                           -- Nome/apelido opcional
  usr_ativo boolean DEFAULT true,
  usr_criado_em timestamptz DEFAULT now(),
  usr_atualizado_em timestamptz DEFAULT now()
);

CREATE INDEX idx_usr_identificador ON financas.usr_usuarios(usr_identificador);
CREATE INDEX idx_usr_ativo ON financas.usr_usuarios(usr_ativo) WHERE usr_ativo = true;
```

**Descrição:**
- Armazena usuários identificados por UUID gerado no browser
- Não requer autenticação tradicional
- Permite adicionar nome/apelido para identificação visual

---

### 2. `are_areas` - Áreas de Negócio

**Sigla:** ARE

```sql
CREATE TABLE financas.are_areas (
  are_id bigserial PRIMARY KEY,
  are_codigo varchar(20) NOT NULL UNIQUE,
  are_nome varchar(100) NOT NULL,
  are_descricao text,
  are_ativo boolean DEFAULT true,
  are_usr_id uuid NOT NULL REFERENCES financas.usr_usuarios(usr_id),
  are_criado_em timestamptz DEFAULT now(),
  are_atualizado_em timestamptz DEFAULT now()
);

CREATE INDEX idx_are_codigo ON financas.are_areas(are_codigo);
CREATE INDEX idx_are_ativo ON financas.are_areas(are_ativo) WHERE are_ativo = true;
CREATE INDEX idx_are_usr_id ON financas.are_areas(are_usr_id);
```

**Descrição:**
- Cadastro de áreas de negócio/departamentos
- Exemplos: "Vendas", "Marketing", "TI", "RH"
- Código único para identificação rápida

---

### 3. `ctr_contas_receita` - Contas de Receita

**Sigla:** CTR

```sql
CREATE TABLE financas.ctr_contas_receita (
  ctr_id bigserial PRIMARY KEY,
  ctr_codigo varchar(20) NOT NULL UNIQUE,
  ctr_nome varchar(100) NOT NULL,
  ctr_descricao text,
  ctr_ativo boolean DEFAULT true,
  ctr_ban_id bigint REFERENCES financas.ban_bancos(ban_id) ON DELETE SET NULL,
  ctr_usr_id uuid NOT NULL REFERENCES financas.usr_usuarios(usr_id),
  ctr_criado_em timestamptz DEFAULT now(),
  ctr_atualizado_em timestamptz DEFAULT now()
);

CREATE INDEX idx_ctr_codigo ON financas.ctr_contas_receita(ctr_codigo);
CREATE INDEX idx_ctr_ativo ON financas.ctr_contas_receita(ctr_ativo) WHERE ctr_ativo = true;
CREATE INDEX idx_ctr_usr_id ON financas.ctr_contas_receita(ctr_usr_id);
```

**Descrição:**
- Cadastro de contas para classificação de receitas
- Exemplos: "Vendas Produto A", "Serviços", "Comissões"
- Código único para identificação rápida
- Pode ser vinculada a um banco para facilitar agrupamentos por instituição

---

### 4. `ban_bancos` - Bancos e Contas Bancárias

**Sigla:** BAN

```sql
CREATE TABLE financas.ban_bancos (
  ban_id bigserial PRIMARY KEY,
  ban_codigo varchar(20) NOT NULL UNIQUE,
  ban_nome varchar(100) NOT NULL,
  ban_numero_conta varchar(50) NOT NULL,
  ban_agencia varchar(20),
  ban_tipo_conta varchar(20),  -- Ex: "Corrente", "Poupança", "Investimento"
  ban_saldo_inicial numeric(15,2) DEFAULT 0,
  ban_ativo boolean DEFAULT true,
  ban_usr_id uuid NOT NULL REFERENCES financas.usr_usuarios(usr_id),
  ban_criado_em timestamptz DEFAULT now(),
  ban_atualizado_em timestamptz DEFAULT now()
);

CREATE INDEX idx_ban_codigo ON financas.ban_bancos(ban_codigo);
CREATE INDEX idx_ban_ativo ON financas.ban_bancos(ban_ativo) WHERE ban_ativo = true;
CREATE INDEX idx_ban_usr_id ON financas.ban_bancos(ban_usr_id);
```

**Descrição:**
- Cadastro de bancos e contas bancárias
- Inclui número da conta, agência e tipo
- Saldo inicial para cálculo de saldo atual

---

## 💰 Tabelas de Movimentação (Transacionais)

### 5. `pag_pagamentos_area` - Pagamentos por Área

**Sigla:** PAG

```sql
CREATE TABLE financas.pag_pagamentos_area (
  pag_id bigserial PRIMARY KEY,
  pag_are_id bigint NOT NULL REFERENCES financas.are_areas(are_id),
  pag_data date NOT NULL DEFAULT CURRENT_DATE,
  pag_valor numeric(15,2) NOT NULL CHECK (pag_valor >= 0),
  pag_descricao text,
  pag_observacao text,
  pag_usr_id uuid NOT NULL REFERENCES financas.usr_usuarios(usr_id),
  pag_criado_em timestamptz DEFAULT now(),
  pag_atualizado_em timestamptz DEFAULT now()
);

CREATE INDEX idx_pag_are_id ON financas.pag_pagamentos_area(pag_are_id);
CREATE INDEX idx_pag_data ON financas.pag_pagamentos_area(pag_data DESC);
CREATE INDEX idx_pag_usr_id ON financas.pag_pagamentos_area(pag_usr_id);
CREATE INDEX idx_pag_data_area ON financas.pag_pagamentos_area(pag_data, pag_are_id);
```

**Descrição:**
- Registra pagamentos diários por área de negócio
- Valores sempre positivos (CHECK constraint)
- Permite descrição e observações

---

### 6. `rec_receitas` - Receitas

**Sigla:** REC

```sql
CREATE TABLE financas.rec_receitas (
  rec_id bigserial PRIMARY KEY,
  rec_ctr_id bigint NOT NULL REFERENCES financas.ctr_contas_receita(ctr_id),
  rec_data date NOT NULL DEFAULT CURRENT_DATE,
  rec_valor numeric(15,2) NOT NULL CHECK (rec_valor >= 0),
  rec_descricao text,
  rec_observacao text,
  rec_usr_id uuid NOT NULL REFERENCES financas.usr_usuarios(usr_id),
  rec_criado_em timestamptz DEFAULT now(),
  rec_atualizado_em timestamptz DEFAULT now()
);

CREATE INDEX idx_rec_ctr_id ON financas.rec_receitas(rec_ctr_id);
CREATE INDEX idx_rec_data ON financas.rec_receitas(rec_data DESC);
CREATE INDEX idx_rec_usr_id ON financas.rec_receitas(rec_usr_id);
CREATE INDEX idx_rec_data_conta ON financas.rec_receitas(rec_data, rec_ctr_id);
```

**Descrição:**
- Registra receitas por conta de receita
- Valores sempre positivos (CHECK constraint)
- Permite descrição e observações

---

### 7. `pbk_pagamentos_banco` - Pagamentos por Banco

**Sigla:** PBK

```sql
CREATE TABLE financas.pbk_pagamentos_banco (
  pbk_id bigserial PRIMARY KEY,
  pbk_ban_id bigint NOT NULL REFERENCES financas.ban_bancos(ban_id),
  pbk_data date NOT NULL DEFAULT CURRENT_DATE,
  pbk_valor numeric(15,2) NOT NULL CHECK (pbk_valor >= 0),
  pbk_descricao text,
  pbk_observacao text,
  pbk_usr_id uuid NOT NULL REFERENCES financas.usr_usuarios(usr_id),
  pbk_criado_em timestamptz DEFAULT now(),
  pbk_atualizado_em timestamptz DEFAULT now()
);

CREATE INDEX idx_pbk_ban_id ON financas.pbk_pagamentos_banco(pbk_ban_id);
CREATE INDEX idx_pbk_data ON financas.pbk_pagamentos_banco(pbk_data DESC);
CREATE INDEX idx_pbk_usr_id ON financas.pbk_pagamentos_banco(pbk_usr_id);
CREATE INDEX idx_pbk_data_banco ON financas.pbk_pagamentos_banco(pbk_data, pbk_ban_id);
```

**Descrição:**
- Registra pagamentos (débitos) por banco
- Valores sempre positivos (CHECK constraint)
- Reduz saldo do banco

---

### 8. `sdb_saldo_banco` - Saldo por Banco

**Sigla:** SDB

```sql
CREATE TABLE financas.sdb_saldo_banco (
  sdb_id bigserial PRIMARY KEY,
  sdb_ban_id bigint NOT NULL REFERENCES financas.ban_bancos(ban_id),
  sdb_data date NOT NULL DEFAULT CURRENT_DATE,
  sdb_saldo numeric(15,2) NOT NULL,
  sdb_descricao text,
  sdb_usr_id uuid NOT NULL REFERENCES financas.usr_usuarios(usr_id),
  sdb_criado_em timestamptz DEFAULT now(),
  sdb_atualizado_em timestamptz DEFAULT now(),
  UNIQUE(sdb_ban_id, sdb_data)  -- Um saldo por banco por dia
);

CREATE INDEX idx_sdb_ban_id ON financas.sdb_saldo_banco(sdb_ban_id);
CREATE INDEX idx_sdb_data ON financas.sdb_saldo_banco(sdb_data DESC);
CREATE INDEX idx_sdb_usr_id ON financas.sdb_saldo_banco(sdb_usr_id);
```

**Descrição:**
- Registra saldo diário por banco
- Um único registro por banco por dia (UNIQUE constraint)
- Pode ser positivo ou negativo (conta no vermelho)

---

### 9. `pvs_semanas` - Cabeçalho da Previsão Semanal

**Sigla:** PVS

```sql
CREATE TABLE financas.pvs_semanas (
  pvs_id bigserial PRIMARY KEY,
  pvs_usr_id uuid NOT NULL REFERENCES financas.usr_usuarios(usr_id) ON DELETE CASCADE,
  pvs_semana_inicio date NOT NULL,
  pvs_semana_fim date NOT NULL,
  pvs_status text NOT NULL CHECK (pvs_status IN ('rascunho', 'importado', 'confirmado')),
  pvs_observacao text,
  pvs_criado_em timestamptz DEFAULT now(),
  pvs_atualizado_em timestamptz DEFAULT now()
);

CREATE INDEX idx_pvs_usr_id ON financas.pvs_semanas(pvs_usr_id);
CREATE INDEX idx_pvs_semana ON financas.pvs_semanas(pvs_semana_inicio, pvs_semana_fim);
```

**Descrição:**
- Registra cada importação semanal realizada pelo usuário
- Garante unicidade por usuário + semana para evitar duplicidade de cabeçalho
- Mantém status da previsão (rascunho/importado/confirmado)

---

### 10. `pvi_previsao_itens` - Itens da Previsão Semanal

**Sigla:** PVI

```sql
CREATE TABLE financas.pvi_previsao_itens (
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
  pvi_criado_em timestamptz DEFAULT now(),
  pvi_atualizado_em timestamptz DEFAULT now()
);

CREATE INDEX idx_pvi_pvs_id ON financas.pvi_previsao_itens(pvi_pvs_id);
CREATE INDEX idx_pvi_data ON financas.pvi_previsao_itens(pvi_data);
```

**Descrição:**
- Armazena os valores previstos por dia (receitas, gastos e saldos calculados)
- Permite vincular cada item a áreas, contas de receita, tipos de receita e bancos
- Mantém ordenação (`pvi_ordem`) para preservar a sequência importada da planilha

---

## 🔍 Views

### `v_dashboard_resumo` - Resumo do Dashboard

```sql
CREATE OR REPLACE VIEW financas.v_dashboard_resumo AS
SELECT
  -- Totais do dia
  CURRENT_DATE as data,

  -- Pagamentos por área (hoje)
  (SELECT COALESCE(SUM(pag_valor), 0)
   FROM financas.pag_pagamentos_area
   WHERE pag_data = CURRENT_DATE) as total_pagamentos_area,

  -- Receitas (hoje)
  (SELECT COALESCE(SUM(rec_valor), 0)
   FROM financas.rec_receitas
   WHERE rec_data = CURRENT_DATE) as total_receitas,

  -- Pagamentos por banco (hoje)
  (SELECT COALESCE(SUM(pbk_valor), 0)
   FROM financas.pbk_pagamentos_banco
   WHERE pbk_data = CURRENT_DATE) as total_pagamentos_banco,

  -- Saldo total em bancos (último registro de cada banco)
  (SELECT COALESCE(SUM(sdb_saldo), 0)
   FROM financas.sdb_saldo_banco sdb
   WHERE sdb_data = (
     SELECT MAX(sdb2.sdb_data)
     FROM financas.sdb_saldo_banco sdb2
     WHERE sdb2.sdb_ban_id = sdb.sdb_ban_id
   )) as saldo_total_bancos;
```

---

## 🔐 Row Level Security (RLS)

Todas as tabelas possuem RLS habilitado com políticas baseadas em `usr_id`.

### Exemplo de Políticas (para todas as tabelas):

```sql
-- Habilitar RLS
ALTER TABLE financas.are_areas ENABLE ROW LEVEL SECURITY;

-- SELECT: Usuário vê apenas seus registros
CREATE POLICY "usuarios_veem_apenas_seus_registros"
ON financas.are_areas
FOR SELECT
USING (are_usr_id = current_setting('app.current_user_id', true)::uuid);

-- INSERT: Usuário pode criar registros para si
CREATE POLICY "usuarios_criam_para_si"
ON financas.are_areas
FOR INSERT
WITH CHECK (are_usr_id = current_setting('app.current_user_id', true)::uuid);

-- UPDATE: Usuário pode atualizar apenas seus registros
CREATE POLICY "usuarios_atualizam_apenas_seus"
ON financas.are_areas
FOR UPDATE
USING (are_usr_id = current_setting('app.current_user_id', true)::uuid)
WITH CHECK (are_usr_id = current_setting('app.current_user_id', true)::uuid);

-- DELETE: Usuário pode deletar apenas seus registros
CREATE POLICY "usuarios_deletam_apenas_seus"
ON financas.are_areas
FOR DELETE
USING (are_usr_id = current_setting('app.current_user_id', true)::uuid);
```

---

## ⚙️ Triggers e Functions

### Trigger de Atualização de Timestamp

```sql
CREATE OR REPLACE FUNCTION financas.atualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar em todas as tabelas
CREATE TRIGGER trg_are_areas_updated
  BEFORE UPDATE ON financas.are_areas
  FOR EACH ROW EXECUTE FUNCTION financas.atualizar_timestamp();

-- (Repetir para todas as tabelas)
```

### Function para Calcular Saldo de Banco

```sql
CREATE OR REPLACE FUNCTION financas.calcular_saldo_banco(
  p_ban_id bigint,
  p_data date DEFAULT CURRENT_DATE
)
RETURNS numeric AS $$
DECLARE
  v_saldo_inicial numeric;
  v_total_receitas numeric;
  v_total_pagamentos numeric;
BEGIN
  -- Busca saldo inicial do banco
  SELECT ban_saldo_inicial INTO v_saldo_inicial
  FROM financas.ban_bancos
  WHERE ban_id = p_ban_id;

  -- Calcula receitas até a data
  SELECT COALESCE(SUM(rec_valor), 0) INTO v_total_receitas
  FROM financas.rec_receitas
  WHERE rec_data <= p_data;

  -- Calcula pagamentos até a data
  SELECT COALESCE(SUM(pbk_valor), 0) INTO v_total_pagamentos
  FROM financas.pbk_pagamentos_banco
  WHERE pbk_ban_id = p_ban_id AND pbk_data <= p_data;

  -- Retorna saldo calculado
  RETURN v_saldo_inicial + v_total_receitas - v_total_pagamentos;
END;
$$ LANGUAGE plpgsql;
```

---

## 📈 Queries Úteis

### 1. Resumo Financeiro do Dia

```sql
SELECT
  (SELECT SUM(pag_valor) FROM financas.pag_pagamentos_area WHERE pag_data = CURRENT_DATE) as pagamentos_area,
  (SELECT SUM(rec_valor) FROM financas.rec_receitas WHERE rec_data = CURRENT_DATE) as receitas,
  (SELECT SUM(pbk_valor) FROM financas.pbk_pagamentos_banco WHERE pbk_data = CURRENT_DATE) as pagamentos_banco;
```

### 2. Top 5 Áreas com Mais Pagamentos (Mês Atual)

```sql
SELECT
  a.are_nome,
  SUM(p.pag_valor) as total_pago
FROM financas.pag_pagamentos_area p
JOIN financas.are_areas a ON p.pag_are_id = a.are_id
WHERE date_trunc('month', p.pag_data) = date_trunc('month', CURRENT_DATE)
GROUP BY a.are_id, a.are_nome
ORDER BY total_pago DESC
LIMIT 5;
```

### 3. Evolução do Saldo de um Banco

```sql
SELECT
  sdb_data,
  sdb_saldo
FROM financas.sdb_saldo_banco
WHERE sdb_ban_id = 1
ORDER BY sdb_data DESC
LIMIT 30;
```

---

## 🔄 Manutenção

### Backup

```bash
# Backup completo do schema financas
pg_dump -h <host> -U <user> -n financas -F c -f financas_backup.dump
```

### Restore

```bash
# Restore do backup
pg_restore -h <host> -U <user> -d <database> financas_backup.dump
```

### Vacuum e Analyze

```sql
-- Executar periodicamente para otimização
VACUUM ANALYZE financas.pag_pagamentos_area;
VACUUM ANALYZE financas.rec_receitas;
VACUUM ANALYZE financas.pbk_pagamentos_banco;
VACUUM ANALYZE financas.sdb_saldo_banco;
```

---

## 📊 Diagrama ER

```
usr_usuarios (1) ──┬─ (N) are_areas
                   ├─ (N) ctr_contas_receita
                   ├─ (N) ban_bancos
                   ├─ (N) pag_pagamentos_area
                   ├─ (N) rec_receitas
                   ├─ (N) pbk_pagamentos_banco
                   ├─ (N) sdb_saldo_banco
                   ├─ (N) pvs_semanas
                   └─ (N) pvi_previsao_itens

are_areas (1) ──── (N) pag_pagamentos_area

ctr_contas_receita (1) ──── (N) rec_receitas

pvs_semanas (1) ──── (N) pvi_previsao_itens

ban_bancos (1) ──┬─ (N) pbk_pagamentos_banco
                 ├─ (N) sdb_saldo_banco
                 └─ (N) pvi_previsao_itens
```
