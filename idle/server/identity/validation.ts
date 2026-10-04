import type { LoginInput, PasswordInput, RegistrationInput } from '../../shared/portal-types.js';
import { PortalError } from './types.js';

export function characterKey(name: string): string { return name.trim().normalize('NFC').toLowerCase(); }
function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new PortalError('VALIDATION_ERROR', 400, 'Dados de formulário inválidos.');
  return input as Record<string, unknown>;
}
function invalid(fields: Record<string, string>): void {
  if (Object.keys(fields).length) throw new PortalError('VALIDATION_ERROR', 400, 'Confira os campos informados.', fields);
}
function username(value: unknown, fields: Record<string, string>): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_]{3,24}$/.test(value)) {
    fields.username = 'Use 3 a 24 letras, números ou _.'; return '';
  }
  return value.toLowerCase();
}
function password(value: unknown, field: string, minimum: number, fields: Record<string, string>): string {
  if (typeof value !== 'string' || [...value].length < minimum || [...value].length > 128 || Buffer.byteLength(value, 'utf8') > 512) {
    fields[field] = `Use ${minimum} a 128 caracteres, até 512 bytes.`; return '';
  }
  return value;
}
function confirmation(value: unknown, expected: string, fields: Record<string, string>): string {
  if (typeof value !== 'string' || value !== expected) { fields.confirmation = 'As senhas precisam corresponder.'; return ''; }
  return value;
}
export function validateRegistration(input: unknown): RegistrationInput {
  const data = object(input); const fields: Record<string, string> = {};
  const user = username(data.username, fields);
  const name = typeof data.characterName === 'string' ? data.characterName.trim().normalize('NFC') : '';
  if ([...name].length < 2 || [...name].length > 24 || !/^[\p{L}\p{N} _-]+$/u.test(name) || characterKey(name) === 'djow') {
    fields.characterName = 'Use 2 a 24 letras, números, espaços, _ ou -. O nome djow é reservado.';
  }
  if (data.gender !== 'male' && data.gender !== 'female') fields.gender = 'Selecione o gênero do personagem.';
  const secret = password(data.password, 'password', 10, fields);
  const confirmed = confirmation(data.confirmation, secret, fields);
  invalid(fields);
  return { username: user, characterName: name, gender: data.gender as 'male' | 'female', password: secret, confirmation: confirmed };
}
export function validateLogin(input: unknown): LoginInput {
  const data = object(input); const fields: Record<string, string> = {};
  const user = username(data.username, fields); const secret = password(data.password, 'password', 1, fields);
  invalid(fields); return { username: user, password: secret };
}
export function validatePassword(input: unknown): PasswordInput {
  const data = object(input); const fields: Record<string, string> = {};
  const currentPassword = password(data.currentPassword, 'currentPassword', 1, fields);
  const newPassword = password(data.newPassword, 'newPassword', 10, fields);
  const confirmed = confirmation(data.confirmation, newPassword, fields);
  invalid(fields); return { currentPassword, newPassword, confirmation: confirmed };
}
