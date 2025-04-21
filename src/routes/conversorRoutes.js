const express = require('express');
const router = express.Router();
const conversorController = require('../controllers/conversorController');

router.post('/procesar-archivos', conversorController.procesarArchivos);

module.exports = router;