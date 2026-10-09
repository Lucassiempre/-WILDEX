# WILDEX Web 0.1

Prototipo web **temporal** de una futura aplicación móvil Android. Simula una bitácora de exploración en formato vertical: fotografiar, identificar en modo demo, descubrir y coleccionar animales reales. No es una landing page ni un identificador por inteligencia artificial.

> **Versión pública de prueba:** el reconocimiento automático todavía no está disponible. El modo demo no analiza la fotografía ni confirma especies o razas; la selección final es manual.

## Funcionalidades

- Catálogo de 150 especies reales, incluidas 59 aves, en mamíferos, aves, reptiles, anfibios, peces, insectos, arácnidos y otros invertebrados.
- Catorce colecciones temáticas con progreso derivado de la bitácora, incluidas aves urbanas, acuáticas, rapaces y de compañía.
- Filtros independientes de categoría y ambiente (ciudad, hogar y silvestre), búsqueda por nombre común o científico y progreso por categoría.
- Especies pendientes con tarjeta bloqueada; fichas completas al registrar la especie.
- Cámara o archivo local, vista previa, selección manual de especie demo, notas y raza/variante opcional.
- Observaciones repetibles con ID, fecha, foto optimizada, método de identificación y notas. Los binarios se guardan en IndexedDB en web y en el directorio privado de Android; nunca se suben a un servidor.
- Mi Álbum agrupa exclusivamente las fotografías propias por especie, permite filtrar las variantes registradas y ofrece un visor con navegación, ficha, notas y nombre personalizado.
- XP por primera especie (+100), nueva especie (+50), primera de una categoría (+75) y nueva variante (+20). Observaciones repetidas no generan XP.
- Cada variante válida se recompensa una sola vez. Las fichas muestran el progreso de variantes y enlazan directamente al álbum de esa especie cuando existen fotografías propias; IDs libres o inventados no se guardan como variantes ni generan experiencia.
- Niveles, logros y desafíos fijos y semanales calculados desde los registros guardados. Las recompensas se reclaman una sola vez y quedan persistidas junto con las insignias obtenidas.
- Perfil local editable con nombre de explorador, nombre visible, biografía, avatar por capas, animal favorito, estadísticas reales e insignias destacadas.
- Recuperación compatible: si el estado v2 no puede leerse, se intenta cargar el respaldo v1 sin borrarlo.

Las novedades, límites de privacidad y alcance de esta entrega están en [`RELEASE_NOTES_0.1.md`](RELEASE_NOTES_0.1.md).

## Datos

`src/types.ts` define `Species`, `Discovery`, `ExplorerState` y `ThematicCollection`. `src/data/species.ts`, `urbanSpecies.ts`, `expandedSpecies.ts`, `themedSpecies.ts` y `priorityBirdSpecies.ts` contienen fichas científicas separadas de las observaciones personales. Cada especie tiene ID estable, nombres, categoría, descripción, hábitat, alimentación, foto y ambientes (`urban`, `wild`, `domestic`); distribución, conservación y variantes se muestran cuando están documentadas. Las fichas de perro y gato contienen 50 y 30 razas respectivamente, más los tipos necesarios para registrar ejemplares mestizos o sin raza determinada, siempre como variantes de **una sola especie**.

`src/data/domesticVariants.ts` separa razas, tipos, colores y patrones mediante IDs estables y descripciones breves. Canarios, periquitos, palomas y gallinas reutilizan las mismas reglas de variantes y XP; un color o patrón no se presenta como raza.

`src/data/thematicCollections.ts` sólo guarda agrupaciones de IDs. Una especie puede pertenecer a varias temáticas y `src/utils/thematicCollections.ts` calcula su progreso desde los descubrimientos existentes. No hay XP, fotos ni almacenamiento independientes por colección.

