# Comentários sobre o front-end - V16

## 2025-11-07
- Criado o componente `RequireUser` e incluído no layout principal para impedir acesso aos módulos sem um operador selecionado (`app/layout.tsx`, `components/layout/RequireUser.tsx`).
- Atualizado o dashboard para atuar como tela de boas-vindas com seleção rápida de módulos e destaque para o novo fluxo de cobranças (`app/dashboard/page.tsx`).
- Ajustada a seleção de operador para direcionar ao dashboard após ativar a sessão e exibir mensagens mais claras quando não houver usuário ativo (`app/page.tsx`, `lib/userSession.ts`, `components/layout/UserIdentifier.tsx`).
- Adicionada a nova tela de Lançamento de Cobrança com formulário dinâmico e histórico de registros (`app/cobrancas/page.tsx`) e o atalho correspondente no menu lateral (`components/layout/Sidebar.tsx`).
