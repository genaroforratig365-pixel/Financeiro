# 📋 Tabela DE-PARA - Importação de Dados

## 🏢 ÁREAS (13 itens)

| Nome no Arquivo | ID | Tabela Destino |
|-----------------|:--:|----------------|
| GASTO COM MATERIAL E CONSUMO | 1 | are_areas |
| MATERIAL E CONSUMO | 1 | are_areas |
| GASTO RH | 2 | are_areas |
| RH | 2 | are_areas |
| GASTO FINANCEIRO E FISCAL | 3 | are_areas |
| FINANCEIRO E FISCAL | 3 | are_areas |
| GASTO LOGISTICA | 4 | are_areas |
| LOGISTICA | 4 | are_areas |
| GASTO COMERCIAL | 5 | are_areas |
| COMERCIAL | 5 | are_areas |
| GASTO MARKETING | 6 | are_areas |
| MARKETING | 6 | are_areas |
| GASTO LOJA DE FABRICA | 7 | are_areas |
| LOJA DE FABRICA | 7 | are_areas |
| GASTO TI | 8 | are_areas |
| TI | 8 | are_areas |
| GASTO DIRETORIA | 9 | are_areas |
| DIRETORIA | 9 | are_areas |
| GASTO COMPRAS | 10 | are_areas |
| COMPRAS | 10 | are_areas |
| GASTO INVESTIMENTO | 11 | are_areas |
| INVESTIMENTO | 11 | are_areas |
| GASTO DALLAS | 12 | are_areas |
| DALLAS | 12 | are_areas |
| TRANSFERÊNCIA PARA APLICAÇÃO | 13 | are_areas |
| TRANSFERENCIA PARA APLICACAO | 13 | are_areas |
| APLICACAO | 13 | are_areas |

---

## 🏦 BANCOS (3 itens - apenas estes!)

| Nome no Arquivo | ID | Tabela Destino | ⚠️ Observação |
|-----------------|:--:|----------------|---------------|
| BANCO DO BRASIL | 1 | ban_bancos | Aceito |
| BB | 1 | ban_bancos | Aceito |
| BRADESCO | 2 | ban_bancos | Aceito |
| BANRISUL | 3 | ban_bancos | Aceito |
| ~~CAIXA~~ | 4 | ban_bancos | ❌ NÃO usar |
| ~~SANTANDER~~ | 5 | ban_bancos | ❌ NÃO usar |
| ~~ITAÚ~~ | 6 | ban_bancos | ❌ NÃO usar |
| ~~SICOOB~~ | 7 | ban_bancos | ❌ NÃO usar |
| ~~SICREDI~~ | 8 | ban_bancos | ❌ NÃO usar |

**⚠️ IMPORTANTE:** Para "Saldo por Banco", considerar APENAS:
- Banco do Brasil (ID 1)
- Bradesco (ID 2)
- Banrisul (ID 3)

---

## 💰 TIPOS DE RECEITA (3 categorias)

| Nome no Arquivo | ID | Conta | Tabela Destino |
|-----------------|:--:|-------|----------------|
| RECEITAS EM TITULOS | 1 | Títulos/Boletos | ctr_contas_receita |
| RECEITAS EM TÍTULOS | 1 | Títulos/Boletos | ctr_contas_receita |
| TITULOS | 1 | Títulos/Boletos | ctr_contas_receita |
| TÍTULOS | 1 | Títulos/Boletos | ctr_contas_receita |
| BOLETOS | 1 | Títulos/Boletos | ctr_contas_receita |
| RECEITAS EM DEPOSITOS | 2 | Depósitos/PIX | ctr_contas_receita |
| RECEITAS EM DEPÓSITOS | 2 | Depósitos/PIX | ctr_contas_receita |
| DEPOSITOS | 2 | Depósitos/PIX | ctr_contas_receita |
| DEPÓSITOS | 2 | Depósitos/PIX | ctr_contas_receita |
| PIX | 2 | Depósitos/PIX | ctr_contas_receita |
| OUTRAS RECEITAS | 3 | Outras | ctr_contas_receita |
| OUTRAS | 3 | Outras | ctr_contas_receita |
| RESGATE APLICAÇÃO | 3 | Outras | ctr_contas_receita |
| RESGATE APLICACAO | 3 | Outras | ctr_contas_receita |

---

## 🔀 REGRAS DE IMPORTAÇÃO POR ORIGEM

### 📤 "Pagamentos por Área"
```
Arquivo → Banco de Dados
────────────────────────────────────────────────
Registro         → pag_data
Area             → pag_are_id (via mapeamento ÁREAS)
Valor_Realizado  → pag_valor
Valor_Previsto   → (IGNORADO)

Tabela: pag_pagamentos_area
```

### 📊 "Previsão por Área"
```
Arquivo → Banco de Dados
────────────────────────────────────────────────
Registro         → pvi_data
Area             → pvi_are_id (via mapeamento ÁREAS)
Valor_Previsto   → pvi_valor
Valor_Realizado  → (IGNORADO)
                 → pvi_tipo = 'gasto'
                 → pvi_categoria = nome da área

Tabela: pvi_previsao_itens
```

### 🏦 "Saldo por Banco"
```
Arquivo → Banco de Dados
────────────────────────────────────────────────
Registro         → pbk_data
Area             → pbk_ban_id (via mapeamento BANCOS)
Valor_Realizado  → pbk_valor
Valor_Previsto   → (IGNORADO)

Tabela: pbk_pagamentos_banco
⚠️ Apenas: BB, Bradesco, Banrisul
```

### 💵 "Receitas por Tipo"
```
Arquivo → Banco de Dados
────────────────────────────────────────────────
Registro         → rec_data
Area             → rec_ctr_id (via mapeamento RECEITAS)
Valor_Realizado  → rec_valor
Valor_Previsto   → (IGNORADO)

Tabela: rec_receitas
```

### 📈 "Previsão Receitas"
```
Arquivo → Banco de Dados
────────────────────────────────────────────────
Registro         → pvi_data
Area             → pvi_categoria
Valor_Previsto   → pvi_valor
Valor_Realizado  → (IGNORADO)
                 → pvi_tipo = 'receita'

Tabela: pvi_previsao_itens
```

---

## 📌 RESUMO RÁPIDO

| Origem | Usa Coluna | Ignora Coluna | Mapeamento | Tabela Final |
|--------|------------|---------------|------------|--------------|
| Pagamentos por Área | Valor_Realizado | Valor_Previsto | ÁREAS | pag_pagamentos_area |
| Previsão por Área | Valor_Previsto | Valor_Realizado | ÁREAS | pvi_previsao_itens |
| Saldo por Banco | Valor_Realizado | Valor_Previsto | BANCOS (3 apenas) | pbk_pagamentos_banco |
| Receitas por Tipo | Valor_Realizado | Valor_Previsto | RECEITAS | rec_receitas |
| Previsão Receitas | Valor_Previsto | Valor_Realizado | RECEITAS | pvi_previsao_itens |

---

## ✏️ COMO EDITAR

Para ajustar este mapeamento, edite o arquivo JSON:
```
/config/mapeamento-importacao.json
```

Após editar o JSON, **reinicie a aplicação** para aplicar as mudanças.

---

**📅 Data:** 2025-11-13
**📝 Versão:** 1.0
**👤 Conferido por:** _________________
