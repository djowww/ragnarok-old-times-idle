/** Parse pinned Hercules spawn rows without evaluating NPC scripts. */
export function parseMapSpawnScript(text) {
    const maps = new Map();
    for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^\s*([a-z0-9_]+),.*?\b(?:monster|boss_monster)\s+.+?\s+(\d+),/i);
        if (!match) continue;
        const [, map, rawId] = match;
        const ids = maps.get(map) ?? new Set();
        ids.add(Number(rawId)); maps.set(map, ids);
    }
    return maps;
}

/** Every configured area must have an audited map and source-native selection. */
export function validateMapSpawnSelections(areas, spawns) {
    for (const area of areas) {
        const official = spawns.get(area.map);
        if (!official) throw new Error(`Area ${area.id} has no pinned spawn script for ${area.map}`);
        if (!area.monsters.length || area.monsters.some(id => !official.has(id)))
            throw new Error(`Area ${area.id} contains a monster not spawned on ${area.map} in its pinned Hercules script`);
    }
}
