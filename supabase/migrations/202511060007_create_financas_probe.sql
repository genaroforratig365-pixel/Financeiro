-- Garante o schema
create schema if not exists financas;

-- (opcional) extensões usadas pelos defaults
create extension if not exists pgcrypto;

-- Tabela de prova no schema certo
create table if not exists financas.teste_ci (
  id uuid primary key default gen_random_uuid(),
  name text,
  created_at timestamptz not null default now()
);

-- Grants mínimos (ajuste conforme sua política)
grant usage on schema financas to anon, authenticated;
