import metadata from "../../content/map-bgm.json";

// Generated from the local client's data/mp3nametable.txt; music stays external.
const mapTracks: Readonly<Record<string, string>> = Object.freeze(metadata.tracks);

export function bgmForMap(map: string): string | undefined {
  return Object.hasOwn(mapTracks, map) ? mapTracks[map] : undefined;
}
