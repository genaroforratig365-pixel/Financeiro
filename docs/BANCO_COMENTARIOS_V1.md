# Comentários Banco de Dados - Versão 1

## Contexto da Atualização
- Liberação de escrita para a tabela `financas.usr_usuarios` garantindo que o fluxo sem autenticação possa registrar e atualizar perfis.

## Detalhes Técnicos
- Migration `20251107103000_grant_usr_usuarios_write_access.sql` concede `INSERT` e `UPDATE` aos papéis `anon` e `authenticated` sempre que a tabela existir.
- Ajuste de `ALTER DEFAULT PRIVILEGES` para manter os privilégios em novas tabelas do schema `financas`, evitando regressões futuras.
- Emissão do `NOTIFY pgrst, 'reload schema'` para invalidar o cache do PostgREST imediatamente após as alterações de permissão.

## Observações de Melhoria
- Revisar se demais tabelas de cadastro também necessitam de privilégios de escrita explícitos para o papel `anon` e adicionar à mesma migration se aplicável.
- Quando autenticação formal for habilitada, restringir os grants para o papel adequado e revisar as políticas RLS para evitar exposições indesejadas.
