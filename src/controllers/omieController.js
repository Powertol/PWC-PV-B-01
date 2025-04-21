const axios = require('axios');
const xlsx = require('xlsx');
const moment = require('moment');
const energyService = require('../services/energyService');

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

    downloadFile: async function(date) {
        const filename = `marginalpdbc_${date}.1`;
        
        try {
            const url = `https://www.omie.es/es/file-download?parents=marginalpdbc&filename=${filename}`;
            console.log('Descargando archivo:', url);
            
            const response = await axios.get(url, { responseType: 'arraybuffer' });
            const data = response.data.toString();
            
            // Procesar el contenido del archivo
            const lines = data.split('\n');
            const prices = [];
            
            for (const line of lines) {
                if (line.trim() && !line.startsWith('Fecha')) {
                    const parts = line.split(';');
                    if (parts.length >= 4) {
                        const fechaStr = parts[0];
                        const hora = parseInt(parts[1]);
                        const precioES = parseFloat(parts[2].replace(',', '.'));
                        
                        if (!isNaN(hora) && !isNaN(precioES)) {
                            const fecha = moment(fechaStr, 'DD/MM/YYYY');
                            prices.push({
                                ano: fecha.year(),
                                mes: fecha.month() + 1,
                                dia: fecha.date(),
                                hora,
                                precio: precioES
                            });
                        }
                    }
                }
            }

            // Guardar precios en la base de datos
            if (prices.length > 0) {
                await energyService.saveEnergyPrices(prices);
            }

            return { success: true, filename };
        } catch (error) {
            console.error(`Error downloading file ${filename}:`, error);
            throw error;
        }
    },

    getDownloadStatus: async function(req, res) {
        try {
            const availableFiles = await omieController.getFilesList();
            const availableFilenames = availableFiles.map(date => `marginalpdbc_${date}.1`);
            
            // Obtener precios almacenados
            const storedPrices = await energyService.getEnergyPrices();
            const downloadedDates = new Set(
                storedPrices.map(price => 
                    moment(`${price.year}-${price.month}-${price.day}`, 'YYYY-M-D')
                    .format('YYYYMMDD')
                )
            );
            
            // Identificar archivos pendientes
            const pendingFiles = availableFiles.filter(date => !downloadedDates.has(date));

            res.json({
                available: availableFilenames.length,
                downloaded: downloadedDates.size,
                pending: pendingFiles.length,
                files: {
                    available: availableFilenames,
                    downloaded: Array.from(downloadedDates).map(date => `marginalpdbc_${date}.1`),
                    pending: pendingFiles.map(date => `marginalpdbc_${date}.1`)
                }
            });
        } catch (error) {
            console.error('Error en getDownloadStatus:', error);
            res.status(500).json({
                error: 'Error al obtener estado de descargas',
                message: error.message
            });
        }
    },

    startDownload: async function(req, res) {
        try {
            const availableFiles = await omieController.getFilesList();
            const storedPrices = await energyService.getEnergyPrices();
            const downloadedDates = new Set(
                storedPrices.map(price => 
                    moment(`${price.year}-${price.month}-${price.day}`, 'YYYY-M-D')
                    .format('YYYYMMDD')
                )
            );
            
            const pendingFiles = availableFiles.filter(date => !downloadedDates.has(date));

            // Iniciar descargas en secuencia
            for (const date of pendingFiles) {
                try {
                    await omieController.downloadFile(date);
                } catch (error) {
                    console.error(`Error downloading file for date ${date}:`, error);
                    continue;
                }
            }

            // Generar archivo Excel con todos los precios
            const prices = await energyService.getEnergyPrices();
            const wb = xlsx.utils.book_new();
            
            const wsData = prices.map(price => ({
                Ano: price.year,
                Mes: price.month,
                Dia: price.day,
                Hora: price.hour,
                'Precio euro/MW': price.price_mwh
            }));

            const ws = xlsx.utils.json_to_sheet(wsData);
            xlsx.utils.book_append_sheet(wb, ws, 'Precios');

            // Generar el archivo Excel en memoria
            const excelBuffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
            
            // Configurar headers para la descarga
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=precios_agregados.xlsx');
            
            // Enviar el archivo
            res.send(excelBuffer);

        } catch (error) {
            console.error('Error en startDownload:', error);
            res.status(500).json({ 
                error: 'Error en el proceso de descarga',
                message: error.message 
            });
        }
    }
};

module.exports = omieController;