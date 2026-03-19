-- Prevent multiple open intents for the same charge and close existing duplicates.

with ranked_open_intents as (
  select
    id,
    row_number() over (
      partition by charge_id
      order by created_at desc, id desc
    ) as rn
  from public.payment_intents
  where status in ('created', 'pending')
)
update public.payment_intents pi
set
  status = 'failed',
  last_error = coalesce(pi.last_error, 'Intent fechada automaticamente: duplicada por charge'),
  updated_at = now()
from ranked_open_intents r
where pi.id = r.id
  and r.rn > 1;

create unique index if not exists ux_payment_intents_open_charge
on public.payment_intents (charge_id)
where status in ('created', 'pending');
