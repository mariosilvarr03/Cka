-- Helper para verificar se o utilizador autenticado é admin
create or replace function public.is_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = check_user_id
      and p.role = 'admin'
      and p.active = true
  );
$$;

-- Ativar RLS
alter table public.categories enable row level security;
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.products enable row level security;
alter table public.charges enable row level security;
alter table public.payments enable row level security;
alter table public.event_registrations enable row level security;

-- Limpar policies antigas (se existirem)
drop policy if exists "categories_read_auth" on public.categories;
drop policy if exists "categories_admin_write" on public.categories;

drop policy if exists "profiles_read_own_or_admin" on public.profiles;
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
drop policy if exists "profiles_insert_admin" on public.profiles;
drop policy if exists "profiles_delete_admin" on public.profiles;

drop policy if exists "events_read_auth" on public.events;
drop policy if exists "events_admin_write" on public.events;

drop policy if exists "products_read_auth" on public.products;
drop policy if exists "products_admin_write" on public.products;

drop policy if exists "charges_read_own_or_admin" on public.charges;
drop policy if exists "charges_insert_admin" on public.charges;
drop policy if exists "charges_update_admin" on public.charges;
drop policy if exists "charges_delete_admin" on public.charges;

drop policy if exists "payments_read_own_or_admin" on public.payments;
drop policy if exists "payments_insert_admin" on public.payments;
drop policy if exists "payments_update_admin" on public.payments;
drop policy if exists "payments_delete_admin" on public.payments;

drop policy if exists "event_regs_read_own_or_admin" on public.event_registrations;
drop policy if exists "event_regs_insert_own_or_admin" on public.event_registrations;
drop policy if exists "event_regs_update_own_or_admin" on public.event_registrations;
drop policy if exists "event_regs_delete_admin" on public.event_registrations;

-- categories
create policy "categories_read_auth"
on public.categories
for select
to authenticated
using (true);

create policy "categories_admin_write"
on public.categories
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- profiles
create policy "profiles_read_own_or_admin"
on public.profiles
for select
to authenticated
using (auth.uid() = user_id or public.is_admin());

create policy "profiles_update_own_or_admin"
on public.profiles
for update
to authenticated
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

create policy "profiles_insert_admin"
on public.profiles
for insert
to authenticated
with check (public.is_admin());

create policy "profiles_delete_admin"
on public.profiles
for delete
to authenticated
using (public.is_admin());

-- events
create policy "events_read_auth"
on public.events
for select
to authenticated
using (true);

create policy "events_admin_write"
on public.events
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- products
create policy "products_read_auth"
on public.products
for select
to authenticated
using (true);

create policy "products_admin_write"
on public.products
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- charges
create policy "charges_read_own_or_admin"
on public.charges
for select
to authenticated
using (athlete_user_id = auth.uid() or public.is_admin());

create policy "charges_insert_admin"
on public.charges
for insert
to authenticated
with check (public.is_admin());

create policy "charges_update_admin"
on public.charges
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "charges_delete_admin"
on public.charges
for delete
to authenticated
using (public.is_admin());

-- payments
create policy "payments_read_own_or_admin"
on public.payments
for select
to authenticated
using (
  exists (
    select 1
    from public.charges c
    where c.id = payments.charge_id
      and (c.athlete_user_id = auth.uid() or public.is_admin())
  )
);

create policy "payments_insert_admin"
on public.payments
for insert
to authenticated
with check (public.is_admin());

create policy "payments_update_admin"
on public.payments
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "payments_delete_admin"
on public.payments
for delete
to authenticated
using (public.is_admin());

-- event_registrations
create policy "event_regs_read_own_or_admin"
on public.event_registrations
for select
to authenticated
using (athlete_user_id = auth.uid() or public.is_admin());

create policy "event_regs_insert_own_or_admin"
on public.event_registrations
for insert
to authenticated
with check (athlete_user_id = auth.uid() or public.is_admin());

create policy "event_regs_update_own_or_admin"
on public.event_registrations
for update
to authenticated
using (athlete_user_id = auth.uid() or public.is_admin())
with check (athlete_user_id = auth.uid() or public.is_admin());

create policy "event_regs_delete_admin"
on public.event_registrations
for delete
to authenticated
using (public.is_admin());

-- Trigger: quando entra pagamento, marca cobrança como paga
create or replace function public.mark_charge_paid_on_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.charges
  set status = 'paid',
      updated_at = now()
  where id = new.charge_id
    and status <> 'paid';
  return new;
end;
$$;

drop trigger if exists trg_mark_charge_paid_on_payment on public.payments;
create trigger trg_mark_charge_paid_on_payment
after insert on public.payments
for each row
execute function public.mark_charge_paid_on_payment();
