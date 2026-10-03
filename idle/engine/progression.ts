import type { Catalog, GameState, Reward } from '../shared/types.js';
import { addItem, event } from './state.js';
import { healFull } from './stats.js';
export function gainExp(s: GameState, c: Catalog, base: number, job: number, at: number) {
  s.totals.baseExp += base; s.totals.jobExp += job;
  if (s.baseLevel < 99) s.baseExp += base;
  const jobClass = c.classes[s.job]; if (s.jobLevel < jobClass.jobCap) s.jobExp += job;
  let leveled = false;
  while (s.baseLevel < 99) {
    const required = (s.reborn ? c.exp.baseTrans ?? c.exp.base : c.exp.base)[s.baseLevel]; if (!(required > 0) || s.baseExp < required) break;
    s.baseExp -= required; s.baseLevel++; s.statPoints += Math.floor((s.baseLevel - 1) / 5) + 3; s.totals.baseLevels++; leveled = true;
    event(s, at, 'level', `Base ${s.baseLevel}!`);
  }
  const curve = c.exp.job[jobClass.expGroup];
  while (s.jobLevel < jobClass.jobCap) {
    const required = curve?.[s.jobLevel]; if (!(required > 0) || s.jobExp < required) break;
    s.jobExp -= required; s.jobLevel++; s.skillPoints++; s.totals.jobLevels++; leveled = true;
    event(s, at, 'level', `Job ${s.jobLevel}!`);
  }
  if (s.baseLevel >= 99) s.baseExp = 0; if (s.jobLevel >= jobClass.jobCap) s.jobExp = 0;
  if (leveled) healFull(s, c);
}
export function grantReward(s: GameState, c: Catalog, reward: Reward, at: number) {
  s.zeny += reward.zeny; s.totals.zeny += reward.zeny; gainExp(s, c, reward.baseExp, reward.jobExp, at);
  for (const item of reward.items) addItem(s, c, item.itemId, item.quantity, true);
}
export function updateQuests(s: GameState, c: Catalog) {
  for (const q of c.quests) {
    const saved = s.quests[q.id] ??= { claimed: false, progress: 0 }; let value = 0;
    switch (q.kind) {
      case 'kills': value = q.target === 'all' ? Object.values(s.bestiary).reduce((a, b) => a + b, 0) : s.bestiary[Number(q.target)] ?? 0; break;
      case 'baseLevel': value = s.baseLevel; break;
      case 'jobLevel': value = s.jobLevel; break;
      case 'class': value = s.job === q.target || s.family === q.target || s.branch === q.target ? q.amount : 0; break;
      case 'area': value = s.visitedAreas.includes(String(q.target)) ? q.amount : 0; break;
      case 'refine': value = s.highestRefine; break;
      case 'challenge': value = s.challengeWins[String(q.target)] ?? 0; break;
    }
    saved.progress = Math.max(saved.progress, Math.min(q.amount, value));
  }
}
