# Comentários sobre o banco de dados - V4

## 2025-11-07
- Correção na verificação de políticas dentro da migration `20251107140000_enable_compartilhado_select.sql`, trocando o campo `polname` por `policyname` para compatibilidade com o catálogo do PostgreSQL utilizado pelo Supabase.
