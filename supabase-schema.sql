-- DreamDrum cloud sync schema. Run this in your Supabase project's SQL editor.

create table if not exists public.dreamdrum_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.dreamdrum_state enable row level security;

create policy "read own state"   on public.dreamdrum_state for select using (auth.uid() = user_id);
create policy "insert own state" on public.dreamdrum_state for insert with check (auth.uid() = user_id);
create policy "update own state" on public.dreamdrum_state for update using (auth.uid() = user_id);
