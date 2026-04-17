-- Ensure deleting an auth user removes the app-owned user rows as well.

begin;

create or replace function public.handle_auth_user_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	delete from public.user_accounts where user_id = old.id;
	delete from public.user_profiles where user_id = old.id;
	return old;
end;
$$;

drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted
	after delete on auth.users
	for each row execute procedure public.handle_auth_user_deleted();

commit;