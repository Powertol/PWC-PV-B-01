const fs = require('fs').promises;
const path = require('path');
const XLSX = require('xlsx');

const procesarArchivo = async (filename) => {
    try {
        const origenDir = path.join(__dirname, '../../downloads/omie');
        const destinoDir = path.join(__dirname, '../../downloads/omie_excel');

        // Asegurarse de que existe el directorio de destino
        await fs.mkdir(destinoDir, { recursive: true });

        // Procesar el archivo
        const contenido = await fs.readFile(path.join(origenDir, filename), 'utf8');
        
        // Procesar las líneas
        const lineas = contenido.split('\n')
            .filter(linea => !linea.includes('MARGINALPDBC') && !linea.includes('*'))
            .map(linea => {
                const campos = linea.split(';').filter(campo => campo.trim() !== '');
                if (campos.length >= 6) {
                    return {
                        'Año': campos[0],
                        'Mes': campos[1],
                        'Día': campos[2],
                        'Hora': campos[3],
                        'Precio PT MWh': campos[4],
                        'Precio ES MWh': campos[5]
                    };
                }
                return null;
            })
            .filter(linea => linea !== null);

        if (lineas.length > 0) {
            // Crear el workbook y worksheet
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(lineas);

            // Configurar el ancho de las columnas
            const colWidths = [
                { wch: 6 },  // Año
                { wch: 4 },  // Mes
                { wch: 4 },  // Día
                { wch: 6 },  // Hora
                { wch: 12 }, // Precio PT
                { wch: 12 }  // Precio ES
            ];
            ws['!cols'] = colWidths;

            // Añadir la worksheet al workbook
            XLSX.utils.book_append_sheet(wb, ws, 'Precios');

            // Guardar el archivo Excel
            const nombreExcel = filename.replace('.1', '.xlsx');
            const rutaDestino = path.join(destinoDir, nombreExcel);
            await XLSX.writeFile(wb, rutaDestino);
            
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error al procesar el archivo:', filename, error);
        return false;
    }
};

const procesarArchivos = async (req, res) => {
    try {
        const origenDir = path.join(__dirname, '../../downloads/omie');
        const destinoDir = path.join(__dirname, '../../downloads/omie_excel');

        // Asegurarse de que existe el directorio de destino
        await fs.mkdir(destinoDir, { recursive: true });

        // Leer todos los archivos del directorio
        const archivos = await fs.readdir(origenDir);
        const archivosMarginales = archivos.filter(archivo => archivo.startsWith('marginalpdbc_'));

        for (const archivo of archivosMarginales) {
            // Leer el archivo
            const contenido = await fs.readFile(path.join(origenDir, archivo), 'utf8');
            
            // Procesar las líneas
            const lineas = contenido.split('\n')
                .filter(linea => !linea.includes('MARGINALPDBC') && !linea.includes('*'))
                .map(linea => {
                    const campos = linea.split(';').filter(campo => campo.trim() !== '');
                    if (campos.length >= 6) {
                        return {
                            'Año': campos[0],
                            'Mes': campos[1],
                            'Día': campos[2],
                            'Hora': campos[3],
                            'Precio PT MWh': campos[4],
                            'Precio ES MWh': campos[5]
                        };
                    }
                    return null;
                })
                .filter(linea => linea !== null);

            if (lineas.length > 0) {
                // Crear el workbook y worksheet
                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(lineas);

                // Configurar el ancho de las columnas
                const colWidths = [
                    { wch: 6 },  // Año
                    { wch: 4 },  // Mes
                    { wch: 4 },  // Día
                    { wch: 6 },  // Hora
                    { wch: 12 }, // Precio PT
                    { wch: 12 }  // Precio ES
                ];
                ws['!cols'] = colWidths;

                // Añadir la worksheet al workbook
                XLSX.utils.book_append_sheet(wb, ws, 'Precios');

                // Guardar el archivo Excel
                const nombreExcel = archivo.replace('.1', '.xlsx');
                const rutaDestino = path.join(destinoDir, nombreExcel);
                await XLSX.writeFile(wb, rutaDestino);
            }
        }

        res.json({ mensaje: 'Archivos procesados correctamente' });
    } catch (error) {
        console.error('Error al procesar los archivos:', error);
        res.status(500).json({ error: 'Error al procesar los archivos' });
    }
};

module.exports = {
    procesarArchivos,
    procesarArchivo
};