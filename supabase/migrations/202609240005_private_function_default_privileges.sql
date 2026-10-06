-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. A schema-level
-- REVOKE cannot remove that global default, so configure each actual creator role.
do $$
declare
  creator record;
begin
  if to_regnamespace('private') is null then
    raise exception 'Expected schema private does not exist';
  end if;

  for creator in
    select distinct roles.oid as role_oid, roles.rolname as role_name
    from pg_catalog.pg_proc functions
    join pg_catalog.pg_namespace namespaces on namespaces.oid = functions.pronamespace
    join pg_catalog.pg_roles roles on roles.oid = functions.proowner
    where namespaces.nspname = 'private'

    union

    select roles.oid, roles.rolname
    from pg_catalog.pg_roles roles
    where roles.rolname = current_user
  loop
    execute format(
      'alter default privileges for role %I revoke execute on functions from public',
      creator.role_name
    );
    execute format(
      'alter default privileges for role %I revoke execute on functions from anon, authenticated',
      creator.role_name
    );
  end loop;
end;
$$;

