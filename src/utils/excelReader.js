const XLSX = require('xlsx');
const path = require('path');

function readExcelFile(filePath) {
    try {
        // Leer el archivo Excel
        const workbook = XLSX.readFile(filePath);
        
        // Obtener la primera hoja
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convertir a JSON
        const data = XLSX.utils.sheet_to_json(worksheet);
        
        // Obtener nombres de columnas
        const headers = Object.keys(data[0] || {});
        
        // Obtener primeras filas como muestra
        const sampleData = data.slice(0, 5);
        
        return {
            success: true,
            fileName: path.basename(filePath),
            sheetName,
            headers,
            rowCount: data.length,
            sampleData,
            message: 'Archivo leído correctamente'
        };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            message: 'Error al leer el archivo'
        };
    }
}

module.exports = {
    readExcelFile
};