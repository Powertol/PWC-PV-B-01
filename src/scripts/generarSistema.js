const XLSX = require('xlsx');
const energyService = require('../services/energyService');

async function generarSistema() {
    try {
        console.log('Iniciando generación del archivo sistema...');

        // Obtener datos combinados de la base de datos
        const systemData = await energyService.generateSystemData();

        if (!systemData || systemData.length === 0) {
            console.log('No hay datos disponibles para generar el sistema');
            return true;
        }

        console.log(`Procesando ${systemData.length} registros...`);

        // Crear nuevo libro de Excel
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(systemData, {
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

        return {
            success: true,
            data: systemData,
            excel: XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
        };
    } catch (error) {
        console.error('Error al generar sistema:', error);
        throw error;
    }
}

// Si el script se ejecuta directamente
if (require.main === module) {
    generarSistema().then(result => {
        if (result && result.success) {
            console.log('Sistema generado exitosamente');
        } else {
            console.log('Error al generar sistema');
        }
    }).catch(console.error);
}

module.exports = generarSistema;