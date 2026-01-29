const mongoose = require('mongoose');

const slotSchema = new mongoose.Schema({
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  startTime: { type: String, required: true }, // "09:00"
  endTime: { type: String, required: true },   // "10:00"
  maxCapacity: { type: Number, required: true },
  currentCount: { type: Number, default: 0 },
});

module.exports = mongoose.model('Slot', slotSchema);
