# WILDEX

WILDEX es un prototipo web interactivo de una futura aplicación móvil Android para explorar, identificar y coleccionar especies reales.

Esta web no es el producto final ni una landing page. Su objetivo es validar diseño, flujo y presentación del MVP dentro de un contenedor que simula una app móvil.

## Funcionalidades

- Dashboard de explorador.
- Flujo de cámara o subida de imagen.
- Servicio de identificación separado en modo demostración.
- Resultado con ficha informativa de especie.
- Colección personal persistida en `localStorage`.
- Perfil, experiencia, progreso y logros.
- Navegación inferior mobile-first.
- Prototipo listo para publicarse en GitHub Pages.

## Modo demo

El reconocimiento de especies no está conectado a una IA real. El servicio ubicado en `src/services/recognitionService.ts` usa un modo demostración identificado en la interfaz. No muestra porcentajes de confianza falsos.

## Instalación

```bash
npm install
```

## Ejecutar localmente

```bash
npm run dev
```

Luego abre la URL que indique Vite, normalmente:

```bash
http://127.0.0.1:5173/
```

## Build de producción

```bash
npm run build
```

## Vista previa del build

```bash
npm run preview
```

## GitHub Pages

El proyecto incluye un workflow en `.github/workflows/deploy.yml`.

Para publicarlo:

1. Sube este proyecto a un repositorio de GitHub.
2. En GitHub, abre `Settings > Pages`.
3. En `Build and deployment`, selecciona `GitHub Actions`.
4. Haz push a la rama `main`.

La configuración de Vite toma automáticamente el nombre del repositorio desde `GITHUB_REPOSITORY` durante el build de GitHub Actions, por lo que la ruta base queda preparada para GitHub Pages.

## Estructura principal

```text
wildex/
├── public/
│   ├── favicon.svg
│   └── images/
├── src/
│   ├── components/
│   ├── data/
│   ├── pages/
│   ├── services/
│   ├── styles/
│   ├── utils/
│   ├── App.tsx
│   └── main.tsx
├── .github/
│   └── workflows/
├── index.html
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## Recursos visuales

Las fichas usan fotografías remotas desde Wikimedia Commons. No se incluyen imágenes de terceros en el ZIP, salvo el favicon propio del prototipo.

## Seguridad

No se incluyen claves privadas, tokens ni credenciales.
