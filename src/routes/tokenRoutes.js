const express = require('express');
const {
  createToken,
  cancelToken,
  createEmergencyToken,
  getSlotsForDoctor,
  simulateDay,
} = require('../controllers/tokenController');

const router = express.Router();

router.post('/tokens', createToken);
router.patch('/tokens/:id/cancel', cancelToken);
router.post('/tokens/emergency', createEmergencyToken);
router.get('/doctors/:id/slots', getSlotsForDoctor);
router.post('/simulate/day', simulateDay);

module.exports = router;
