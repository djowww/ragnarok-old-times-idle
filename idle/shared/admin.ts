import type { GameState } from './types.js';

/** Public admin search/selection data; account IDs stay on the server. */
export interface AdminCharacter {
  profileId: string;
  username: string;
  characterName: string;
  classId: string;
  baseLevel: number;
  jobLevel: number;
  gender: GameState['gender'];
  status: GameState['status'];
  zeny: number;
}
