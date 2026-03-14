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

  insert into public.profiles (user_id, full_name, role, category_id, active)
  values (new.id, derived_name, 'athlete', default_category_id, true)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
