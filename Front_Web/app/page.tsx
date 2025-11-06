import { getSupabaseServer } from "../lib/supabaseClient";

import { redirect } from 'next/navigation';

function parseTablesEnv(): string[] {
  const raw = process.env.NEXT_PUBLIC_FINANCAS_TABLES || "";
  const list = raw.split(",").map(s => s.trim()).filter(Boolean);
  return list.length ? list : ["usr_usuarios"]; // fallback
}

export default async function Page() {
  const supabase = getSupabaseServer();
  const tables = parseTablesEnv();

  const results = await Promise.all(
    tables.map(async (t) => {
      const { data, error } = await supabase.from(t).select("*").order("id", { ascending: false }).limit(5);
      return { t, data, error };
    })
  );

  return (
    <main style={{ padding: 24 }}>
      <h1>Financeiro — Smoke Test</h1>
      <p>Schema: <b>financas</b> | Tabelas: <code>{tables.join(", ")}</code></p>

      {results.map(({ t, data, error }) => (
        <section key={t} style={{ marginTop: 20 }}>
          <h3>{t}</h3>
          {error ? (
            <pre style={{ color: "crimson" }}>{JSON.stringify(error, null, 2)}</pre>
          ) : (
            <pre>{JSON.stringify(data, null, 2)}</pre>
          )}
        </section>
      ))}

      <p style={{ marginTop: 12 }}>Healthcheck: <code>/api/health</code></p>
    </main>
  );
}
