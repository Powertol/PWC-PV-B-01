const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

// En Render, usar el directorio /tmp para archivos temporales
const BASE_DIR = process.env.NODE_ENV === 'production' ? '/tmp' : path.join(__dirname, '..', '..');
const DOWNLOADS_DIR = path.join(BASE_DIR, 'downloads');
const SISTEMA_PATH = path.join(BASE_DIR, 'sistema.xlsx');

// Asegurar que los directorios existen
async function ensureDirectoryExists() {
    try {
        await fs.mkdir(DOWNLOADS_DIR, { recursive: true });
        console.log('Directorio de descargas creado:', DOWNLOADS_DIR);
    } catch (error) {
        console.error('Error al crear directorio:', error);
        throw error;
    }
}

async function generarSistema() {
    try {
        await ensureDirectoryExists();
        
        console.log('Iniciando generación del archivo sistema.xlsx...');
        const precios = await leerPreciosAgregados();
        const produccionPorHora = await leerProduccionPVGIS();

        console.log('Registros de precios originales:', precios.length);
        
        // Verificar si hay horas inválidas antes del filtrado
        const horasInvalidas = precios.filter(p => p.hora < 1 || p.hora > 24);
        if (horasInvalidas.length > 0) {
            console.log('Se encontraron registros con horas inválidas:', horasInvalidas.length);
            console.log('Ejemplo de registro inválido:', horasInvalidas[0]);
        }

        // Crear estructura de datos para el nuevo sistema y filtrar horas inválidas
        const sistema = precios
            .map(precio => {
                const horaProduccion = precio.hora - 1; // Convertir de 1-24 a 0-23
                const clave = `${precio.mes.toString().padStart(2,'0')}-${precio.dia.toString().padStart(2,'0')}-${horaProduccion}`;
                const produccionValue = produccionPorHora.get(clave);

                if (precio.hora < 1 || precio.hora > 24) {
                    console.log(`Eliminando registro con hora inválida: ${precio.hora} del día ${precio.dia}/${precio.mes}/${precio.ano}`);
                    return null;
                }

                const produccionFinal = produccionValue === undefined ? 0 : produccionValue;
                
                return {
                    'ano': precio.ano,
                    'mes': precio.mes,
                    'dia': precio.dia,
                    'hora': precio.hora,
                    'Precio MWh': formatearNumero(precio.precio),
                    'Produccion MWh': formatearNumero(produccionFinal, 6)
                };
            })
            .filter(registro => registro !== null);

        console.log('Registros después de filtrar horas inválidas:', sistema.length);

        // Ordenar por fecha y hora
        sistema.sort((a, b) => {
            if (a.ano !== b.ano) return a.ano - b.ano;
            if (a.mes !== b.mes) return a.mes - b.mes;
            if (a.dia !== b.dia) return a.dia - b.dia;
            return a.hora - b.hora;
        });

        // Crear nuevo libro de Excel
        const newWorkbook = XLSX.utils.book_new();
        const newWorksheet = XLSX.utils.json_to_sheet(sistema, {
            header: ['ano', 'mes', 'dia', 'hora', 'Precio MWh', 'Produccion MWh']
        });
        
        // Ajustar anchos de columna
        const anchos = [
            {wch: 6},  // ano
            {wch: 4},  // mes
            {wch: 4},  // dia
            {wch: 4},  // hora
            {wch: 12}, // Precio MWh
            {wch: 12}  // Produccion MWh
        ];
        newWorksheet['!cols'] = anchos;

        XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, "Sistema");

        // Guardar archivo
        XLSX.writeFile(newWorkbook, SISTEMA_PATH);
        console.log('Archivo sistema.xlsx generado exitosamente en:', SISTEMA_PATH);
        return true;
    } catch (error) {
        console.error('Error al generar el archivo:', error);
        return false;
    }
}

// Función para leer el archivo de precios
async function leerPreciosAgregados() {
    try {
        const rutaPrecios = path.join(DOWNLOADS_DIR, 'precios_agregados.xlsx');
        console.log('Leyendo precios desde:', rutaPrecios);
        
        const workbook = XLSX.readFile(rutaPrecios);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const datos = XLSX.utils.sheet_to_json(worksheet, { raw: true });
        
        return datos.filter(row =>
            row.Ano && row.Mes && row.Dia && row.Hora && row['Precio euro/MW']
        ).map(row => ({
            ano: parseInt(row.Ano),
            mes: parseInt(row.Mes),
            dia: parseInt(row.Dia),
            hora: parseInt(row.Hora),
            precio: typeof row['Precio euro/MW'] === 'number'
                ? row['Precio euro/MW']
                : parseFloat(row['Precio euro/MW'].toString().replace(',', '.'))
        }));
    } catch (error) {
        console.error('Error al leer archivo de precios:', error);
        throw error;
    }
}

// Función para leer el archivo de producción PVGIS más reciente
async function leerProduccionPVGIS() {
    try {
        const archivos = await fs.readdir(DOWNLOADS_DIR);
        const archivosPvgis = archivos.filter(archivo => archivo.startsWith('pvgis_production_'));
        
        // Obtener el archivo más reciente
        const archivoProduccion = archivosPvgis.sort().pop();

        // Eliminar archivos antiguos
        const archivosEliminados = archivosPvgis.slice(0, -1);
        await Promise.all(archivosEliminados.map(archivo => 
            fs.unlink(path.join(DOWNLOADS_DIR, archivo))
        ));
        
        if (archivosEliminados.length > 0) {
            console.log(`Se eliminaron ${archivosEliminados.length} archivos antiguos de producción`);
        }

        if (!archivoProduccion) {
            throw new Error('No se encontró archivo de producción PVGIS');
        }

        console.log('Usando archivo de producción:', archivoProduccion);
        const rutaProduccion = path.join(DOWNLOADS_DIR, archivoProduccion);
        
        const workbook = XLSX.readFile(rutaProduccion);
        const worksheet = workbook.Sheets['Datos Horarios'];
        
        if (!worksheet) {
            throw new Error('No se encontró la hoja "Datos Horarios"');
        }

        const datos = XLSX.utils.sheet_to_json(worksheet, { raw: true });
        const produccionPorFecha = new Map();

        datos.forEach(row => {
            if (!row['Mes'] || !row['Día'] || !row['Hora'] || !row['Producción (MWh)']) return;

            const mes = typeof row['Mes'] === 'number' ? row['Mes'] : parseInt(row['Mes']);
            const dia = typeof row['Día'] === 'number' ? row['Día'] : parseInt(row['Día']);
            const hora = typeof row['Hora'] === 'number' ? row['Hora'] : parseInt(row['Hora']);

            if (hora < 0 || hora > 23) {
                console.log(`Ignorando hora inválida en producción: ${hora}`);
                return;
            }

            const produccion = typeof row['Producción (MWh)'] === 'number'
                ? row['Producción (MWh)']
                : parseFloat(row['Producción (MWh)'].toString().replace(',', '.'));

            if (!isNaN(hora) && !isNaN(produccion)) {
                const clave = `${mes.toString().padStart(2,'0')}-${dia.toString().padStart(2,'0')}-${hora}`;
                produccionPorFecha.set(clave, produccion);
            }
        });

        return produccionPorFecha;
    } catch (error) {
        console.error('Error al leer archivo de producción:', error);
        throw error;
    }
}

function formatearNumero(numero, decimales = 2) {
    if (typeof numero !== 'number' || isNaN(numero)) return 0;
    return parseFloat(numero.toFixed(decimales));
}

if (require.main === module) {
    generarSistema();
}

module.exports = generarSistema;