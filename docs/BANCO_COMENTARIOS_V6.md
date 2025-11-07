# Comentários sobre o banco de dados - V6

## 2025-11-07
- Criada a migration `20251107160000_create_cobrancas_table.sql` para adicionar a tabela `cob_cobrancas` com relacionamentos para contas e tipos de receita, incluindo gatilho de atualização de timestamp e políticas RLS alinhadas ao identificador de operador enviado pelo front-end.
- Concedidos privilégios de inserção/atualização/remoção e uso da sequência `cob_cobrancas_cob_id_seq` às roles `anon` e `authenticated`, garantindo que qualquer operador selecionado possa registrar cobranças no Supabase.
