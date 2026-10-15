export function parseMapSpawnScript(text: string): Map<string, Set<number>>;
export function validateMapSpawnSelections(areas: readonly { id: string; map: string; monsters: readonly number[] }[], spawns: ReadonlyMap<string, ReadonlySet<number>>): void;
