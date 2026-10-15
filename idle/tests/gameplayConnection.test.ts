import { describe, expect, it, vi } from 'vitest';
import { GameplayConnection } from '../web/gameplayConnection';

describe('gameplay session opening before ordinary polling', () => {
  it('opens once, then polls without repeating the NoSave boundary', async () => {
    const post = vi.fn().mockResolvedValue({ revision: 1 });
    const connection = new GameplayConnection(() => 'connection-one');
    await connection.snapshot(post); await connection.snapshot(post);
    expect(post.mock.calls).toEqual([
      ['/api/session/open', { connectionId: 'connection-one' }], ['/api/session', {}],
    ]);
  });
  it('keeps the same opening identifier when its acknowledgement is uncertain', async () => {
    const post = vi.fn().mockRejectedValueOnce(new Error('lost response')).mockResolvedValue({ revision: 1 });
    const makeId = vi.fn().mockReturnValue('connection-one');
    const connection = new GameplayConnection(makeId);
    await expect(connection.snapshot(post)).rejects.toThrow('lost response');
    await connection.snapshot(post);
    expect(post.mock.calls).toEqual([
      ['/api/session/open', { connectionId: 'connection-one' }], ['/api/session/open', { connectionId: 'connection-one' }],
    ]);
    expect(makeId).toHaveBeenCalledTimes(1);
  });
  it('opens a fresh connection after an established poll fails', async () => {
    const post = vi.fn().mockResolvedValueOnce({ revision: 1 }).mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ revision: 2 });
    const makeId = vi.fn().mockReturnValueOnce('connection-one').mockReturnValue('connection-two');
    const connection = new GameplayConnection(makeId);
    await connection.snapshot(post);
    await expect(connection.snapshot(post)).rejects.toThrow('offline');
    await connection.snapshot(post); await connection.snapshot(post);
    expect(post.mock.calls).toEqual([
      ['/api/session/open', { connectionId: 'connection-one' }], ['/api/session', {}],
      ['/api/session/open', { connectionId: 'connection-two' }], ['/api/session', {}],
    ]);
  });
  it('makes repeated disconnect notifications idempotent without disturbing command receipts', async () => {
    const post = vi.fn().mockResolvedValue({ revision: 1 });
    const makeId = vi.fn().mockReturnValueOnce('connection-one').mockReturnValue('connection-two');
    const connection = new GameplayConnection(makeId);
    await connection.snapshot(post); connection.disconnect(); connection.disconnect();
    await connection.snapshot(post);
    expect(makeId).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenLastCalledWith('/api/session/open', { connectionId: 'connection-two' });
  });
});
