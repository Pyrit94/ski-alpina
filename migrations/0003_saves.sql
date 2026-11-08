-- Games and their save points.
--
-- A game is a resort that keeps running (and saving itself) as before; its
-- kind says whether everyone on the roster shares it or one person owns it.
-- A save is a named snapshot of a game, as many as anyone likes, to go back
-- to on purpose.
alter table resorts add column if not exists kind text not null default 'shared';
alter table resorts add column if not exists owner text;
alter table resorts add column if not exists created_at timestamptz not null default now();

-- Before this, "Eigenes Gebiet" opened a fresh random room nobody could find
-- again. Those are personal games now; who made them is not recorded, so
-- they stay visible to everyone.
update resorts set kind = 'own' where id like 'resort-%' and kind = 'shared';

create table if not exists resort_saves (
  id text primary key,
  resort_id text not null,
  name text not null,
  snapshot jsonb not null,
  summary jsonb not null default '{}'::jsonb,
  created_by text,
  created_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists resort_saves_resort_idx on resort_saves (resort_id, created_at desc);
