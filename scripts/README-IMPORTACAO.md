# Importação de Dados Históricos

## 📋 Template de Importação

Use o arquivo `template-movimentacao-historica.csv` como modelo para importar dados históricos.

### Estrutura do Template

O arquivo CSV deve conter as seguintes colunas:

| Coluna | Descrição | Formato | Exemplo |
|--------|-----------|---------|---------|
| **Registro** | Data do registro | DD/MM/YYYY | 28/02/2025 |
| **Area** | Nome da área ou descrição | Texto | GASTO COM MATERIAL E CONSUMO |
| **Valor_Previsto** | Valor previsto | Número | 142616.69 |
| **Valor_Realizado** | Valor realizado | Número | 152385.68 |
| **Origem** | Tipo de origem do registro | Texto | Pagamentos por Área |

### Tipos de Origem Suportados

O campo **Origem** determina como os dados serão importados:

#### 1. Saldo Inicial
- **Origem**: "Ajuste de Saldo de Aplicação" ou "Saldo Inicial"
- **Uso**: Valor_Realizado (Valor_Previsto é ignorado)
- **Destino**: Tabela `pvi_previsao_itens` com tipo 'saldo_inicial'

#### 2. Previsão de Gastos por Área
- **Origem**: "Previsão por Área"
- **Uso**: Valor_Previsto
- **Destino**: Tabela `pvi_previsao_itens` com tipo 'gasto'
- **Áreas reconhecidas**:
  - GASTO COM MATERIAL E CONSUMO
  - GASTO RH
  - GASTO FINANCEIRO E FISCAL
  - GASTO LOGISTICA
  - GASTO COMERCIAL
  - GASTO MARKETING
  - GASTO LOJA DE FABRICA
  - GASTO TI
  - GASTO DIRETORIA
  - GASTO COMPRAS
  - GASTO INVESTIMENTO
  - GASTO DALLAS
  - TRANSFERÊNCIA PARA APLICAÇÃO

#### 3. Pagamentos Realizados por Área
- **Origem**: "Pagamentos por Área"
- **Uso**: Valor_Realizado
- **Destino**: Tabela `pag_pagamentos_area`

#### 4. Previsão de Receitas
- **Origem**: "Previsão de Receitas"
- **Uso**: Valor_Previsto
- **Destino**: Tabela `pvi_previsao_itens` com tipo 'receita'

#### 5. Receitas Realizadas
- **Origem**: "Receitas por Tipo"
- **Uso**: Valor_Realizado
- **Destino**: Tabela `rec_receitas`
- **Tipos reconhecidos**:
  - RECEITAS EM TITULOS / TÍTULOS / BOLETOS → Conta ID 1
  - RECEITAS EM DEPOSITOS / DEPÓSITOS / PIX → Conta ID 2
  - OUTRAS RECEITAS / RESGATE APLICAÇÃO → Conta ID 3

#### 6. Saldos Bancários
- **Origem**: "Saldo por Banco"
- **Uso**: Valor_Realizado
- **Destino**: Tabela `sdb_saldo_banco`
- **Bancos reconhecidos**:
  - BANCO DO BRASIL / BB → Banco ID 1
  - BRADESCO → Banco ID 2
  - BANRISUL → Banco ID 3
  - CAIXA / CAIXA ECONÔMICA → Banco ID 4
  - SANTANDER → Banco ID 5
  - ITAÚ / ITAU → Banco ID 6
  - SICOOB → Banco ID 7
  - SICREDI → Banco ID 8

#### 7. Pagamentos por Banco
- **Origem**: "Pagamento por Banco"
- **Uso**: Valor_Realizado
- **Destino**: Tabela `pbk_pagamentos_banco`
- **Bancos**: Mesma lista acima

## 🚀 Como Usar

### 1. Preparar os Dados

1. Abra o arquivo `template-movimentacao-historica.csv` no Excel
2. Cole seus dados históricos respeitando as colunas
3. Certifique-se de que as datas estão no formato DD/MM/YYYY
4. Valores podem usar ponto ou vírgula como decimal
5. Salve o arquivo como `.xlsx` ou `.csv`

### 2. Executar a Importação

```bash
# 1. Instalar dependências (primeira vez)
npm install xlsx @supabase/supabase-js dotenv

# 2. Coloque seu arquivo na pasta scripts/planilhas/
mkdir -p scripts/planilhas
cp seu-arquivo.xlsx scripts/planilhas/movimentacao-historica.xlsx

# 3. Configure as variáveis de ambiente no .env
# NEXT_PUBLIC_SUPABASE_URL=sua-url
# NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave

# 4. Execute o script de importação
npx tsx scripts/importar-dados.ts
```

### 3. Verificar Importação

O script exibirá:
- ✅ Número de registros importados com sucesso
- ❌ Número de erros encontrados
- ⚠️ Avisos sobre dados que precisam de mapeamento manual

## ⚠️ Observações Importantes

### Valores Previstos vs Realizados

- **Valor_Previsto**: Usado apenas para registros de previsão (relatórios semanais)
- **Valor_Realizado**: Usado para registros de saldo diário (valores reais executados)

### Mapeamentos Automáticos

O sistema reconhece automaticamente:

1. **Áreas de Negócio**: 13 áreas mapeadas (Material e Consumo, RH, Financeiro, etc.)
2. **Bancos**: 8 instituições financeiras (BB, Bradesco, Banrisul, Caixa, etc.)
3. **Tipos de Receita**: 3 categorias (Títulos, Depósitos, Outras)

Se um nome não for reconhecido, será registrado um aviso no resultado da importação.

## 📊 Exemplo Completo

```csv
Registro,Area,Valor_Previsto,Valor_Realizado,Origem
28/02/2025,SALDO INICIAL APLICAÇÃO,0,4777842.88,Ajuste de Saldo de Aplicação
20/03/2025,GASTO COM MATERIAL E CONSUMO,142616.69,0,Previsão por Área
20/03/2025,GASTO COM MATERIAL E CONSUMO,0,152385.68,Pagamentos por Área
20/03/2025,GASTO RH,463156.31,0,Previsão por Área
20/03/2025,GASTO RH,0,480561.95,Pagamentos por Área
20/03/2025,RECEITAS EM TITULOS,377856.93,0,Previsão de Receitas
20/03/2025,RECEITAS EM TITULOS,0,406409.11,Receitas por Tipo
```

## 🆘 Suporte

Se encontrar problemas durante a importação:

1. Verifique se as colunas estão nomeadas corretamente
2. Confirme que as datas estão no formato DD/MM/YYYY
3. Revise os logs de erro para identificar linhas problemáticas
4. Consulte a documentação do sistema para mais informações
