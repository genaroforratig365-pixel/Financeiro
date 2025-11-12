# 📊 Script de Importação de Dados Históricos

Este script permite importar dados históricos das planilhas Excel para o banco Supabase.

## 📋 Pré-requisitos

1. Node.js instalado (v18 ou superior)
2. Acesso ao Supabase configurado no `.env`

## 🚀 Como Usar

### 1. Instalar dependências

```bash
cd /home/user/Financeiro
npm install xlsx @supabase/supabase-js dotenv tsx
```

### 2. Preparar as planilhas

Crie a pasta `planilhas` dentro de `scripts`:

```bash
mkdir -p scripts/planilhas
```

Coloque suas planilhas Excel (.xlsx ou .xls) na pasta `/home/user/Financeiro/scripts/planilhas/`

### 3. Formato esperado das planilhas

#### Movimentação Diária

Colunas necessárias:
- `Registro` ou `data` ou `Data` - Data da movimentação (formato: DD/MM/YYYY ou YYYY-MM-DD)
- `Area` ou `Área` - Nome da área (ex: GASTO RH, COMERCIAL)
- `Valor_Prev` ou `valorPrev` - Valor previsto
- `Valor_Realizado` ou `valorRealizado` - Valor realizado
- `Origem` - Tipo de movimentação (pagamento por área, receitas, banco)

Exemplo:
```
Registro       | Area          | Valor_Prev | Valor_Realizado | Origem
01/11/2024     | GASTO RH      | 15000      | 14500           | pagamento por área
01/11/2024     | COMERCIAL     | 8000       | 8200            | pagamento por área
```

#### Saldo Inicial

Colunas necessárias:
- `data de registro` ou `data` ou `Data` - Data
- `saldoinicial` ou `saldoInicial` - Saldo inicial do dia
- `saldoFinal` ou `Saldo Final` - Saldo final do dia

Exemplo:
```
data de registro | saldoinicial | saldoFinal
01/11/2024       | 250000       | 235000
02/11/2024       | 235000       | 228000
```

### 4. Executar a importação

```bash
npx tsx scripts/importar-dados.ts
```

## 📝 Mapeamento de Áreas

O script reconhece automaticamente as seguintes áreas:

| Nome na Planilha                  | ID no Banco |
|-----------------------------------|-------------|
| GASTO COM MATERIAL E CONSUMO      | 1           |
| GASTO RH / RH                     | 2           |
| GASTO FINANCEIRO E FISCAL         | 3           |
| GASTO LOGISTICA                   | 4           |
| GASTO COMERCIAL                   | 5           |
| GASTO MARKETING                   | 6           |
| GASTO LOJA DE FABRICA             | 7           |
| GASTO TI                          | 8           |
| GASTO DIRETORIA                   | 9           |
| GASTO COMPRAS                     | 10          |
| GASTO INVESTIMENTO                | 11          |
| GASTO DALLAS                      | 12          |
| TRANSFERÊNCIA PARA APLICAÇÃO      | 13          |

**Nota:** O script aceita nomes com ou sem o prefixo "GASTO".

## ⚙️ Personalização

Caso suas planilhas tenham formato diferente, você pode editar o arquivo `scripts/importar-dados.ts`:

1. Ajuste os nomes das colunas na função `importarMovimentacaoDiaria()`
2. Adicione lógica para tipos específicos de receitas ou bancos
3. Modifique o mapeamento de áreas no `AREAS_MAP`

## 🔍 Troubleshooting

### Erro: "Pasta não encontrada"
Certifique-se de criar a pasta `scripts/planilhas/`

### Erro: "Nenhuma planilha encontrada"
Verifique se os arquivos têm extensão `.xlsx` ou `.xls`

### Erro: "Área não encontrada"
O script mostrará um aviso com o nome da área não reconhecida. Adicione-a ao `AREAS_MAP` no script.

### Erro de conexão Supabase
Verifique se as variáveis de ambiente estão configuradas corretamente no `.env`:
```
NEXT_PUBLIC_SUPABASE_URL=sua_url_aqui
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_aqui
```

## 📊 Próximos Passos

Após a importação:

1. Acesse o sistema web
2. Navegue até "Relatórios > Saldo Diário"
3. Selecione uma data que você importou
4. Verifique se os dados foram importados corretamente

Se houver divergências, você pode:
- Editar os registros diretamente pelo sistema
- Deletar registros duplicados
- Reimportar com planilhas corrigidas

## 🆘 Suporte

Em caso de dúvidas ou problemas:
1. Verifique os logs do console durante a execução
2. Revise o formato das suas planilhas
3. Consulte a documentação do Supabase para detalhes sobre as tabelas
