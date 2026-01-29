// Higher number = higher priority
const PRIORITY_MAP = {
  EMERGENCY: 5,
  PAID: 4,
  FOLLOW_UP: 3,
  ONLINE: 2,
  WALK_IN: 1,
};

function getPriority(source) {
  return PRIORITY_MAP[source] || 0;
}

module.exports = {
  getPriority,
  PRIORITY_MAP,
};
