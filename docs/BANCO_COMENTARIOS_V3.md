# Comentários sobre o banco de dados - V3

## 2025-11-07
- migration `20251107140000_enable_compartilhado_select.sql` criando políticas de leitura ampla para cadastros e movimentações no schema `financas`.
- migration `20251107140500_create_tipos_receita.sql` adicionando a tabela `tpr_tipos_receita` com triggers de atualização, índices e políticas RLS consistentes.
