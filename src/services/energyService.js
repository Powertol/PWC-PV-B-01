const db = require('../models/database');

const energyService = {
    // Precios
    async saveEnergyPrices(prices) {
        try {
            // Usar una transacción para insertar múltiples precios
            return await db.tx(async t => {
                const queries = prices.map(price => {
                    return t.none(
                        `INSERT INTO energy_prices (year, month, day, hour, price_mwh)
                         VALUES ($1, $2, $3, $4, $5)
                         ON CONFLICT (year, month, day, hour)
                         DO UPDATE SET price_mwh = $5`,
                        [price.ano, price.mes, price.dia, price.hora, price.precio]
                    );
                });
                return t.batch(queries);
            });
        } catch (error) {
            console.error('Error saving energy prices:', error);
            throw error;
        }
    },

    async getEnergyPrices() {
        try {
            return await db.any(
                `SELECT year, month, day, hour, price_mwh
                 FROM energy_prices
                 ORDER BY year, month, day, hour`
            );
        } catch (error) {
            console.error('Error getting energy prices:', error);
            throw error;
        }
    },

    // Producción Solar
    async saveSolarProduction(productionData, systemConfig) {
        try {
            return await db.tx(async t => {
                // Primero guardamos la configuración de la instalación
                const installation = await t.one(
                    `INSERT INTO installations 
                     (latitude, longitude, peak_power, system_loss, mounting_system, angle, azimuth)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)
                     RETURNING id`,
                    [
                        systemConfig.latitude,
                        systemConfig.longitude,
                        systemConfig.peakPower,
                        systemConfig.systemLoss,
                        systemConfig.mountingSystem,
                        systemConfig.angle,
                        systemConfig.azimuth
                    ]
                );

                // Luego guardamos los datos de producción
                const queries = productionData.map(prod => {
                    return t.none(
                        `INSERT INTO solar_production 
                         (year, month, day, hour, production_mwh, latitude, longitude, 
                          peak_power, system_loss, mounting_system, angle, azimuth)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                         ON CONFLICT (year, month, day, hour, latitude, longitude)
                         DO UPDATE SET production_mwh = $5`,
                        [
                            prod.año,
                            prod.mes,
                            prod.día,
                            prod.hora,
                            prod['Producción (MWh)'],
                            systemConfig.latitude,
                            systemConfig.longitude,
                            systemConfig.peakPower,
                            systemConfig.systemLoss,
                            systemConfig.mountingSystem,
                            systemConfig.angle || 0,
                            systemConfig.azimuth || 0
                        ]
                    );
                });

                await t.batch(queries);
                return installation.id;
            });
        } catch (error) {
            console.error('Error saving solar production:', error);
            throw error;
        }
    },

    async getSolarProduction(params = {}) {
        try {
            let query = `
                SELECT year, month, day, hour, production_mwh,
                       latitude, longitude, peak_power, system_loss,
                       mounting_system, angle, azimuth
                FROM solar_production
            `;

            const conditions = [];
            const queryParams = [];
            let paramCount = 1;

            if (params.latitude && params.longitude) {
                conditions.push(`latitude = $${paramCount} AND longitude = $${paramCount + 1}`);
                queryParams.push(params.latitude, params.longitude);
                paramCount += 2;
            }

            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND ');
            }

            query += ' ORDER BY year, month, day, hour';

            return await db.any(query, queryParams);
        } catch (error) {
            console.error('Error getting solar production:', error);
            throw error;
        }
    },

    // Sistema combinado
    async generateSystemData() {
        try {
            return await db.any(`
                SELECT 
                    p.year as ano,
                    p.month as mes,
                    p.day as dia,
                    p.hour as hora,
                    p.price_mwh as "Precio MWh",
                    COALESCE(s.production_mwh, 0) as "Produccion MWh"
                FROM energy_prices p
                LEFT JOIN solar_production s ON
                    p.year = s.year AND
                    p.month = s.month AND
                    p.day = s.day AND
                    p.hour = s.hour
                ORDER BY p.year, p.month, p.day, p.hour
            `);
        } catch (error) {
            console.error('Error generating system data:', error);
            throw error;
        }
    }
};

module.exports = energyService;