const axios = require('axios');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs').promises;
const fileManager = require('../utils/fileManager');
const generarSistema = require('../scripts/generarSistema');

const pvgisController = {
    async getPVGISData(req, res) {
        try {
            // Asegurar que todos los directorios y archivos necesarios existen
            await fileManager.ensureDirectories();
            await fileManager.ensurePreciosFile();
            await fileManager.ensureSistemaFile();

            console.log('Datos recibidos:', req.body);
            
            const {
                lat,
                lon,
                peakpower,
                loss,
                mounting_system,
                angle,
                aspect
            } = req.body;

            // Validaciones
            if (!lat || !lon || !peakpower || loss === undefined || !angle) {
                throw new Error('Faltan campos requeridos o valores inválidos');
            }

            if (lat < -90 || lat > 90) throw new Error('Latitud debe estar entre -90 y 90');
            if (lon < -180 || lon > 180) throw new Error('Longitud debe estar entre -180 y 180');
            if (peakpower <= 0) throw new Error('La potencia pico debe ser mayor a 0');
            if (loss < 0 || loss > 100) throw new Error('Las pérdidas deben estar entre 0 y 100');
            if (angle < 0 || angle > 90) throw new Error('El ángulo debe estar entre 0 y 90');

            // Configurar tracking según el tipo de montaje
            let trackingParams = {};
            switch(mounting_system) {
                case 'vertical_axis':
                    trackingParams = { tracking: 1, trackingtype: 0 };
                    break;
                case 'inclined_axis':
                    trackingParams = { tracking: 1, trackingtype: 1 };
                    break;
                case 'two_axis':
                    trackingParams = { tracking: 1, trackingtype: 2 };
                    break;
                default:
                    trackingParams = {
                        tracking: 0,
                        fixed_angle: parseFloat(angle),
                        fixed_azimuth: parseFloat(aspect)
                    };
            }

            const params = {
                lat: parseFloat(lat),
                lon: parseFloat(lon),
                peakpower: parseFloat(peakpower),
                loss: parseFloat(loss),
                usehorizon: 1,
                outputformat: 'json',
                pvcalculation: 1,
                pvtechchoice: 'crystSi',
                startyear: 2020,
                endyear: 2020,
                components: 1,
                ...trackingParams
            };

            console.log('Enviando solicitud a PVGIS con parámetros:', params);

            const baseUrl = 'https://re.jrc.ec.europa.eu/api/v5_2/seriescalc';
            const response = await axios.get(baseUrl, {
                params,
                timeout: 60000,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'PowerChoice/1.0'
                }
            });

            if (!response.data || !response.data.outputs) {
                throw new Error('No se recibieron datos válidos de PVGIS');
            }

            const outputs = response.data.outputs;
            let hourlyData = [];

            if (outputs.hourly && Array.isArray(outputs.hourly)) {
                hourlyData = outputs.hourly.map(hour => {
                    const timeMatch = hour.time.match(/(\d{4})(\d{2})(\d{2}):(\d{2})(\d{2})/);
                    if (!timeMatch) {
                        throw new Error(`Formato de fecha inválido: ${hour.time}`);
                    }
                    const [_, year, month, day, hours] = timeMatch;
                    
                    return {
                        año: parseInt(year),
                        mes: parseInt(month),
                        día: parseInt(day),
                        hora: parseInt(hours),
                        'Producción (MWh)': parseFloat(((hour.P || 0) / 1000000).toFixed(6))
                    };
                });
            } else {
                throw new Error('No se encontraron datos horarios en la respuesta de PVGIS');
            }

            // Crear Excel con resultados
            const wb = xlsx.utils.book_new();
            
            // Agregar información de la instalación
            const infoData = [
                ['INSTALACIÓN SOLAR FOTOVOLTAICA - DATOS DE CONFIGURACIÓN'],
                [''],
                ['Ubicación', `Latitud: ${params.lat}°, Longitud: ${params.lon}°`],
                ['Potencia Instalada', `${params.peakpower} kWp`],
                ['Pérdidas', `${params.loss}%`],
                ['Configuración', mounting_system === 'fixed' ? 'Sistema Fijo' :
                                mounting_system === 'vertical_axis' ? 'Seguimiento Eje Vertical' :
                                mounting_system === 'inclined_axis' ? 'Seguimiento Eje Horizontal' :
                                'Seguimiento 2 Ejes'],
                mounting_system === 'fixed' ? ['Ángulo', `${params.fixed_angle}°`] : [''],
                mounting_system === 'fixed' ? ['Azimut', `${params.fixed_azimuth}° (0° = Sur, -90° = Este, 90° = Oeste)`] : [''],
                [''],
                ['Fuente de Datos', 'PVGIS-SARAH2'],
                ['Año de Referencia', '2020']
            ];
            
            const wsInfo = xlsx.utils.aoa_to_sheet(infoData);
            wsInfo['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 10 }];
            
            const wsData = xlsx.utils.json_to_sheet(hourlyData);
            wsData['!cols'] = [
                { wch: 6 },  // año
                { wch: 4 },  // mes
                { wch: 4 },  // día
                { wch: 4 },  // hora
                { wch: 15 }  // produccion_MWh
            ];

            xlsx.utils.sheet_add_aoa(wsData, [
                ['Año', 'Mes', 'Día', 'Hora', 'Producción (MWh)']
            ], { origin: 'A1' });
            
            xlsx.utils.book_append_sheet(wb, wsInfo, 'Información');
            xlsx.utils.book_append_sheet(wb, wsData, 'Datos Horarios');
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `pvgis_production_${timestamp}.xlsx`;
            const excelPath = path.join(fileManager.paths.DOWNLOADS_DIR, fileName);
            
            // Guardar Excel
            xlsx.writeFile(wb, excelPath);
            console.log('Archivo Excel generado en:', excelPath);

            // Actualizar sistema.xlsx
            console.log('Actualizando sistema.xlsx...');
            try {
                await generarSistema();
                console.log('sistema.xlsx actualizado correctamente');
            } catch (error) {
                console.error('Error al actualizar sistema.xlsx:', error);
                // No lanzar el error para que no afecte la respuesta al usuario
            }
            
            res.json({
                success: true,
                message: 'Datos procesados correctamente',
                data: {
                    summary: {
                        totalProduction: hourlyData.reduce((sum, hour) => sum + hour['Producción (MWh)'], 0),
                        location: `${params.lat}, ${params.lon}`,
                        peakPower: params.peakpower
                    }
                },
                file: fileName
            });

        } catch (error) {
            console.error('Error en PVGIS:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener datos de PVGIS',
                error: error.message,
                stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
            });
        }
    }
};

module.exports = pvgisController;