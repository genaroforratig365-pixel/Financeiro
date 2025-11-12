# Guia de Registro de Saldo Inicial e Controle de Aplicações

Este documento explica como configurar e utilizar o sistema de saldo inicial, movimentações diárias e controle de aplicações financeiras.

---

## 📋 Sumário

1. [Onde Registrar o Saldo Inicial](#onde-registrar-o-saldo-inicial)
2. [Tipos de Registros em Previsão](#tipos-de-registros-em-previsão)
3. [Controle de Aplicações Financeiras](#controle-de-aplicações-financeiras)
4. [Importação de Dados Históricos](#importação-de-dados-históricos)
5. [Auditoria de Saldos](#auditoria-de-saldos)
6. [Fluxo de Cálculo do Sistema](#fluxo-de-cálculo-do-sistema)

---

## 🎯 Onde Registrar o Saldo Inicial

### Tabela: `pvi_previsao_itens`

O saldo inicial é registrado na tabela **`pvi_previsao_itens`** com tipo específico.

### Estrutura do Registro

```sql
INSERT INTO financas.pvi_previsao_itens (
  pvi_data,
  pvi_tipo,
  pvi_valor,
  pvi_usr_id
) VALUES (
  '2025-01-01',           -- Data do primeiro dia útil
  'saldo_inicial',        -- Tipo do registro
  100000.00,              -- Valor do saldo inicial consolidado
  'uuid-do-usuario'       -- ID do usuário responsável
);
```

### Campos Importantes

- **`pvi_data`**: Data de referência (primeiro dia do período)
- **`pvi_tipo`**: Use `'saldo_inicial'` para o saldo inicial
- **`pvi_valor`**: Valor total consolidado de todos os bancos
- **`pvi_are_id`**: NULL (não se aplica a áreas)
- **`pvi_ctr_id`**: NULL (não se aplica a contas específicas)
- **`pvi_ban_id`**: NULL (consolidado de todos os bancos)

---

## 📊 Tipos de Registros em Previsão

A tabela `pvi_previsao_itens` aceita os seguintes tipos (`pvi_tipo`):

| Tipo | Descrição | Uso |
|------|-----------|-----|
| `saldo_inicial` | Saldo consolidado inicial | Primeiro dia do período |
| `saldo_final` | Saldo final do dia | Gerado automaticamente ou manual |
| `saldo` | Saldo genérico | Previsão de saldo |
| `saldo_diario` | Saldo previsto para o dia | Planejamento diário |
| `saldo_acumulado` | Saldo acumulado até a data | Acompanhamento |
| `receita` | Previsão de receitas | Por conta/banco |
| `gasto` | Previsão de gastos | Por área |

### Prioridade de Exibição (Auditoria)

Quando há múltiplos tipos para a mesma data, o sistema usa a seguinte ordem de prioridade:

1. **saldo_final** (maior prioridade)
2. **saldo**
3. **saldo_diario**
4. **saldo_acumulado** (menor prioridade)

---

## 💰 Controle de Aplicações Financeiras

### Áreas de Aplicação

O sistema controla aplicações através de áreas específicas cadastradas na tabela `are_areas`:

1. **TRANSFERÊNCIA PARA APLICAÇÃO** (Saída)
   - Representa valores transferidos da conta corrente para aplicação
   - Registrado em: **Movimentação > Saldo Diário > Pagamentos por Área**

2. **RESGATE APLICAÇÃO** (Entrada)
   - Representa valores resgatados da aplicação para conta corrente
   - Registrado em: **Movimentação > Saldo Diário > Receitas por Conta**

### Registro do Saldo Inicial de Aplicação

```sql
-- Registrar saldo inicial de aplicação
INSERT INTO financas.pvi_previsao_itens (
  pvi_data,
  pvi_tipo,
  pvi_valor,
  pvi_descricao,
  pvi_usr_id
) VALUES (
  '2025-01-01',
  'saldo_aplicacao',
  50000.00,
  'Saldo inicial em aplicações financeiras',
  'uuid-do-usuario'
);
```

### Cálculo Automático

A partir do registro inicial, o sistema calcula:

```
Saldo Aplicação Dia N = Saldo Aplicação Dia N-1
                        + Transferências para Aplicação
                        - Resgates de Aplicação
```

### Relatório de Aplicação

O saldo de aplicação é calculado diariamente:

- **No Relatório de Saldo Diário**: Mostra apenas o saldo líquido se houver movimentação no dia
- **No Saldo Final**: Considera todas as movimentações acumuladas

---

## 📥 Importação de Dados Históricos

### Passo 1: Inserir Saldo Inicial

Antes de importar dados históricos, **obrigatoriamente** registre o saldo inicial:

```sql
INSERT INTO financas.pvi_previsao_itens (
  pvi_data, pvi_tipo, pvi_valor, pvi_usr_id
) VALUES (
  '2024-12-31',            -- Último dia do período anterior
  'saldo_inicial',
  150000.00,               -- Saldo consolidado de todos os bancos
  'uuid-do-usuario'
);
```

### Passo 2: Importar Movimentações

Após registrar o saldo inicial, importe as movimentações nas respectivas tabelas:

- **Pagamentos por Área**: `pag_pagamentos_area`
- **Receitas**: `rec_receitas`
- **Pagamentos por Banco**: `pbk_pagamentos_banco`
- **Saldos Bancários**: `sdb_saldo_banco`

### Passo 3: Verificar Consistência

Use a página **Auditoria > Saldos Diários** para verificar se:

- Soma dos bancos = Saldo final registrado
- Não há divergências

---

## 🔍 Auditoria de Saldos

### Página: Auditoria > Saldos Diários

Esta página compara:

1. **Soma dos Saldos Bancários** (`sdb_saldo_banco`)
2. **Saldo Final Registrado** (`pvi_previsao_itens` onde `pvi_tipo` IN ('saldo_final', 'saldo', 'saldo_diario'))

### Interpretação dos Resultados

| Situação | Significado |
|----------|-------------|
| Diferença = 0 | ✅ Saldos conferem |
| Diferença > 0 | ⚠️ Soma dos bancos MAIOR que o saldo registrado |
| Diferença < 0 | ⚠️ Soma dos bancos MENOR que o saldo registrado |

### Correção de Divergências

Se houver divergência:

1. Verifique se todos os bancos foram registrados
2. Confirme se o saldo final foi atualizado corretamente
3. Verifique se há duplicidade de lançamentos

---

## ⚙️ Fluxo de Cálculo do Sistema

### Cálculo Diário

```
Saldo Inicial Dia = Saldo Final Dia Anterior

Receitas do Dia = Σ (Receitas por Conta)

Pagamentos do Dia = Σ (Pagamentos por Área) + Σ (Pagamentos por Banco)

Saldo Final Dia = Saldo Inicial + Receitas - Pagamentos
```

### Movimentação de Aplicação

```
Saldo Aplicação Atual = Saldo Aplicação Anterior
                        + Transferências para Aplicação (Área específica)
                        - Resgates de Aplicação (Receita específica)
```

### Cards de Resumo (Movimentação)

Na tela **Movimentação > Saldo Diário**, os 4 cards exibem:

1. **Saldo Inicial**: Saldo final do dia anterior
2. **Receitas**: Total de entradas do dia
3. **Pagamentos**: Total de saídas do dia (áreas + bancos)
4. **Saldo Final**: Resultado consolidado (Inicial + Receitas - Pagamentos)

---

## ❓ Perguntas Frequentes

### 1. O saldo inicial é por banco ou consolidado?

**Resposta**: O saldo inicial registrado em `pvi_previsao_itens` é **consolidado** (soma de todos os bancos). Os saldos individuais por banco são registrados em `sdb_saldo_banco`.

### 2. Como corrigir o saldo inicial?

```sql
-- Atualizar saldo inicial
UPDATE financas.pvi_previsao_itens
SET pvi_valor = 200000.00
WHERE pvi_data = '2025-01-01'
  AND pvi_tipo = 'saldo_inicial';
```

### 3. Posso ter múltiplos saldos iniciais?

Sim, mas recomenda-se ter apenas um por data. Se houver múltiplos, o sistema usará o de maior prioridade.

### 4. Como registrar saldo de aplicação no primeiro dia?

Use um INSERT separado com `pvi_tipo = 'saldo_aplicacao'` e o valor inicial em aplicações.

---

## 📞 Suporte

Para dúvidas ou problemas:

1. Verifique a auditoria de saldos
2. Confirme os tipos de registro na tabela `pvi_previsao_itens`
3. Valide a consistência das movimentações
4. Entre em contato com a equipe de desenvolvimento

---

**Última atualização**: 12/11/2025
**Versão do documento**: 1.0
