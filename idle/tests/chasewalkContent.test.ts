import { describe, expect, it } from 'vitest';
import raw from '../content/catalog.json';
import manifest from '../content/source-manifest.json';
describe('pinned ChaseWalk content', () => {
  it('promotes389 only with manual source cast and original icon and prerequisites', () => {
    expect(raw.skills.st_chasewalk).toMatchObject({ herculesId:389, name:'Furtividade', implementation:'supported', manualUse:'toggle',
      spCost:[10,10,10,10,10], castTimeMs:[1200,1200,1200,1200,1200], iconResource:'data/texture/유저인터페이스/item/st_chasewalk.bmp',
      prerequisites:[{skillId:'tf_hiding',level:5},{skillId:'rg_tunneldrive',level:3}] });
    expect(manifest.skillCoverage.supported).toBe(265);
    expect(manifest.skillSources.st_chasewalk.adaptation).toContain('NoSave');
  });
});
