const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

function analyzeBattery(efficiency = 0.9, capacity = 3.92, dod = 0.8, cRate = 0.5, startDate = null, endDate = null) {
    return new Promise((resolve, reject) => {
        try {
            // Leer archivo sistema.xlsx
            const sistemaPath = path.resolve(__dirname, '../../sistema.xlsx');
            const sistemaWorkbook = XLSX.readFile(sistemaPath);
            const sistemaSheet = sistemaWorkbook.Sheets[sistemaWorkbook.SheetNames[0]];
            const sistemaData = XLSX.utils.sheet_to_json(sistemaSheet);

            // Configuración de la batería
            const maxCapacity = capacity; // MWh
            const maxChargePower = maxCapacity * cRate; // MW por hora
            const maxDischargePower = maxCapacity * cRate; // MW por hora

            // Filtrar datos por rango de fechas y agrupar por día
            const dailyData = {};
            sistemaData.forEach(row => {
                const currentDate = new Date(row.ano, row.mes - 1, row.dia);
                const dayKey = `${row.ano}-${row.mes}-${row.dia}`;
                
                // Si hay fechas de filtro, verificar si está dentro del rango
                if (startDate && endDate) {
                    const start = new Date(startDate);
                    const end = new Date(endDate);
                    if (currentDate < start || currentDate > end) {
                        return; // Saltar esta fila si está fuera del rango
                    }
                }

                if (!dailyData[dayKey]) {
                    dailyData[dayKey] = [];
                }
                dailyData[dayKey].push(row);
            });

            // Variables para métricas
            let totalRevenue = 0;
            let totalSolarOnlyRevenue = 0;
            let totalWithBatteryRevenue = 0;
            let totalCycles = 0;
            let totalEfficiency = 0;
            let cycleCount = 0;
            let totalCRateDegradation = 0;

            // Función para calcular la degradación adicional por C-Rate alto
            const calculateCRateDegradation = (usedCRate, duration = 1) => {
                // Base de degradación por C-Rate (ajustable según especificaciones de batería)
                const baseDegradation = 0.00003; // 0.003% base por ciclo (basado en datos de CATL/BYD)
                
                // Factor multiplicador basado en el C-Rate
                // C-Rate > 0.5 comienza a causar degradación adicional
                // Factor de degradación más suave basado en datos de fabricantes
                const degradationFactor = usedCRate > 0.5 ?
                    1 + (Math.pow(usedCRate/0.5, 1.2) - 1) * 0.5 : 1;
                
                return baseDegradation * degradationFactor * duration;
            };

            // Procesar cada día
            const analysisBEES = [];
            let currentSoC = 0; // Mover fuera del bucle para mantener el SoC entre días
            
            for (const dayKey in dailyData) {
                const dayRows = dailyData[dayKey];
                let dailyCharge = 0;
                let dailyDischarge = 0;
                
                // Encontrar las horas con producción solar ordenadas por precio
                const hoursWithProduction = dayRows
                    .filter(row => parseFloat(row['Produccion MWh']) > 0)
                    .sort((a, b) => parseFloat(a['Precio MWh']) - parseFloat(b['Precio MWh']));

                if (hoursWithProduction.length > 0) {
                    // Array para llevar registro de las horas de carga
                    const chargeHours = [];
                    let totalCharge = 0;

                    // Intentar cargar en múltiples horas hasta llenar la batería
                    let remainingCapacity = maxCapacity - currentSoC; // Capacidad restante hasta 100%
                    let chargeIndex = 0;

                    while (remainingCapacity > 0 && chargeIndex < hoursWithProduction.length) {
                        const chargeHour = hoursWithProduction[chargeIndex];
                        const availableSolar = parseFloat(chargeHour['Produccion MWh']);
                        const possibleCharge = Math.min(
                            maxChargePower,
                            remainingCapacity,
                            availableSolar
                        );

                        if (possibleCharge > 0) {
                            chargeHours.push({
                                hour: chargeHour,
                                chargeAmount: possibleCharge
                            });
                            totalCharge += possibleCharge;
                            remainingCapacity -= possibleCharge;
                        }
                        chargeIndex++;
                    }

                    // Encontrar las horas más caras posteriores a la última carga para descarga
                    // Encontrar la última hora de carga del día
                    const lastChargeHour = chargeHours.length > 0 ?
                        Math.max(...chargeHours.map(ch => ch.hour.hora)) : 0;

                    console.log(`Día ${dayKey}:`);
                    console.log(`- Horas de carga: ${chargeHours.map(ch => ch.hour.hora).join(', ')}`);
                    console.log(`- Última hora de carga: ${lastChargeHour}`);
                    
                    // Seleccionar las horas más caras posteriores a la última carga
                    const expensiveHours = dayRows
                        .filter(row => row.hora > lastChargeHour) // Solo horas posteriores a la carga
                        .sort((a, b) => parseFloat(b['Precio MWh']) - parseFloat(a['Precio MWh'])); // Ordenar por precio descendente
                    
                    console.log(`- Horas disponibles para descarga: ${expensiveHours.map(h => h.hora).join(', ')}`);
                    console.log(`- Precios de descarga: ${expensiveHours.map(h => h['Precio MWh']).join(', ')}`);

                    // Procesar cada hora del día
                    let dailyRevenue = 0;
                    dayRows.forEach(row => {
                        let cargaMWh = 0;
                        let descargaMWh = 0;
                        const produccionMWh = parseFloat(row['Produccion MWh'] || 0);
                        const precioMWh = parseFloat(row['Precio MWh']);
                        const ingresosSoloSolar = produccionMWh * precioMWh;

                        // Verificar si es hora de carga
                        const chargeEvent = chargeHours.find(ch => ch.hour.hora === row.hora);
                        if (chargeEvent) {
                            cargaMWh = chargeEvent.chargeAmount;
                            // Calcular C-Rate actual y su degradación
                            const actualCRate = cargaMWh / maxCapacity;
                            const cRateDegradation = calculateCRateDegradation(actualCRate);
                            totalCRateDegradation += cRateDegradation;

                            // Ajustar SoC considerando solo degradación durante la carga
                            const effectiveCharge = cargaMWh * (1 - totalCRateDegradation);
                            currentSoC = Math.min(maxCapacity, currentSoC + effectiveCharge);
                            dailyCharge += cargaMWh;
                        }
                        
                        // Verificar si tenemos energía para descargar y es una hora posterior a la carga
                        if (currentSoC > 0 && expensiveHours.some(h => h.hora === row.hora)) {
                            // Encontrar las horas restantes ordenadas por precio
                            const remainingHours = expensiveHours
                                .filter(h => h.hora >= row.hora)
                                .sort((a, b) => parseFloat(b['Precio MWh']) - parseFloat(a['Precio MWh']));

                            // Si esta es la hora con el precio más alto de las restantes
                            if (remainingHours.length > 0 && remainingHours[0].hora === row.hora) {
                                const maxPossibleDischarge = Math.min(
                                    maxDischargePower, // Limitado por C-rate
                                    currentSoC - (maxCapacity * (1 - dod)), // Limitado por DoD
                                    currentSoC // No podemos descargar más de lo que tenemos
                                );

                                if (maxPossibleDischarge > 0) {
                                    // Calcular C-Rate actual y su degradación
                                    const actualCRate = maxPossibleDischarge / maxCapacity;
                                    const cRateDegradation = calculateCRateDegradation(actualCRate);
                                    totalCRateDegradation += cRateDegradation;

                                    // Ajustar descarga considerando degradación y eficiencia
                                    descargaMWh = maxPossibleDischarge * (1 - totalCRateDegradation) * efficiency;
                                    currentSoC = Math.max(maxCapacity * (1 - dod), currentSoC - (descargaMWh / efficiency));
                                    dailyDischarge += descargaMWh;
                                }
                            }
                        }

                        // Formatear números con coma como separador decimal
                        const formatNumber = (num) => num.toString().replace('.', ',');

                        // Calcular balance neto e ingresos para cada hora
                        const balanceNeto = produccionMWh - cargaMWh + descargaMWh;
                        const ingresosConBateria = balanceNeto * precioMWh;
                        
                        // Actualizar los ingresos diarios
                        totalSolarOnlyRevenue += ingresosSoloSolar;
                        totalWithBatteryRevenue += ingresosConBateria;
                        dailyRevenue += ingresosConBateria - ingresosSoloSolar;

                        analysisBEES.push({
                            'Año': row.ano,
                            'Mes': row.mes,
                            'Dia': row.dia,
                            'Hora': row.hora,
                            'Precio MWh': formatNumber(Number(precioMWh).toFixed(2)),
                            'Produccion MWh': formatNumber(Number(produccionMWh).toFixed(4)),
                            'Carga MWh': formatNumber(Number(cargaMWh).toFixed(4)),
                            'Descarga MWh': formatNumber(Number(descargaMWh).toFixed(4)),
                            'SoC': formatNumber(Number(currentSoC).toFixed(4)),
                            'Balance Neto MWh': formatNumber(Number(balanceNeto).toFixed(4)),
                            'Ingresos Solo Solar': formatNumber(Number(ingresosSoloSolar).toFixed(2)),
                            'Ingresos Con Bateria': formatNumber(Number(ingresosConBateria).toFixed(2)),
                            'Diferencia': formatNumber(Number(ingresosConBateria - ingresosSoloSolar).toFixed(2))
                        });
                    });

                    // Actualizar métricas globales
                    if (dailyCharge > 0) {
                        totalEfficiency += dailyDischarge / dailyCharge;
                        cycleCount++;
                        
                        // Ajustar ciclos basados en el C-rate
                        const dailyCycles = dailyCharge / maxCapacity;
                        // Factor de ajuste más conservador basado en datos de utility-scale
                        const cRateAdjustmentFactor = cRate > 0.5 ? 1 + (Math.pow(cRate/0.5, 1.2) - 1) * 0.3 : 1;
                        totalCycles += dailyCycles * cRateAdjustmentFactor;
                    }
                    totalRevenue += dailyRevenue;
                }
            }

            // Ordenar los resultados
            analysisBEES.sort((a, b) => {
                if (a.Año !== b.Año) return a.Año - b.Año;
                if (a.Mes !== b.Mes) return a.Mes - b.Mes;
                if (a.Dia !== b.Dia) return a.Dia - b.Dia;
                return a.Hora - b.Hora;
            });

            // Crear nuevo workbook
            const newWorkbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.json_to_sheet(analysisBEES);
            XLSX.utils.book_append_sheet(newWorkbook, worksheet, 'Análisis');

            const analysisPath = path.resolve(__dirname, '../../Analisis BEES.xlsx');

            // Verificar si el archivo existe y eliminarlo
            if (fs.existsSync(analysisPath)) {
                fs.unlinkSync(analysisPath);
            }

            // Escribir el nuevo archivo
            XLSX.writeFile(newWorkbook, analysisPath);

            resolve({
                message: 'Análisis completado y archivo actualizado',
                totalRows: analysisBEES.length,
                totalRevenue,
                totalSolarOnlyRevenue,
                totalWithBatteryRevenue,
                revenuePerCycle: totalCycles > 0 ? totalRevenue / totalCycles : 0,
                totalCycles,
                averageEfficiency: cycleCount > 0 ? totalEfficiency / cycleCount : 0,
                totalDays: Object.keys(dailyData).length,
                roi: (totalRevenue / (maxCapacity * 1000000)) * 100,
                cRateImpact: {
                    totalDegradation: totalCRateDegradation * 100, // Convertir a porcentaje
                    effectiveCapacity: maxCapacity * (1 - totalCRateDegradation),
                    adjustedCycles: totalCycles,
                    cycleImpactFactor: cRate > 0.5 ? Math.pow(cRate/0.5, 1.5) : 1,
                    estimatedLifeReduction: ((cRate > 0.5 ? Math.pow(cRate/0.5, 1.5) : 1) - 1) * 100 // Porcentaje de reducción de vida
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}


module.exports = {
    analyzeBattery
};