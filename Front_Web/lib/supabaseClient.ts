import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// sempre trabalhar no schema 'financas'
const SCHEMA = "financas" as const;

function assertEnv() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY na Vercel.");
  }
}

export function getSupabaseServer(): SupabaseClient {
  assertEnv();
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: SCHEMA } });
}

export function getSupabaseClient(): SupabaseClient {
  assertEnv();
  if (typeof window === "undefined") throw new Error("getSupabaseClient() só no browser");
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: SCHEMA } });
}

/* helper opcional (deixa como estava) */
export async function getOrCreateUser(
  supabase: SupabaseClient,
  identificador: string,
  nome?: string
) {
  const { data: existing, error: findErr } = await supabase
    .from("usr_usuarios")
    .select("*")
    .eq("usr_identificador", identificador)
    .maybeSingle();

  if (findErr) return { data: null, error: findErr };
  if (existing) return { data: existing, error: null };

  const { data: inserted, error: insertErr } = await supabase
    .from("usr_usuarios")
    .insert({ usr_identificador: identificador, usr_nome: nome ?? null, usr_ativo: true })
    .select()
    .single();

  return { data: inserted ?? null, error: insertErr ?? null };
}
