import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
export function getSupabaseClient() {
  assertEnv();
  if (typeof window === "undefined") {
    throw new Error("getSupabaseClient() só pode ser usado no browser");
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: SCHEMA },
  });
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

  return { data: inserted ?? null, error: insertErr ?? null };
}
