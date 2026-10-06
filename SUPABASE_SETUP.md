# Supabase: esquema inicial de Wildex

Esta carpeta contiene el esquema, los diagnósticos y las funciones server-side de Supabase utilizados por Wildex. Las credenciales privilegiadas nunca pertenecen al cliente.

Si las migraciones originales ya se ejecutaron total o parcialmente, no deben volver a correrse. Utilizar primero el procedimiento de sólo lectura de [`SUPABASE_REMOTE_RECOVERY.md`](SUPABASE_REMOTE_RECOVERY.md) y crear después una migración incremental.

## Migraciones

Las migraciones se aplican en orden:

1. `202609240001_core.sql`: catálogo, perfiles, observaciones y referencias de fotografías.
2. `202609240002_gamification.sql`: descubrimientos, eventos de XP, desafíos e insignias.
3. `202609240003_catalog_seed.sql`: 150 especies, 104 variantes, 14 colecciones y desafíos actuales.
4. `202609240004_security.sql`: permisos, RLS y bucket privado `observation-photos`.
5. `202609240005_private_function_default_privileges.sql`: corrección incremental para revocar el `EXECUTE` global predeterminado de futuras funciones creadas por los roles responsables.
6. `202609280006_initial_sync.sql`: API transaccional para importación y snapshots de cuenta.
7. `202609280007_reconcile_initial_sync.sql`: reconciliación incremental de la instalación inicial.
8. `202610050008_composite_observation_identity.sql`: identidad de observación `(user_id, id)` y asociaciones M:N de imports.
9. `202610060009_account_deletion_cascades.sql`: ajusta únicamente FKs privadas para permitir la eliminación completa de una cuenta.

La migración del catálogo se genera desde los archivos TypeScript existentes:

```bash
node scripts/generateSupabaseCatalogMigration.mjs
```

No se debe regenerar una migración ya aplicada. Cuando cambie el catálogo después del primer despliegue, crear una migración nueva con los cambios incrementales.

## Decisiones de datos

- Los IDs de especie y variante continúan siendo texto. La clave de una variante es `(species_id, id)`.
- Las observaciones usan UUID creados en el dispositivo y pertenecen a `auth.users` mediante `user_id`.
- `photo_path` guarda sólo la ruta del objeto, nunca el binario. Debe usar `<user-id>/<observation-id>/original.jpg`.
- El bucket es privado, admite JPEG, PNG y WebP y limita cada objeto a 10 MB.
- Los descubrimientos se crean desde un trigger al insertar observaciones. Las tablas derivadas no aceptan escrituras del cliente.
- Cada especie nueva entrega 50 XP. Un evento adicional único de 50 XP conserva el total de 100 XP de la primera especie.
- La primera especie de una categoría entrega 75 XP y cada variante nueva entrega 20 XP.
- `unique (user_id, event_key)` impide repetir esas recompensas aunque una operación se reintente.
- Restricciones adicionales fijan los importes de descubrimiento en 50, 50, 75 y 20 XP; un evento de descubrimiento también debe referenciar una observación.
- Una observación repetida se conserva, pero no crea otro descubrimiento ni evento de XP.
- Los reclamos usan `(user_id, challenge_id)` como clave primaria. Esta fase no expone una función para reclamarlos: la validación transaccional del progreso se implementará antes de conectar la app.
- El XP total se obtiene con `sum(xp_events.amount)` y el nivel sigue derivándose de ese total.

### Compatibilidad con el XP local

Para el flujo normal, SQL conserva exactamente los totales de `discoveryService.ts`: primera especie 100 XP, cada especie posterior 50 XP, primera especie de una categoría 75 XP y primera observación de una variante válida 20 XP. SQL representa los 100 XP iniciales como un evento de especie de 50 y un bono inicial único de 50 para mantener idempotencia ante inserciones concurrentes.

Existe un caso heredado que no debe recalcularse silenciosamente: el servicio local decide si corresponde el bono inicial usando `discoveries.length`, por lo que una observación antigua cuyo ID ya no exista en el catálogo también impide el bono de 100 XP. La base remota rechaza especies fuera del catálogo. Cuando se implemente la importación, se deberá preservar el total local confirmado mediante un único evento `legacy-import` que ajuste cualquier diferencia, sin volver a premiar especies o variantes.

