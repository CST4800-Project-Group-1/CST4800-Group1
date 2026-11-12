// SCRUM-23: extends Howard Heaven Jr.'s supplied rule with verified-evidence guards.
// Justin's earlier SCRUM-14 examples remain credited in docs/socket-examples.md.
const supportedSockets = new Set(['AM5', 'LGA1700']);

const socketOf = part =>
  typeof part?.specs?.socket === 'string'
    ? part.specs.socket.trim()
    : null;

export function normalizeSocket(socket) {
  if (typeof socket !== 'string' || !socket.trim()) return null;

  const normalized = socket.trim().toUpperCase();
  return supportedSockets.has(normalized) ? normalized : null;
}

function verifiedSocket(part, now) {
  const socket = normalizeSocket(socketOf(part));
  const evidence = part?.specs?.socketProvenance;
  if (!socket || !evidence || !Number.isFinite(now)
      || evidence.method !== 'explicit_product_spec'
      || typeof evidence.sourceField !== 'string'
      || !['socket', 'cpu socket', 'processor socket', 'socket type'].includes(evidence.sourceField.trim().toLowerCase())
      || normalizeSocket(evidence.rawValue) !== socket) return null;
  const canonical = value => {
    if (typeof value !== 'string') return null;
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
      return url.origin + url.pathname.replace(/\/$/, '');
    } catch { return null; }
  };
  if (!canonical(part.sourceUrl) || canonical(part.sourceUrl) !== canonical(evidence.sourceUrl)) return null;
  const utc = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return NaN;
    const ms = Date.parse(value);
    return Number.isFinite(ms) && new Date(ms).toISOString().replace('.000Z', 'Z') === value.replace('.000Z', 'Z') ? ms : NaN;
  };
  const verified = utc(evidence.verifiedAt), expires = utc(evidence.expiresAt);
  return verified <= now && now < expires && 0 < expires - verified && expires - verified <= 3600000 ? socket : null;
}

export function evaluateSocketCompatibility(cpu, motherboard, context = {}) {
  const {now = Date.now(), refreshState = 'ready'} = context || {};
  const cpuSocket = socketOf(cpu);
  const motherboardSocket = socketOf(motherboard);

  const result = (status, message) => ({
    ruleId: 'cpu-motherboard-socket',
    status,
    cpuSocket,
    motherboardSocket,
    message,
    scope: 'socket-only',
    biosChecked: false,
    fullBuildChecked: false
  });

  if (!cpu || !motherboard) {
    return result(
      'waiting',
      !cpu && !motherboard
        ? 'Select a CPU and motherboard to check their sockets.'
        : !cpu
          ? 'Select a CPU to check it against your motherboard.'
          : 'Select a motherboard to check it against your CPU.'
    );
  }

  if (cpu.category !== 'cpu' || motherboard.category !== 'motherboard') {
    return result('unknown', 'Select a valid CPU and motherboard.');
  }

  if (refreshState !== 'ready') {
    return result('unknown', 'Socket compatibility is unknown until both categories refresh successfully.');
  }

  const normalizedCpu = verifiedSocket(cpu, now);
  const normalizedMotherboard = verifiedSocket(motherboard, now);

  if (!normalizedCpu || !normalizedMotherboard) {
    return result(
      'unknown',
      `Socket compatibility is unknown: fresh verified evidence is required. CPU socket: ${cpuSocket || 'unavailable'}; motherboard socket: ${motherboardSocket || 'unavailable'}.`
    );
  }

  if (normalizedCpu === normalizedMotherboard) {
    return result(
      'match',
      `Sockets match: ${cpu.name} (${cpuSocket}) and ${motherboard.name} (${motherboardSocket}). Socket compatibility only; BIOS and full build compatibility are not checked.`
    );
  }

  return result(
    'mismatch',
    `Socket mismatch: ${cpu.name} uses ${cpuSocket}, but ${motherboard.name} uses ${motherboardSocket}. Choose a CPU or motherboard with the same socket. BIOS and full build compatibility are not checked.`
  );
}
