import { beforeDungeonExpansionCatalog, beforeDungeonExpansionManifest } from './dungeon-map-historical';
import { beforeSoloAlchemySkills } from './solo-alchemy-historical';
import { beforeSageFieldSkills, beforeSagePropertyItems } from './sage-fields-historical-fixture';
import chasewalkBaseline from './fixtures/chasewalk389Baseline.json';
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import dungeonCurrentCatalog from '../content/catalog.json';
import dungeonCurrentManifest from '../content/source-manifest.json';
import rules from '../content/rules.json';
import baseline from './fixtures/sense234Baseline.json';
import magicRodBaseline from './fixtures/magicRodUnsupportedBaseline.json';
import rogueCopyBaseline from './fixtures/rogueCopyUnsupportedBaseline.json';
import type { Catalog } from '../shared/types';
import { beforeHistoricalClassCadence } from './class-cadence-historical';

const catalog = beforeDungeonExpansionCatalog(dungeonCurrentCatalog);
const manifest = beforeDungeonExpansionManifest(dungeonCurrentManifest);

const typedCatalog = catalog as unknown as Catalog;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key =>
    JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
  return JSON.stringify(value);
}
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const sagePacketSkillSources = new Set(['SA_ADVANCEDBOOK', 'SA_FLAMELAUNCHER', 'SA_FROSTWEAPON', 'SA_LIGHTNINGLOADER', 'SA_SEISMICWEAPON']);

