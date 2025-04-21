const axios = require('axios');
const xlsx = require('xlsx');
const path = require('path');
const generarSistema = require('../scripts/generarSistema');

const pvgisController = {
    async getPVGISData(req, res) {
        try {
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

            // Validar que todos los campos necesarios estén presentes y sean números válidos
            if (!lat || !lon || !peakpower || loss === undefined || !angle) {
                throw new Error('Faltan campos requeridos o valores inválidos');
            }

            // Validar rangos
            if (lat < -90 || lat > 90) throw new Error('Latitud debe estar entre -90 y 90');
            if (lon < -180 || lon > 180) throw new Error('Longitud debe estar entre -180 y 180');
            if (peakpower <= 0) throw new Error('La potencia pico debe ser mayor a 0');
            if (loss < 0 || loss > 100) throw new Error('Las pérdidas deben estar entre 0 y 100');
            if (angle < 0 || angle > 90) throw new Error('El ángulo debe estar entre 0 y 90');

            // Configurar tracking según el tipo de montaje
            let trackingParams = {};
            switch(mounting_system) {
                case 'vertical_axis':
                    trackingParams = {
                        tracking: 1,
                        trackingtype: 0 // Vertical axis
                    };
                    break;
                case 'inclined_axis':
                    trackingParams = {
                        tracking: 1,
                        trackingtype: 1 // Inclined axis
                    };
                    break;
                case 'two_axis':
                    trackingParams = {
                        tracking: 1,
                        trackingtype: 2 // 2-axis tracking
                    };
                    break;
                default: // 'fixed'
                    trackingParams = {
                        tracking: 0,
                        fixed_angle: parseFloat(angle),
                        fixed_azimuth: parseFloat(aspect)
                    };
            }

            // Configurar parámetros para la API PVGIS
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
            console.log('Enviando solicitud a:', baseUrl);

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

            // Procesar datos y convertir a MWh si es necesario
            const outputs = response.data.outputs;
            let hourlyData = [];

            if (outputs.hourly && Array.isArray(outputs.hourly)) {
                hourlyData = outputs.hourly.map(hour => {
                    // Parsear el formato de fecha YYYYMMDD:HHMM
                    const timeMatch = hour.time.match(/(\d{4})(\d{2})(\d{2}):(\d{2})(\d{2})/);
                    if (!timeMatch) {
                        throw new Error(`Formato de fecha inválido: ${hour.time}`);
                    }
                    const [_, year, month, day, hours, minutes] = timeMatch;
                    
                    return {
                        año: parseInt(year),
                        mes: parseInt(month),
                        día: parseInt(day),
                        hora: parseInt(hours),
                        'Producción (MWh)': parseFloat(((hour.P || 0) / 1000000).toFixed(6)) // Convertir de W a MWh
                    };
                });
            } else {
                throw new Error('No se encontraron datos horarios en la respuesta de PVGIS');
            }

            try {
                // Crear archivo Excel
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
                    ['Año de Referencia', '2020'],
                    [''],
                    ['PRODUCCIÓN HORARIA'],
                    ['Valores en MWh (Megavatios-hora)'],
                    ['Los datos se presentan para cada hora del año 2020']
                ];
                
                // Crear hoja de información
                const wsInfo = xlsx.utils.aoa_to_sheet(infoData);
                
                // Ajustar ancho de columnas para info
                wsInfo['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 10 }];
                
                // Crear hoja de datos
                const wsData = xlsx.utils.json_to_sheet(hourlyData);
                
                // Ajustar ancho de columnas para datos
                wsData['!cols'] = [
                    { wch: 6 },  // año
                    { wch: 4 },  // mes
                    { wch: 4 },  // día
                    { wch: 4 },  // hora
                    { wch: 15 }  // produccion_MWh
                ];

                // Establecer encabezados personalizados
                xlsx.utils.sheet_add_aoa(wsData, [
                    ['Año', 'Mes', 'Día', 'Hora', 'Producción (MWh)']
                ], { origin: 'A1' });
                
                // Agregar las hojas al libro
                xlsx.utils.book_append_sheet(wb, wsInfo, 'Información');
                xlsx.utils.book_append_sheet(wb, wsData, 'Datos Horarios');
                
                // Generar nombre de archivo con timestamp
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const fileName = `pvgis_production_${timestamp}.xlsx`;
                const excelPath = path.join(__dirname, '../../downloads', fileName);
                
                // Guardar Excel
                xlsx.writeFile(wb, excelPath);

                // Actualizar sistema.xlsx con los nuevos datos
                console.log('Actualizando sistema.xlsx con los nuevos datos de producción...');
                // Añadir pequeño retraso para asegurar que el archivo PVGIS esté completamente escrito
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                const sistemaActualizado = await Promise.resolve(generarSistema());
                
                if (!sistemaActualizado) {
                    console.error('Error al actualizar sistema.xlsx');
                    throw new Error('Error al actualizar sistema.xlsx');
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
                console.error('Error al crear archivo Excel:', error);
                throw new Error('Error al generar el archivo Excel');
            }

        } catch (error) {
            console.error('Error en PVGIS:', error);
            res.status(500).json({
                success: false,
                message: 'Error al obtener datos de PVGIS',
                error: error.message
            });
        }
    }
};

module.exports = pvgisController;