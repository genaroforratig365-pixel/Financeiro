# Comentários sobre o banco de dados - V4

## 2025-11-07
- migration `20251107200000_grant_movimentacao_access.sql` concedendo privilégios de escrita e uso de sequência para tabelas operacionais (pagamentos, receitas, saldos e cobranças), eliminando erros de permissão no frontend.
- migration `20251107201000_add_ctr_banco_relacao.sql` adicionando a coluna `ctr_ban_id` às contas de receita para permitir agrupamento por banco.
- migration `20251107203000_create_previsao_semanal_tables.sql` criando as tabelas `pvs_semanas` e `pvi_previsao_itens` utilizadas pela nova importação de previsão semanal.
