# Comentários Frontend - Versão 8

## Contexto da Atualização
- Ajuste na tela de "Dados do Usuário" para reportar erros de permissão ao salvar e manter o estado local sincronizado.
- Padronização do helper `getOrCreateUser` com tipagens explícitas, cobrindo erros de atualização no Supabase.

## Detalhes Técnicos
- Tipagem `UsuarioRow` exportada por `lib/supabaseClient`, reutilizada na página de cadastro para evitar casts com `any`.
- `getOrCreateUser` agora retorna `{ data, error }` com `PostgrestError`, valida `UPDATE` antes de confirmar sucesso e propaga falhas de `INSERT`.
- O formulário de usuário verifica `error` após `update`, mantém o estado `usuario` alinhado com o que foi persistido e só atualiza o `localStorage` quando o Supabase confirmar a operação.

## Observações de Melhoria
- Considerar feedback granular no UI exibindo mensagens específicas do `PostgrestError` quando apropriado.
- Avaliar reutilizar o mesmo padrão de tratamento de erros nas demais páginas de cadastro que atualizam registros.
