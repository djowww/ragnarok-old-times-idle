import { describe, expect, it } from 'vitest';
import { parseCommandRequest, ValidationError } from '../server/validation';

describe('validação do comando de recolha de pendências', () => {
  it('aceita collectPendingLoot sem argumentos', () => {
    expect(parseCommandRequest({
      requestId: 'request-123',
      command: { type: 'collectPendingLoot' },
    })).toEqual({ requestId: 'request-123', command: { type: 'collectPendingLoot' } });
  });

  it('recusa campos extras no comando sem argumentos', () => {
    expect(() => parseCommandRequest({
      requestId: 'request-123',
      command: { type: 'collectPendingLoot', uid: 'item-1' },
    })).toThrowError(ValidationError);
  });
});
