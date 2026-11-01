export const RUWACH_CONCEALMENT_STATUSES = [
  'SC_HIDING',
  'SC_CLOAKING',
  'SC_CAMOUFLAGE',
  'SC_CLOAKINGEXCEED',
  'SC_NEWMOON',
] as const;

type TimedStatus = { expiresAt: number };

export function activeRuwachConcealment(statuses: Record<string, TimedStatus> | undefined, at: number) {
  return RUWACH_CONCEALMENT_STATUSES.filter(name => (statuses?.[name]?.expiresAt ?? 0) > at);
}

/** Hercules ends every concealment status when Ruach reveals any one of them. */
export function revealRuwachTarget(statuses: Record<string, TimedStatus> | undefined, at: number) {
  const active = activeRuwachConcealment(statuses, at);
  if (active.length)
    for (const name of RUWACH_CONCEALMENT_STATUSES) delete statuses![name];
  return active;
}
