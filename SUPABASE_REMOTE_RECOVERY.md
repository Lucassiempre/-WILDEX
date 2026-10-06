# Diagnóstico y recuperación de la base remota

Los errores `relation already exists`, `duplicate key` y `policy already exists` demuestran únicamente que existen `species`, `badges`, al menos una especie sembrada y la política `species_read_active`. No demuestran que cada archivo haya terminado ni que la versión remota coincida con las migraciones locales actuales.

No se deben volver a ejecutar las migraciones `202609240001` a `202609240004`. Si fueron aplicadas manualmente, el historial de `supabase_migrations.schema_migrations` incluso puede estar vacío aunque los objetos existan. Las correcciones se realizarán después mediante una migración incremental nueva.

## Orden del diagnóstico

Ejecutar cada archivo por separado en el SQL Editor y conservar el único resultado JSON que produce. Todas las consultas son de sólo lectura.

1. [`supabase/diagnostics/01_schema_and_history.sql`](supabase/diagnostics/01_schema_and_history.sql)
2. [`supabase/diagnostics/02_functions_and_triggers.sql`](supabase/diagnostics/02_functions_and_triggers.sql)
3. [`supabase/diagnostics/03_rls_storage_and_grants.sql`](supabase/diagnostics/03_rls_storage_and_grants.sql)
4. [`supabase/diagnostics/04_catalog_and_data.sql`](supabase/diagnostics/04_catalog_and_data.sql)
5. [`supabase/diagnostics/05_post_review_corrections.sql`](supabase/diagnostics/05_post_review_corrections.sql), después de confirmar que 01-04 están completos.

La consulta 04 referencia deliberadamente las quince tablas de Wildex para comparar filas reales. Ejecutarla sólo si el resultado de la consulta 01 muestra `exists: true` para todas. Si falta alguna, detenerse después de la consulta 03 y conservar los resultados; un `WHERE` no podría volver segura una referencia a una tabla inexistente durante el análisis de PostgreSQL.

No ejecutar simultáneamente estos archivos con las migraciones originales. No usar `DROP`, `TRUNCATE`, `DELETE`, `db reset` ni volver a sembrar el catálogo.

## Qué debe comprobarse

### Consulta 01

- Las quince tablas esperadas y sus columnas reales.
- `rls_enabled: true` para todas las tablas.
- Existencia de claves foráneas, claves únicas y restricciones `CHECK`.
- Presencia de las dos restricciones nuevas de `xp_events`: importes fijos y asociación correcta con observación o desafío.
- `migration_history_available` indica si existe el historial de Supabase CLI. La consulta no referencia esa tabla, porque las migraciones manuales pueden no haberla creado y tampoco serían representadas por su contenido.

### Consulta 02

- Cuatro funciones en el esquema `private`.
- `create_profile_for_new_user` y `award_observation_discoveries` como `security_definer: true`.
- `runtime_config` con `search_path=""` para todas las funciones.
- `anon_can_execute: false` y `authenticated_can_execute: false`.
- Nueve triggers habilitados, incluido `observations_award_discoveries`.
- Privilegios predeterminados del esquema `private` sin ejecución pública.

### Consulta 03

- Políticas privadas basadas en `auth.uid()`.
- Ningún `INSERT`, `UPDATE` o `DELETE` para clientes sobre tablas derivadas de XP.
- La política `observations_insert_own` debe exigir `deleted_at is null`.
- El bucket `observation-photos` debe tener `public: false`.
- Las políticas de lectura, actualización y borrado de Storage deben comprobar carpeta y `owner_id`.

### Consulta 04

- Conteos esperados: 150 especies, 104 variantes, 14 colecciones, 145 membresías, 15 desafíos y 17 objetivos.
- Todos los elementos de `catalog_differences` deben tener `total: 0`.
- Los conteos de usuarios, observaciones, descubrimientos, XP, reclamos y fotografías deben conservarse para verificar que la futura corrección no pierde datos.

### Consulta 05

Esta consulta verifica exclusivamente las correcciones incorporadas después de la instalación manual inicial: constraints de XP, rechazo de observaciones ya eliminadas, propiedad de fotografías, privilegios predeterminados del esquema privado y ausencia de escrituras de cliente en tablas derivadas. No alcanza con que la política o tabla exista: cada fila debe devolver `passed: true`.

La comprobación de funciones calcula permisos efectivos por cada rol propietario de funciones en `private` y por `current_user`. Si no existe una ACL global explícita, aplica `acldefault('f', owner)`, que representa el permiso incorporado de PostgreSQL y concede `EXECUTE` a `PUBLIC`. También comprueba que una ACL específica de `private` no vuelva a sumar ese permiso.

Antes de llamar a `aclexplode`, la consulta comprueba que cada ACL sea un arreglo unidimensional. Una ACL específica ausente o vacía se trata como `NULL` y aporta cero permisos; no se construye `'{}'::aclitem[]`, porque ese arreglo vacío carece de dimensiones y `aclexplode` lo rechaza. El detalle informa `global_dims` y `private_dims` para facilitar esta comprobación.

## Siguiente paso

Las migraciones originales no deben volver a ejecutarse: sus errores de duplicado son compatibles con una instalación ya realizada manualmente y no constituyen evidencia de daño.

El diagnóstico remoto encontró una única diferencia: los permisos predeterminados para funciones nuevas. La corrección está en `202609240005_private_function_default_privileges.sql`. Debe ejecutarse una sola vez y luego repetirse la consulta 05; todas las filas deben devolver `passed: true`.

Para comprobar sin modificar la base si la migración 005 quedó aplicada, se ejecuta únicamente `supabase/diagnostics/05_post_review_corrections.sql`. La fila `private_function_default_execute_revoked` debe devolver `passed: true`. En su detalle, cada rol creador debe mostrar una ACL global efectiva sin una entrada `=X/...` para `PUBLIC` ni entradas `anon=X/...` o `authenticated=X/...`. `global_explicit=false` junto con `=X/...` indica que PostgreSQL sigue usando el default incorporado y que la corrección no quedó aplicada para ese rol.

PostgreSQL concede globalmente `EXECUTE` a `PUBLIC` para funciones nuevas. Una revocación con `IN SCHEMA private` no puede quitar ese valor global porque los defaults por esquema sólo agregan permisos. Por eso la migración identifica cada rol propietario de funciones privadas y el rol que ejecuta la migración, y modifica el default global de funciones para esos roles concretos. Las funciones públicas que deban exponerse en el futuro tendrán que recibir un `GRANT EXECUTE` explícito.
