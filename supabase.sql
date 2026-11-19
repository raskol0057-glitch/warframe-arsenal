-- Warframe Arsenal: облачные профили. Выполнить один раз в Supabase → SQL Editor.
create table if not exists public.progress (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  name       text not null default 'Тэнно' check (char_length(name) <= 40),
  mastered   text[] not null default '{}',
  player_id  text check (player_id is null or player_id ~ '^[0-9a-f]{24}$'),
  updated_at timestamptz not null default now()
);

alter table public.progress enable row level security;

-- Каждый видит и меняет только свою строку.
drop policy if exists "own row: read"   on public.progress;
drop policy if exists "own row: insert" on public.progress;
drop policy if exists "own row: update" on public.progress;
drop policy if exists "own row: delete" on public.progress;
create policy "own row: read"   on public.progress for select using (auth.uid() = user_id);
create policy "own row: insert" on public.progress for insert with check (auth.uid() = user_id);
create policy "own row: update" on public.progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row: delete" on public.progress for delete using (auth.uid() = user_id);

-- Защита от раздувания: не больше 3000 отметок на аккаунт.
alter table public.progress drop constraint if exists mastered_size;
alter table public.progress add constraint mastered_size check (cardinality(mastered) <= 3000);