describe('source-closed manual Sense catalog', () => {
  it('promotes Sense and retains every non-Sight Blaster source skill value', () => {
    expect(catalog.skills.sense).toEqual({ ...baseline.sense, implementation: 'supported',
      unsupportedReason: undefined, manualUse: 'inspect' });
    const { sense: _sense, ...otherSkills } = beforeSageFieldSkills(beforeSoloAlchemySkills(typedCatalog.skills)) as unknown as Record<string, Record<string, unknown>>;
    otherSkills.sight_blaster.implementation = 'unsupported';
    otherSkills.sight_blaster.unsupportedReason = 'Requer carga que detona ao contato com um inimigo.';
    otherSkills.al_ruwach.implementation = 'unsupported';
    otherSkills.al_ruwach.unsupportedReason = 'Requer aura que revela alvos e causa dano ao contato.';
    otherSkills.al_ruwach.name = 'Ruwach';
    otherSkills.al_ruwach.description = 'Ruwach. Dano mágico conforme Hercules pré-renovação. Requer aura que revela alvos e causa dano ao contato.';
    otherSkills.pr_lexdivina.description += ' Ruwach permanece um pré-requisito estudável com pontos, com seu efeito ainda indisponível.';
    otherSkills.dc_dontforgetme.name = 'Slow Grace';
    otherSkills.dc_dontforgetme.implementation = 'unsupported';
    otherSkills.dc_dontforgetme.unsupportedReason = 'Mecânica Hercules importada; a simulação atual ainda não executa este efeito.';
    otherSkills.dc_dontforgetme.description = 'Slow Grace. Aplica DONTFORGETME. Mecânica Hercules importada; a simulação atual ainda não executa este efeito.';
    // Restore this skill to its historical catalog row before comparing the frozen Sense234 digest.
    otherSkills.lk_jointbeat.name = 'Vital Strike';
    otherSkills.lk_jointbeat.implementation = 'unsupported';
    otherSkills.lk_jointbeat.unsupportedReason = 'Requer seleção aleatória de partes do corpo com penalidades distintas.';
    otherSkills.lk_jointbeat.description = 'Vital Strike. Dano de arma conforme Hercules pré-renovação. Requer seleção aleatória de partes do corpo com penalidades distintas.';
    // Restore Pang Voice's imported-only row before checking the frozen Sense234 catalog.
    otherSkills.ba_pangvoice.implementation = 'unsupported';
    otherSkills.ba_pangvoice.unsupportedReason = 'Mecânica Hercules importada; a simulação atual ainda não executa este efeito.';
    otherSkills.ba_pangvoice.description = 'Pang Voice. Habilidade utilitária. Mecânica Hercules importada; a simulação atual ainda não executa este efeito.';
    delete otherSkills.ba_pangvoice.statusEffect;
    delete otherSkills.ba_pangvoice.statusChance;
    delete otherSkills.ba_pangvoice.statusDurationMs;
    // Restore Wink of Charm's imported-only row before checking the frozen Sense234 catalog.
    otherSkills.dc_winkcharm.implementation = 'unsupported';
    otherSkills.dc_winkcharm.unsupportedReason = 'Mecânica Hercules importada; a simulação atual ainda não executa este efeito.';
    otherSkills.dc_winkcharm.description = 'Wink of Charm. Aplica DC_WINKCHARM. Mecânica Hercules importada; a simulação atual ainda não executa este efeito.';
    otherSkills.dc_winkcharm.statusDurationMs = [17000];
    delete otherSkills.dc_winkcharm.statusChance;
    // Restore the Close Confine source row before comparing the frozen Sense234 catalog.
    otherSkills.rg_closeconfine.name = 'Close Confine';
    otherSkills.rg_closeconfine.implementation = 'unsupported';
    otherSkills.rg_closeconfine.unsupportedReason = 'Mecânica Hercules importada; a simulação atual ainda não executa este efeito.';
    otherSkills.rg_closeconfine.description = 'Close Confine. Aplica RG_CCONFINE_S. Mecânica Hercules importada; a simulação atual ainda não executa este efeito.';
    // Restore Back Slide's imported-only row; its source promotion has independent coverage.
    otherSkills.tf_backsliding.implementation = 'unsupported';
    otherSkills.tf_backsliding.unsupportedReason = 'Mecânica Hercules importada; a simulação atual ainda não executa este efeito.';
    otherSkills.tf_backsliding.description = 'Back Slide. Habilidade utilitária. Mecânica Hercules importada; a simulação atual ainda não executa este efeito.';
    delete otherSkills.tf_backsliding.manualUse;
    // The frozen source baseline predates the explicit Idle balance layer.
    // Its independent coverage/hash tests validate those new vectors.
    for (const skill of Object.values(otherSkills)) {
      delete skill.idleDamageMultiplierPct;
      delete skill.allowPlagiarism; // Source flag export has independent Rogue coverage.
    }
    otherSkills.rg_plagiarism = structuredClone(rogueCopyBaseline.rg_plagiarism);
    otherSkills.st_preserve = structuredClone(rogueCopyBaseline.st_preserve);
    otherSkills.st_chasewalk = structuredClone(chasewalkBaseline);
    // Restore Magic Rod's pre-promotion export row so the frozen digest continues
    // to verify every unrelated skill value.
    otherSkills.sa_magicrod = structuredClone(magicRodBaseline) as unknown as Record<string, unknown>;
    otherSkills.sa_spellbreaker.description = 'Interrompe a conjuração atual de um monstro em alcance 9. Custa 10 SP e tem conjuração base de 700 ms, reduzida por DEX. Monstro normal perde 2% de HP máximo; nível 5 cura metade do valor calculado. Boss tem 10% de chance e não sofre dano nem cura HP. A rotação só inicia quando pode concluir antes do monstro. Tarou não concede SP; o ramo de Magic Rod e PvP não é simulado.';
    // The repair service has its own NPC flow; keep the prior unsupported skill row in this older catalog projection.
    otherSkills.bs_repairweapon.unsupportedReason = 'Requer produção, objetos persistentes, parceiros ou edição de células do mapa.';
    otherSkills.bs_repairweapon.description = 'Weapon Repair. Habilidade utilitária. Requer produção, objetos persistentes, parceiros ou edição de células do mapa.';
    const excludedPacketSkills = Object.entries(otherSkills).filter(([, skill]) => sagePacketSkillSources.has(skill.sourceName as string));
    expect(excludedPacketSkills.map(([, skill]) => skill.sourceName).sort()).toEqual([...sagePacketSkillSources].sort());
    const sourceClosedSkills = Object.fromEntries(Object.entries(otherSkills).filter(([, skill]) => !sagePacketSkillSources.has(skill.sourceName as string)));
    expect(digest(sourceClosedSkills)).toBe('0f484dcbd22e865195342964976dd94717049f903e1358d20e3a8051221d48ee');
    expect(catalog.skills.sense).toMatchObject({ id: 'sense', sourceName: 'WZ_ESTIMATION', mechanic: 'WZ_ESTIMATION',
      herculesId: 93, maxLevel: 1, spCost: [10], range: [9], targetType: 'enemy', damageType: 'none',
      power: [0], cooldownMs: 0, castTimeMs: [0], afterCastDelayMs: [0] });
    expect(manifest.skillCoverage).toMatchObject({ classes: 40, skills: 348, supported: 262, unsupported: 86 });
    expect(manifest.skillSources.sense).toMatchObject({ id: 93, name: 'WZ_ESTIMATION', implementation: 'supported',
      sourceRequirements: { SPCost: 10 }, sourceDamageType: { NoDamage: true } });
  });
  it('pins the real monster-info packet and source sense_type default without changing other content', () => {
    for (const row of baseline.sources) expect(manifest.sources).toContainEqual(row);
    expect(manifest.sources).toHaveLength(29);
    expect(manifest.sources).toContainEqual(expect.objectContaining({ path: 'npc/merchants/refine.txt', sha256: '3b0cf6c2b711115780acfd7d8c41ad1bd2a2f6582baec44a605cf889b747eac1' }));
    expect(manifest.sources).toContainEqual(expect.objectContaining({ path: 'src/map/clif.c',
      sha256: 'ae5fd1e746c1fa4075882762ef8b7ebb24e4022ec776f0a15da7d94464707a42' }));
    expect((rules.sourceHashes as Record<string, string>)['src/map/clif.c']).toBe('ae5fd1e746c1fa4075882762ef8b7ebb24e4022ec776f0a15da7d94464707a42');
    expect((manifest as Record<string, unknown>).senseInspection).toMatchObject({ skill: 'WZ_ESTIMATION',
      packet: 'ZC_MONSTER_INFO', packetId: '0x18c', packetSource: 'src/map/clif.c:6194..6229',
      senseType: 3, senseTypeSource: 'src/map/battle.c:7872', currentHp: true,
      elementalOrder: ['water', 'earth', 'fire', 'wind', 'poison', 'holy', 'dark', 'ghost', 'undead'], manualOnly: true });
    expect(catalog.source.commit).toBe(baseline.commit);
    for (const key of ['classes', 'items', 'monsters', 'areas'] as const) {
      const historical = key === 'items' ? beforeSagePropertyItems(typedCatalog.items)
        : key === 'classes' ? beforeHistoricalClassCadence(typedCatalog.classes)
          : structuredClone(typedCatalog[key]);
      if (key === 'classes') for (const id of ['sage', 'professor', 'priest', 'high_priest']) {
        const rows = historical as Catalog['classes'];
        rows[id].weapons = rows[id].weapons.filter(weapon => weapon !== 'book');
        if (rows[id].weaponAspd) delete rows[id].weaponAspd.book;
      }
      if (key === 'items') {
        const rows = historical as Catalog['items'];
        delete rows[1550];
        for (const id of [1552, 1557, 1559, 1560, 1565]) {
          expect(typedCatalog.items[id]).toMatchObject({ type: 'equipment', weaponType: 'book', refinable: true, equipSupported: true });
          delete rows[id].weaponType;
          rows[id].refinable = false;
          rows[id].equipSupported = false;
        }
      }
      if (key === 'monsters') for (const monster of Object.values(historical as Catalog['monsters'])) {
        if (!monster.npcStatusSkills) continue;
        monster.npcStatusSkills = monster.npcStatusSkills.filter((row: { damageType?: string }) => row.damageType !== 'magic');
        for (const row of monster.npcStatusSkills) {
          delete row.state; delete row.condition; delete row.sourceRowIndex;
        }
        if (!monster.npcStatusSkills.length) delete monster.npcStatusSkills;
      }
      expect(digest(historical)).toBe(baseline[key + 'Sha256' as keyof typeof baseline]);
    }
  });
});
