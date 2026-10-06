# WILDEX Android con Capacitor

Esta carpeta contiene la primera aplicación Android nativa de WILDEX. Reutiliza la aplicación React existente dentro de Capacitor; no es una reimplementación.

## Identidad de la aplicación

- Nombre visible: `WILDEX`.
- ID de aplicación definitivo: `com.mrlabs.wildex`.
- Identidad de desarrollador: `MrLabs`.
- Recursos web nativos: `dist/`.
- SDK mínimo: Android 7.0, API 24.
- SDK objetivo y de compilación: API 36.
- Versión de prueba actual: `0.1.2` (`versionCode 3`).

El identificador `com.mrlabs.wildex` debe conservarse al firmar, distribuir y publicar la aplicación. Google Play no permite cambiar el `applicationId` de una aplicación ya publicada.

## Preparar y sincronizar

Requisitos: Node.js 22 o posterior, Android Studio con SDK 36 y un **JDK 21 completo que incluya `jlink`**. Desde la raíz:

```bash
npm ci
npm test
npm run android:sync
npm run android:open
```

`android:sync` compila la web con rutas relativas y ejecuta `cap sync android`. Cada cambio en React debe sincronizarse nuevamente antes de compilar la app.

En Android Studio, esperar la sincronización de Gradle y ejecutar `app` sobre un emulador o dispositivo habilitado para depuración. Para generar una APK de depuración desde Windows:

```powershell
$env:JAVA_HOME = "C:\ruta\al\jdk-21"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
npm run android:build:debug
```

La salida esperada es `android/app/build/outputs/apk/debug/app-debug.apk`. Esta APK no está firmada para publicación y no debe subirse a Google Play. En esta computadora, el JBR de Android Studio es Java 25 (no compatible con el Gradle actual) y el JBR 21 encontrado no incluye `jlink`; por eso hace falta seleccionar o instalar un JDK 21 completo en `Settings > Build, Execution, Deployment > Build Tools > Gradle > Gradle JDK`.

## Fotografías y migración

Las observaciones conservan un ID estable y ahora admiten `photoRef`:

- Web: el binario JPEG se guarda en IndexedDB (`wildex-media-v1`).
- Android: se guarda en el directorio privado `Directory.Data/observation-photos` mediante Capacitor Filesystem.
- Estado y relaciones: `localStorage` conserva observaciones, especie, variante, XP y la referencia estable, pero no el binario de fotos nuevas.

Al iniciar, las fotos antiguas en Base64 se copian al repositorio adecuado y se verifican antes de guardar `photoRef`. Sólo después de una copia válida se deja de serializar el Base64; si algo falla, la foto heredada permanece intacta. No se modifican XP, fechas, especies, variantes ni IDs de observación.

No hay sincronización, exportación ni respaldo remoto. Desinstalar la app, borrar sus datos o limpiar el almacenamiento del sitio puede eliminar las fotografías locales.

## Cámara, galería y permisos

En Android, Cámara y Galería usan `@capacitor/camera`; la imagen se previsualiza antes de confirmar especie, variante y observación. Las fotos se reducen a un máximo aproximado de 900 px y calidad JPEG 0,72.

La galería usa `chooseFromGallery`. Para la cámara, la versión 0.1.2 usa temporalmente `getPhoto` con resultado URI porque ese puente registra la llamada externa con Capacitor y permite recuperarla mediante `appRestoredResult` si Android recrea la Activity. En `@capacitor/camera 8.2.4`, el flujo Android de `takePhoto` conserva la llamada y sus opciones sólo en memoria; en el dispositivo de prueba esa Activity se recrea y el resultado se pierde. Antes de abrir la cámara se guarda un borrador temporal de Descubrir. Cancelar limpia sólo la operación pendiente y no navega a Inicio.

La versión 0.1.2 conserva el resultado temporal antes de convertirlo y prueba, en orden, `webPath`, la URI mediante Filesystem y la miniatura. La sesión se elimina únicamente después de mostrar la foto o de recibir un código de cancelación oficial. Los eventos de diagnóstico se guardan localmente y también aparecen en Logcat con el prefijo `WildexCapture`; no incluyen el contenido Base64 de la fotografía.

Para seguir una prueba conectada por ADB en Windows:

```powershell
adb logcat | findstr WildexCapture
```

La configuración actual no declara permisos amplios de cámara ni almacenamiento. El plugin abre la aplicación de cámara y el selector de fotos del sistema, `Filesystem` escribe sólo en el directorio privado y `saveToGallery` está desactivado. El manifiesto declara `INTERNET` porque las fotografías del catálogo se cargan desde Wikimedia Commons. Si en el futuro se integra una cámara embebida o se guardan copias en la galería, habrá que revisar permisos por versión de Android.

## Funcionamiento sin conexión

El paquete Android incluye interfaz, catálogo textual, colecciones, perfil, avatar, XP, desafíos fijos y estado local. Las fotografías propias ya guardadas permanecen disponibles sin conexión. Las imágenes remotas del catálogo y sus páginas de atribución requieren Internet; cuando no cargan, la interfaz muestra el respaldo visual existente. No hay reconocimiento automático ni modelo local.

## Integración nativa

- `@capacitor/app`: botón Atrás; cierra primero modales, vuelve a Inicio y luego minimiza la app.
- `@capacitor/status-bar`: estilo coordinado con modo claro u oscuro y áreas seguras.
- `@capacitor/keyboard`: ajusta la vista y oculta temporalmente la navegación inferior al escribir.
- `@capacitor/camera`: cámara y selector de galería del sistema.
- `@capacitor/filesystem`: fotografías en almacenamiento privado de la app.
- `@capacitor/browser`: autorización de Google en el navegador del sistema.
- `@aparajita/capacitor-secure-storage`: sesión Supabase cifrada con una clave protegida por Android Keystore.

## Google Login

El retorno OAuth usa `com.mrlabs.wildex://auth/callback`, declarado en el manifiesto Android y autorizado en Supabase. La app abre Google en el navegador del sistema, recibe el deep link mediante `appUrlOpen` o `getLaunchUrl` e intercambia el código PKCE dentro de la app.

Antes de sincronizar, definir `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en `.env.local`. No agregar el client secret de Google, claves `service_role` ni claves secretas de Supabase. La sesión Android se guarda en almacenamiento cifrado; la compilación web usa una sesión sólo en memoria y no ofrece un flujo OAuth web independiente.

En Supabase debe permanecer autorizada la URL `com.mrlabs.wildex://auth/callback`. En Google Cloud, el cliente web configurado para Supabase debe conservar la URL de callback que muestra el proveedor de Google en el panel de Supabase.

Los iconos y splash Android se generaron desde `public/images/wildex-icon.png` y `public/images/wildex-logo.png`.
