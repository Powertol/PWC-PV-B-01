const xlsx = require('xlsx');
const path = require('path');
const { analyzeBattery } = require('../utils/batteryAnalysis');
const { calculateDegradation, calculateExpectedLifespan, calculateAnnualDegradation, calculateCyclesForDoD } = require('../utils/batteryDegradation');

class BatteryController {
    static async optimize(req, res) {
        try {
            const {
                startDate,
                endDate,
                capacity,
                efficiency,
                dod,
                cRate,
                manufacturer
            } = req.body;

            // Validar parámetros
            if (efficiency <= 0 || efficiency > 1) {
                return res.status(400).json({
                    success: false,
                    error: 'La eficiencia debe ser un valor entre 0 y 1'
                });
            }

            // Validar C-rate
            if (cRate <= 0) {
                return res.status(400).json({
                    success: false,
                    error: 'El C-Rate debe ser un valor positivo'
                });
            }

            // Ejecutar el análisis de la batería con todos los parámetros
            const result = await analyzeBattery(efficiency, capacity, dod, cRate, startDate, endDate);

            // Calcular ciclos base y ajustados por C-rate
            const baseCycles = calculateCyclesForDoD(manufacturer, dod * 100, 0.5); // Base con C-rate 0.5
            const adjustedCycles = calculateCyclesForDoD(manufacturer, dod * 100, cRate);
            const cRateImpact = {
                originalCycles: baseCycles,
                adjustedCycles: adjustedCycles,
                impactPercentage: ((adjustedCycles - baseCycles) / baseCycles) * 100
            };
            
            // Calcular métricas adicionales con el nuevo modelo de degradación
            const dailyCycles = result.totalCycles / result.totalDays;
            
            // Calcular años de operación
            const startOperationDate = new Date(startDate);
            const endOperationDate = new Date(endDate);
            const operationYears = (endOperationDate - startOperationDate) / (365 * 24 * 60 * 60 * 1000);

            // Calcular degradación basada en DoD, C-rate y años de operación
            const degradation = calculateDegradation(manufacturer, result.totalCycles, dod, cRate, operationYears);
            const expectedLifespan = calculateExpectedLifespan(manufacturer, dailyCycles, dod, cRate);
            const annualDegradation = calculateAnnualDegradation(manufacturer, dod, cRate, dailyCycles);

            // Devolver resultados con información detallada
            res.json({
                success: true,
                revenues: {
                    solarOnly: result.totalSolarOnlyRevenue,
                    withBattery: result.totalWithBatteryRevenue,
                    improvement: result.totalRevenue
                },
                revenuePerCycle: result.revenuePerCycle,
                totalCycles: result.totalCycles,
                averageEfficiency: result.averageEfficiency,
                totalDays: result.totalDays,
                roi: result.roi,
                degradation: {
                    remainingCapacity: degradation.remainingCapacity,
                    totalDegradation: degradation.totalDegradation,
                    bySource: {
                        cycles: degradation.cyclesDegradationPercentage,
                        natural: degradation.naturalDegradationPercentage
                    },
                    operationalData: {
                        years: operationYears,
                        cyclesPerYear: dailyCycles * 365,
                        totalCycles: result.totalCycles
                    },
                    lifespan: {
                        expected: expectedLifespan,
                        annual: {
                            total: annualDegradation.total,
                            byCycles: annualDegradation.byCycles,
                            natural: annualDegradation.natural
                        }
                    },
                    cRateImpact
                },
                parameters: {
                    capacity,
                    efficiency,
                    dod,
                    cRate,
                    manufacturer
                }
            });
        } catch (error) {
            console.error('Error en optimización de batería:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Error al procesar la optimización'
            });
        }
    }

    static organizeDailyData(data) {
        const dailyData = {};
        data.forEach(row => {
            const date = new Date(row.Fecha).toISOString().split('T')[0];
            if (!dailyData[date]) {
                dailyData[date] = [];
            }
            dailyData[date].push({
                hour: row.Hora,
                price: row.Precio,
                solarProduction: row.Produccion
            });
        });
        return dailyData;
    }

    static async downloadReport(req, res) {
        try {
            const filePath = path.join(process.cwd(), 'Analisis BEES.xlsx');
            res.download(filePath);
        } catch (error) {
            console.error('Error al descargar el reporte:', error);
            res.status(500).json({ error: 'Error al descargar el reporte' });
        }
    }
}

module.exports = BatteryController;