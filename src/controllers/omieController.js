const axios = require('axios');
const xlsx = require('xlsx');
const moment = require('moment');
const energyService = require('../services/energyService');

const omieController = {
    getFilesList: async function() {
        const startDate = moment('2024-01-01');
        const endDate = moment('2024-12-31');  // Hasta fin de 2024
        const datesList = [];

        console.log('Generando lista de archivos desde:', startDate.format('YYYY-MM-DD'), 
                    'hasta:', endDate.format('YYYY-MM-DD'));

        while (startDate.isSameOrBefore(endDate)) {
            datesList.push(startDate.format('YYYYMMDD'));
            startDate.add(1, 'day');
        }

        console.log(`Lista generada: ${datesList.length} días`);
        return datesList;
    },

    downloadFile: async function(date) {
        const filename = `marginalpdbc_${date}.1`;
        
        try {
            const url = `https://www.omie.es/es/file-download?parents=marginalpdbc&filename=${filename}`;
            console.log('Descargando archivo:', url);
            
            const response = await axios.get(url, { responseType: 'arraybuffer' });
            
            // Convertir el buffer a string y analizar el contenido
            const data = response.data.toString();
            console.log('Muestra de datos recibidos:', data.substring(0, 200));

            const lines = data.split('\n');
            const prices = [];
            
            console.log(`Procesando ${lines.length} líneas del archivo ${filename}`);
            
            for (const line of lines) {
                if (line.trim() && !line.startsWith('Fecha')) {
                    console.log('Procesando línea:', line);  // Log completo de la línea

                    const parts = line.split(';');
                    console.log('Partes separadas:', parts);  // Log de las partes

                    if (parts.length >= 4) {
                        const fechaStr = parts[0].trim();
                        const horaStr = parts[1].trim();
                        const precioStr = parts[2].trim().replace(',', '.');
                        
                        console.log('Datos extraídos:', {
                            fecha: fechaStr,
                            hora: horaStr,
                            precio: precioStr,
                            parteOriginal: parts[2]
                        });

                        const hora = parseInt(horaStr);
                        const precio = parseFloat(precioStr);
                        
                        if (!isNaN(hora) && !isNaN(precio) && fechaStr) {
                            try {
                                const fecha = moment(fechaStr, 'DD/MM/YYYY');
                                if (fecha.isValid()) {
                                    prices.push({
                                        ano: fecha.year(),
                                        mes: fecha.month() + 1,
                                        dia: fecha.date(),
                                        hora,
                                        precio
                                    });
                                    console.log('Precio procesado correctamente:', {
                                        ano: fecha.year(),
                                        mes: fecha.month() + 1,
                                        dia: fecha.date(),
                                        hora,
                                        precio
                                    });
                                } else {
                                    console.warn(`Fecha inválida: ${fechaStr}`);
                                }
                            } catch (error) {
                                console.error('Error parsing date:', fechaStr, error);
                            }
                        } else {
                            console.warn('Valores inválidos:', {
                                hora: { valor: hora, esNaN: isNaN(hora) },
                                precio: { valor: precio, esNaN: isNaN(precio) },
                                fechaStr: fechaStr
                            });
                        }
                    }
                }
            }

            console.log(`Processed ${prices.length} initial price records from file ${filename}`);

            const validPrices = prices.filter(price => {
                const isValid = (
                    Number.isInteger(price.ano) && price.ano > 2000 && price.ano < 2100 &&
                    Number.isInteger(price.mes) && price.mes >= 1 && price.mes <= 12 &&
                    Number.isInteger(price.dia) && price.dia >= 1 && price.dia <= 31 &&
                    Number.isInteger(price.hora) && price.hora >= 1 && price.hora <= 24 &&
                    typeof price.precio === 'number' && !isNaN(price.precio) && price.precio >= 0
                );

                if (!isValid) {
                    console.warn('Precio inválido:', {
                        price,
                        validaciones: {
                            ano: { valor: price.ano, valido: Number.isInteger(price.ano) && price.ano > 2000 && price.ano < 2100 },
                            mes: { valor: price.mes, valido: Number.isInteger(price.mes) && price.mes >= 1 && price.mes <= 12 },
                            dia: { valor: price.dia, valido: Number.isInteger(price.dia) && price.dia >= 1 && price.dia <= 31 },
                            hora: { valor: price.hora, valido: Number.isInteger(price.hora) && price.hora >= 1 && price.hora <= 24 },
                            precio: { valor: price.precio, valido: typeof price.precio === 'number' && !isNaN(price.precio) && price.precio >= 0 }
                        }
                    });
                }

                return isValid;
            });

            console.log(`Found ${validPrices.length} valid prices after validation for ${filename}`);

            if (validPrices.length > 0) {
                console.log('Muestra de precios válidos:', validPrices.slice(0, 3));
                await energyService.saveEnergyPrices(validPrices);
                console.log(`Successfully saved ${validPrices.length} prices to database from ${filename}`);
            } else {
                console.warn('No valid prices found in file:', filename);
                console.log('Contenido del archivo:', data);
            }

            return { 
                success: true, 
                filename, 
                processedCount: validPrices.length,
                totalLines: lines.length,
                initialPrices: prices.length,
                sampleData: data.substring(0, 500)  // Incluir muestra de datos en la respuesta
            };
        } catch (error) {
            console.error(`Error downloading file ${filename}:`, {
                message: error.message,
                status: error.response?.status,
                statusText: error.response?.statusText,
                headers: error.response?.headers,
                data: error.response?.data
            });
            throw error;
        }
    },

    // ... resto del código sin cambios ...
};

module.exports = omieController;