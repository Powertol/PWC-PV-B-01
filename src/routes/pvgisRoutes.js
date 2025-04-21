const express = require('express');
const router = express.Router();
const pvgisController = require('../controllers/pvgisController');

router.post('/calculate', async (req, res, next) => {
    console.log('Recibiendo petición PVGIS:', {
        body: req.body,
        method: req.method,
        path: req.path,
        headers: req.headers
    });
    
    try {
        await pvgisController.getPVGISData(req, res);
    } catch (error) {
        console.error('Error en ruta PVGIS:', error);
        next(error);
    }
});

module.exports = router;