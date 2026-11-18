// SCRUM-23: extends Howard Heaven Jr.'s supplied rule with verified-evidence guards.
// Justin's earlier SCRUM-14 examples remain credited in docs/socket-examples.md.
const supportedSockets = new Set(['AM4', 'AM5', 'LGA1700']);

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
  if (!socket || !evidence || !Number.isFinite(now)) return null;
  if (evidence.method === 'manufacturer_spec_reference') {
    // Static exact-product manufacturer specifications are hardware facts,
    // unlike one-hour retailer price/availability snapshots.
    const reviewed = {
      'cpu|100-100001905BOX': {
        socket: 'AM4',
        retailer: 'https://www.bhphotovideo.com/c/product/2007607-REG/amd_100_100001905box_ryzen_5_5500f_6_core.html',
        manufacturer: 'https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-5-5500f.html',
      },
      'motherboard|X870 EAGLE WIFI7': {
        socket: 'AM5',
        retailer: 'https://www.bhphotovideo.com/c/product/1852679-REG/gigabyte_x870_eagle_wifi7_motherboard.html',
        manufacturer: 'https://www.gigabyte.com/Motherboard/X870-EAGLE-WIFI7-rev-1x/sp',
      },
    }[`${part?.category}|${String(part?.model || '').trim().toUpperCase()}`];
    const urlKey = value => {
      try {
        const u = new URL(value);
        return u.protocol === 'https:' && !u.username && !u.password && !u.port
          ? u.origin.toLowerCase() + u.pathname.replace(/\\/$/, '') : null;
      } catch { return null; }
    };
    return reviewed && reviewed.socket === socket && normalizeSocket(evidence.rawValue) === socket
      && urlKey(part.sourceUrl) === urlKey(reviewed.retailer)
      && urlKey(evidence.sourceUrl) === urlKey(reviewed.manufacturer)
      && evidence.reviewedOn === '2026-11-18' ? socket : null;
  }
  if (evidence.method !== 'explicit_product_spec'
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
