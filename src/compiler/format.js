export function escapeForDisplay(str) {
  return str.replace(/\\/g, '\\\\').replace(/\0/g, '\\0').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r');
}

export function typeName(val) {
  if (typeof val === 'number') return 'number';
  if (typeof val === 'string') return 'string';
  if (Array.isArray(val)) return 'array';
  return typeof val;
}

// [FIX v13 #5] Cycle-safe value formatter — self-referencing arrays print "[...]"
// instead of crashing the host with infinite recursion.
export function formatValue(val, seen) {
  if (typeof val === 'number') return String(val);
  if (typeof val === 'string') return `"${escapeForDisplay(val)}"`;
  if (Array.isArray(val)) {
    if (!seen) seen = new Set();
    if (seen.has(val)) return "[...]";
    seen.add(val);
    const inner = val.map(v => formatValue(v, seen)).join(", ");
    seen.delete(val);
    return `[${inner}]`;
  }
  return String(val);
}

// Top-level print: strings render raw (no quotes); everything else via formatValue.
export function formatForPrint(val) {
  if (typeof val === 'string') return val;
  return formatValue(val);
}
