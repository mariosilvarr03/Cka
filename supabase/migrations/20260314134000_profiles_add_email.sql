alter table public.profiles
add column if not exists email text;

update public.profiles p
set email = u.email,
    updated_at = now()
from auth.users u
where u.id = p.user_id
  and (p.email is distinct from u.email);

create unique index if not exists ux_profiles_email_lower
on public.profiles (lower(email))
where email is not null;

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
  where name = 'iniciante'
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
