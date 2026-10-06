# WILDEX Web 0.1

Primera versión pública de prueba del prototipo web móvil de WILDEX.

## Incluido

- Catálogo de 150 especies, variantes y colecciones temáticas.
- Flujo de descubrimiento en modo demostración con confirmación manual.
- Colección, álbum fotográfico local, perfil, avatares, XP, niveles, logros y desafíos.
- Temas claro y oscuro, diseño móvil y despliegue preparado para GitHub Pages.

## Privacidad y almacenamiento

No hay cuentas, autenticación ni backend. El perfil, progreso y fotografías se guardan en `localStorage` del navegador. Nada se sube desde la aplicación. Los datos dependen del navegador, dispositivo, origen y configuración de privacidad; borrar los datos del sitio, usar navegación privada o cambiar de dominio puede eliminarlos o volverlos inaccesibles. No existe sincronización, exportación ni copia de seguridad.

Las fotos se reducen a un máximo de 900 px por lado y JPEG de calidad 0,72 antes de guardarse. El límite real de almacenamiento depende del navegador. Si no queda espacio, WILDEX cancela el registro e informa el problema.

## Reconocimiento

El reconocimiento automático no está disponible. El modo demo no analiza píxeles ni confirma especies o razas. Puede usar una selección manual o el nombre del archivo para recorrer la interfaz, y la persona debe confirmar o corregir el resultado antes de guardar.

## Fotografías y licencias

Las fotografías del catálogo se cargan remotamente desde Wikimedia Commons y no se incluyen en el repositorio. Cada ficha enlaza a la página `File:` usada como fuente visual, donde figuran autoría, licencia y requisitos de atribución. Las licencias varían entre archivos y deben revisarse individualmente antes de redistribuir cualquier fotografía.

El ZIP sólo incluye `wildex-icon.png` y `wildex-logo.png`, recursos de identidad suministrados para el proyecto. No contiene fotografías personales ni observaciones del navegador.

## Compatibilidad de datos

- El progreso usa `wildex-explorer-state-v2` y conserva recuperación desde `wildex-explorer-state-v1`.
- El perfil usa `wildex-explorer-profile-v1` de forma independiente.
- Los campos nuevos se normalizan con valores compatibles; las claves anteriores no se eliminan automáticamente.
- Futuras migraciones deben mantener respaldo, pruebas con estados heredados y escritura no destructiva.

## Limitaciones conocidas

- Sin inteligencia artificial real, cuentas, sincronización o recuperación remota.
- Sin exportación/importación de progreso y fotografías.
- Las imágenes del catálogo requieren conexión a Internet.
- Las atribuciones y condiciones de uso se consultan por archivo en Wikimedia Commons.
- Es un prototipo web temporal de la futura aplicación Android.
