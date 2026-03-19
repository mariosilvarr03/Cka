-- Move monthly fee due date to the last day of each month.
-- Keeps "isento" excluded via prod.default_amount > 0.

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
    (date_trunc('month', make_date(p_year, p_month, 1)::timestamp) + interval '1 month - 1 day')::date,
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

-- Optional historical alignment: update unpaid monthly charges to month-end.
update public.charges c
set due_date = (
  date_trunc('month', make_date(c.billing_year, c.billing_month, 1)::timestamp)
  + interval '1 month - 1 day'
)::date,
updated_at = now()
from public.products p
where c.product_id = p.id
  and p.type = 'monthly_fee'
  and c.billing_year is not null
  and c.billing_month is not null
  and c.status <> 'paid'
  and c.due_date is distinct from (
    date_trunc('month', make_date(c.billing_year, c.billing_month, 1)::timestamp)
    + interval '1 month - 1 day'
  )::date;
