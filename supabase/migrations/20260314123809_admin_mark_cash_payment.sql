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
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'not authorized';
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

revoke all on function public.admin_mark_cash_payment(uuid, numeric, text) from public;
grant execute on function public.admin_mark_cash_payment(uuid, numeric, text) to authenticated;
