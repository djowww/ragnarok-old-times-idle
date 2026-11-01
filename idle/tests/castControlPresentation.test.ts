import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getSnapshot } from '../engine';
import Build from '../web/panels/Build';
import { ownCast, castSetup } from './cast-control-fixture';
import { executeCommand } from '../engine/commands';
import { npcStatusCastProgress } from '../shared/playerStatusView';
import * as presentation from '../web/assets/combatPresentation';
import { getCombatActorAction } from '../web/assets/renderer';
function render(s: any, c: any, at: number) { return renderToStaticMarkup(createElement(Build, { catalog: c, snapshot: getSnapshot(s, c, at), busy: false, command: async () => true, mode: 'skills' })); }
describe('Cast Cancel live manual UI', () => {
    it('labels actual own spell and additional raw cost with a manual action', () => { const { s, c } = ownCast(); const html = render(s, c, 100); expect(html).toContain('Cancelar conjuração'); expect(html).toContain('Lanças de Fogo'); expect(html).toContain('22 SP adicionais'); });
    it('disables cancellation at source deadline and after removal', () => { const { s, c } = ownCast(); expect(render(s, c, 1000)).toMatch(/disabled=""[^>]*>Cancelar conjuração/); executeCommand(s, c, { type: 'useSkill', skillId: 'sa_castcancel' }, 100); expect(render(s, c, 101)).toMatch(/disabled=""[^>]*>Cancelar conjuração/); });
    it('cuts only canceled cast cue by actor and action, never earlier attack/history', () => { const cues = [{ id: 1, sourceActorId: 'hero', actionId: 'old', castAction: true }, { id: 2, sourceActorId: 'hero', actionId: 'new', castAction: true }, { id: 3, sourceActorId: 'hero', actionId: 'old', castAction: false }, { id: 4, sourceActorId: 'other', actionId: 'old', castAction: true }]; const history = [{ kind: 'cast-interrupted', sourceActorId: 'hero', actionId: 'old' }]; const result = (presentation as any).retireInterruptedCastCues(cues, history); expect(result.map((c: any) => c.id)).toEqual([2, 3, 4]); expect(history).toHaveLength(1); });
    it('preserves other actor cast bars and Spell Breaker uses its own skill pose', () => { const { s, c } = ownCast(), other = castSetup().e; s.battle!.enemies!.push(other); executeCommand(s, c, { type: 'useSkill', skillId: 'sa_castcancel' }, 100); expect(npcStatusCastProgress(other, s.id, s.areaId, 400)).toBe(.5); expect(getCombatActorAction('skill', 'SA_SPELLBREAKER')).toBe('skill'); });
});
