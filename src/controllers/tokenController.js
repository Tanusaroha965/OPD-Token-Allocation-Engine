const Doctor = require('../models/Doctor');
const Slot = require('../models/Slot');
const Token = require('../models/Token');
const { getPriority } = require('../utils/priority');

// Helper: find next available slot for a doctor after the given startTime
async function findNextAvailableSlot(doctorId, currentStartTime) {
  const slots = await Slot.find({ doctorId }).sort({ startTime: 1 });
  return slots.find((s) => s.startTime > currentStartTime && s.currentCount < s.maxCapacity) || null;
}

// Helper: move a token to a different slot (updates counts)
async function moveTokenToSlot(token, fromSlot, toSlot) {
  if (token.source !== 'EMERGENCY' && token.status === 'ACTIVE') {
    if (fromSlot.currentCount > 0) {
      fromSlot.currentCount -= 1;
    }
    toSlot.currentCount += 1;
  }
  token.slotId = toSlot._id;
  await Promise.all([fromSlot.save(), toSlot.save(), token.save()]);
}

// Core allocation helper used by create and simulation
async function allocateToken({ doctorId, slotId, source }) {
  const slot = await Slot.findById(slotId);
  if (!slot) {
    return { error: 'Slot not found' };
  }
  if (String(slot.doctorId) !== String(doctorId)) {
    return { error: 'Slot does not belong to this doctor' };
  }

  const priority = getPriority(source);
  const isEmergency = source === 'EMERGENCY';

  // Emergency: always allow, do not increment currentCount
  if (isEmergency) {
    const token = await Token.create({
      doctorId,
      slotId,
      source,
      priority,
      status: 'ACTIVE',
    });
    return { token, message: 'Emergency token created' };
  }

  // Non-emergency flow
  if (slot.currentCount < slot.maxCapacity) {
    const token = await Token.create({
      doctorId,
      slotId,
      source,
      priority,
      status: 'ACTIVE',
    });
    slot.currentCount += 1;
    await slot.save();
    return { token, message: 'Token created in requested slot' };
  }

  // Slot full: find lowest priority non-emergency active token
  const lowestToken = await Token.findOne({
    slotId,
    status: 'ACTIVE',
    source: { $ne: 'EMERGENCY' },
  })
    .sort({ priority: 1, createdAt: -1 })
    .exec();

  if (!lowestToken) {
    return { error: 'Slot is full and no swappable token found' };
  }

  if (priority > lowestToken.priority) {
    const nextSlot = await findNextAvailableSlot(doctorId, slot.startTime);
    if (!nextSlot) {
      return { error: 'Slot full. No next slot available for reallocation.' };
    }

    // Move lowest-priority token to next slot
    await moveTokenToSlot(lowestToken, slot, nextSlot);

    // Add new token to requested slot
    const newToken = await Token.create({
      doctorId,
      slotId,
      source,
      priority,
      status: 'ACTIVE',
    });
    slot.currentCount += 1; // we moved one out, then added one back
    await slot.save();

    return {
      token: newToken,
      message: 'Token created by bumping lower priority token to next slot',
    };
  }

  return { error: 'Slot full. Incoming token has lower or equal priority.' };
}

// Controller: create token (regular)
async function createToken(req, res, next) {
  try {
    const { doctorId, slotId, source } = req.body;
    if (!doctorId || !slotId || !source) {
      return res.status(400).json({ message: 'doctorId, slotId, and source are required' });
    }
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });

    const result = await allocateToken({ doctorId, slotId, source });
    if (result.error) return res.status(400).json({ message: result.error });
    return res.status(201).json({ token: result.token, message: result.message });
  } catch (err) {
    next(err);
  }
}

// Controller: emergency token (always allow)
async function createEmergencyToken(req, res, next) {
  try {
    const { doctorId, slotId } = req.body;
    if (!doctorId || !slotId) {
      return res.status(400).json({ message: 'doctorId and slotId are required' });
    }
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });

    const result = await allocateToken({ doctorId, slotId, source: 'EMERGENCY' });
    if (result.error) return res.status(400).json({ message: result.error });
    return res.status(201).json({ token: result.token, message: result.message });
  } catch (err) {
    next(err);
  }
}

