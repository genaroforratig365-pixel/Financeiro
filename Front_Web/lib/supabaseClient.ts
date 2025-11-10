import {
  createClient,
  type PostgrestError,
  type SupabaseClient,
} from "@supabase/supabase-js";

import { USER_ID_STORAGE_KEY } from "./sessionKeys";
import { getUserId } from "./userSession";

// ENV obrigatórias
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SCHEMA = "financas" as const;

function assertEnv() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY na Vercel."
    );
  }
}

/** Cliente para uso em Server Components / Route Handlers */
export function getSupabaseServer() {
  assertEnv();
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: SCHEMA },
  });
}

/** Cliente para uso em Client Components (browser) */
type ClientOptions = {
  /**
   * Define se o cabeçalho de sessão (x-user-id) deve ser enviado automaticamente.
   * Útil para chamadas internas que já definiram manualmente o cabeçalho.
   */
  includeSessionHeader?: boolean;
  /**
   * Cabeçalhos adicionais a serem enviados com todas as requisições.
   */
  headers?: Record<string, string | undefined>;
};

export type UsuarioRow = {
  usr_id: string;
  usr_identificador: string;
  usr_nome: string | null;
  usr_email: string | null;
  usr_ativo: boolean;
};

type GetOrCreateUserResult = {
  data: UsuarioRow | null;
  error: PostgrestError | null;
};

export function getSupabaseClient(options: ClientOptions = {}) {
  assertEnv();
  if (typeof window === "undefined") {
    throw new Error("getSupabaseClient() só pode ser usado no browser");
  }

  const sessionHeaders: Record<string, string> = {};

  if (options.includeSessionHeader !== false) {
    const userId = getUserId();
    if (userId) {
      sessionHeaders["x-user-id"] = userId;
    }
  }

  const extraHeaders = Object.entries(options.headers ?? {}).reduce(
    (acc, [key, value]) => {
      if (value) {
        acc[key] = value;
      }
      return acc;
    },
    {} as Record<string, string>
  );

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: SCHEMA },
    global: {
      headers: {
        ...sessionHeaders,
        ...extraHeaders,
      },
    },
  });
}

function ensureUserIdFromBrowser(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(USER_ID_STORAGE_KEY);
    if (stored && stored.trim().length > 0) {
      return stored;
    }

    const uuid = window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    window.localStorage.setItem(USER_ID_STORAGE_KEY, uuid);
    return uuid;
  } catch (error) {
    console.warn("Não foi possível acessar o localStorage para obter o usuário da sessão.", error);
    return null;
  }
}

/** Helper opcional */
type AnySupabaseClient = SupabaseClient<any, any, any>;

export async function getOrCreateUser(
  supabase: AnySupabaseClient,
  identificador: string,
  nome?: string | null,
  email?: string | null
): Promise<GetOrCreateUserResult> {
  const { data: existing, error: findErr } = await supabase
    .from("usr_usuarios")
    .select("*")
    .eq("usr_identificador", identificador)
    .maybeSingle();
  if (findErr) return { data: null, error: findErr };

  const usuarioExistente = existing as UsuarioRow | null;
  if (usuarioExistente) {
    const updates: Partial<Pick<UsuarioRow, "usr_nome" | "usr_email">> = {};
    // Só atualiza o nome se for fornecido E não for vazio
    if (nome && nome.trim().length > 0 && nome !== usuarioExistente.usr_nome) {
      updates.usr_nome = nome.trim();
    }
    if (email && email.trim().length > 0 && email !== usuarioExistente.usr_email) {
      updates.usr_email = email.trim();
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateErr } = await supabase
        .from("usr_usuarios")
        .update(updates)
        .eq("usr_id", usuarioExistente.usr_id);

      if (updateErr) {
        return { data: usuarioExistente, error: updateErr };
      }

      const updated: UsuarioRow = {
        ...usuarioExistente,
        ...updates,
      };

      return { data: updated, error: null };
    }

    return { data: usuarioExistente, error: null };
  }

  // Não permite criar usuário sem nome
  const nomeValido = nome && nome.trim().length > 0 ? nome.trim() : null;
  if (!nomeValido) {
    return {
      data: null,
      error: {
        message: 'Não é possível criar um usuário sem nome. Entre em contato com o administrador (Genaro) para cadastro.',
        details: '',
        hint: '',
        code: 'NOME_OBRIGATORIO'
      } as PostgrestError
    };
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("usr_usuarios")
    .insert({
      usr_identificador: identificador,
      usr_nome: nomeValido,
      usr_email: email && email.trim().length > 0 ? email.trim() : null,
      usr_ativo: true,
    })
    .select()
    .single();

  if (insertErr) {
    return { data: null, error: insertErr };
  }

  return {
    data: inserted ?? null,
    error: insertErr ?? null,
  };
}
