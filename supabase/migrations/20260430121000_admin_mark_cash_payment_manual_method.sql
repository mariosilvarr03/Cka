drop function if exists public.admin_mark_cash_payment(uuid, numeric, text);

create or replace function public.admin_mark_cash_payment(
  p_charge_id uuid,
  p_amount numeric,
  p_notes text default null,
  p_method payment_method default 'cash'
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

  if p_method not in ('cash', 'bank_transfer') then
    raise exception 'invalid payment method';
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
    p_method,
    now(),
    auth.uid(),
    p_notes
  )
  returning id into v_payment_id;

  return v_payment_id;
end;
$$;

revoke all on function public.admin_mark_cash_payment(uuid, numeric, text, payment_method) from public;
grant execute on function public.admin_mark_cash_payment(uuid, numeric, text, payment_method) to authenticated;
