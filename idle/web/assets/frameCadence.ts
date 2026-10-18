/** Keep a render deadline rather than discarding the remainder of each RAF.
 * This avoids a 16 ms threshold dropping 144 Hz displays to 48 FPS.
 * Missed frames are skipped, never replayed as a burst after a stalled tab. */
export class FrameCadence {
  private nextAt: number | undefined;
  private interval: number | undefined;
  private observedAt: number | undefined;

  reset(): void {
    this.nextAt = this.interval = this.observedAt = undefined;
  }

  shouldRender(at: number, interval: number): boolean {
    if (!Number.isFinite(at) || !Number.isFinite(interval) || interval <= 0) return false;
    if (this.nextAt === undefined || this.interval !== interval ||
        this.observedAt !== undefined && at < this.observedAt) {
      this.nextAt = at;
      this.interval = interval;
    }
    this.observedAt = at;
    // RAF timestamps can differ from an exact deadline by floating point noise.
    const epsilon = 0.000001;
    if (at + epsilon < this.nextAt) return false;
    this.nextAt += (Math.floor((at - this.nextAt + epsilon) / interval) + 1) * interval;
    return true;
  }
}
