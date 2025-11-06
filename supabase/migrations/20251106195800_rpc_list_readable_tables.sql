create or replace function financas.list_readable_tables(_schema text default 'financas')
returns table (table_name text)
language sql
as $$
  select c.relname::text as table_name
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = _schema
    and c.relkind = 'r'  -- base tables
    and has_table_privilege(current_user, format('"%s"."%s"', n.nspname, c.relname), 'SELECT')
  order by 1;
$$;

grant execute on function financas.list_readable_tables(text) to anon, authenticated;

notify pgrst, 'reload schema';
