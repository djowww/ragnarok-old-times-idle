type ConnectionBody = { connectionId: string } | Record<string, never>;

/** Initial/reconnected entry is distinct from the ordinary gameplay heartbeat. */
export class GameplayConnection {
  private opened = false;
  private connectionId: string;
  constructor(private readonly makeId: () => string = () => crypto.randomUUID()) {
    this.connectionId = makeId();
  }

  disconnect(): void {
    if (!this.opened) return;
    this.opened = false;
    this.connectionId = this.makeId();
  }

  async snapshot<T>(post: (path: string, body: ConnectionBody) => Promise<T>): Promise<T> {
    const wasOpened = this.opened;
    try {
      const value = await post(wasOpened ? '/api/session' : '/api/session/open',
        wasOpened ? {} : { connectionId: this.connectionId });
      this.opened = true;
      return value;
    } catch (error) {
      // An opening may have committed before its response was lost. Retry that
      // exact identifier; an established connection's failure opens a new one.
      if (wasOpened) this.disconnect();
      throw error;
    }
  }
}
