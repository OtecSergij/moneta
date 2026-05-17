-- moneta MVP — initial schema
-- See docs/tech-spec.md §4 for design notes.

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────────────────────

create table public.categories (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  name        text        not null,
  color       text        not null,
  created_at  timestamptz not null default now(),
  constraint categories_name_per_user unique (user_id, name),
  constraint categories_name_len      check (char_length(trim(name)) between 1 and 40),
  constraint categories_color_hex     check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create index categories_user_idx on public.categories (user_id);

create table public.expenses (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  category_id  uuid        not null references public.categories(id) on delete restrict,
  amount_minor integer     not null check (amount_minor > 0),
  currency     text        not null default 'RUB' check (length(currency) = 3),
  note         text        check (note is null or char_length(note) <= 200),
  spent_at     date        not null,
  created_at   timestamptz not null default now()
);

create index expenses_user_spent_idx on public.expenses (user_id, spent_at desc);
create index expenses_category_idx   on public.expenses (category_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row-Level Security
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.categories enable row level security;
alter table public.expenses   enable row level security;

create policy "categories: own rows"
  on public.categories
  for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "expenses: own rows"
  on public.expenses
  for all
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);
