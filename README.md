# WILDEX 2.0

Prototipo web **temporal** de una futura aplicación móvil Android. Simula una bitácora de exploración en formato vertical: fotografiar, identificar en modo demo, descubrir y coleccionar animales reales. No es una landing page ni un identificador por inteligencia artificial.

## Funcionalidades

- Catálogo de 64 especies reales en mamíferos, aves, reptiles, anfibios, peces, insectos, arácnidos y otros invertebrados.
- Filtros independientes de categoría y ambiente (ciudad, hogar y silvestre), búsqueda por nombre común o científico y progreso por categoría.
- Especies pendientes con tarjeta bloqueada; fichas completas al registrar la especie.
- Cámara o archivo local, vista previa, selección manual de especie demo, notas y raza/variante opcional.
- Observaciones repetibles con ID, fecha, foto optimizada, método de identificación y notas. Las fotos quedan en `localStorage`, nunca se suben a un servidor.
- XP por primera especie (+100), nueva especie (+50), primera de una categoría (+75) y nueva variante (+20). Observaciones repetidas no generan XP.
- Niveles, logros y desafíos calculados desde los registros guardados. Tema oscuro verde bosque y tema claro persistente.

## Datos

`src/types.ts` define `Species`, `Discovery` y `ExplorerState`. `src/data/species.ts`, `urbanSpecies.ts` y `expandedSpecies.ts` contienen fichas científicas separadas de las observaciones personales. Cada especie tiene ID estable, nombres, categoría, descripción, hábitat, alimentación, foto y ambientes (`urban`, `wild`, `domestic`); distribución, conservación y variantes se muestran cuando están documentadas. Las fichas de perro y gato contienen razas como variantes de **una sola especie**. El conejo doméstico y el silvestre, así como la rata doméstica y la parda, tampoco duplican especies.

Una observación tiene ID propio, `speciesId`, `variantId` opcional, fecha, foto opcional, método, confianza opcional y notas opcionales. La raza es una declaración manual, no una inferencia visual. Registrar varias razas u observaciones de una especie solo cuenta una especie en el progreso.

`src/services/storageService.ts` carga el estado v2 y migra los descubrimientos v1 conservando el almacenamiento anterior como respaldo. Si se agota el espacio local al guardar una foto, se informa el error y no se registra esa observación. Las fotos se reducen a un máximo de 900 px por lado y JPEG de calidad 0,72; la capacidad final depende del navegador.

## Modo demostración

`src/services/recognitionService.ts` expone una interfaz `RecognitionService` para reemplazar el servicio demo en el futuro. La demo selecciona manualmente una especie o utiliza palabras del **nombre del archivo**; no inspecciona sus píxeles, no estima confianza y no confirma razas. Puede mostrar estados de resultado, falta de coincidencia, imagen inválida y error. No ofrece porcentajes de certeza ficticios. Una identificación real necesitará un modelo entrenado, validación con especialistas y tratamiento responsable de datos personales.

## Fotos y fuentes

Las fotografías de fichas se cargan de Wikimedia Commons y no se redistribuyen dentro del repositorio. Cada ficha enlaza a su página `File:` original, donde constan autor, licencia y condiciones de atribución; antes de republicar o descargar una imagen, revisá esos términos individuales. Si falla la carga, la app muestra un respaldo visual. La visualización de fotos de catálogo requiere Internet; las fotos de observaciones son locales. Las fuentes de taxonomía y distribución se enlazan en las fichas cuando están disponibles. Para la selección inicial se consultaron el [Sistema de Información de Biodiversidad de Argentina](https://www.argentina.gob.ar/node/196165), [fauna de parques nacionales](https://www.argentina.gob.ar/node/200824), un [listado de aves de Buenos Aires](https://buenosaires.gob.ar/sites/default/files/media/document/2018/02/10/61ad46a5a42ce1d1cc4bc58c9cbfa5ca8e518cbc.pdf), un [relevamiento de peces](https://www.argentina.gob.ar/sites/default/files/reconstruccion_de_paseo_ribereno_y_zona_costera_de_coronda.pdf) y el [listado oficial de especies exóticas](https://www.argentina.gob.ar/sites/default/files/lista_oficial_eei_boletin_oficial_con_nombres_comunes_0.pdf). El catálogo es educativo, no una guía clínica ni una identificación definitiva.

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
npm run build
npm run preview
```

Las pruebas automatizadas cubren integridad del catálogo, conteo único de especies/variantes, desafíos y migración v1 a v2. El flujo de fotografía y observaciones se verifica además en el navegador.

## GitHub Pages

`vite.config.ts` toma el nombre del repositorio de `GITHUB_REPOSITORY` durante GitHub Actions y configura la base `/-WILDEX/` para `lucassiempre/-WILDEX`. Los recursos locales usan `BASE_URL`; no hay rutas de React Router que fallen al actualizar. El workflow `.github/workflows/deploy.yml` instala con `npm ci`, compila y publica `dist` al hacer push a `main` (o al ejecutarlo manualmente). En el repositorio, seleccionar `Settings > Pages > Build and deployment > GitHub Actions`. Sitio previsto: [lucassiempre.github.io/-WILDEX](https://lucassiempre.github.io/-WILDEX/). Este repositorio local no publica cambios automáticamente hasta subirlos.

## Camino a Android

La interfaz, catálogo, cámara, almacenamiento, gamificación e identificación están separados. Para una futura integración con Capacitor: estabilizar el modelo de datos y las pruebas, instalar `@capacitor/core`, `@capacitor/cli` y la plataforma Android, configurar `webDir: dist`, evaluar plugins nativos de cámara/almacenamiento, migrar fotos fuera de `localStorage`, revisar permisos, accesibilidad y funcionamiento sin conexión, y generar un build Android firmado. Esta versión no incluye APK ni Capacitor.

## Pendiente

- Identificación real y validada de especies, con resultados inciertos y revisión humana.
- Backend o almacenamiento nativo escalable para fotografías y sincronización.
- Revisión taxonómica continua, fichas regionales, más fuentes científicas y fotografías locales con atribución completa.
- Pruebas de usabilidad en dispositivos Android reales.

## Estructura

```text
wildex/
  public/images/               Icono y logo oficiales
  src/components/              Interfaz reutilizable
  src/data/                    Catálogo de especies
  src/pages/                   Pantallas móviles
  src/services/                Identificación, fotos y persistencia
  src/utils/                   Gamificación
  src/styles/                  Temas y estilos
  .github/workflows/deploy.yml
  DEVELOPMENT_ROADMAP.md
```

No se incluyen claves privadas, tokens ni credenciales.
