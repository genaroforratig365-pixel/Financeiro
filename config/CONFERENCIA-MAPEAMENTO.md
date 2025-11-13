# 📊 Conferência de Mapeamento - Importação de Dados

## 🎯 Resumo das Regras de Importação

### 1️⃣ Pagamentos por Área (Realizados)
**Origem no arquivo:** `"Pagamentos por Área"`
**Tabela destino:** `pag_pagamentos_area`
**Campos usados:** Registro (data), Area, Valor_Realizado
**Campos ignorados:** Valor_Previsto

#### Mapeamento de Áreas → IDs:
```
GASTO COM MATERIAL E CONSUMO → ID 1
MATERIAL E CONSUMO → ID 1
GASTO RH → ID 2
RH → ID 2
GASTO FINANCEIRO E FISCAL → ID 3
FINANCEIRO E FISCAL → ID 3
GASTO LOGISTICA → ID 4
LOGISTICA → ID 4
GASTO COMERCIAL → ID 5
COMERCIAL → ID 5
GASTO MARKETING → ID 6
MARKETING → ID 6
GASTO LOJA DE FABRICA → ID 7
LOJA DE FABRICA → ID 7
GASTO TI → ID 8
TI → ID 8
GASTO DIRETORIA → ID 9
DIRETORIA → ID 9
GASTO COMPRAS → ID 10
COMPRAS → ID 10
GASTO INVESTIMENTO → ID 11
INVESTIMENTO → ID 11
GASTO DALLAS → ID 12
DALLAS → ID 12
TRANSFERÊNCIA PARA APLICAÇÃO → ID 13
TRANSFERENCIA PARA APLICACAO → ID 13
APLICACAO → ID 13
```

#### Exemplo:
```
Registro: 20/03/2025
Area: GASTO COM MATERIAL E CONSUMO
Valor_Realizado: 152385.68
Origem: Pagamentos por Área

→ Insere em pag_pagamentos_area:
  - pag_data = 2025-03-20
  - pag_are_id = 1 (Material e Consumo)
  - pag_valor = 152385.68
  - pag_usr_id = (usuário atual)
```

---

### 2️⃣ Previsão por Área
**Origem no arquivo:** `"Previsão por Área"`
**Tabela destino:** `pvi_previsao_itens`
**Campos usados:** Registro (data), Area, Valor_Previsto
**Campos ignorados:** Valor_Realizado

#### Mapeamento: Usa a mesma tabela de áreas acima

#### Exemplo:
```
Registro: 20/03/2025
Area: GASTO COM MATERIAL E CONSUMO
Valor_Previsto: 142616.69
Origem: Previsão por Área

→ Insere em pvi_previsao_itens:
  - pvi_data = 2025-03-20
  - pvi_are_id = 1 (Material e Consumo)
  - pvi_valor = 142616.69
  - pvi_tipo = 'gasto'
  - pvi_categoria = 'GASTO COM MATERIAL E CONSUMO'
  - pvi_usr_id = (usuário atual)
```

---

### 3️⃣ Saldos por Banco
**Origem no arquivo:** `"Saldo por Banco"`
**Tabela destino:** `pbk_pagamentos_banco`
**Campos usados:** Registro (data), Area (nome do banco), Valor_Realizado
**Campos ignorados:** Valor_Previsto

#### Mapeamento de Bancos → IDs:
```
BANCO DO BRASIL → ID 1
BB → ID 1
BRADESCO → ID 2
BANRISUL → ID 3
```

**⚠️ IMPORTANTE:** Apenas estes 3 bancos serão considerados para "Saldo por Banco"

#### Exemplo:
```
Registro: 20/03/2025
Area: BANCO DO BRASIL
Valor_Realizado: 605.52
Origem: Saldo por Banco

→ Insere em pbk_pagamentos_banco:
  - pbk_data = 2025-03-20
  - pbk_ban_id = 1 (Banco do Brasil)
  - pbk_valor = 605.52
  - pbk_usr_id = (usuário atual)
```

---

### 4️⃣ Receitas por Tipo (Realizadas)
**Origem no arquivo:** `"Receitas por Tipo"`
**Tabela destino:** `rec_receitas`
**Campos usados:** Registro (data), Area (tipo de receita), Valor_Realizado
**Campos ignorados:** Valor_Previsto

