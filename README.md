# Web BEES 4.0

Aplicación web para descarga y análisis de precios del mercado eléctrico.

## Características

- Descarga de precios del mercado eléctrico OMIE
- Interfaz web para visualización de datos
- Sistema de autenticación de usuarios
- Visualización de datos en mapas usando Leaflet
- Exportación de datos a Excel

## Requisitos previos

- Node.js (v14 o superior)
- npm (incluido con Node.js)

## Instalación

1. Clonar el repositorio:
```bash
git clone [URL_DEL_REPOSITORIO]
cd web-bees
```

2. Instalar dependencias:
```bash
npm install
```

3. Configurar variables de entorno:
```bash
cp .env.example .env
```
Editar el archivo `.env` con tus configuraciones.

4. Iniciar la aplicación:

Para desarrollo:
```bash
npm run dev
```

Para producción:
```bash
npm start
```

## Estructura del proyecto

- `src/` - Código fuente principal
  - `controllers/` - Controladores de la aplicación
  - `models/` - Modelos de datos
  - `routes/` - Rutas de la aplicación
  - `views/` - Plantillas EJS
- `public/` - Archivos estáticos
- `downloads/` - Archivos descargados

## Despliegue

Esta aplicación está configurada para ser desplegada en Render.com. Para desplegar:

1. Asegúrate de que todos los cambios estén commitidos en GitHub
2. En Render, crear un nuevo "Web Service"
3. Conectar con el repositorio de GitHub
4. Configurar las variables de entorno necesarias
5. Desplegar

## Licencia

ISC