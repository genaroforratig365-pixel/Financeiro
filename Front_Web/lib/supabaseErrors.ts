import type { PostgrestError } from "@supabase/supabase-js";

function isPostgrestError(value: unknown): value is PostgrestError {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PostgrestError>;
  return (
    typeof candidate.code === "string" &&
    typeof candidate.message === "string"
  );
}

/**
 * Converte erros do Supabase em mensagens amigáveis para o usuário final.
 */
export function traduzirErroSupabase(
  error: unknown,
  mensagemPadrao: string
): string {
  if (!error) {
    return mensagemPadrao;
  }

  if (isPostgrestError(error)) {
    if (error.code === "42501") {
      return "Permissão negada para executar esta ação. Confirme se as permissões foram aplicadas no banco de dados e tente novamente.";
    }

    if (error.message.trim().length > 0) {
      return error.message;
    }
  }

  if (error instanceof Error) {
    return error.message || mensagemPadrao;
  }

  return mensagemPadrao;
}
