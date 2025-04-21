const express = require('express');
const router = express.Router();
const pvgisController = require('../controllers/pvgisController');

// Ruta para obtener datos de PVGIS y generar Excel
router.post('/calculate', pvgisController.getPVGISData);

module.exports = router;