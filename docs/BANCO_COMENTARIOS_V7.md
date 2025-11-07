# Comentários sobre o banco de dados - V7

## 2025-11-08
- Adicionada a migration `20251108100000_update_permissions_and_session.sql` com helpers para recuperar o operador da sessão, gatilho genérico que preenche automaticamente a coluna `*_usr_id` e novas políticas RLS garantindo que apenas requisições com `x-user-id` válido consigam inserir, atualizar ou remover registros das tabelas operacionais (`pag_pagamentos_area`, `rec_receitas`, `pbk_pagamentos_banco`, `sdb_saldo_banco` e `cob_cobrancas`).
- Criadas as estruturas `bcr_banco_conta` e `ctp_conta_tipo_receita` (migration `20251108101000_create_banco_conta_tipo_relations.sql`) para relacionar bancos às contas de receita e definir quais tipos ficam disponíveis em cada conta, mantendo gatilhos de timestamp, RLS e permissões de escrita alinhados ao novo helper de sessão.
- Atualizada a tabela `cob_cobrancas` pela migration `20251108102000_update_cobrancas_add_banco.sql`, acrescentando a coluna `cob_ban_id`, índice dedicado e rotina que tenta popular automaticamente o banco com base nos vínculos existentes entre bancos e contas de receita.
- Implementada a migration `20251108103000_create_previsao_semanal_tables.sql` criando a tabela `pvw_previsao_semana` para armazenar os lançamentos importados da planilha semanal, com índices por semana/data, gatilho de atualização, RLS baseada em sessão e permissões de uso da sequência.
