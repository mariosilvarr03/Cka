-- Harden profile self-update permissions and payment workflows.

-- Replace broad profile update policy with split policies.
drop policy if exists "profiles_update_own_or_admin" on public.profiles;

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
on public.profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "profiles_update_own_limited" on public.profiles;
create policy "profiles_update_own_limited"
on public.profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.protect_profile_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.user_id and not public.is_admin(auth.uid()) then
    if new.role is distinct from old.role
       or new.category_id is distinct from old.category_id
       or new.active is distinct from old.active then
      raise exception 'not authorized to change protected profile fields';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_sensitive_fields on public.profiles;
create trigger trg_protect_profile_sensitive_fields
before update on public.profiles
for each row
execute function public.protect_profile_sensitive_fields();

-- Ensure only admins or internal jobs can run monthly generation.
create or replace function public.generate_monthly_charges(
  p_year smallint default extract(year from now())::smallint,
  p_month smallint default extract(month from now())::smallint
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  if p_month < 1 or p_month > 12 then
    raise exception 'Invalid month: %', p_month;
  end if;

  if not (
    public.is_admin(auth.uid())
    or auth.role() = 'service_role'
    or current_user = 'postgres'
  ) then
    raise exception 'not authorized';
  end if;

  insert into public.charges (
    athlete_user_id,
    product_id,
    amount,
    currency,
    due_date,
    status,
    billing_month,
    billing_year
  )
  select
    pr.user_id,
    prod.id,
    prod.default_amount,
    'EUR',
    make_date(p_year, p_month, 10),
    'pending'::charge_status,
    p_month,
    p_year
  from public.profiles pr
  join public.products prod
    on prod.type = 'monthly_fee'
   and prod.active = true
   and prod.category_id = pr.category_id
  where pr.role = 'athlete'
    and pr.active = true
  on conflict (athlete_user_id, product_id, billing_year, billing_month)
  where billing_year is not null and billing_month is not null
  do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

-- Ensure cash payments are consistent and cannot be duplicated.
create or replace function public.admin_mark_cash_payment(
  p_charge_id uuid,
  p_amount numeric,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_charge_amount numeric;
  v_charge_status charge_status;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not authorized';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid amount';
  end if;

  select c.amount, c.status
  into v_charge_amount, v_charge_status
  from public.charges c
  where c.id = p_charge_id
  for update;

  if not found then
    raise exception 'charge not found';
  end if;

  if v_charge_status = 'paid' then
    raise exception 'charge already paid';
  end if;

  if exists (
    select 1
    from public.payments p
    where p.charge_id = p_charge_id
  ) then
    raise exception 'charge already has payments';
  end if;

  if p_amount <> v_charge_amount then
    raise exception 'amount mismatch';
  end if;

  insert into public.payments (
    charge_id,
    amount,
    method,
    paid_at,
    confirmed_by_user_id,
    notes
  )
  values (
    p_charge_id,
    p_amount,
    'cash',
    now(),
    auth.uid(),
    p_notes
  )
  returning id into v_payment_id;

  return v_payment_id;
end;
$$;
