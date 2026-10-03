// Local data/mp3nametable.txt; MP3 files stay in client-data/BGM/.
const mapTracks: Readonly<Record<string, string>> = Object.freeze({
  prontera: "08.mp3",
  prt_fild08: "12.mp3",
  prt_sewb1: "19.mp3",
  prt_fild04: "05.mp3",
  prt_fild03: "05.mp3",
  pay_dun00: "20.mp3",
  iz_dun01: "29.mp3",
  gef_fild10: "35.mp3",
  moc_pryd02: "22.mp3",
  gef_dun02: "50.mp3",
  gl_knt01: "44.mp3",
});

export function bgmForMap(map: string): string | undefined {
  return Object.hasOwn(mapTracks, map) ? mapTracks[map] : undefined;
}
