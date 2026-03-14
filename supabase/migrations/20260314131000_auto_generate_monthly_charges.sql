create extension if not exists pg_cron;

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

revoke all on function public.generate_monthly_charges(smallint, smallint) from public;
grant execute on function public.generate_monthly_charges(smallint, smallint) to authenticated;

-- Backfill for current month so new setup starts working immediately.
select public.generate_monthly_charges();

-- Schedule monthly run at 00:05 on day 1 of each month (UTC).
do $do$
begin
  if not exists (
    select 1
    from cron.job
    where jobname = 'generate-monthly-charges'
  ) then
    perform cron.schedule(
      'generate-monthly-charges',
      '5 0 1 * *',
      $job$select public.generate_monthly_charges();$job$
    );
  end if;
end;
$do$;
