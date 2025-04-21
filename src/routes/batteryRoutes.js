const express = require('express');
const router = express.Router();
const BatteryController = require('../controllers/batteryController');

// Middleware para verificar autenticación
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        next();
    } else {
        res.status(401).json({ error: 'No autorizado' });
    }
};

// Ruta para optimización de baterías
router.post('/optimize', isAuthenticated, async (req, res) => {
    await BatteryController.optimize(req, res);
});

// Ruta para descargar el reporte
router.get('/download-report', isAuthenticated, async (req, res) => {
    await BatteryController.downloadReport(req, res);
});

// Ruta para ejecutar el análisis de la batería
router.post('/analyze', isAuthenticated, async (req, res) => {
    await BatteryController.runAnalysis(req, res);
});

// Ruta para leer archivos Excel
router.get('/read-excel', async (req, res) => {
    await BatteryController.readExcel(req, res);
});

module.exports = router;