Si dos dispositivos sincronizan especies nuevas al mismo tiempo, la restricción única decide qué observación queda asociada al bono inicial, pero el total del usuario sigue siendo el mismo. La interfaz futura deberá sumar los eventos creados por la operación en vez de asumir que hay un solo evento por observación.

## Validación local

Las comprobaciones que no requieren Supabase se ejecutan con:

```bash
npm test
npm run build
```

Para validar realmente PostgreSQL, triggers y RLS se necesita Supabase CLI y Docker. No forman parte de las dependencias de Wildex:

```bash
npx supabase init
npx supabase start
npx supabase db reset
```

`db reset` elimina la base local de Supabase, nunca debe apuntarse a producción. Después se pueden comprobar conteos:

```sql
select count(*) from public.species;             -- 150
select count(*) from public.species_variants;    -- 104
select count(*) from public.thematic_collections; -- 14
select id, public from storage.buckets where id = 'observation-photos';
```

## Aplicación remota

Revisar primero cada archivo y hacer una copia de seguridad si el proyecto remoto ya contiene datos. Luego, desde la raíz y usando únicamente el inicio de sesión interactivo de Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push --dry-run
npx supabase db push
```

No guardar el access token, la contraseña de la base ni la clave `service_role` en el repositorio. La clave publicable futura sólo podrá utilizarse después de verificar RLS.

## Comprobar RLS

Crear dos usuarios de prueba A y B desde Supabase Auth. Con sus UUID, la impersonación siguiente puede ejecutarse en SQL Editor dentro de una transacción. Sustituir los valores de ejemplo:

```sql
begin;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}',
  true
);
set local role authenticated;

select * from public.profiles;
select * from public.observations;
select * from public.xp_events;

rollback;
```

Las consultas deben devolver exclusivamente filas del usuario A. Repetir con el UUID B. También se debe comprobar mediante el cliente autenticado que:

- A no puede insertar ni actualizar una observación usando `user_id` de B.
- A no puede leer, reemplazar ni borrar `observation-photos/<B>/...`.
- Las lecturas, reemplazos y borrados de fotografías requieren tanto la carpeta del usuario como `owner_id` coincidente. Las futuras subidas deben realizarse con la sesión autenticada del usuario; una subida administrativa con `service_role` no asigna propietario automáticamente.
- El rol anónimo sólo puede leer catálogos y desafíos visibles.
- Ningún cliente puede insertar directamente en `xp_events`, descubrimientos, reclamos o insignias.
- Insertar dos observaciones de la misma especie/variante conserva ambas observaciones pero crea una sola recompensa de cada tipo.

El SQL Editor normalmente opera como propietario y puede saltarse RLS. Por eso las comprobaciones deben usar `set local role authenticated` o clientes con sesiones reales; una consulta ejecutada como `postgres` no demuestra que RLS esté funcionando.
# Eliminación de cuenta (Wildex 1.0)

La eliminación se ejecuta en la Edge Function autenticada `delete-account`. El cliente nunca contiene `service_role`: la función obtiene el usuario del JWT, elimina primero todos los objetos de `observation-photos/<userId>/` y recién después elimina `auth.users`.

Como las migraciones 001-008 se aplicaron manualmente y el proyecto remoto no tiene historial de Supabase CLI, **no usar `supabase db push`**. Ejecutar una sola vez `supabase/migrations/202610060009_account_deletion_cascades.sql` en SQL Editor y luego comprobarla con `supabase/diagnostics/13_account_deletion_cascades.sql`. No reejecutar migraciones históricas 001-008.

Después, desplegar sólo la función:

```bash
npx supabase login
npx supabase link --project-ref wvoqbobqprljgysyzqof
npx supabase functions deploy delete-account --project-ref wvoqbobqprljgysyzqof
```

Supabase aporta `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` al entorno de la Edge Function. La clave privilegiada no debe copiarse a `.env.local`, variables `VITE_*`, Android ni el repositorio.

Wildex 1.0 protege la acción con una sesión autenticada válida y la confirmación literal `ELIMINAR`. Una reautenticación reforzada inmediatamente anterior al borrado queda documentada como endurecimiento posterior; no forma parte de esta versión.

