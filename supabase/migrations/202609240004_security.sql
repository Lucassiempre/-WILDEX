alter table public.species enable row level security;
alter table public.species_variants enable row level security;
alter table public.thematic_collections enable row level security;
alter table public.thematic_collection_species enable row level security;
alter table public.profiles enable row level security;
alter table public.observations enable row level security;
alter table public.badges enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_objectives enable row level security;
alter table public.user_species_discoveries enable row level security;
alter table public.user_variant_discoveries enable row level security;
alter table public.xp_events enable row level security;
alter table public.challenge_claims enable row level security;
alter table public.user_badges enable row level security;
alter table public.profile_featured_badges enable row level security;

revoke all on table
  public.species,
  public.species_variants,
  public.thematic_collections,
  public.thematic_collection_species,
  public.profiles,
  public.observations,
  public.badges,
  public.challenges,
  public.challenge_objectives,
  public.user_species_discoveries,
  public.user_variant_discoveries,
  public.xp_events,
  public.challenge_claims,
  public.user_badges,
  public.profile_featured_badges
from anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

grant select on public.species, public.species_variants, public.thematic_collections,
  public.thematic_collection_species, public.badges, public.challenges,
  public.challenge_objectives to anon, authenticated;
grant select, insert, update, delete on public.profiles, public.observations to authenticated;
grant select on public.user_species_discoveries, public.user_variant_discoveries,
  public.xp_events, public.challenge_claims, public.user_badges,
  public.profile_featured_badges to authenticated;
grant insert, update, delete on public.profile_featured_badges to authenticated;

create policy species_read_active
on public.species for select
to anon, authenticated
using (active);

create policy variants_read_active
on public.species_variants for select
to anon, authenticated
using (
  active and exists (
    select 1 from public.species
    where species.id = species_variants.species_id and species.active
  )
);

create policy thematic_collections_read_active
on public.thematic_collections for select
to anon, authenticated
using (active);

create policy thematic_collection_species_read_active
on public.thematic_collection_species for select
to anon, authenticated
using (
  exists (
    select 1 from public.thematic_collections
    where thematic_collections.id = thematic_collection_species.collection_id
      and thematic_collections.active
  )
);

create policy badges_read
on public.badges for select
to anon, authenticated
using (true);

create policy challenges_read_visible
on public.challenges for select
to anon, authenticated
using (status in ('scheduled', 'published', 'archived'));

create policy challenge_objectives_read_visible
on public.challenge_objectives for select
to anon, authenticated
using (
  exists (
    select 1 from public.challenges
    where challenges.id = challenge_objectives.challenge_id
      and challenges.status in ('scheduled', 'published', 'archived')
  )
);

create policy profiles_select_own
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

create policy profiles_insert_own
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = id);

create policy profiles_update_own
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy profiles_delete_own
on public.profiles for delete
to authenticated
using ((select auth.uid()) = id);

create policy observations_select_own
on public.observations for select
to authenticated
using ((select auth.uid()) = user_id);

create policy observations_insert_own
on public.observations for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and deleted_at is null
);

create policy observations_update_own
on public.observations for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy observations_delete_own
on public.observations for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy species_discoveries_select_own
on public.user_species_discoveries for select
to authenticated
using ((select auth.uid()) = user_id);

create policy variant_discoveries_select_own
on public.user_variant_discoveries for select
to authenticated
using ((select auth.uid()) = user_id);

create policy xp_events_select_own
on public.xp_events for select
to authenticated
using ((select auth.uid()) = user_id);

create policy challenge_claims_select_own
on public.challenge_claims for select
to authenticated
using ((select auth.uid()) = user_id);

create policy user_badges_select_own
on public.user_badges for select
to authenticated
using ((select auth.uid()) = user_id);

create policy featured_badges_select_own
on public.profile_featured_badges for select
to authenticated
using ((select auth.uid()) = user_id);

create policy featured_badges_insert_own
on public.profile_featured_badges for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy featured_badges_update_own
on public.profile_featured_badges for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy featured_badges_delete_own
on public.profile_featured_badges for delete
to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'observation-photos',
  'observation-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy observation_photos_select_own
on storage.objects for select
to authenticated
using (
  bucket_id = 'observation-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and owner_id = (select auth.uid())::text
);

create policy observation_photos_insert_own
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'observation-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy observation_photos_update_own
on storage.objects for update
to authenticated
using (
  bucket_id = 'observation-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and owner_id = (select auth.uid())::text
)
with check (
  bucket_id = 'observation-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and owner_id = (select auth.uid())::text
);

create policy observation_photos_delete_own
on storage.objects for delete
to authenticated
using (
  bucket_id = 'observation-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and owner_id = (select auth.uid())::text
);
