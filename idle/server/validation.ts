import type { CommandRequest, GameCommand } from '../shared/types.js';

export class ValidationError extends Error {
  readonly code = 'INVALID_COMMAND';
  constructor(message = 'Confira os dados dessa ação.') { super(message); this.name = 'ValidationError'; }
}

type Rule = (value: unknown) => boolean;
const integer = (min: number, max: number): Rule => value => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const token: Rule = value => typeof value === 'string' && /^[A-Za-z0-9_:\-]{1,80}$/.test(value);
const huntFocus: Rule = value => typeof value === 'string' && (value === 'any' || /^monster:[1-9]\d{0,6}$/.test(value) || /^element:[a-z]{1,32}$/.test(value));
const oneOf = (...values: unknown[]): Rule => value => values.includes(value);
const boolean: Rule = value => typeof value === 'boolean';
const rules: Record<string, Record<string, Rule>> = {
  startHunt: { areaId: token }, setHuntFocus: { areaId: token, focus: huntFocus }, stop: {}, rest: {}, sellLoot: {}, rebirth: {}, dismissOffline: {},
  setGender: { gender: oneOf('male', 'female') },
  allocate: { stat: oneOf('str', 'agi', 'vit', 'int', 'dex', 'luk'), amount: integer(1, 99) },
  learnSkill: { skillId: token },
  setRotation: { skillIds: value => Array.isArray(value) && value.length <= 3 && new Set(value).size === value.length && value.every(token) },
  buy: { itemId: integer(1, 1_000_000), quantity: integer(1, 9999) },
  sell: { uid: token, quantity: integer(1, 9999) },
  equip: { uid: token }, favorite: { uid: token }, refine: { uid: token },
  unequip: { slot: oneOf('weapon', 'armor', 'shield', 'head', 'garment', 'shoes', 'accessory') },
  socket: { uid: token, cardUid: token }, changeClass: { classId: token },
  setPotions: { hpThreshold: integer(0, 100), spThreshold: integer(0, 100) },
  setAutoResume: { enabled: boolean }, claimQuest: { questId: token }, challenge: { challengeId: token },
};

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseCommandRequest(value: unknown): CommandRequest {
  if (!object(value) || Object.keys(value).some(key => key !== 'requestId' && key !== 'command')) throw new ValidationError();
  if (typeof value.requestId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(value.requestId)) throw new ValidationError('A ação precisa de um identificador válido para ser salva.');
  if (!object(value.command) || typeof value.command.type !== 'string' || !Object.hasOwn(rules, value.command.type)) throw new ValidationError('Essa ação não existe.');
  const rule = rules[value.command.type];
  if (Object.keys(value.command).some(key => key !== 'type' && !Object.hasOwn(rule, key))) throw new ValidationError();
  const command: Record<string, unknown> = { type: value.command.type };
  for (const [key, check] of Object.entries(rule)) {
    if (!check(value.command[key])) throw new ValidationError();
    command[key] = value.command[key];
  }
  return { requestId: value.requestId, command: command as unknown as GameCommand };
}
