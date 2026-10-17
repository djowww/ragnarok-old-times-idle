import {alignFalconCues} from '../web/assets/falconPresentation';
import { selectSceneEventBatch } from '../web/assets/sceneEventBootstrap';
import { shiftCorpsePresentation } from '../web/assets/corpsePresentation';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import rawCatalog from '../content/catalog.json';
import { drawSkillEffect, combatPopupText, SKILL_EFFECT_MS } from '../web/assets/sceneEffects';
import { actorActionImpactAt, combatActionCueFromEvent, skillVisualEffectAt, skillCueCastDuration, presentLatestActorActions, presentedActorActionAt, retireInterruptedCastCues, retireTrickDeadPoses, sceneEventSkill } from '../web/assets/combatPresentation';
import { hasSceneAction, trapCueAction } from '../web/assets/groundTraps';
import { isTownScene } from '../shared/worldScene';
import { isNpcStatusAction } from '../shared/playerStatusView';
import { getCombatActorAction } from '../web/assets/renderer';

const scene = readFileSync(new URL('../web/components/Scene.tsx', import.meta.url), 'utf8');
const effectStart = scene.indexOf('    const previous = stateRef.current.state;');
const effectEnd = scene.indexOf('  }, [snapshot, state.events, catalog]);', effectStart);
const associateStart = scene.indexOf('  const shiftPresentationAssociates =');
const associateEnd = scene.indexOf('  useEffect(() => {', associateStart);
const sourceHelpers = scene.slice(scene.indexOf('function skillFor('), scene.indexOf('export default function Scene(')) +
  scene.slice(scene.indexOf('function pruneActionWatermarks('), scene.indexOf('function newestCue(')) +
  scene.slice(associateStart, associateEnd);
const snapshotConsumer = new Function('scope', `with (scope) { ${ts.transpileModule(sourceHelpers + scene.slice(effectStart, effectEnd), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText} }`);

