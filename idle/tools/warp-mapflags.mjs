/** Strict parser for the three pinned Warp Portal map restrictions. */
export function parseWarpMapFlags(source, expectedFlag) {
  if (!['nowarp', 'nomemo', 'nowarpto'].includes(expectedFlag))
    throw new Error('Unsupported Warp Portal map flag: ' + expectedFlag);
  const maps = new Set();
  for (const line of source.split(/\r?\n/)) {
    const text = line.trim();
    if (!text || text.startsWith('//') || text.startsWith('/*') || text.startsWith('*') || text.startsWith('*/')) continue;
    const match = /^([a-zA-Z0-9_@-]+)\s+mapflag\s+(nowarp|nomemo|nowarpto)\s*$/.exec(text);
    if (!match || match[2] !== expectedFlag) throw new Error('Unsupported ' + expectedFlag + ' directive: ' + text);
    maps.add(match[1]);
  }
  return [...maps].sort();
}
