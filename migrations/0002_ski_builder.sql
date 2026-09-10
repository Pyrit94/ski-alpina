create table if not exists resorts (
  id text primary key,
  name text not null,
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);
