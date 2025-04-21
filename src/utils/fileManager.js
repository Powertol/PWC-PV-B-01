const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

// En Render, usar el directorio /var/data para almacenamiento persistente
const BASE_DIR = process.env.NODE_ENV === 'production' ? '/var/data' : path.join(__dirname, '..', '..');
const DOWNLOADS_DIR = path.join(BASE_DIR, 'downloads');
const OMIE_DIR = path.join(DOWNLOADS_DIR, 'omie');
const EXCEL_DIR = path.join(DOWNLOADS_DIR, 'omie_excel');

// Rutas de archivos importantes
const PRECIOS_PATH = path.join(DOWNLOADS_DIR, 'precios_agregados.xlsx');
const SISTEMA_PATH = path.join(BASE_DIR, 'sistema.xlsx');

async function ensureDirectories() {
    const directories = [
        DOWNLOADS_DIR,
        OMIE_DIR,
        EXCEL_DIR
    ];

    try {
        await Promise.all(directories.map(dir => 
            fs.mkdir(dir, { recursive: true })
        ));
        console.log('Directorios creados/verificados:', directories);
    } catch (error) {
        console.error('Error al crear directorios:', error);
        throw error;
    }
}

async function ensurePreciosFile() {
    try {
        // Verificar si el archivo existe
        try {
            await fs.access(PRECIOS_PATH);
            console.log('Archivo precios_agregados.xlsx existe');
            return true;
        } catch {
            console.log('Creando archivo precios_agregados.xlsx inicial');
            
            // Crear archivo con estructura inicial
            const wb = XLSX.utils.book_new();
            const wsData = [
                ['Ano', 'Mes', 'Dia', 'Hora', 'Precio euro/MW']
            ];
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            
            XLSX.utils.book_append_sheet(wb, ws, 'Precios');
            XLSX.writeFile(wb, PRECIOS_PATH);
            
            console.log('Archivo precios_agregados.xlsx creado con éxito');
            return true;
        }
    } catch (error) {
        console.error('Error al verificar/crear archivo de precios:', error);
        throw error;
    }
}

async function ensureSistemaFile() {
    try {
        // Verificar si el archivo existe
        try {
            await fs.access(SISTEMA_PATH);
            console.log('Archivo sistema.xlsx existe');
            return true;
        } catch {
            console.log('Creando archivo sistema.xlsx inicial');
            
            // Crear archivo con estructura inicial
            const wb = XLSX.utils.book_new();
            const wsData = [
                ['ano', 'mes', 'dia', 'hora', 'Precio MWh', 'Produccion MWh']
            ];
            const ws = XLSX.utils.json_to_sheet(wsData, {
                header: ['ano', 'mes', 'dia', 'hora', 'Precio MWh', 'Produccion MWh']
            });
            
            // Ajustar anchos de columna
            ws['!cols'] = [
                {wch: 6},  // ano
                {wch: 4},  // mes
                {wch: 4},  // dia
                {wch: 4},  // hora
                {wch: 12}, // Precio MWh
                {wch: 12}  // Produccion MWh
            ];
            
            XLSX.utils.book_append_sheet(wb, ws, "Sistema");
            XLSX.writeFile(wb, SISTEMA_PATH);
            
            console.log('Archivo sistema.xlsx creado con éxito');
            return true;
        }
    } catch (error) {
        console.error('Error al verificar/crear archivo sistema:', error);
        throw error;
    }
}

module.exports = {
    paths: {
        BASE_DIR,
        DOWNLOADS_DIR,
        OMIE_DIR,
        EXCEL_DIR,
        PRECIOS_PATH,
        SISTEMA_PATH
    },
    ensureDirectories,
    ensurePreciosFile,
    ensureSistemaFile
};