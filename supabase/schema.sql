-- ExpenseBook database schema.
-- Run this once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- It is safe to re-run: every statement is idempotent.

-- ─────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  name       text,
  created_at timestamptz not null default now()
);

create table if not exists public.ledgers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) between 1 and 100),
  owner_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.ledger_members (
  ledger_id  uuid not null references public.ledgers (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       text not null check (role in ('owner', 'editor')),
  created_at timestamptz not null default now(),
  primary key (ledger_id, user_id)
);

create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  ledger_id  uuid not null references public.ledgers (id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);
create unique index if not exists categories_ledger_name_key
  on public.categories (ledger_id, lower(name));

create table if not exists public.entries (
  id          uuid primary key default gen_random_uuid(),
  -- Insertion order; breaks ties between entries at the same minute so the
  -- order (and running balance) of a CSV import is preserved.
  seq         bigint generated always as identity,
  ledger_id   uuid not null references public.ledgers (id) on delete cascade,
  type        text not null check (type in ('in', 'out')),
  amount      numeric(14, 2) not null check (amount > 0),
  occurred_at timestamptz not null,
  remark      text not null default '',
  category_id uuid references public.categories (id) on delete set null,
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists entries_ledger_time_idx on public.entries (ledger_id, occurred_at, seq);

-- ─────────────────────────────────────────────────────────────
-- Triggers
-- ─────────────────────────────────────────────────────────────

-- Create a profile row whenever someone signs in for the first time.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- The creator of a ledger automatically becomes its owner member.
create or replace function public.handle_new_ledger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.ledger_members (ledger_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end $$;

drop trigger if exists on_ledger_created on public.ledgers;
create trigger on_ledger_created
  after insert on public.ledgers
  for each row execute function public.handle_new_ledger();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists entries_touch_updated_at on public.entries;
create trigger entries_touch_updated_at
  before update on public.entries
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Access rules (Row Level Security)
-- ─────────────────────────────────────────────────────────────

-- security definer so policies can check membership without recursing into
-- ledger_members' own policies.
create or replace function public.is_ledger_member(p_ledger_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.ledger_members
    where ledger_id = p_ledger_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_ledger_owner(p_ledger_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.ledgers
    where id = p_ledger_id and owner_id = auth.uid()
  );
$$;

alter table public.profiles       enable row level security;
alter table public.ledgers        enable row level security;
alter table public.ledger_members enable row level security;
alter table public.categories     enable row level security;
alter table public.entries        enable row level security;

-- Profiles: see yourself and anyone you share a ledger with.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (
  id = auth.uid() or exists (
    select 1 from public.ledger_members mine
    join public.ledger_members theirs on theirs.ledger_id = mine.ledger_id
    where mine.user_id = auth.uid() and theirs.user_id = profiles.id
  )
);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (id = auth.uid());

-- Ledgers: members read; anyone signed in creates their own; owner renames/deletes.
drop policy if exists ledgers_select on public.ledgers;
-- owner_id check is needed for `insert ... returning`: the owner's membership
-- row is added by an after-insert trigger, which hasn't run when RETURNING is checked.
create policy ledgers_select on public.ledgers for select
  using (owner_id = auth.uid() or public.is_ledger_member(id));
drop policy if exists ledgers_insert on public.ledgers;
create policy ledgers_insert on public.ledgers for insert with check (owner_id = auth.uid());
drop policy if exists ledgers_update on public.ledgers;
create policy ledgers_update on public.ledgers for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists ledgers_delete on public.ledgers;
create policy ledgers_delete on public.ledgers for delete using (owner_id = auth.uid());

-- Members: members see the member list; owner removes others; anyone can leave.
-- Adding members goes through add_ledger_member() below.
drop policy if exists members_select on public.ledger_members;
create policy members_select on public.ledger_members for select
  using (public.is_ledger_member(ledger_id));
drop policy if exists members_delete on public.ledger_members;
create policy members_delete on public.ledger_members for delete using (
  role <> 'owner' and (user_id = auth.uid() or public.is_ledger_owner(ledger_id))
);

-- Categories and entries: any member has full access.
drop policy if exists categories_all on public.categories;
create policy categories_all on public.categories for all
  using (public.is_ledger_member(ledger_id))
  with check (public.is_ledger_member(ledger_id));

drop policy if exists entries_all on public.entries;
create policy entries_all on public.entries for all
  using (public.is_ledger_member(ledger_id))
  with check (public.is_ledger_member(ledger_id));

-- ─────────────────────────────────────────────────────────────
-- Functions called by the app
-- ─────────────────────────────────────────────────────────────

-- Share a ledger with someone by email. They must have signed in once.
create or replace function public.add_ledger_member(p_ledger_id uuid, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid;
begin
  if not public.is_ledger_owner(p_ledger_id) then
    raise exception 'Only the ledger owner can add members';
  end if;

  select id into v_user_id from public.profiles where lower(email) = lower(trim(p_email));
  if v_user_id is null then
    raise exception 'No user with email %. Ask them to sign in to ExpenseBook once first.', p_email;
  end if;

  insert into public.ledger_members (ledger_id, user_id, role)
  values (p_ledger_id, v_user_id, 'editor')
  on conflict (ledger_id, user_id) do nothing;
end $$;

-- Totals for every ledger the current user can see.
create or replace view public.ledger_summaries
with (security_invoker = true) as
select
  l.id,
  l.name,
  l.owner_id,
  l.created_at,
  coalesce(sum(e.amount) filter (where e.type = 'in'), 0)  as total_in,
  coalesce(sum(e.amount) filter (where e.type = 'out'), 0) as total_out,
  count(e.id)                                              as entry_count,
  max(e.occurred_at)                                       as last_entry_at,
  (select count(*) from public.ledger_members m where m.ledger_id = l.id) as member_count
from public.ledgers l
left join public.entries e on e.ledger_id = l.id
group by l.id;

grant select on public.ledger_summaries to authenticated;