Una observación tiene ID propio, `speciesId`, `variantId` opcional, fecha, foto opcional, método, confianza opcional, notas y nombre personalizado opcionales. La raza es una declaración manual, no una inferencia visual. El nombre personalizado identifica al ejemplar para la persona usuaria; no reemplaza el nombre científico ni la variante. Registrar varias razas u observaciones de una especie solo cuenta una especie en el progreso.

El Álbum se calcula directamente desde esas observaciones y no mantiene una segunda copia de las fotografías. Una observación sin foto sigue perteneciendo a la colección, pero no aparece como imagen del usuario. La edición de notas o nombres no modifica XP, especies ni logros.

`src/services/storageService.ts` carga el estado v2 y migra los descubrimientos v1 conservando el almacenamiento anterior como respaldo. También recupera v1 cuando existe un v2 dañado, normaliza fechas e IDs heredados y conserva observaciones de especies antiguas aunque ya no sumen al progreso del catálogo vigente. `src/services/photoStorageService.ts` guarda fotografías nuevas fuera de `localStorage`: IndexedDB en web y Capacitor Filesystem en Android. Las fotos Base64 anteriores se copian y verifican antes de reemplazar su contenido serializado por un `photoRef`; ante cualquier error se conserva el dato heredado. Si se agota el espacio al guardar una foto, se informa el error y no se registra esa observación. Las fotos se reducen a un máximo de 900 px por lado y JPEG de calidad 0,72.

Todo el progreso permanece en el dispositivo y depende de la instalación u origen exacto. Borrar datos, desinstalar la app, usar navegación privada o cambiar de dispositivo o dominio puede perder el acceso a perfil, descubrimientos y fotografías. Esta versión no ofrece sincronización, exportación ni copia de seguridad.

`src/services/discoveryService.ts` concentra el alta de observaciones y las reglas de XP. Esto evita que una observación repetida, una raza ya registrada o un identificador de variante inválido aumenten especies o experiencia por error.

## Desafíos

`src/data/challenges.ts` contiene el catálogo independiente de la interfaz. Los desafíos fijos se calculan sobre todo el historial, por lo que reconocen descubrimientos anteriores. Los semanales filtran las observaciones entre `startDate` y `endDate` y admiten especies o variantes diferentes, cantidad de observaciones, categorías, colecciones temáticas y especies descubiertas por primera vez durante el evento.

Para agregar un desafío semanal, incorporá un objeto con `id` estable, `title`, `description`, fechas ISO con zona horaria, `objectives`, `xpReward`, `badgeId` opcional y `status`. Usá `draft` para ocultarlo, `scheduled` para mostrarlo sin habilitar recompensa, `published` para activarlo y `archived` para conservarlo como histórico. Los IDs publicados no deben reutilizarse, ya que son la clave que impide entregar XP más de una vez.

`src/services/challengeCatalogService.ts` expone el contrato del catálogo local para poder sustituirlo más adelante por un backend. `src/services/challengeService.ts` evalúa progreso y fases, y centraliza el reclamo idempotente. No hay panel de administración ni autenticación simulada.

## Perfil del explorador

`src/services/profileService.ts` mantiene la identidad separada del progreso y la persiste en `wildex-explorer-profile-v1`. El modelo `ExplorerProfile` contempla `userId`, `displayName`, `username`, `avatarConfig`, `favoriteSpeciesId`, `featuredBadgeIds`, `createdAt` y `updatedAt`, por lo que puede serializarse directamente para una sincronización futura. El animal favorito se valida contra las especies descubiertas y sólo pueden destacarse hasta tres insignias obtenidas.

`src/components/ExplorerAvatar.tsx` reconstruye el personaje desde JSON usando SVG por capas. Apariencia, piel, peinado, color, ropa, accesorio y fondo se definen en `src/data/avatarOptions.ts`; cada opción incluye una clasificación `free`, `premium` o `challenge`. Todos los elementos actuales son gratuitos. No existen pagos, bloqueos ni ventajas de XP asociadas al perfil.

