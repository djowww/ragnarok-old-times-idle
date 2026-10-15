/** Parse inert Hercules directives without conflating monster and player flags. */
export function parseTeleportMapFlags(source) {
  return [...new Set(source.split(/\r?\n/).flatMap(line => {
    const text = line.trim();
    if (!text || text.startsWith('//')) return [];
    const match = /^([a-zA-Z0-9_@-]+)\s+mapflag\s+(noteleport|monster_noteleport)\s*$/.exec(text);
    if (!match) throw new Error('Unsupported noteleport directive: ' + text);
    return match[2] === 'noteleport' ? [match[1]] : [];
  }))].sort();
}
