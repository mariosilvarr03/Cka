-- Seed one monthly product per active category so charge generation has source products.

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