El editor separa Identidad y Avatar en pestañas. En la pestaña Avatar, la vista previa y las acciones permanecen visibles mientras sólo se desplaza el panel de opciones; la reserva inferior contempla la navegación de Wildex y el área segura del dispositivo. Cancelar descarta el borrador completo sin escribir en el almacenamiento.

Para integrar Supabase, `profileService` deberá sustituirse por un repositorio remoto que lea y escriba el mismo modelo, manteniendo una copia local para funcionamiento sin conexión. Google Sign-In deberá aportar el `userId` autenticado y, sólo con consentimiento, valores iniciales de nombre o imagen. La pantalla de perfil no contiene autenticación simulada, contraseñas ni botones de acceso ficticios.

La primera fase del esquema remoto está preparada como migraciones SQL en `supabase/migrations`. Incluye el catálogo actual, perfiles, observaciones, descubrimientos, eventos idempotentes de XP, desafíos, insignias, RLS y un bucket privado de fotografías. No está aplicada al proyecto remoto ni conectada a la aplicación. Las instrucciones de revisión, aplicación y prueba están en [`SUPABASE_SETUP.md`](SUPABASE_SETUP.md).

## Modo demostración

`src/services/recognitionService.ts` expone una interfaz `RecognitionService` para reemplazar el servicio demo en el futuro. Su resultado normalizado contiene `speciesId`, `variantId` opcional, `speciesConfidence` opcional, `variantConfidence` opcional e `identificationMethod`. Esto permite conectar un modelo real sin acoplarlo a la pantalla ni cambiar el formato de las observaciones.

La demo selecciona manualmente una especie o utiliza palabras del **nombre del archivo**; no inspecciona sus píxeles, no estima confianza y no confirma razas. Especie y variante se presentan por separado y la persona puede corregir ambas antes de guardar, incluyendo la opción **Raza no determinada**. Los campos de confianza sólo se muestran cuando un proveedor real los entrega. Puede mostrar estados de resultado, falta de coincidencia, imagen inválida y error, pero nunca ofrece porcentajes de certeza ficticios.

## Fotos y fuentes

