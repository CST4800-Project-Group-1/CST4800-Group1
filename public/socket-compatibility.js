// Socket-only preview contract; full build compatibility remains unchecked.
// This reference rule is limited to the two socket families in the Sprint 1 seed.
const supportedSockets = new Set(['AM5', 'LGA1700']);
const socketOf = part => typeof part?.specs?.socket === 'string' ? part.specs.socket.trim() : null;

export function evaluateSocketCompatibility(cpu, motherboard) {
  const cpuSocket = socketOf(cpu), motherboardSocket = socketOf(motherboard);
  const result = (status, message) => ({ruleId:'cpu-motherboard-socket', status, cpuSocket, motherboardSocket, message});
  if (!cpu || !motherboard) {
    return result('waiting', !cpu && !motherboard ? 'Select a CPU and motherboard to check their sockets.'
      : !cpu ? 'Select a CPU to check it against your motherboard.' : 'Select a motherboard to check it against your CPU.');
  }
  if (cpu.category !== 'cpu' || motherboard.category !== 'motherboard'
      || !supportedSockets.has(cpuSocket?.toUpperCase()) || !supportedSockets.has(motherboardSocket?.toUpperCase())) {
    return result('unknown', `Socket compatibility is unknown. CPU socket: ${cpuSocket || 'unavailable'}; motherboard socket: ${motherboardSocket || 'unavailable'}. Confirm the data and supported socket rule before continuing.`);
  }
  if (cpuSocket.toUpperCase() === motherboardSocket.toUpperCase()) {
    return result('match', `Sockets match: ${cpu.name} (${cpuSocket}) and ${motherboard.name} (${motherboardSocket}).`);
  }
  return result('mismatch', `Socket mismatch: ${cpu.name} uses ${cpuSocket}, but ${motherboard.name} uses ${motherboardSocket}. Choose a CPU or motherboard with the same socket.`);
}
