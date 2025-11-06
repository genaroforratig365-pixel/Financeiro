# Comentários sobre o front-end - V9

## 2025-11-07
- criado helper `lib/supabaseErrors.ts` para traduzir erros do PostgREST em mensagens amigáveis, com foco em avisos de permissão negada.
- páginas de criação de áreas, contas de receita e bancos passaram a reutilizar o helper para exibir mensagens coerentes quando o Supabase bloquear a operação.
- tela de "Dados do Usuário" agora reutiliza a mesma lógica, evitando tratamento manual de strings de erro.
