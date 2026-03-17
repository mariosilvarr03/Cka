-- Phase 1.1:
-- - RLS policies for online payment support tables
-- - admin function to create event + athlete registrations + charges
-- - idempotent function to confirm external payments
-- - monthly generation rule: do not generate charges with amount = 0 (isento)

-- -----------------------------------------------------------------------------
-- RLS for payment_intents and payment_webhook_events
-- -----------------------------------------------------------------------------

drop policy if exists "payment_intents_read_own_or_admin" on public.payment_intents;
create policy "payment_intents_read_own_or_admin"
on public.payment_intents
for select
to authenticated
using (athlete_user_id = auth.uid() or public.is_admin());

-- No policies for payment_webhook_events on authenticated users by design.
-- This keeps webhook payloads inaccessible from normal authenticated sessions.

-- Keep payment_intents.updated_at in sync.
create or replace function public.touch_payment_intents_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_payment_intents_updated_at on public.payment_intents;
create trigger trg_touch_payment_intents_updated_at
before update on public.payment_intents
for each row
execute function public.touch_payment_intents_updated_at();

-- -----------------------------------------------------------------------------
-- Admin event creation with per-athlete amount
-- -----------------------------------------------------------------------------

create or replace function public.admin_create_event_with_registrations(
  p_title text,
  p_event_date date,
  p_payment_deadline date,
  p_registration_deadline date default null,
  p_description text default null,
  p_registrations jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_product_id uuid;
  v_charge_id uuid;
  v_due_date date;
  v_item jsonb;
  v_athlete_user_id uuid;
  v_amount numeric;
  v_exists_athlete boolean;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not authorized';
  end if;

  if p_title is null or btrim(p_title) = '' then
    raise exception 'event title is required';
  end if;

  if p_event_date is null then
    raise exception 'event date is required';
  end if;

  if p_payment_deadline is not null and p_payment_deadline > p_event_date then
    raise exception 'payment_deadline must be <= event_date';
  end if;

  if p_registration_deadline is not null and p_registration_deadline > p_event_date then
    raise exception 'registration_deadline must be <= event_date';
  end if;

  if jsonb_typeof(p_registrations) <> 'array' then
    raise exception 'registrations must be a JSON array';
  end if;

  if jsonb_array_length(p_registrations) = 0 then
    raise exception 'registrations cannot be empty';
  end if;

  insert into public.events (
    title,
    description,
    event_date,
    registration_deadline,
    payment_deadline,
    status
  )
  values (
    btrim(p_title),
    p_description,
    p_event_date,
    p_registration_deadline,
    p_payment_deadline,
    'open'
  )
  returning id into v_event_id;

  insert into public.products (
    type,
    name,
    description,
    default_amount,
    event_id,
    active
  )
  values (
    'event_registration',
    'Inscricao - ' || btrim(p_title),
    coalesce(p_description, 'Inscricao no evento ' || btrim(p_title)),
    0,
    v_event_id,
    true
  )
  returning id into v_product_id;

  v_due_date := coalesce(p_payment_deadline, p_event_date);

  for v_item in select value from jsonb_array_elements(p_registrations)
  loop
    v_athlete_user_id := (v_item ->> 'athlete_user_id')::uuid;
    v_amount := (v_item ->> 'amount')::numeric;

    if v_athlete_user_id is null then
      raise exception 'athlete_user_id is required in each registration item';
    end if;

    if v_amount is null or v_amount < 0 then
      raise exception 'amount must be >= 0 for athlete %', v_athlete_user_id;
    end if;

    select exists (
      select 1
      from public.profiles p
      where p.user_id = v_athlete_user_id
        and p.role = 'athlete'
        and p.active = true
    )
    into v_exists_athlete;

    if not v_exists_athlete then
      raise exception 'athlete % not found or inactive', v_athlete_user_id;
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
    values (
      v_athlete_user_id,
      v_product_id,
      v_amount,
      'EUR',
      v_due_date,
      'pending',
      null,
      null
    )
    returning id into v_charge_id;

    insert into public.event_registrations (
      event_id,
      athlete_user_id,
      status,
      charge_id
    )
    values (
      v_event_id,
      v_athlete_user_id,
      'confirmed',
      v_charge_id
    );
  end loop;

  return v_event_id;
end;
$$;

revoke all on function public.admin_create_event_with_registrations(text, date, date, date, text, jsonb) from public;
grant execute on function public.admin_create_event_with_registrations(text, date, date, date, text, jsonb) to authenticated;
grant execute on function public.admin_create_event_with_registrations(text, date, date, date, text, jsonb) to service_role;

-- -----------------------------------------------------------------------------
-- Idempotent external payment confirmation
-- -----------------------------------------------------------------------------

create or replace function public.confirm_external_payment(
  p_charge_id uuid,
  p_amount numeric,
  p_method payment_method,
  p_provider text,
  p_provider_ref text,
  p_paid_at timestamptz default now(),
  p_notes text default null,
  p_payment_intent_id uuid default null
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
  v_actor uuid;
begin
  if not (
    public.is_admin(auth.uid())
    or auth.role() = 'service_role'
    or current_user = 'postgres'
  ) then
    raise exception 'not authorized';
  end if;

  if p_charge_id is null then
    raise exception 'charge_id is required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid amount';
  end if;

  if p_provider is null or btrim(p_provider) = '' then
    raise exception 'provider is required';
  end if;

  if p_provider_ref is null or btrim(p_provider_ref) = '' then
    raise exception 'provider_ref is required';
  end if;

  select p.id
  into v_payment_id
  from public.payments p
  where p.provider = btrim(p_provider)
    and p.provider_ref = btrim(p_provider_ref)
  limit 1;

  if v_payment_id is not null then
    return v_payment_id;
  end if;

  select c.amount, c.status
  into v_charge_amount, v_charge_status
  from public.charges c
  where c.id = p_charge_id
  for update;

  if not found then
    raise exception 'charge not found';
  end if;

  if p_amount <> v_charge_amount then
    raise exception 'amount mismatch';
  end if;

  v_actor := case when public.is_admin(auth.uid()) then auth.uid() else null end;

  insert into public.payments (
    charge_id,
    amount,
    method,
    paid_at,
    confirmed_by_user_id,
    provider,
    provider_ref,
    notes
  )
  values (
    p_charge_id,
    p_amount,
    p_method,
    coalesce(p_paid_at, now()),
    v_actor,
    btrim(p_provider),
    btrim(p_provider_ref),
    p_notes
  )
  returning id into v_payment_id;

  if p_payment_intent_id is not null then
    update public.payment_intents pi
    set status = 'paid',
        paid_at = coalesce(p_paid_at, now()),
        updated_at = now(),
        last_error = null
    where pi.id = p_payment_intent_id;
  else
    update public.payment_intents pi
    set status = 'paid',
        paid_at = coalesce(p_paid_at, now()),
        updated_at = now(),
        last_error = null
    where pi.charge_id = p_charge_id
      and pi.provider = btrim(p_provider)
      and pi.status in ('created', 'pending');
  end if;

  return v_payment_id;
exception
  when unique_violation then
    select p.id
    into v_payment_id
    from public.payments p
    where p.provider = btrim(p_provider)
      and p.provider_ref = btrim(p_provider_ref)
    limit 1;

    if v_payment_id is null then
      raise;
    end if;

    return v_payment_id;
end;
$$;

revoke all on function public.confirm_external_payment(uuid, numeric, payment_method, text, text, timestamptz, text, uuid) from public;
grant execute on function public.confirm_external_payment(uuid, numeric, payment_method, text, text, timestamptz, text, uuid) to authenticated;
grant execute on function public.confirm_external_payment(uuid, numeric, payment_method, text, text, timestamptz, text, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Monthly generation: do not create zero-value charges (isento)
-- -----------------------------------------------------------------------------

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
    and prod.default_amount > 0
  on conflict (athlete_user_id, product_id, billing_year, billing_month)
  where billing_year is not null and billing_month is not null
  do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;
