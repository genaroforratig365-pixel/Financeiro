import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
) {
  const { data: existing, error: findErr } = await supabase
    .from("usr_usuarios")
    .select("*")
    .eq("usr_identificador", identificador)
    .maybeSingle();
  if (findErr) return { data: null, error: findErr };
  if (existing) {
    const updates: Record<string, unknown> = {};
    if (nome && nome !== existing.usr_nome) {
      updates.usr_nome = nome;
    }
    if (email && email !== (existing as any).usr_email) {
      updates.usr_email = email;
    }

    if (Object.keys(updates).length > 0) {
      await supabase
        .from("usr_usuarios")
        .update(updates)
        .eq("usr_id", existing.usr_id);
    }

    return { data: { ...existing, ...updates }, error: null };
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("usr_usuarios")
    .insert({
      usr_identificador: identificador,
      usr_nome: nome ?? null,
      usr_email: email ?? null,
      usr_ativo: true,
    })
    .select()
    .single();

  return {
    data: inserted ?? null,
    error: insertErr ?? null,
  };
}