// Controller: cancel token and reallocate if possible
async function cancelToken(req, res, next) {
  try {
    const { id } = req.params;
    const token = await Token.findById(id);
    if (!token) return res.status(404).json({ message: 'Token not found' });
    if (token.status !== 'ACTIVE') {
      return res.status(400).json({ message: 'Token is not active' });
    }

    const slot = await Slot.findById(token.slotId);
    token.status = 'CANCELLED';
    await token.save();

    if (token.source !== 'EMERGENCY' && slot && slot.currentCount > 0) {
      slot.currentCount -= 1;
      await slot.save();
    }

    // Simple reallocation: move highest-priority later token into this freed slot
    if (slot) {
      const candidate = await Token.findOne({
        doctorId: token.doctorId,
        status: 'ACTIVE',
        source: { $ne: 'EMERGENCY' },
      })
        .populate('slotId')
        .sort({ priority: -1, createdAt: 1 })
        .exec();

      if (candidate && candidate.slotId && candidate.slotId.startTime > slot.startTime) {
        const fromSlot = await Slot.findById(candidate.slotId._id);
        if (fromSlot && fromSlot.currentCount > 0 && slot.currentCount < slot.maxCapacity) {
          await moveTokenToSlot(candidate, fromSlot, slot);
        }
      }
    }

    return res.json({ message: 'Token cancelled' });
  } catch (err) {
    next(err);
  }
}

// Controller: view slots for a doctor with tokens
async function getSlotsForDoctor(req, res, next) {
  try {
    const { id } = req.params;
    const doctor = await Doctor.findById(id);
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });

    const slots = await Slot.find({ doctorId: id }).sort({ startTime: 1 }).lean();
    const tokens = await Token.find({ doctorId: id }).sort({ createdAt: 1 }).lean();

    const tokensBySlot = tokens.reduce((acc, t) => {
      const key = String(t.slotId);
      acc[key] = acc[key] || [];
      acc[key].push(t);
      return acc;
    }, {});

    const result = slots.map((slot) => ({
      ...slot,
      tokens: tokensBySlot[String(slot._id)] || [],
    }));

    return res.json({ doctor, slots: result });
  } catch (err) {
    next(err);
  }
}

// Controller: simulation endpoint
async function simulateDay(_req, res, next) {
  try {
    await Promise.all([Doctor.deleteMany({}), Slot.deleteMany({}), Token.deleteMany({})]);

    // Create doctors
    const doctors = await Doctor.insertMany([
      { name: 'Dr. A', department: 'General' },
      { name: 'Dr. B', department: 'Pediatrics' },
      { name: 'Dr. C', department: 'Dermatology' },
    ]);

    // Create slots (3 per doctor)
    const slotTimes = [
      ['09:00', '10:00'],
      ['10:00', '11:00'],
      ['11:00', '12:00'],
    ];

    const slots = [];
    for (const doctor of doctors) {
      for (const [startTime, endTime] of slotTimes) {
        const slot = await Slot.create({
          doctorId: doctor._id,
          startTime,
          endTime,
          maxCapacity: 3,
          currentCount: 0,
        });
        slots.push(slot);
      }
    }

    // Helper to pick a slot for a doctor by index
    const slotFor = (doctorIndex, slotIndex) =>
      slots.find(
        (s) => String(s.doctorId) === String(doctors[doctorIndex]._id) && s.startTime === slotTimes[slotIndex][0]
      );

    // Add mixed tokens
    await allocateToken({
      doctorId: doctors[0]._id,
      slotId: slotFor(0, 0)._id,
      source: 'WALK_IN',
    });
    await allocateToken({
      doctorId: doctors[0]._id,
      slotId: slotFor(0, 0)._id,
      source: 'ONLINE',
    });
    await allocateToken({
      doctorId: doctors[0]._id,
      slotId: slotFor(0, 0)._id,
      source: 'PAID',
    });

    await allocateToken({
      doctorId: doctors[1]._id,
      slotId: slotFor(1, 1)._id,
      source: 'FOLLOW_UP',
    });
    await allocateToken({
      doctorId: doctors[1]._id,
      slotId: slotFor(1, 1)._id,
      source: 'ONLINE',
    });

    await allocateToken({
      doctorId: doctors[2]._id,
      slotId: slotFor(2, 2)._id,
      source: 'WALK_IN',
    });

    // Add one emergency token to a full slot scenario
    await allocateToken({
      doctorId: doctors[0]._id,
      slotId: slotFor(0, 0)._id,
      source: 'EMERGENCY',
    });

    // Cancel one token (first non-emergency token)
    const tokenToCancel = await Token.findOne({ source: { $ne: 'EMERGENCY' }, status: 'ACTIVE' });
    if (tokenToCancel) {
      await cancelToken({ params: { id: tokenToCancel._id } }, { status: () => ({ json: () => {} }) }, () => {});
    }

    // Return final state
    const allDoctors = await Doctor.find({});
    const allSlots = await Slot.find({});
    const allTokens = await Token.find({});

    return res.json({
      doctors: allDoctors,
      slots: allSlots,
      tokens: allTokens,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createToken,
  cancelToken,
  createEmergencyToken,
  getSlotsForDoctor,
  simulateDay,
};
