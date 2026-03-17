-- Phase 1 foundation:
-- 1) settle athlete categories and monthly amounts
-- 2) extend events with payment_deadline
-- 3) add payment intents and webhook event storage for online providers

-- -----------------------------------------------------------------------------
-- Categories aligned with stakeholder decision
-- -----------------------------------------------------------------------------

update public.categories
set
  name = 'singular',
  monthly_fee = 30.00,
  active = true
where lower(name) in ('iniciante', 'singular');

update public.categories
set
  name = 'familiar',
  monthly_fee = 50.00,
  active = true
where lower(name) in ('intermediario', 'familiar');

update public.categories
set
  name = 'isento',
  monthly_fee = 0.00,
  active = true
where lower(name) in ('competicao', 'isento');

insert into public.categories (name, monthly_fee, active)
values
  ('singular', 30.00, true),
  ('familiar', 50.00, true),
  ('isento', 0.00, true)
on conflict (name)
do update set
  monthly_fee = excluded.monthly_fee,
  active = excluded.active;

-- Keep only official categories active.
update public.categories
set active = false
where lower(name) not in ('singular', 'familiar', 'isento');

-- Keep monthly products consistent with category prices and naming.
update public.products p
set
  default_amount = c.monthly_fee,
  name = 'Mensalidade - ' || initcap(c.name),
  description = 'Mensalidade automatica da categoria ' || c.name
from public.categories c
where p.type = 'monthly_fee'
  and p.category_id = c.id
  and p.event_id is null;

insert into public.products (
  type,
  name,
  description,
  default_amount,
  category_id,
  event_id,
  active
)
select
  'monthly_fee',
  'Mensalidade - ' || initcap(c.name),
  'Mensalidade automatica da categoria ' || c.name,
  c.monthly_fee,
  c.id,
  null,
  true
from public.categories c
where c.active = true
  and not exists (
    select 1
    from public.products p
    where p.type = 'monthly_fee'
      and p.category_id = c.id
      and p.event_id is null
  );

-- New signups should default to the singular category.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_category_id bigint;
  derived_name text;
begin
  select id
  into default_category_id
  from public.categories
  where name = 'singular'
  limit 1;

  derived_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (user_id, full_name, email, role, category_id, active)
  values (new.id, derived_name, new.email, 'athlete', default_category_id, true)
  on conflict (user_id) do update
  set email = excluded.email,
      updated_at = now();

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Events extension
-- -----------------------------------------------------------------------------

alter table public.events
add column if not exists payment_deadline date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'events_payment_deadline_before_event_check'
      and conrelid = 'public.events'::regclass
  ) then
    alter table public.events
    add constraint events_payment_deadline_before_event_check
    check (payment_deadline is null or payment_deadline <= event_date);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Online payment foundation
-- -----------------------------------------------------------------------------

do $$ begin
  create type payment_intent_status as enum (
    'created',
    'pending',
    'paid',
    'failed',
    'expired',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid not null references public.charges(id) on delete cascade,
  athlete_user_id uuid not null references public.profiles(user_id) on delete cascade,
  provider text not null,
  method payment_method not null,
  amount numeric(10,2) not null check (amount > 0),
  currency char(3) not null default 'EUR',
  status payment_intent_status not null default 'created',
  external_request_id text,
  external_reference text,
  external_entity text,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  last_error text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payment_intents_charge
on public.payment_intents (charge_id);

create index if not exists idx_payment_intents_athlete_status
on public.payment_intents (athlete_user_id, status);

create unique index if not exists ux_payment_intents_provider_request
on public.payment_intents (provider, external_request_id)
where external_request_id is not null;

create table if not exists public.payment_webhook_events (
  id bigserial primary key,
  provider text not null,
  external_event_id text not null,
  event_type text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);

create unique index if not exists ux_payment_webhook_provider_event
on public.payment_webhook_events (provider, external_event_id);

create unique index if not exists ux_payments_provider_ref
on public.payments (provider, provider_ref)
where provider is not null
  and provider_ref is not null;

alter table public.payment_intents enable row level security;
alter table public.payment_webhook_events enable row level security;
