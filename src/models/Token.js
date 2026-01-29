const mongoose = require('mongoose');

const tokenSchema = new mongoose.Schema({
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  slotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Slot', required: true },
  source: {
    type: String,
    enum: ['ONLINE', 'WALK_IN', 'PAID', 'FOLLOW_UP', 'EMERGENCY'],
    required: true,
  },
  priority: { type: Number, required: true },
  status: {
    type: String,
    enum: ['ACTIVE', 'CANCELLED', 'NO_SHOW'],
    default: 'ACTIVE',
  },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Token', tokenSchema);
