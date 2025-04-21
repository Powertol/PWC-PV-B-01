const db = require('../models/database');
const axios = require('axios');
const { procesarArchivo } = require('./conversorController');
const moment = require('moment');
const fs = require('fs').promises; // Usar promesas para operaciones de archivo
const fsSync = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// En Render, usar el directorio /tmp para archivos temporales
const BASE_DIR = process.env.NODE_ENV === 'production' ? '/tmp' : path.join(__dirname, '..', '..');
const DOWNLOAD_DIR = path.join(BASE_DIR, 'downloads', 'omie');
const EXCEL_DIR = path.join(BASE_DIR, 'downloads', 'omie_excel');
const AGREGADO_PATH = path.join(BASE_DIR, 'downloads', 'precios_agregados.xlsx');

// Asegurar que los directorios existen
async function ensureDirectoriesExist() {
    try {
        await Promise.all([
            fs.mkdir(DOWNLOAD_DIR, { recursive: true }),
            fs.mkdir(EXCEL_DIR, { recursive: true }),
            fs.mkdir(path.dirname(AGREGADO_PATH), { recursive: true })
        ]);
        console.log('Directorios creados:', {
            DOWNLOAD_DIR,
            EXCEL_DIR,
            AGREGADO_DIR: path.dirname(AGREGADO_PATH)
        });
    } catch (error) {
        console.error('Error al crear directorios:', error);
        throw error;
    }
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
        try {
            await ensureDirectoriesExist();
            
            // Verificar archivos físicamente en el directorio
            let existingFiles = [];
            try {
                const files = await fs.readdir(DOWNLOAD_DIR);
                existingFiles = files.filter(file => file.endsWith('.1'));
            } catch (error) {
                console.error('Error al leer directorio:', error);
                existingFiles = [];
            }

            console.log('Archivos encontrados:', existingFiles);

            // Limpiar registros de la base de datos que ya no existen físicamente
            if (existingFiles.length > 0) {
                await db.none(
                    'DELETE FROM downloaded_files WHERE filename NOT IN ($1:csv)',
                    [existingFiles]
                );
            }

            // Insertar nuevos archivos encontrados
            for (const file of existingFiles) {
                const date = file.replace('marginalpdbc_', '').replace('.1', '');
                await db.none(
                    'INSERT INTO downloaded_files (filename, file_date, file_path) VALUES ($1, $2, $3) ON CONFLICT (filename) DO NOTHING',
                    [file, moment(date, 'YYYYMMDD').format('YYYY-MM-DD'), path.join(DOWNLOAD_DIR, file)]
                );
            }

            // Retornar la lista actualizada de archivos
            const files = await db.any('SELECT filename, file_date FROM downloaded_files ORDER BY file_date');
            console.log('Archivos en base de datos:', files);
            return files;
        } catch (error) {
            console.error('Error en checkDownloadedFiles:', error);
            throw error;
        }
    },

    getDownloadStatus: async function(req, res) {
        try {
            await ensureDirectoriesExist();
            
            // Obtener lista de archivos disponibles y descargados
            const [availableFiles, downloadedFiles] = await Promise.all([
                omieController.getFilesList(),
                omieController.checkDownloadedFiles()
            ]);
            
            // Convertir archivos disponibles al formato del nombre de archivo
            const availableFilenames = availableFiles.map(date => `marginalpdbc_${date}.1`);
            
            // Verificar archivos físicamente
            let existingFiles = [];
            try {
                const files = await fs.readdir(DOWNLOAD_DIR);
                existingFiles = files.filter(file => file.endsWith('.1'));
            } catch (error) {
                console.error('Error al leer directorio en getDownloadStatus:', error);
                existingFiles = [];
            }
            
            // Calcular archivos pendientes
            const pendingFiles = availableFilenames.filter(filename =>
                !existingFiles.includes(filename)
            );

            console.log('Estado de descargas:', {
                availableCount: availableFilenames.length,
                downloadedCount: existingFiles.length,
                pendingCount: pendingFiles.length,
                downloadDir: DOWNLOAD_DIR,
                downloadedFiles: existingFiles
            });

            res.json({
                available: availableFilenames.length,
                downloaded: existingFiles.length,
                pending: pendingFiles.length,
                files: {
                    available: availableFilenames,
                    downloaded: existingFiles,
                    pending: pendingFiles
                },
                paths: {
                    downloadDir: DOWNLOAD_DIR,
                    excelDir: EXCEL_DIR,
                    agregadoPath: AGREGADO_PATH
                }
            });
        } catch (error) {
            console.error('Error detallado en getDownloadStatus:', {
                error: error.message,
                stack: error.stack,
                downloadDir: DOWNLOAD_DIR
            });
            res.status(500).json({
                error: 'Error al obtener estado de descargas',
                message: error.message,
                stack: process.env.NODE_ENV === 'production' ? undefined : error.stack,
                paths: {
                    downloadDir: DOWNLOAD_DIR,
                    excelDir: EXCEL_DIR,
                    agregadoPath: AGREGADO_PATH
                }
            });
        }
    },

    // ... resto del controlador sin cambios ...
};

module.exports = omieController;