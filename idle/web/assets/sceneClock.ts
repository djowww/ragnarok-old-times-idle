export interface SceneClockSample {
  id: string;
  serverTime: number;
  receivedAt: number;
  at: number;
  pausedAt?: number;
}

/** Movement-only clock: delayed snapshots cannot rewind an active route. */
export class SceneClock {
  private id?: string;
  private paused = false;
  private localAt?: number;
  private visualAt?: number;

  reset() {
    this.id = undefined;
    this.localAt = this.visualAt = undefined;
  }

  at(sample: SceneClockSample): number {
    const paused = sample.pausedAt !== undefined;
    const target = sample.pausedAt ?? sample.serverTime + Math.max(0, sample.at - sample.receivedAt);
    if (this.visualAt === undefined || this.id !== sample.id || this.paused !== paused) {
      this.visualAt = target;
      this.localAt = sample.at;
    } else if (paused) {
      this.visualAt = target;
      this.localAt = sample.at;
    } else {
      const elapsed = Math.max(0, sample.at - this.localAt!);
      const predicted = this.visualAt + elapsed;
      // Slew at 0.9–1.1x rather than snapping to a newly received anchor.
      const limit = elapsed * 0.1;
      const correction = Math.max(-limit, Math.min(limit, target - predicted));
      this.visualAt = Math.max(this.visualAt, predicted + correction);
      this.localAt = Math.max(this.localAt!, sample.at);
    }
    this.id = sample.id;
    this.paused = paused;
    return this.visualAt;
  }
}
