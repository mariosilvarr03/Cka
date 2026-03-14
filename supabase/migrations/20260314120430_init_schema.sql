create extension if not exists pgcrypto;

do $$ begin
  create type app_role as enum ('athlete', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type product_type as enum ('monthly_fee', 'event_registration', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type charge_status as enum ('pending', 'paid', 'cancelled', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_method as enum ('online_card', 'mbway', 'multibanco', 'cash', 'bank_transfer', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type event_status as enum ('draft', 'open', 'closed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type registration_status as enum ('requested', 'confirmed', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.categories (
  id bigserial primary key,
  name text not null unique,
  monthly_fee numeric(10,2) not null check (monthly_fee >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role app_role not null default 'athlete',
  category_id bigint references public.categories(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_date date not null,
  registration_deadline date,
  status event_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (registration_deadline is null or registration_deadline <= event_date)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  type product_type not null,
  name text not null,
  description text,
  default_amount numeric(10,2) not null check (default_amount >= 0),
  category_id bigint references public.categories(id),
  event_id uuid references public.events(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (
    (type = 'monthly_fee' and category_id is not null and event_id is null) or
    (type = 'event_registration' and event_id is not null) or
    (type = 'other')
  )
);

create table if not exists public.charges (
  id uuid primary key default gen_random_uuid(),
  athlete_user_id uuid not null references public.profiles(user_id) on delete cascade,
  product_id uuid not null references public.products(id),
  amount numeric(10,2) not null check (amount >= 0),
  currency char(3) not null default 'EUR',
  due_date date,
  status charge_status not null default 'pending',
  billing_month smallint check (billing_month between 1 and 12),
  billing_year smallint check (billing_year >= 2020),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_charges_monthly_unique
on public.charges (athlete_user_id, product_id, billing_year, billing_month)
where billing_year is not null and billing_month is not null;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid not null references public.charges(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  method payment_method not null,
  paid_at timestamptz not null default now(),
  confirmed_by_user_id uuid references public.profiles(user_id),
  provider text,
  provider_ref text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  athlete_user_id uuid not null references public.profiles(user_id) on delete cascade,
  status registration_status not null default 'requested',
  charge_id uuid unique references public.charges(id),
  created_at timestamptz not null default now(),
  unique (event_id, athlete_user_id)
);

create index if not exists idx_profiles_category on public.profiles(category_id);
create index if not exists idx_charges_athlete_status on public.charges(athlete_user_id, status);
create index if not exists idx_charges_due_date on public.charges(due_date);
create index if not exists idx_payments_charge on public.payments(charge_id);
create index if not exists idx_events_date on public.events(event_date);

insert into public.categories (name, monthly_fee)
values
  ('iniciante', 25.00),
  ('intermediario', 30.00),
  ('competicao', 40.00)
on conflict (name) do nothing;
