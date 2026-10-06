-- Allow one auth.users deletion transaction to remove the complete private graph.
-- Catalog foreign keys intentionally remain RESTRICT/SET NULL as originally defined.
begin;

alter table public.observations
  drop constraint observations_import_owner_fkey,
  add constraint observations_import_owner_fkey
    foreign key (user_id, import_id)
    references public.sync_imports(user_id, id)
    on delete no action
    deferrable initially deferred;

alter table public.challenge_claims
  drop constraint challenge_claims_user_id_xp_event_id_fkey,
  add constraint challenge_claims_user_id_xp_event_id_fkey
    foreign key (user_id, xp_event_id)
    references public.xp_events(user_id, id)
    on delete no action
    deferrable initially deferred;

alter table public.sync_import_challenge_claims
  drop constraint sync_import_challenge_claims_user_id_import_id_fkey,
  drop constraint sync_import_challenge_claims_user_id_challenge_id_fkey,
  add constraint sync_import_challenge_claims_user_id_import_id_fkey
    foreign key (user_id, import_id)
    references public.sync_imports(user_id, id)
    on delete cascade,
  add constraint sync_import_challenge_claims_user_id_challenge_id_fkey
    foreign key (user_id, challenge_id)
    references public.challenge_claims(user_id, challenge_id)
    on delete cascade;

alter table public.sync_import_observations
  drop constraint sync_import_observations_import_fkey,
  drop constraint sync_import_observations_observation_fkey,
  add constraint sync_import_observations_import_fkey
    foreign key (user_id, import_id)
    references public.sync_imports(user_id, id)
    on delete cascade,
  add constraint sync_import_observations_observation_fkey
    foreign key (user_id, observation_id)
    references public.observations(user_id, id)
    on delete cascade;

alter table public.sync_legacy_observation_map
  drop constraint sync_legacy_observation_map_observation_fkey,
  add constraint sync_legacy_observation_map_observation_fkey
    foreign key (user_id, observation_id)
    references public.observations(user_id, id)
    on delete cascade;

commit;
