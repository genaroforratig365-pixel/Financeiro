// Front_Web/app/page.tsx
import { getSupabaseServer } from "../lib/supabaseClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SCHEMA = process.env.NEXT_PUBLIC_SUPABASE_SCHEMA ?? "public";
// Se o schema ativo for "financas", lê a tabela direta; senão, usa a view no public
const TABLE = SCHEMA === "financas" ? "teste_ci" : "v_teste_ci";

export default async function Page() {
  const supabase = getSupabaseServer();

  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("id", { ascending: false })
    .limit(5);

  return (
    <main>
      <h1>Financeiro — Smoke Test</h1>
      <p>Schema: <b>{SCHEMA}</b> | Fonte: <b>{TABLE}</b></p>

      {error ? (
        <pre style={{ color: "crimson" }}>{JSON.stringify(error, null, 2)}</pre>
      ) : (
        <pre>{JSON.stringify(data, null, 2)}</pre>
      )}

      <p style={{ marginTop: 12 }}>
        Healthcheck: <code>/api/health</code>
      </p>
    </main>
  );
}
