# Hoja de ruta de WILDEX

## Estado de la versión web 0.1

Preparada como primera prueba pública: flujo demo explícito, perfil y avatar local, catálogo completo, álbum, gamificación, desafíos, persistencia compatible, advertencias de almacenamiento, fuentes visuales individuales, pruebas en el workflow y despliegue con base `/-WILDEX/`. La publicación sigue siendo manual y esta entrega no incorpora autenticación, pagos ni reconocimiento automático.

## 1. Prototipo interactivo

Completado en la versión 2.0: experiencia móvil, navegación inferior, fotografía demo, colección local, álbum fotográfico personal, variantes con progreso y XP único, observaciones repetibles, temas, perfil editable con avatar por capas, logros, desafíos fijos retroactivos, eventos semanales configurables y despliegue preparado para GitHub Pages. Las recompensas de desafíos e insignias se persisten y sólo pueden reclamarse una vez.

## 2. Catálogo ampliado

Completado para el alcance del prototipo: 150 especies, ocho categorías, ambientes urbano/silvestre/doméstico, 59 especies de aves, 50 razas de perro, 30 de gato, variantes documentadas para aves domésticas, búsqueda, filtros, fichas con atribución visual individual y 14 colecciones temáticas con progreso. Perros y gatos se cuentan como una especie cada uno, sin convertir sus razas en especies. Las temáticas reutilizan descubrimientos, Álbum y XP sin duplicar almacenamiento.

Continuo: auditoría taxonómica, científica, de accesibilidad y de licencias con especialistas; cobertura geográfica más fina; actualización de estados de conservación; y atribuciones de medios exportables.

## 3. Aplicación Android

Preparado: Capacitor 8 con `webDir: dist`, proyecto Android nativo, ID definitivo `com.mrlabs.wildex`, cámara y galería del sistema, Filesystem privado, IndexedDB para web, migración no destructiva de Base64, botón Atrás, teclado, barra de estado, áreas seguras, icono y splash de WILDEX. La web y GitHub Pages conservan sus builds independientes.

Pendiente: pruebas adicionales en dispositivos físicos y emuladores, política de privacidad, respaldo/exportación, firma de lanzamiento, revisión de tamaño, accesibilidad nativa y publicación. Las imágenes de Wikimedia Commons continúan requiriendo conexión; el catálogo textual y las funciones locales se empaquetan con la app.

## 4. Reconocimiento real de especies

Preparado en el prototipo: contrato desacoplado con especie, variante opcional, confianzas opcionales y método de identificación; presentación separada; corrección manual previa al guardado; y compatibilidad con observaciones anteriores. El modo demo no analiza píxeles ni inventa porcentajes.

Pendiente: reunir datos autorizados y etiquetados, entrenar o integrar un modelo detrás de `RecognitionService`, medir errores por grupo y región, ofrecer incertidumbre y revisión manual, y evitar atribuir razas o especies peligrosas sin evidencia suficiente.

## 5. Pruebas con usuarios

Pendiente: validar el recorrido fotografiar-identificar-descubrir-coleccionar con participantes urbanos y visitantes de espacios naturales; medir comprensión del modo demo, errores de identificación, accesibilidad y retención.

## 6. Publicación

Web preparada: Vite compila con base `/-WILDEX/` dentro de GitHub Actions y `.github/workflows/deploy.yml` publica únicamente `dist/` mediante GitHub Pages.

Pendiente para producto móvil: revisión legal y de licencias, política de privacidad, estabilidad, pruebas de seguridad, métricas de calidad, firma y distribución Android. Ninguna fase supone una APK hasta completar estos controles.

## 7. Administración de eventos

Preparado: catálogo semanal desacoplado mediante `ChallengeCatalogService`, estados de borrador, programado, publicado y archivado, objetivos tipados y cálculo limitado a las fechas del evento.

Pendiente: reemplazar el catálogo local por un backend, autenticación con permisos reales, auditoría de cambios, publicación programada e interfaz administrativa. El prototipo no simula estas capacidades.

## 8. Perfil y sincronización

Preparado: modelo de perfil serializable, almacenamiento independiente del progreso, avatar SVG reconstruible desde JSON, animal favorito validado e insignias destacadas sin efectos sobre XP. Las opciones visuales admiten clasificación gratuita, Premium o desbloqueable, aunque todas las actuales permanecen disponibles.

Preparado sin aplicar: migraciones locales para perfiles, catálogo, observaciones, descubrimientos, XP idempotente, desafíos, insignias, RLS y fotografías privadas en Supabase Storage.

Pendiente: revisar y aplicar las migraciones al proyecto remoto, conectar un repositorio Supabase, sincronización local/remota, resolución de conflictos y Google Sign-In real. La futura autenticación deberá completar `userId` y podrá proponer datos básicos con consentimiento; no debe reemplazar silenciosamente el nombre, avatar ni progreso local.