#### Mapeamento de Tipos de Receita → IDs:
```
RECEITAS EM TITULOS → ID 1 (Conta: Títulos/Boletos)
RECEITAS EM TÍTULOS → ID 1
TITULOS → ID 1
TÍTULOS → ID 1
BOLETOS → ID 1

RECEITAS EM DEPOSITOS → ID 2 (Conta: Depósitos/PIX)
RECEITAS EM DEPÓSITOS → ID 2
DEPOSITOS → ID 2
DEPÓSITOS → ID 2
PIX → ID 2

OUTRAS RECEITAS → ID 3 (Conta: Outras)
OUTRAS → ID 3
RESGATE APLICAÇÃO → ID 3
RESGATE APLICACAO → ID 3
```

#### Exemplo:
```
Registro: 20/03/2025
Area: RECEITAS EM TITULOS
Valor_Realizado: 406409.11
Origem: Receitas por Tipo

→ Insere em rec_receitas:
  - rec_data = 2025-03-20
  - rec_ctr_id = 1 (Receitas em Títulos)
  - rec_valor = 406409.11
  - rec_usr_id = (usuário atual)
```

---

### 5️⃣ Previsão de Receitas
**Origem no arquivo:** `"Previsão Receitas"`
**Tabela destino:** `pvi_previsao_itens`
**Campos usados:** Registro (data), Area (tipo de receita), Valor_Previsto
**Campos ignorados:** Valor_Realizado

#### Mapeamento: Usa a mesma tabela de tipos de receita acima

#### Exemplo:
```
Registro: 20/03/2025
Area: RECEITAS EM TITULOS
Valor_Previsto: 377856.93
Origem: Previsão Receitas

→ Insere em pvi_previsao_itens:
  - pvi_data = 2025-03-20
  - pvi_valor = 377856.93
  - pvi_tipo = 'receita'
  - pvi_categoria = 'RECEITAS EM TITULOS'
  - pvi_usr_id = (usuário atual)
```

---

## 📝 Validações Importantes

### ✅ O que será importado:
- Registros com origem reconhecida
- Valores maiores que zero (> 0)
- Datas válidas no formato DD/MM/YYYY
- Áreas/Bancos/Receitas encontrados no mapeamento

### ⚠️ O que será ignorado (com aviso):
- Áreas não encontradas no mapeamento
- Bancos não encontrados no mapeamento
- Tipos de receita não encontrados
- Valores zerados ou negativos
- Origens não reconhecidas

### ❌ O que causará erro:
- Linhas sem data válida
- Erros de inserção no banco de dados
- Violação de constraints (ex: chaves estrangeiras inválidas)

---

## 🔧 Como Ajustar o Mapeamento

Para ajustar os mapeamentos, edite o arquivo:
```
/config/mapeamento-importacao.json
```

### Exemplo de ajuste:

**Adicionar novo banco:**
```json
"bancos": {
  "mapeamento": {
    "BANCO DO BRASIL": 1,
    "NOVO BANCO": 9
  }
}
```

**Adicionar nova área:**
```json
"areas": {
  "mapeamento": {
    "GASTO RH": 2,
    "NOVA AREA": 14
  }
}
```

---

## 📊 Resumo de Tabelas Afetadas

| Origem | Tabela Destino | Tipo de Dado |
|--------|----------------|--------------|
| Pagamentos por Área | `pag_pagamentos_area` | Gastos Realizados |
| Previsão por Área | `pvi_previsao_itens` | Gastos Previstos |
| Saldo por Banco | `pbk_pagamentos_banco` | Saldos Bancários |
| Receitas por Tipo | `rec_receitas` | Receitas Realizadas |
| Previsão Receitas | `pvi_previsao_itens` | Receitas Previstas |

---

## ✅ Checklist de Conferência

- [ ] IDs de áreas (1-13) conferidos
- [ ] IDs de bancos (1-3) conferidos
- [ ] IDs de contas de receita (1-3) conferidos
- [ ] Regras de importação compreendidas
- [ ] Exemplos testados
- [ ] Mapeamento JSON revisado
- [ ] Pronto para testar importação

---

**Última atualização:** 2025-11-13
**Versão:** 1.0
