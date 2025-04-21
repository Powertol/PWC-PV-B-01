const db = require('../models/database');
const axios = require('axios');
const { procesarArchivo } = require('./conversorController');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// En Render, usar el directorio /tmp para archivos temporales
const BASE_DIR = process.env.NODE_ENV === 'production' ? '/tmp' : path.join(__dirname, '..', '..');
const DOWNLOAD_DIR = path.join(BASE_DIR, 'downloads', 'omie');
const EXCEL_DIR = path.join(BASE_DIR, 'downloads', 'omie_excel');
const AGREGADO_PATH = path.join(BASE_DIR, 'downloads', 'precios_agregados.xlsx');

// Asegurar que los directorios existen
function ensureDirectoriesExist() {
    [DOWNLOAD_DIR, EXCEL_DIR, path.dirname(AGREGADO_PATH)].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
}

const omieController = {
    getFilesList: async function() {
        const startDate = moment('2024-01-01');
        const endDate = moment().add(1, 'day');
        const datesList = [];

        while (startDate.isSameOrBefore(endDate)) {
            datesList.push(startDate.format('YYYYMMDD'));
            startDate.add(1, 'day');
        }

        return datesList;
    },

    checkDownloadedFiles: async function() {
        ensureDirectoriesExist();
        
        // Verificar archivos físicamente en el directorio
        const existingFiles = fs.existsSync(DOWNLOAD_DIR)
            ? fs.readdirSync(DOWNLOAD_DIR)
                .filter(file => file.endsWith('.1'))
            : [];

        // Limpiar registros de la base de datos que ya no existen físicamente
        await db.none(
            'DELETE FROM downloaded_files WHERE filename NOT IN ($1:csv)',
            [existingFiles]
        );

        // Insertar nuevos archivos encontrados
        for (const file of existingFiles) {
            const date = file.replace('marginalpdbc_', '').replace('.1', '');
            await db.none(
                'INSERT INTO downloaded_files (filename, file_date, file_path) VALUES ($1, $2, $3) ON CONFLICT (filename) DO NOTHING',
                [file, moment(date, 'YYYYMMDD').format('YYYY-MM-DD'), path.join(DOWNLOAD_DIR, file)]
            );
        }

        // Retornar la lista actualizada de archivos
        return await db.any('SELECT filename, file_date FROM downloaded_files ORDER BY file_date');
    },

    downloadFile: async function(date) {
        ensureDirectoriesExist();
        
        const filename = `marginalpdbc_${date}.1`;
        const filePath = path.join(DOWNLOAD_DIR, filename);

        // Verificar si el archivo ya existe
        if (fs.existsSync(filePath)) {
            console.log(`El archivo ${filename} ya existe, omitiendo descarga.`);
            return { success: true, filename, filePath };
        }

        const url = `https://www.omie.es/es/file-download?parents=marginalpdbc&filename=${filename}`;
        
        try {
            const response = await axios.get(url, { responseType: 'arraybuffer' });
            const data = response.data;

            // Guardar el archivo físicamente
            await fs.promises.writeFile(filePath, data);

            // Procesar el archivo y convertirlo a Excel
            await procesarArchivo(filename);

            // Registrar en la base de datos
            await db.none(
                'INSERT INTO downloaded_files (filename, file_date, file_path) VALUES ($1, $2, $3)',
                [filename, moment(date, 'YYYYMMDD').format('YYYY-MM-DD'), filePath]
            );

            return { success: true, filename, filePath };
        } catch (error) {
            console.error(`Error downloading file ${filename}:`, error.message);
            throw error;
        }
    },

    getDownloadStatus: async function(req, res) {
        try {
            ensureDirectoriesExist();
            
            // Forzar una verificación fresca de archivos descargados
            await omieController.checkDownloadedFiles();
            
            const availableFiles = await omieController.getFilesList();
            const downloadedFiles = await omieController.checkDownloadedFiles();
            
            // Convertir archivos disponibles al formato del nombre de archivo
            const availableFilenames = availableFiles.map(date => `marginalpdbc_${date}.1`);
            
            // Verificar archivos físicamente en el directorio
            const existingFiles = fs.existsSync(DOWNLOAD_DIR)
                ? fs.readdirSync(DOWNLOAD_DIR).filter(file => file.endsWith('.1'))
                : [];
                
            // Usar los archivos físicos como lista de descargados
            const downloadedFilenames = existingFiles;
            
            // Calcular archivos pendientes
            const pendingFiles = availableFilenames.filter(filename =>
                !downloadedFilenames.includes(filename)
            );

            res.json({
                available: availableFilenames.length,
                downloaded: downloadedFilenames.length,
                pending: pendingFiles.length,
                files: {
                    available: availableFilenames,
                    downloaded: downloadedFilenames,
                    pending: pendingFiles
                }
            });
        } catch (error) {
            console.error('Error en getDownloadStatus:', error);
            res.status(500).json({
                error: 'Error al obtener estado de descargas',
                message: error.message,
                path: DOWNLOAD_DIR
            });
        }
    },

    startDownload: async function(req, res) {
        try {
            ensureDirectoriesExist();
            
            await omieController.checkDownloadedFiles();
            const availableFiles = await omieController.getFilesList();
            const downloadedFiles = await omieController.checkDownloadedFiles();
            const downloadedFilenames = downloadedFiles.map(f => f.filename);
            
            const pendingFiles = availableFiles.filter(date =>
                !downloadedFilenames.includes(`marginalpdbc_${date}.1`)
            );

            if (req.session.user) {
                await db.none(
                    'INSERT INTO metrics (user_id, action) VALUES ($1, $2)',
                    [req.session.user.id, 'start_download']
                );
            }

            // Iniciar descargas en secuencia
            for (const date of pendingFiles) {
                try {
                    await omieController.downloadFile(date);
                } catch (error) {
                    console.error(`Error downloading file for date ${date}:`, error);
                    continue;
                }
            }

            // Actualizar el archivo agregado después de las descargas
            await omieController.agregarPreciosExcel();

            res.json({ 
                success: true, 
                message: 'Descarga y agregación completadas',
                downloaded: pendingFiles.length,
                total: availableFiles.length
            });
        } catch (error) {
            console.error('Error en startDownload:', error);
            res.status(500).json({ 
                error: 'Error en el proceso de descarga',
                message: error.message 
            });
        }
    },

    agregarPreciosExcel: async function() {
        try {
            ensureDirectoriesExist();
            
            // Verificar que el directorio existe
            if (!fs.existsSync(EXCEL_DIR)) {
                throw new Error('El directorio de archivos Excel no existe');
            }

            // Obtener lista de archivos Excel
            const archivos = fs.readdirSync(EXCEL_DIR)
                .filter(file => file.endsWith('.xlsx'))
                .sort();

            // Estructura para almacenar los datos
            const datos = [];

            // Procesar cada archivo
            for (const archivo of archivos) {
                const workbook = XLSX.readFile(path.join(EXCEL_DIR, archivo));
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const fileDatos = XLSX.utils.sheet_to_json(worksheet);

                // Obtener fecha del nombre del archivo
                const fechaStr = archivo.replace('marginalpdbc_', '').replace('.xlsx', '');
                const fecha = moment(fechaStr, 'YYYYMMDD');
                const ano = fecha.format('YYYY');
                const mes = fecha.format('MM');
                const dia = fecha.format('DD');

                fileDatos.forEach(row => {
                    const hora = row.Hora?.toString() || '';
                    const precioES = row['Precio ES MWh'];

                    if (hora && precioES !== undefined) {
                        datos.push({
                            Ano: ano,
                            Mes: mes,
                            Dia: dia,
                            Hora: hora,
                            'Precio euro/MW': precioES
                        });
                    }
                });
            }

            // Ordenar los datos
            datos.sort((a, b) => {
                const fechaA = `${a.Ano}${a.Mes}${a.Dia}${a.Hora.padStart(2, '0')}`;
                const fechaB = `${b.Ano}${b.Mes}${b.Dia}${b.Hora.padStart(2, '0')}`;
                return fechaA.localeCompare(fechaB);
            });

            // Crear nuevo libro de Excel
            const wb = XLSX.utils.book_new();
            
            // Convertir datos al formato de hoja de cálculo
            const wsData = [
                ['Ano', 'Mes', 'Dia', 'Hora', 'Precio euro/MW']
            ];

            datos.forEach(row => {
                wsData.push([
                    row.Ano,
                    row.Mes,
                    row.Dia,
                    row.Hora,
                    row['Precio euro/MW']
                ]);
            });

            const ws = XLSX.utils.aoa_to_sheet(wsData);
            XLSX.utils.book_append_sheet(wb, ws, 'Precios Agregados');

            // Guardar el archivo
            XLSX.writeFile(wb, AGREGADO_PATH);

            return { success: true, message: 'Archivo agregado creado correctamente' };
        } catch (error) {
            console.error('Error al agregar precios:', error);
            throw error;
        }
    }
};

module.exports = omieController;