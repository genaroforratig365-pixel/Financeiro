# Comentários sobre o banco de dados - V5

## 2025-11-07
- Adicionada migration (`20251107143000_reset_rls_shared_access.sql`) que reconfigura as políticas RLS das tabelas operacionais para liberar leitura e escrita a todos os operadores autenticados/anon, garantindo que novos usuários enxerguem os dados existentes.
- Criada migration (`20251107143500_remove_sdb_descricao.sql`) que remove a coluna `sdb_descricao` da tabela `sdb_saldo_banco`, alinhando o esquema ao formulário atual da movimentação diária.
- Mantida a correção na migration `20251107140000_enable_compartilhado_select.sql`, agora compatível com o catálogo do PostgreSQL por utilizar o campo `policyname` ao verificar políticas existentes.