Las fotografías de fichas se cargan de Wikimedia Commons y no se redistribuyen dentro del repositorio. Cada ficha enlaza a su página `File:` original mediante **Fuente visual y licencia**, donde constan autor, licencia y condiciones de atribución; antes de republicar o descargar una imagen, revisá esos términos individuales. La suite verifica que las 150 fichas tengan una fuente visual única y una URL remota de Commons. Si falla la carga, la app muestra un respaldo visual. La visualización de fotos de catálogo requiere Internet; las fotos de observaciones son locales. Las fuentes de taxonomía y distribución se enlazan en las fichas cuando están disponibles. Para la selección inicial se consultaron el [Sistema de Información de Biodiversidad de Argentina](https://www.argentina.gob.ar/node/196165), [fauna de parques nacionales](https://www.argentina.gob.ar/node/200824), un [listado de aves de Buenos Aires](https://buenosaires.gob.ar/sites/default/files/media/document/2018/02/10/61ad46a5a42ce1d1cc4bc58c9cbfa5ca8e518cbc.pdf), un [relevamiento de peces](https://www.argentina.gob.ar/sites/default/files/reconstruccion_de_paseo_ribereno_y_zona_costera_de_coronda.pdf) y el [listado oficial de especies exóticas](https://www.argentina.gob.ar/sites/default/files/lista_oficial_eei_boletin_oficial_con_nombres_comunes_0.pdf). El catálogo es educativo, no una guía clínica ni una identificación definitiva.

Las URLs de Commons solicitan miniaturas de hasta 900 px para reducir la transferencia en móviles.

## Desarrollo local

Requiere Node.js 22 o superior.

```bash
npm ci
npm run dev
```

La URL local habitual es `http://127.0.0.1:5173/`. Build de producción:

```bash
npm test
npm run build:app
npm run preview
```

Las diecinueve pruebas automatizadas cubren integridad del catálogo, categorías y ambientes, variantes, colecciones temáticas, progreso, XP, Álbum, logros, desafíos, recompensas únicas, creación y edición de perfil, avatar JSON, animal favorito, insignias destacadas, persistencia local, reconocimiento demo y compatibilidad con datos anteriores.

Mi Álbum se verificó en navegador con varias fotos de una especie, especies distintas, filtros de variantes reales, visor anterior/siguiente, acceso a ficha, edición persistente de nota y nombre personalizado, recarga y estado vacío. También se comprobó el recorrido inverso desde la ficha al álbum correspondiente. La vista temática fue validada con progreso de variantes y especies, pertenencia múltiple y detalle móvil. La barra inferior con cinco destinos fue revisada a 320 px sin desbordamiento.

La interfaz fue revisada sin desplazamiento horizontal a 320, 360, 390, 768 y 1920 px. En pantallas de escritorio conserva un contenedor móvil de 430 px; en el perfil, las estadísticas aparecen antes de desafíos y logros.

## GitHub Pages

La app y el sitio publico usan entradas y salidas separadas. `npm run build:app` compila `index.html` -> `src/main.tsx` en `dist-app/`. `npm run build:site` compila `site/index.html`, `site/privacy/index.html` y `site/delete-account/index.html` en `dist-site/`, con downloads, QR y formulario beta. `npm run dev:site` y `npm run preview:site` muestran el sitio publico.

`vite.config.ts` configura la base `/-WILDEX/` desde `GITHUB_REPOSITORY` solo para el build del sitio. El workflow `.github/workflows/deploy.yml` ejecuta tests, `npm run build:site` y publica exclusivamente `dist-site/`. En el repositorio, seleccionar `Settings > Pages > Build and deployment > GitHub Actions`. Sitio previsto: [lucassiempre.github.io/-WILDEX](https://lucassiempre.github.io/-WILDEX/). No se publica nada hasta subir los cambios.

## Android con Capacitor

La primera plataforma Android nativa vive en `android/` y reutiliza esta aplicación mediante Capacitor 8. `capacitor.config.ts` usa `webDir: dist-app` y el identificador definitivo `com.mrlabs.wildex`, bajo la identidad de desarrollador MrLabs. Cámara y galería usan resultados URI y restauración de Activity; un borrador temporal permite volver a Descubrir con la foto aunque Android haya recreado el proceso. Almacenamiento privado, barra de estado, teclado y botón Atrás tienen adaptadores nativos. Capacitor verifica que `dist-app/` tenga la entrada React real antes de `sync` o `copy`; rechaza una landing o un build incompleto. El sitio publico nunca se copia a Android.

```bash
npm run build:app
npm run android:sync
npm run android:open
```

La configuración completa, permisos, limitaciones offline, identidad Android y compilación de la APK están documentados en [`ANDROID_SETUP.md`](ANDROID_SETUP.md). No se publicó ni firmó una versión para Google Play.

## Pendiente

- Identificación real y validada de especies, con resultados inciertos y revisión humana.
- Backend o almacenamiento nativo escalable para fotografías y sincronización.
- Revisión taxonómica continua, fichas regionales, más fuentes científicas y fotografías locales con atribución completa.
- Pruebas de usabilidad en dispositivos Android reales.
- Auditoría científica y legal continua por especialistas; los enlaces disponibles facilitan la revisión, pero no la sustituyen.

## Estructura

```text
wildex/
  public/images/               Icono y logo oficiales
  android/                     Proyecto nativo generado por Capacitor
  supabase/migrations/         Esquema SQL preparado, todavía no aplicado
  scripts/                     Generador reproducible del catálogo SQL
  src/components/              Interfaz reutilizable
  src/data/                    Catálogo de especies
  src/pages/                   Pantallas móviles
  src/services/                Identificación, perfil, persistencia, descubrimientos y desafíos
  src/utils/                   Gamificación
  src/styles/                  Temas y estilos
  .github/workflows/deploy.yml
  DEVELOPMENT_ROADMAP.md
  ANDROID_SETUP.md
```

No se incluyen claves privadas, tokens ni credenciales.
