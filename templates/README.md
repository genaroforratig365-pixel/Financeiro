# Templates de Importação

Este diretório contém templates para importação em massa de dados no sistema financeiro.

## Template SQL - importacao_saldos_diarios.sql

### Descrição
Script SQL para importação direta de saldos diários no banco de dados PostgreSQL/Supabase.

### Como usar

1. **Obter seu USER_ID**:
   ```sql
   SELECT usr_id FROM financas.usr_usuarios
   WHERE usr_identificador = 'seu_email@exemplo.com';
   ```

2. **Obter IDs das categorias**:
   ```sql
   -- Áreas
   SELECT are_id, are_nome FROM financas.are_areas WHERE are_ativo = true;

   -- Contas de Receita
   SELECT ctr_id, ctr_codigo, ctr_nome FROM financas.ctr_contas_receita WHERE ctr_ativo = true;

   -- Bancos
   SELECT ban_id, ban_nome FROM financas.ban_bancos WHERE ban_ativo = true;
   ```

3. **Editar o template**:
   - Substitua `@USER_ID` pelo UUID obtido no passo 1
   - Substitua a data `v_data_lancamento` pela data desejada
   - Preencha os IDs das categorias conforme os valores obtidos no passo 2
   - Ajuste os valores conforme necessário

4. **Executar no Supabase**:
   - Acesse o Supabase Dashboard
   - Vá em "SQL Editor"
   - Cole o script editado
   - Execute (Run)

### Vantagens
- Inserção rápida de múltiplos registros
- Usa UPSERT (ON CONFLICT) para evitar duplicatas
- Transacional (tudo ou nada)

## Template CSV - importacao_saldos_diarios.csv

### Descrição
Arquivo CSV estruturado para importação via ferramentas externas ou scripts.

### Formato dos campos

| Campo | Descrição | Valores possíveis |
|-------|-----------|-------------------|
| tipo | Tipo de lançamento | `pagamento_area`, `receita`, `pagamento_banco`, `saldo_banco` |
| data | Data do lançamento | Formato `YYYY-MM-DD` |
| categoria_id | ID da categoria | Número inteiro (consulte tabelas) |
| categoria_nome | Nome da categoria | Texto (apenas referência) |
| valor | Valor do lançamento | Número decimal (use ponto como separador) |

### Como usar

1. **Editar o CSV**:
   - Abra o arquivo em Excel, LibreOffice ou editor de texto
   - Remova as linhas de comentário (começam com #)
   - Preencha os dados conforme o formato
   - Salve mantendo a codificação UTF-8

2. **Importar via script Python** (exemplo):
   ```python
   import csv
   from supabase import create_client

   supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

   with open('importacao_saldos_diarios.csv') as f:
       reader = csv.DictReader(f)
       for row in reader:
           if row['tipo'] == 'pagamento_area':
               supabase.table('pag_pagamentos_area').upsert({
                   'pag_are_id': row['categoria_id'],
                   'pag_data': row['data'],
                   'pag_valor': float(row['valor'])
               }).execute()
           # ... outros tipos
   ```

3. **Importar via ferramenta de planilha**:
   - Algumas ferramentas permitem importar CSV diretamente para o banco
   - Certifique-se de mapear as colunas corretamente

## Observações Importantes

⚠️ **ATENÇÃO**:
- Sempre faça backup antes de importar dados em massa
- Teste primeiro com um conjunto pequeno de dados
- Verifique se os IDs das categorias estão corretos
- O sistema usa UPSERT, então valores existentes serão substituídos

## Verificação após importação

Execute as queries de verificação presentes no final do template SQL para confirmar que os dados foram importados corretamente.

## Suporte

Em caso de dúvidas ou problemas:
1. Verifique se os IDs das categorias estão corretos
2. Confirme se o USER_ID está correto
3. Verifique os logs de erro do banco de dados
4. Consulte a documentação do projeto