function snapshotFixture(population: boolean) {
  const stone = { id: 5, at: 1500, actionId: 'pick-5', actionStartedAt: 1500, actionMotionMs: 300,
    sourceActorId: 'hero', targetActorId: 'hero', actorAction: 'skill', kind: 'skill', skillId: 'tf_pickstone',
    skillLevel: 1, text: 'Pedra coletada', amount: 1, itemId: 7049, quantity: 1, target: 'player' };
  const state: any = { id: 'hero', hp: 100, status: 'challenge', areaId: null, events: [stone],
    battle: { ...(population ? { enemies: [] } : {}), monsterId: 1002, groundEffects: [] } };
  const ref = (current: any) => ({ current });
  const scope: any = { state, snapshot: { state, serverTime: 1500, stats: { attackIntervalMs: 600 } }, catalog: rawCatalog,
    stateRef: ref({ state: structuredClone(state) }), receivedAt: ref(0), eventCursor: ref({ profileId: 'hero', id: 0 }),
    performance: { now: () => 1600 }, mapName: 'fixture', renderedHeroGround: ref(null),
    combatCues: ref([]), actionWatermarks: ref(new Map()), effects: ref([]), lootCues: ref([]),
    textureStartup: ref({ hasPendingDebut: () => false }), heroPresentation: ref({ hasPendingFrame: () => false }),
    enemyPresentation: ref({ hasPendingFrame: () => false }), actorsRef: ref({}), groupHistory: ref(new Map()),
    enemyPositions: ref(new Map()), offensiveTargets: ref(new Set()), legacyOpponentPosition: ref(null),
    legacyOpponentId: ref('enemy'), defeatedOpponent: ref(null), blockedTerminalId: ref(null),
    projection: ref(null), encounterPose: ref(null), roaming: ref({ position: { x: .5, y: .5 } }),
    skillCueCastDuration, combatActionCueFromEvent, selectSceneEventBatch, shiftCorpsePresentation, alignFalconCues, isTownScene, isNpcStatusAction, sceneEventSkill, HERO_COMBAT_DIRECTION: 6, actorActionDuration: () => 300,
    presentLatestActorActions, retireInterruptedCastCues, retireTrickDeadPoses, hasSceneAction, trapCueAction, combatPopupText, SKILL_EFFECT_MS,
    getCombatActorAction, actorActionImpactAt, skillVisualEffectAt,
  };
  return scope;
}
describe('Pick Stone collection cue', () => {
  it.each([false, true])('runs the actual Scene snapshot consumer and deduplicates item popup/action in population %s', population => {
    const scope = snapshotFixture(population); snapshotConsumer(scope);
    expect(scope.effects.current).toEqual([expect.objectContaining({ id: 5, text: 'Pedra +1', target: 'player' })]);
    expect(scope.combatCues.current).toHaveLength(1);
    expect(scope.combatCues.current[0]).toMatchObject({ sourceActorId: 'hero', targetActorId: 'hero', actorAction: 'skill' });
    expect(scope.lootCues.current).toHaveLength(0);
    scope.state = JSON.parse(JSON.stringify(scope.state)); scope.snapshot.state = scope.state;
    snapshotConsumer(scope);
    expect(scope.effects.current).toHaveLength(1); expect(scope.combatCues.current).toHaveLength(1);
    expect(scope.lootCues.current).toHaveLength(0);
  });
  it.each([false, true])('recovers a recent self action on Scene mount only once in population %s', population => {
    const scope = snapshotFixture(population);
    scope.eventCursor.current = undefined;
    scope.state.battle.challengeId = 'challenge-current';
    scope.state.battle.startedAt = 1000;
    snapshotConsumer(scope);
    expect(scope.combatCues.current).toHaveLength(1);
    expect(scope.effects.current).toEqual([expect.objectContaining({ id: 5, text: 'Pedra +1' })]);
    expect(scope.eventCursor.current).toEqual({ profileId: 'hero', id: 5 });
    snapshotConsumer(scope);
    expect(scope.combatCues.current).toHaveLength(1);
    expect(scope.effects.current).toHaveLength(1);
  });
  it('shows the real item quantity rather than a healing popup', () => {
    expect(combatPopupText({ kind: 'skill', target: 'player', amount: 1, itemId: 7049, quantity: 1 })).toBe('Pedra +1');
    expect(combatPopupText({ kind: 'skill', target: 'player', amount: 20 })).toBe('+20');
    expect(combatPopupText({ kind: 'damage', target: 'player', amount: 20 })).toBe('20');
  });
  it('draws self collection text with no magical halo and preserves the Throw effect', () => {
    const methods = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), ellipse: vi.fn(), stroke: vi.fn(), strokeText: vi.fn(), fillText: vi.fn() };
    const ctx = { globalAlpha: 1, ...methods } as unknown as CanvasRenderingContext2D;
    drawSkillEffect(ctx, null, { sourceName: 'TF_PICKSTONE', skillId: 'tf_pickstone', kind: 'buff', name: 'Find Stone', x: 100, y: 200, elapsedMs: 500 });
    expect(methods.ellipse).not.toHaveBeenCalled();
    expect(methods.fillText).toHaveBeenCalledWith('Pedra coletada', 100, 130);
    drawSkillEffect(ctx, null, { sourceName: 'TF_THROWSTONE', skillId: 'tf_throwstone', kind: 'physical', name: 'Stone Fling', x: 100, y: 200, elapsedMs: 500 });
    expect(methods.ellipse).toHaveBeenCalledOnce();
  });
  it('presents a self skill action once across duplicate saved snapshot actions', () => {
    const cue = { id: 5, actionId: 'pick-stone-action', actionAt: 1500, sourceActorId: 'hero', targetActorId: 'hero', actorAction: 'skill' as const,
      start: 1500, effectStart: 1500, impact: 1500, actionDuration: 300, duration: 1200 };
    const marks = new Map(); presentLatestActorActions([cue], marks, 1600);
    const originalStart = cue.start;
    expect(presentedActorActionAt([cue], 'hero', 1600)?.actorAction).toBe('skill');
    const replay = JSON.parse(JSON.stringify(cue)); presentLatestActorActions([replay], marks, 1800, [cue]);
    expect(cue.start).toBe(originalStart); expect(replay.start).toBe(originalStart);
  });
});
