# Comentários sobre o banco de dados - V2

## 2025-11-07
- adicionada migration `20251107120000_grant_cadastros_write_access.sql` concedendo `INSERT`/`UPDATE` em `financas.are_areas`, `financas.ctr_contas_receita` e `financas.ban_bancos` para os papéis `anon` e `authenticated`.
- liberado uso das sequências relacionadas (`are_areas_are_id_seq`, `ctr_contas_receita_ctr_id_seq`, `ban_bancos_ban_id_seq`) garantindo que o front consiga inserir registros nessas tabelas sem erro de permissão.
- cada grant é aplicado somente quando a tabela/seq existir, mantendo a migration idempotente e segura para ambientes já provisionados.
