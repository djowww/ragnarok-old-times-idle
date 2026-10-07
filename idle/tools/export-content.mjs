#!/usr/bin/env node
/** Reproducible selected Hercules catalog. GPL-3.0-or-later. Never evaluates scripts. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseConfig, resolveInheritance } from './libconfig.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rules = JSON.parse(await readFile(resolve(root, 'content/rules.json'), 'utf8'));
const sha = b => createHash('sha256').update(b).digest('hex');
const args = process.argv.slice(2);
const arg = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const source = arg('--source');
const files = ['mob_db.conf', 'item_db.conf', 'job_db.conf', 'exp_group_db.conf', 'skill_db.conf', 'skill_tree.conf', 'attr_fix.conf', 'size_fix.txt'];
const buffers = {};
const parsed = {};
const manifest = { commit: rules.commit, license: 'GPL-3.0-or-later', sources: [], adaptations: rules.adaptations, excludedDrops: [], inertDropItems: [], missingItemResources: [], skillSources: {}, classSources: {} };
manifest.bossRoster = {
    miniBossSource: rules.miniBossRosterSource,
    miniBossMonsterIds: rules.miniBossMonsterIds,
    mvpCriterion: 'MvpExp or MvpDrops in pinned mob_db.conf',
    excludedMvpSpritePrefixes: rules.excludedMvpSpritePrefixes ?? [],
};
for (const file of files) {
    const url = `https://raw.githubusercontent.com/HerculesWS/Hercules/${rules.commit}/db/pre-re/${file}`;
    const buffer = source ? await readFile(resolve(source, 'db/pre-re', file)) : Buffer.from(await (await fetch(url)).arrayBuffer());
    if (sha(buffer) !== rules.sourceHashes[file])
        throw new Error('Pinned source hash mismatch: ' + file);
    buffers[file] = buffer;
    manifest.sources.push({ path: 'db/pre-re/' + file, url, sha256: sha(buffer) });
    if (!file.endsWith('.txt'))
        parsed[file] = parseConfig(buffer.toString('utf8'));
}
const resourcePath = arg('--item-resources');
const resourceBuffer = resourcePath ? await readFile(resolve(resourcePath)) : Buffer.from(await (await fetch((arg('--asset-origin') ?? 'http://127.0.0.1:8080') + '/data/idnum2itemresnametable.txt')).arrayBuffer());
const resources = {};
for (const line of new TextDecoder('euc-kr').decode(resourceBuffer).split(/\r?\n/)) {
    const m = line.match(/^\s*(\d+)#([^#]+)#/);
    if (m)
        resources[m[1]] = m[2].trim();
}
manifest.itemResources = { path: 'data/idnum2itemresnametable.txt', encoding: 'CP949 (WHATWG euc-kr)', sha256: sha(resourceBuffer), redistributed: false };
const jobs = parsed['job_db.conf'];
for (const [name, value] of Object.entries(jobs))
    if (Array.isArray(value))
        jobs[name] = value.at(-1);
const skillByName = Object.fromEntries(parsed['skill_db.conf'].skill_db.map(s => [s.Name, s]));
// Source formulas and job bonuses are pinned alongside the databases. They are
// audited data; the exporter never evaluates Hercules C or item scripts.
for (const path of ['db/job_db2.txt', 'src/map/battle.c', 'src/map/status.c', 'src/map/skill.c', 'src/map/pc.c']) {
    const url = `https://raw.githubusercontent.com/HerculesWS/Hercules/${rules.commit}/${path}`;
    const buffer = source ? await readFile(resolve(source, path)) : Buffer.from(await (await fetch(url)).arrayBuffer());
    if (sha(buffer) !== rules.sourceHashes[path]) throw new Error('Pinned source hash mismatch: ' + path);
    buffers[path] = buffer;
    manifest.sources.push({ path, url, sha256: sha(buffer) });
}
const skillTrees = parsed['skill_tree.conf'];
function sourceTree(name, trail = []) {
    if (trail.includes(name)) throw new Error('Skill-tree inheritance cycle: ' + name);
    const row = skillTrees[name];
    if (!row) throw new Error('Missing source skill tree: ' + name);
    let result = {};
    for (const parent of row.inherit ?? []) result = { ...result, ...sourceTree(parent, [...trail, name]) };
    result = { ...result, ...row.skills };
    // Hercules explicitly prevents non-Novices inheriting Play Dead.
    if (!['Novice', 'Novice_High'].includes(name)) delete result.NV_TRICKDEAD;
    return result;
}
const sourceAliases = { ...rules.skillAliases, ...Object.fromEntries(rules.skills.map(s => [s.source, s.id])) };
const skillId = name => sourceAliases[name] ?? name.toLowerCase();
const familySkills = Object.keys(skillByName).filter(name => name.startsWith('WE_'));
const treeByClass = Object.fromEntries(rules.classes.map(r => {
    const tree = sourceTree(r.source);
    for (const name of familySkills) delete tree[name];
    if (r.family !== 'merchant') delete tree.ALL_INCCARRY;
    return [r.id, tree];
}));
manifest.classSkillExclusions = {
    allClasses: familySkills,
    nonMerchantFamilies: ['ALL_INCCARRY'],
    reason: 'Family skills disabled for all idle classes; Increase Weight Limit R retained only for Merchant and evolutions. Native MC_INCCARRY preserved.'
};
const skillNames = [...new Set(Object.values(treeByClass).flatMap(tree => Object.keys(tree)))];
const bonusRows = Object.fromEntries(buffers['db/job_db2.txt'].toString('utf8').split(/\r?\n/).map(line => line.split('//')[0].trim()).filter(Boolean).map(line => { const [job, ...bonuses] = line.split(',').map(Number); return [job, bonuses]; }));
const statKeys = ['str', 'agi', 'vit', 'int', 'dex', 'luk'];
const jobIds = { Novice: 0, Swordsman: 1, Magician: 2, Archer: 3, Acolyte: 4, Merchant: 5, Thief: 6, Knight: 7, Priest: 8, Wizard: 9, Blacksmith: 10, Hunter: 11, Assassin: 12, Crusader: 14, Monk: 15, Sage: 16, Rogue: 17, Alchemist: 18, Bard: 19, Dancer: 20, Novice_High: 4001, Swordsman_High: 4002, Magician_High: 4003, Archer_High: 4004, Acolyte_High: 4005, Merchant_High: 4006, Thief_High: 4007, Lord_Knight: 4008, High_Priest: 4009, High_Wizard: 4010, Whitesmith: 4011, Sniper: 4012, Assassin_Cross: 4013, Paladin: 4015, Champion: 4016, Professor: 4017, Stalker: 4018, Creator: 4019, Clown: 4020, Gypsy: 4021 };
const motionKeys = { Fist: 'fist', Dagger: 'dagger', Sword: 'sword', TwoHandSword: 'twoHandSword', Spear: 'spear', TwoHandSpear: 'twoHandSpear', Axe: 'axe', TwoHandAxe: 'twoHandAxe', Mace: 'mace', TwoHandMace: 'twoHandMace', Rod: 'staff', TwoHandRod: 'twoHandStaff', Bow: 'bow', Knuckle: 'knuckle', Instrumen: 'instrument', Whip: 'whip', Book: 'book', Katar: 'katar' };
const allItems = parsed['item_db.conf'].item_db;
const itemByName = Object.fromEntries(allItems.map(i => [i.AegisName, i]));
const itemById = Object.fromEntries(allItems.map(i => [i.Id, i]));
function inheritedItem(item, trail = []) { if (!item.CloneItem)
    return item; if (trail.includes(item.Id))
    throw new Error('CloneItem cycle'); const parent = typeof item.CloneItem === 'number' ? itemById[item.CloneItem] : itemByName[item.CloneItem]; if (!parent)
    throw new Error('Missing CloneItem'); return { ...inheritedItem(parent, [...trail, item.Id]), ...item }; }
const catalog = { version: rules.version, source: { commit: rules.commit, files: manifest.sources.map(s => s.path), hash: '' }, rates: rules.rates, monsters: {}, items: {}, classes: {}, skills: {}, areas: rules.areas, quests: [], challenges: [], exp: { base: [], job: {} }, elementModifiers: {}, sizeModifiers: {} };
function actorSprite(job, gender) { const sex = gender === 'male' ? '남' : '여'; const base = 'data/sprite/인간족/몸통/' + sex + '/' + rules.spriteJobs[job] + '_' + sex; const head = 'data/sprite/인간족/머리통/' + sex + '/1_' + sex; return { spr: base + '.spr', act: base + '.act', headSpr: head + '.spr', headAct: head + '.act' }; }
for (const rule of rules.classes) {
    const job = resolveInheritance(jobs, rule.source);
    const { source, spriteJob, ...rest } = rule;
    const jobCap = rule.tier === 0 ? 10 : rule.trans && rule.tier === 2 ? 70 : 50;
    const bonus = Object.fromEntries(statKeys.map(k => [k, 0]));
    const jobBonuses = Array.from({ length: jobCap }, (_, index) => { const stat = statKeys[(bonusRows[jobIds[source]]?.[index] ?? 0) - 1]; if (stat) bonus[stat]++; return { ...bonus }; });
    const attackMotion = Object.fromEntries(Object.entries(job.BaseASPD ?? {}).map(([k, v]) => [motionKeys[k] ?? k, v]));
    const weaponAspd = { ...Object.fromEntries(Object.entries(attackMotion).filter(([k]) => ['dagger', 'sword', 'spear', 'axe', 'mace', 'staff', 'bow', 'instrument', 'whip', 'katar'].includes(k))), unarmed: attackMotion.fist ?? 2000 };
    catalog.classes[rule.id] = { ...rest, skills: Object.keys(treeByClass[rule.id]).map(skillId), jobCap, expGroup: job.JobExpGroup, hp: job.HPTable.slice(0, 99).map(n => rule.trans ? n + Math.floor(n * 25 / 100) : n), sp: job.SPTable.slice(0, 99).map(n => rule.trans ? n + Math.floor(n * 25 / 100) : n), jobBonuses: Object.fromEntries(statKeys.map(k => [k, jobBonuses.map(row => row[k])])), attackMotion, weaponAspd, baseWeight: (job.Weight ?? 20000) / 10, sprite: { male: actorSprite(spriteJob, rule.gender ?? 'male'), female: actorSprite(spriteJob, rule.gender ?? 'female') } };
    manifest.classSources[rule.id] = { job: source, sourceJobId: jobIds[source], baseExpGroup: job.BaseExpGroup, jobExpGroup: job.JobExpGroup, skillTree: source, jobBonuses: 'db/job_db2.txt', attackMotion: 'db/pre-re/job_db.conf:BaseASPD' };
}
function byLevel(value, max, fallback = 0) {
    return Array.from({ length: max }, (_, i) => {
        const result = typeof value === 'number' ? value : Number(value?.['Lv' + (i + 1)] ?? fallback);
        if (!Number.isFinite(result)) throw new Error(`Invalid numeric Hercules value at Lv${i + 1}: ${JSON.stringify(value)}`);
        return result;
    });
}
const magicRatios = {
    MG_NAPALMBEAT: l => 70 + 10 * l, MG_SOULSTRIKE: () => 100, MG_COLDBOLT: () => 100,
    MG_FROSTDIVER: l => 100 + 10 * l, MG_FIREBALL: l => 70 + 10 * l, MG_FIREWALL: () => 50,
    MG_FIREBOLT: () => 100, MG_LIGHTNINGBOLT: () => 100, MG_THUNDERSTORM: () => 80,
    WZ_FIREPILLAR: l => 40 + 20 * l, WZ_SIGHTRASHER: l => 100 + 20 * l, WZ_METEOR: () => 100,
    WZ_JUPITEL: () => 100, WZ_VERMILION: l => 80 + 20 * l, WZ_WATERBALL: l => 100 + 30 * l,
    WZ_FROSTNOVA: l => Math.floor((100 + 10 * l) * 2 / 3), WZ_STORMGUST: l => 100 + 40 * l,
    WZ_EARTHSPIKE: () => 100, WZ_HEAVENDRIVE: () => 100, HW_NAPALMVULCAN: l => 70 + 10 * l,
    WZ_SIGHTBLASTER: () => 100, AL_HOLYLIGHT: () => 125, AL_RUWACH: () => 145, PR_MAGNUS: () => 100,
};
const weaponRatios = {
    SM_BASH: l => 100 + 30 * l, SM_MAGNUM: l => 100 + 20 * l, MC_MAMMONITE: l => 100 + 50 * l,
    AC_DOUBLE: l => 90 + 10 * l, AC_SHOWER: l => 75 + 5 * l, AC_CHARGEARROW: () => 150,
    KN_PIERCE: l => 100 + 10 * l, KN_SPEARSTAB: l => 100 + 20 * l, KN_SPEARBOOMERANG: l => 100 + 50 * l,
    KN_BRANDISHSPEAR: l => 100 + 20 * l, KN_BOWLINGBASH: l => 100 + 40 * l,
    AS_GRIMTOOTH: l => 100 + 20 * l, AS_SONICBLOW: l => 400 + 40 * l,
    AS_POISONREACT: l => 100 + 30 * l, TF_SPRINKLESAND: () => 130, MC_CARTREVOLUTION: () => 150,
    RG_BACKSTAP: l => 300 + 40 * l, RG_RAID: l => 100 + 40 * l, RG_INTIMIDATE: l => 100 + 30 * l,
    CR_SHIELDCHARGE: l => 100 + 20 * l, CR_SHIELDBOOMERANG: l => 100 + 30 * l,
    CR_HOLYCROSS: l => 100 + 35 * l, AM_DEMONSTRATION: l => 100 + 20 * l, AM_ACIDTERROR: l => 100 + 40 * l,
    MO_FINGEROFFENSIVE: l => 100 + 50 * l, MO_INVESTIGATE: l => 100 + 75 * l,
    MO_TRIPLEATTACK: l => 100 + 20 * l, MO_CHAINCOMBO: l => 150 + 50 * l, MO_COMBOFINISH: l => 240 + 60 * l,
    BA_MUSICALSTRIKE: l => 125 + 25 * l, DC_THROWARROW: l => 125 + 25 * l,
    CH_TIGERFIST: l => 40 + 100 * l, CH_CHAINCRUSH: l => 400 + 100 * l, CH_PALMSTRIKE: l => 200 + 100 * l,
    LK_HEADCRUSH: l => 100 + 40 * l, LK_JOINTBEAT: l => 50 + 10 * l,
    ASC_METEORASSAULT: l => 40 + 40 * l, SN_SHARPSHOOTING: l => 200 + 50 * l,
    CG_ARROWVULCAN: l => 200 + 100 * l, AS_SPLASHER: l => 500 + 50 * l,
    PA_SHIELDCHAIN: l => 100 + 30 * l, HT_PHANTASMIC: () => 150, MO_BALKYOUNG: () => 300,
    HT_FREEZINGTRAP: l => 50 + 10 * l, HW_MAGICCRASHER: () => 100, TF_POISON: () => 100,
    KN_CHARGEATK: () => 100, AS_VENOMKNIFE: () => 100,
};
const miscSkills = new Set(['HT_LANDMINE', 'HT_BLASTMINE', 'HT_CLAYMORETRAP', 'HT_BLITZBEAT', 'SN_FALCONASSAULT', 'TF_THROWSTONE', 'PA_PRESSURE', 'CR_ACIDDEMONSTRATION', 'ASC_BREAKER', 'HW_GRAVITATION', 'BA_DISSONANCE', 'MO_EXTREMITYFIST', 'LK_SPIRALPIERCE', 'WS_CARTTERMINATION', 'CR_GRANDCROSS', 'PF_SOULBURN', 'PR_TURNUNDEAD']);
const healSkills = new Set(['NV_FIRSTAID', 'AL_HEAL', 'PR_SANCTUARY', 'AM_POTIONPITCHER', 'CR_SLIMPITCHER']);
// A source row alone is not an implementation. Every supported non-damage
// skill must have an Effects translation or an explicit engine dispatcher.
const effectSkills = new Set(['AL_BLESSING', 'AL_INCAGI', 'MC_LOUD', 'PR_IMPOSITIO', 'PR_GLORIA', 'AC_CONCENTRATION', 'KN_TWOHANDQUICKEN', 'BS_ADRENALINE', 'CR_SPEARQUICKEN', 'BS_OVERTHRUST', 'WS_OVERTHRUSTMAX', 'LK_CONCENTRATION', 'SN_SIGHT', 'SN_WINDWALK', 'MO_EXPLOSIONSPIRITS', 'BA_WHISTLE', 'BA_ASSASSINCROSS', 'BA_POEMBRAGI', 'BA_APPLEIDUN', 'DC_HUMMING', 'DC_FORTUNEKISS', 'DC_SERVICEFORYOU', 'AL_ANGELUS', 'CR_AUTOGUARD', 'CR_REFLECTSHIELD', 'LK_PARRYING', 'HP_ASSUMPTIO']);
const passiveSkills = new Set(['SM_SWORD', 'SM_TWOHAND', 'SM_RECOVERY', 'SM_MOVINGRECOVERY', 'KN_SPEARMASTERY', 'MG_SRECOVERY', 'AC_OWL', 'AC_VULTURE', 'AL_DEMONBANE', 'TF_DOUBLE', 'TF_MISS', 'MO_IRONHAND', 'MO_DODGE', 'MO_TRIPLEATTACK', 'PR_MACEMASTERY', 'HT_BEASTBANE', 'HT_STEELCROW', 'HT_FALCON', 'BA_MUSICALLESSON', 'DC_DANCINGLESSON', 'BS_HILTBINDING', 'BS_WEAPONRESEARCH', 'MC_DISCOUNT', 'MC_OVERCHARGE', 'MC_INCCARRY', 'ALL_INCCARRY', 'MC_PUSHCART', 'AM_AXEMASTERY', 'AS_KATAR', 'AS_SONICACCEL', 'ASC_KATAR', 'CR_TRUST', 'HW_SOULDRAIN', 'HP_MEDITATIO', 'HP_MANARECHARGE', 'AM_LEARNINGPOTION', 'BS_SKINTEMPER', 'SA_DRAGONOLOGY', 'AL_DP']);
const activeSpecial = new Set(['MG_SIGHT', 'MG_SAFETYWALL', 'MG_STONECURSE', 'MG_ENERGYCOAT', 'WZ_QUAGMIRE', 'HW_MAGICPOWER', 'TF_STEAL', 'RG_STEALCOIN', 'TF_HIDING', 'AS_CLOAKING', 'BS_HAMMERFALL', 'BA_FROSTJOKE', 'DC_SCREAM', 'MO_CALLSPIRITS', 'MO_ABSORBSPIRITS', 'CH_SOULCOLLECT', 'PR_KYRIE', 'PR_MAGNIFICAT', 'WS_CARTBOOST', 'SM_PROVOKE', 'AL_DECAGI', 'PR_LEXDIVINA', 'PR_LEXAETERNA', 'BS_WEAPONPERFECT', 'BS_MAXIMIZE', 'PR_ASPERSIO', 'RG_STRIPWEAPON', 'RG_STRIPARMOR', 'RG_STRIPHELM', 'PF_HPCONVERSION']);
const oneShotTraps = new Set(['HT_LANDMINE', 'HT_BLASTMINE', 'HT_CLAYMORETRAP', 'HT_FREEZINGTRAP']);
const unsupported = {
    NV_BASIC: 'Ações sociais do Aprendiz não existem na simulação de caça.', WE_BABY: 'Requer sistema de família e personagens vinculados.', WE_CALLPARENT: 'Requer sistema de família e personagens vinculados.', WE_CALLBABY: 'Requer sistema de família e personagens vinculados.',
    AL_WARP: 'Portais para mapas e memorizações de coordenadas exigem navegação em mapa.', AL_HOLYWATER: 'Produção de Água Benta exige células de água e Frasco Vazio.', ALL_RESURRECTION: 'Requer outro personagem morto ou alvo morto-vivo.', PR_REDEMPTIO: 'Ressurreição de grupo exige outros personagens.',
    MC_VENDING: 'Requer comércio com outros personagens.', ALL_BUYING_STORE: 'Requer comércio com outros personagens.', MC_CARTDECORATE: 'Decoração de carrinho exige objetos de carrinho.', MC_CHANGECART: 'Aparência do carrinho exige objetos de carrinho.', MC_IDENTIFY: 'O inventário atual não contém equipamentos não identificados.',
    RG_GRAFFITI: 'Requer inscrições em células do mapa.', RG_FLAGGRAFFITI: 'Requer bandeiras de guilda no mapa.', RG_CLEANER: 'Requer inscrições em células do mapa.', RG_GANGSTER: 'Requer aliados da mesma classe.', RG_COMPULSION: 'Requer comércio com outros personagens.', RG_PLAGIARISM: 'Requer habilidades inimigas copiáveis.', ST_PRESERVE: 'Depende de Intimidate/copiar habilidades.',
    CR_DEVOTION: 'Requer outro personagem para transferir dano.', PR_BENEDICTIO: 'Requer dois Noviços e células de mapa.', HP_BASILICA: 'Requer área protegida e interação com vários personagens.', PA_GOSPEL: 'Requer efeitos aleatórios de grupo.', MO_KITRANSLATION: 'Requer outro personagem para transferir esferas.', PF_SOULCHANGE: 'Requer SP de outro personagem; monstros não têm SP no catálogo.', PF_SOULBURN: 'Requer SP do alvo; monstros não têm SP no catálogo.', HT_SHOCKWAVE: 'Requer SP do alvo; monstros não têm SP no catálogo.',
    SA_ABRACADABRA: 'Requer seleção aleatória de habilidades especiais e transformações.', SA_LANDPROTECTOR: 'Requer células de mapa e cancelamento de campos.', SA_CASTCANCEL: 'Requer cancelar uma conjuração em curso.', SA_MAGICROD: 'Requer magias conjuradas por inimigos.', SA_SPELLBREAKER: 'Requer magias conjuradas por inimigos.', SA_FREECAST: 'Movimentação durante conjuração exige coordenadas de mapa.',
    SA_ADVANCEDBOOK: 'Requer armas do tipo Livro, ainda ausentes dos equipamentos utilizáveis.', SA_AUTOSPELL: 'Requer seleção de uma magia aprendida e invocação automática com chance e nível próprios.', PF_DOUBLECASTING: 'Requer uma segunda invocação de Lanças acionada por chance, ainda não executada.', PF_MEMORIZE: 'Requer três cargas que reduzem a conjuração e são consumidas individualmente.', PF_FOGWALL: 'Requer penalidades específicas de ataques à distância e falha de habilidades inimigas.', PF_SPIDERWEB: 'Requer imobilização ligada a uma unidade de solo e consumo da teia por dano de Fogo.',
    AM_CP_WEAPON: 'Proteção contra quebra e remoção exige estado de equipamento quebrado ou removido do personagem.', AM_CP_SHIELD: 'Proteção contra quebra e remoção exige estado de equipamento quebrado ou removido do personagem.', AM_CP_ARMOR: 'Proteção contra quebra e remoção exige estado de equipamento quebrado ou removido do personagem.', AM_CP_HELM: 'Proteção contra quebra e remoção exige estado de equipamento quebrado ou removido do personagem.', CR_FULLPROTECTION: 'Proteção completa exige estado de equipamento quebrado ou removido do personagem.',
    RG_SNATCHER: 'Requer tentativa de Furto acionada automaticamente por ataques normais.', RG_STRIPSHIELD: 'Redução de DEF por remoção de escudo ainda não foi ativada no despacho de habilidades.', ST_FULLSTRIP: 'Requer uma tentativa conjunta de quatro remoções e a chance própria de Desarmar Total.',
    CG_MARIONETTE: 'Requer outro personagem para transferir atributos.', CG_MOONLIT: 'Requer parceiro e interação espacial de grupo.', CG_LONGINGFREEDOM: 'Requer parceiro durante dueto.', CG_HERMODE: 'Requer guilda e área de combate entre personagens.', CG_TAROTCARD: 'Requer baralho aleatório com efeitos de combate entre personagens.',
    WZ_ICEWALL: 'Requer edição de células bloqueadas do mapa.', HW_GANBANTEIN: 'Requer remoção de unidades de habilidades em células do mapa.',
    WZ_SIGHTBLASTER: 'Requer carga que detona ao contato com um inimigo.', AL_RUWACH: 'Requer aura que revela alvos e causa dano ao contato.',
    AS_POISONREACT: 'Requer contra-ataques condicionados a golpes recebidos.', AS_SPLASHER: 'Requer bomba que detona após um intervalo e divide o dano entre alvos.',
    KN_BRANDISHSPEAR: 'Requer montaria ativa e distribuição de dano em células direcionais.', LK_JOINTBEAT: 'Requer seleção aleatória de partes do corpo com penalidades distintas.',
    SA_FROSTWEAPON: 'A falha pode quebrar a arma; o estado de arma quebrada e o reparo ainda não existem.', SA_SEISMICWEAPON: 'A falha pode quebrar a arma; o estado de arma quebrada e o reparo ainda não existem.', SA_FLAMELAUNCHER: 'A falha pode quebrar a arma; o estado de arma quebrada e o reparo ainda não existem.', SA_LIGHTNINGLOADER: 'A falha pode quebrar a arma; o estado de arma quebrada e o reparo ainda não existem.',
    AM_POTIONPITCHER: 'Requer cura específica do item lançado e seus modificadores.', CR_SLIMPITCHER: 'Requer cura específica da poção compacta e seus modificadores.',
    SM_PROVOKE: 'Requer modificadores de ATK e DEF aplicados ao inimigo.', AL_DECAGI: 'Requer chance e penalidades de AGI e movimento específicas do alvo.',
    PR_LEXDIVINA: 'Requer conjuração inimiga para aplicar Silêncio.', PR_LEXAETERNA: 'Requer duplicar e consumir o dano do próximo golpe no alvo.',
};
const townPatterns = /^(BS_(IRON|STEEL|ENCHANTEDSTONE|ORIDEOCON|DAGGER|SWORD|TWOHANDSWORD|AXE|MACE|KNUCKLE|SPEAR|REPAIRWEAPON|FINDINGORE)|AM_(PHARMACY|CANNIBALIZE|SPHEREMINE|BIOETHICS|CALLHOMUN|REST|RESURRECTHOMUN|TWILIGHT\d)|CR_CULTIVATION|ASC_CDP|SA_CREATECON|AC_MAKINGARROW|WS_WEAPONREFINE|TF_PICKSTONE|HT_(REMOVETRAP|SPRINGTRAP|TALKIEBOX)|BD_)/;
const descriptions = rules.skillDescriptions ?? {};
const statusChances = { MG_FROSTDIVER: l => 35 + 3 * l, WZ_FROSTNOVA: l => 35 + 3 * l, MG_STONECURSE: l => 20 + 4 * l, WZ_METEOR: l => 3 * l, WZ_VERMILION: l => 4 * l, HW_NAPALMVULCAN: () => 5, TF_POISON: l => 10 + 4 * l, AS_SONICBLOW: l => 10 + 2 * l, BA_FROSTJOKE: l => 15 + 5 * l, DC_SCREAM: l => 25 + 5 * l, BS_HAMMERFALL: l => 20 + 10 * l, HT_LANDMINE: l => 30 + 5 * l, HT_FREEZINGTRAP: l => 35 + 3 * l, SA_FROSTWEAPON: l => Math.min(100, 60 + 10 * l), SA_SEISMICWEAPON: l => Math.min(100, 60 + 10 * l), SA_FLAMELAUNCHER: l => Math.min(100, 60 + 10 * l), SA_LIGHTNINGLOADER: l => Math.min(100, 60 + 10 * l) };
for (const name of skillNames) {
    const src = skillByName[name];
    if (!src) throw new Error('Missing source skill ' + name);
    const rule = rules.skills.find(s => s.source === name);
    const maxLevel = Math.min(src.MaxLevel, Math.max(...Object.values(treeByClass).map(tree => typeof tree[name] === 'number' ? tree[name] : tree[name]?.MaxLevel ?? 0)));
    const prerequisitesByClass = Object.fromEntries(Object.entries(treeByClass).filter(([, tree]) => tree[name]).map(([job, tree]) => [job, Object.entries(typeof tree[name] === 'number' ? {} : tree[name]).filter(([key]) => !['MaxLevel', 'MinJobLevel'].includes(key)).map(([key, level]) => ({ skillId: skillId(key), level }))]));
    const targetType = !src.SkillType ? 'passive' : src.SkillType.Place ? 'ground' : src.SkillType.Enemy ? 'enemy' : src.SkillType.Self ? 'self' : 'support';
    let kind = targetType === 'passive' ? 'passive' : healSkills.has(name) ? 'heal' : ['TF_STEAL', 'RG_STEALCOIN'].includes(name) ? 'steal' : magicRatios[name] ? 'magical' : weaponRatios[name] || miscSkills.has(name) ? 'physical' : 'buff';
    let damageType = magicRatios[name] ? 'magic' : weaponRatios[name] ? 'weapon' : miscSkills.has(name) ? 'misc' : 'none';
    const supportedMechanic = magicRatios[name] || weaponRatios[name] || miscSkills.has(name) || effectSkills.has(name) || passiveSkills.has(name) || activeSpecial.has(name) || ['NV_FIRSTAID', 'AL_HEAL', 'PR_SANCTUARY'].includes(name);
    const unsupportedReason = unsupported[name] ?? (src.SkillInfo?.Spirit ? 'Requer estado de Espírito da classe, ainda não implementado.' : townPatterns.test(name) ? 'Requer produção, objetos persistentes, parceiros ou edição de células do mapa.' : !supportedMechanic ? 'Mecânica Hercules importada; a simulação atual ainda não executa este efeito.' : undefined);
    const implementation = unsupportedReason ? 'unsupported' : 'supported';
    if (name === 'PF_SOULBURN') damageType = 'none';
    const rawHits = byLevel(src.NumberOfHits, maxLevel, 1);
    const hitCount = rawHits.map(Math.abs);
    const itemCostByLevel = Array.from({ length: maxLevel }, (_, i) => Object.entries(src.Requirements?.Items ?? {}).flatMap(([itemName, amount]) => { const item = itemByName[itemName]; if (!item) throw new Error('Missing reagent: ' + itemName); const quantity = byLevel(amount, maxLevel)[i]; return quantity > 0 ? [{ itemId: item.Id, quantity }] : []; }));
    const power = Array.from({ length: maxLevel }, (_, i) => (magicRatios[name] ?? weaponRatios[name] ?? (name === 'NV_FIRSTAID' ? () => 5 : name === 'PR_SANCTUARY' ? l => l > 6 ? 777 : 100 * l : () => 0))(i + 1));
    const inheritedEffect = name === 'AC_OWL' ? { dex: 1 } : name === 'TF_MISS' ? { flee: 3 } : undefined;
    // A negative SplashRange selects the default AREA_SIZE (14). Negative
    // Unit.Layout values instead select special cell layouts and are not radii.
    const radius = byLevel(src.SplashRange ?? src.Unit?.Layout ?? src.Unit?.Range, maxLevel).map(n => src.SplashRange !== undefined && n < 0 ? 14 : Math.max(0, n));
    const duration = byLevel(src.SkillData1, maxLevel);
    const statusEffect = src.StatusChange ?? (name === 'BS_HAMMERFALL' ? 'SC_STUN' : undefined);
    const draining = ['BS_MAXIMIZE', 'TF_HIDING', 'AS_CLOAKING'].includes(name);
    const spDrainIntervalMs = name === 'TF_HIDING' ? Array.from({ length: maxLevel }, (_, i) => (i + 4) * 1000) : duration;
    const weaponRequirements = Object.keys(src.Requirements?.WeaponTypes ?? {}).filter(k => src.Requirements.WeaponTypes[k]);
    const requiredWeapon = [...new Set(weaponRequirements.map(k => ({ Daggers: 'dagger', '1HSwords': 'sword', '2HSwords': 'sword', '1HSpears': 'spear', '2HSpears': 'spear', '1HAxes': 'axe', '2HAxes': 'axe', Maces: 'mace', '2HMaces': 'mace', Staves: 'staff', '2HStaves': 'staff', Bows: 'bow', Katars: 'katar', Instruments: 'instrument', Whips: 'whip' })[k]).filter(Boolean))];
    const onlyTwoHanded = weaponRequirements.length && weaponRequirements.every(k => ['2HSwords', '2HSpears', '2HAxes', '2HMaces', '2HStaves'].includes(k));
    catalog.skills[skillId(name)] = {
        id: skillId(name), name: rule?.name ?? rules.skillNames?.[name] ?? src.Description, kind, maxLevel,
        herculesId: src.Id, sourceName: name, mechanic: name, implementation, ...(unsupportedReason && { unsupportedReason }),
        description: descriptions[name] ?? `${src.Description}. ${targetType === 'passive' ? 'Habilidade passiva.' : damageType === 'magic' ? 'Dano mágico conforme Hercules pré-renovação.' : damageType === 'weapon' ? 'Dano de arma conforme Hercules pré-renovação.' : damageType === 'misc' ? 'Fórmula específica de dano conforme Hercules pré-renovação.' : src.StatusChange ? 'Aplica ' + src.StatusChange.replace('SC_', '') + '.' : 'Habilidade utilitária.'}${unsupportedReason ? ' ' + unsupportedReason : ''}`,
        iconResource: 'data/texture/유저인터페이스/item/' + src.Name.toLowerCase() + '.bmp',
        spCost: byLevel(src.Requirements?.SPCost, maxLevel), power, cooldownMs: byLevel(src.CoolDown, maxLevel)[0],
        castTimeMs: byLevel(src.CastTime, maxLevel), afterCastDelayMs: byLevel(src.AfterCastActDelay, maxLevel),
        interruptCast: src.InterruptCast === true,
        ...(src.CastDefRate !== undefined && { castDefenseReductionPct: src.CastDefRate }),
        hitCount, sourceHitCount: rawHits, aoeRadius: radius, range: byLevel(src.Range, maxLevel), targetType, damageType,
        ...(src.SkillInfo?.RangeModByVulture && { rangeBonusByVulture: true }),
        prerequisites: Object.values(prerequisitesByClass)[0] ?? [], prerequisitesByClass,
        minimumJobLevel: Math.max(1, ...Object.values(treeByClass).map(tree => tree[name]?.MinJobLevel ?? 0)),
        ...(src.Element && { element: src.Element.replace('Ele_', '').toLowerCase() }),
        ...(src.CastTimeOptions?.IgnoreDex && { ignoresDex: true }),
        ...(src.DamageType?.SplitDamage && { splitDamage: true }), ...(src.DamageType?.IgnoreDefense && { ignoreDefense: true }),
        ...(src.DamageType?.IgnoreElement && { ignoreElement: true }),
        ...(src.DamageType?.IgnoreFlee && { ignoreFlee: true }),
        ...(statusEffect && { statusEffect, statusDurationMs: byLevel(src.SkillData2 ?? src.SkillData1, maxLevel) }),
        ...(statusChances[name] && { statusChance: Array.from({ length: maxLevel }, (_, i) => statusChances[name](i + 1)) }),
        ...(src.Unit && { groundDurationMs: duration, groundIntervalMs: src.Unit.Interval ?? 1000 }),
        ...(oneShotTraps.has(name) && { groundHitLimit: 1 }),
        ...(['BA_FROSTJOKE', 'DC_SCREAM'].includes(name) && { effectDelayMs: 2000 }),
        ...(draining && { spDrainIntervalMs, spDrainAmount: 1, toggle: true }),
        ...(duration[0] > 0 && { durationMs: duration[0] }),
        ...(src.Requirements?.ZenyCost && { zenyCost: byLevel(src.Requirements.ZenyCost, maxLevel) }),
        ...(itemCostByLevel.some(cost => cost.length) && { itemCostByLevel }),
        ...(requiredWeapon.length && !weaponRequirements.includes('NoWeapon') && { requiredWeapon }),
        ...(onlyTwoHanded && { requiredTwoHanded: true }),
        ...(src.Requirements?.State && { requiredState: src.Requirements.State }),
        ...(src.Requirements?.HPCost && { hpCost: byLevel(src.Requirements.HPCost, maxLevel) }),
        ...(src.Requirements?.HPRateCost && { hpCostPercent: typeof src.Requirements.HPRateCost === 'number' ? src.Requirements.HPRateCost : byLevel(src.Requirements.HPRateCost, maxLevel)[0] }),
        ...(src.Requirements?.SpiritSphereCost && { sphereCost: byLevel(src.Requirements.SpiritSphereCost, maxLevel) }),
        ...(rule?.requiredSlot && { requiredSlot: rule.requiredSlot }),
        ...(inheritedEffect && { effects: inheritedEffect }),
    };
    manifest.skillSources[skillId(name)] = { id: src.Id, name, sourceMaxLevel: src.MaxLevel, sourceRequirements: src.Requirements ?? {}, sourceDamageType: src.DamageType ?? {}, sourceUnit: src.Unit ?? {}, sourceHitCount: rawHits, sourceSplashRange: src.SplashRange ?? 0, implementation, ...(unsupportedReason && { unsupportedReason }), ratioSource: magicRatios[name] || weaponRatios[name] ? 'src/map/battle.c:battle_calc_skillratio (pre-renewal branches)' : miscSkills.has(name) ? 'src/map/battle.c:battle_calc_misc_attack / battle_calc_weapon_attack' : 'src/map/skill.c and src/map/status.c', unsupportedRequirements: Object.keys(src.Requirements ?? {}).filter(k => !['SPCost', 'ZenyCost', 'Items', 'WeaponTypes', 'State', 'HPCost', 'HPRateCost', 'SpiritSphereCost'].includes(k)) };
}
manifest.skillCoverage = { classes: rules.classes.length, skills: skillNames.length, supported: Object.values(catalog.skills).filter(s => s.implementation === 'supported').length, unsupported: Object.values(catalog.skills).filter(s => s.implementation === 'unsupported').length };
manifest.skillCoverage.byClass = Object.fromEntries(Object.values(catalog.classes).map(job => [job.id, { sourceTree: job.skills.length, supported: job.skills.filter(id => catalog.skills[id].implementation === 'supported').length, unsupported: job.skills.filter(id => catalog.skills[id].implementation === 'unsupported').length }]));
manifest.skillCoverage.supportedSourceNames = Object.values(catalog.skills).filter(s => s.implementation === 'supported').map(s => s.sourceName);
manifest.skillCoverage.unavailable = Object.values(catalog.skills).filter(s => s.implementation === 'unsupported').map(s => ({ skillId: s.id, sourceName: s.sourceName, reason: s.unsupportedReason }));
manifest.skillCoverage.combatExpansion = ['AM_LEARNINGPOTION', 'BS_SKINTEMPER', 'BS_WEAPONPERFECT', 'BS_MAXIMIZE', 'SA_DRAGONOLOGY', 'AL_DP', 'PR_ASPERSIO', 'RG_STRIPWEAPON', 'RG_STRIPARMOR', 'RG_STRIPHELM', 'PF_HPCONVERSION', ...oneShotTraps];
manifest.formulaEvidence = {
    magic: ['battle.c:1650..1714 skill ratios', 'battle.c:4166 MATK splash split', 'battle.c:1562 hard and soft MDEF', 'battle.c:4310 positive/negative division fix'],
    weapon: ['battle.c:5822 pre-renewal division before defense', 'battle.c:6087 Weaponry Research after defense', 'battle.c:6075 mastery after defense', 'battle.c:6124 spirit spheres', 'battle.c:5436 weapon weight *8/100 = 80% displayed weight'],
    cast: ['skill.c:17509 DEX/150', 'skill_db.conf CastTimeOptions.IgnoreDex', 'skill.c:22789..22813 InterruptCast default false', 'status.c:6386 hard DEF -= trunc(hard DEF * CastDefRate / 100); Grand Cross and Meteor Assault CastDefRate 33'],
    stats: ['status.c:3763..3769 base motion AGI/DEX', 'db/job_db2.txt cumulative job bonuses', 'job_db.conf BaseASPD and Weight'],
    recovery: ['status.c:2733..2737 skill HP/SP recovery', 'skill.c:2805..2815 Soul Drain', 'skill.c:1169 Sanctuary'],
    potions: ['pc.c:8722..8724 item HP modifiers', 'pc.c:8761..8763 item SP modifiers', 'pc.c:5% per AM_LEARNINGPOTION level'],
    additionalPassives: ['status.c:1894 Dragonology INT', 'status.c:2219..2238 Skin Tempering and Dragonology element/race bonuses', 'battle.c:1493..1500 Divine Protection monster soft defense'],
    additionalActions: ['skill.c:8570..8587 strip chance and duration', 'status.c:7981..7995 strip monster stat modifiers', 'skill.c:9228 HP Conversion', 'status.c:6128..6144 weapon enchantment precedence'],
    traps: ['battle.c:4400..4410 classic mine damage', 'battle.c:4650 splash division before element', 'skill.c:18925 pre-renewal Freezing Trap weapon attack', 'skill_db.conf Unit and SkillData1 arm duration'],
    statusAndDrain: ['skill.c:1865..1873 Frost Joke/Scream base chance', 'skill.c:8252 delayed effect after 2000 ms', 'status.c:7891 Maximize duration becomes drain interval', 'status.c:8286 Cloaking infinite duration and drain interval', 'status.c:8269..8273 and 12408 Hiding remaining-second drain'],
    range: ['battle.c:7685 player circular/client and monster square range', 'path.c:494..505 floor(max(0,sqrt(dx*dx+dy*dy)-0.0625)) client range', 'skill.c:1096..1115 negative skill range absolute under default skillrange_from_weapon=BL_NUL; RangeModByVulture', 'mob_db.conf AttackRange', 'item_db.conf Range'],
};
const slotFromLoc = loc => { if (Array.isArray(loc))
    loc = loc.join('|'); return /EQP_ARMS|EQP_WEAPON/.test(loc ?? '') ? 'weapon' : /EQP_ARMOR/.test(loc ?? '') ? 'armor' : /EQP_SHIELD/.test(loc ?? '') ? 'shield' : /EQP_HEAD/.test(loc ?? '') ? 'head' : /EQP_GARMENT/.test(loc ?? '') ? 'garment' : /EQP_SHOES/.test(loc ?? '') ? 'shoes' : /EQP_ACC/.test(loc ?? '') ? 'accessory' : undefined; };
const weaponTypes = { W_DAGGER: 'dagger', W_1HSWORD: 'sword', W_2HSWORD: 'sword', W_1HSPEAR: 'spear', W_2HSPEAR: 'spear', W_1HAXE: 'axe', W_2HAXE: 'axe', W_MACE: 'mace', W_2HMACE: 'mace', W_STAFF: 'staff', W_2HSTAFF: 'staff', W_BOW: 'bow', W_KATAR: 'katar', W_MUSICAL: 'instrument', W_WHIP: 'whip' };
function includeItem(raw, shop = false, drop = false) {
    const i = inheritedItem(raw);
    if (catalog.items[i.Id]) {
        if (shop)
            catalog.items[i.Id].shop = true;
        return true;
    }
    let type = 'loot', slot = slotFromLoc(i.Loc), weaponType = weaponTypes[i.Subtype], unsupportedEffect = false;
    if (i.Type === 'IT_CARD') {
        type = 'card';
        if (!rules.cards[i.Id]) {
            if (!drop) return false;
            unsupportedEffect = true;
        }
    }
    else if (i.Type === 'IT_HEALING' || i.Type === 'IT_USABLE' || i.Type === 'IT_DELAYCONSUME') {
        if (rules.heal[i.Id] || i.Id === 611) type = 'consumable';
        else {
            if (!drop) return false;
            unsupportedEffect = true;
        }
    }
    else if (i.Type === 'IT_WEAPON' || i.Type === 'IT_ARMOR') {
        type = 'equipment';
        unsupportedEffect = !!i.Script && !rules.itemEffects[i.Id];
    }
    else if ([984, 985, 990, 717, 7136].includes(i.Id))
        type = 'material';
    else if (drop && i.Type && i.Type !== 'IT_ETC')
        unsupportedEffect = true;
    const allowedClasses = Object.values(catalog.classes).filter(j => { const rule = rules.classes.find(r => r.id === j.id); const origin = rule.rebirthOf ? rules.classes.find(r => r.id === rule.rebirthOf)?.source : rule.source; const sourceJob = origin === 'Dancer' ? 'Bard' : origin; return (!i.Job || (i.Job[sourceJob] ?? i.Job.All ?? false)) && (!weaponType || j.weapons.includes(weaponType)); }).map(j => j.id);
    const resource = resources[i.Id];
    if (!resource) {
        if (!drop) throw new Error('No client icon resource for item ' + i.Id);
        manifest.missingItemResources.push({ itemId: i.Id, aegisName: i.AegisName });
    }
    const buyPrice = i.Buy ?? (i.Sell ?? 0) * 2;
    const sellPrice = i.Sell ?? Math.floor(buyPrice / 2);
    catalog.items[i.Id] = { id: i.Id, name: i.Name, aegisName: i.AegisName, type, ...type === 'equipment' && { slot, weaponType, twoHanded: i.Loc === 'EQP_ARMS', refinable: slot !== 'accessory' && i.Refine !== false }, attack: i.Atk ?? 0, def: i.Def ?? 0, slots: i.Slots ?? 0, minLevel: typeof i.EquipLv === 'number' ? i.EquipLv : 1, allowedClasses, buyPrice, sellPrice, weight: (i.Weight ?? 0) / 10, resource: resource ? 'data/texture/유저인터페이스/item/' + resource + '.bmp' : '', effects: unsupportedEffect ? {} : rules.cards[i.Id] ?? rules.itemEffects[i.Id] ?? {}, ...type === 'card' && !unsupportedEffect && slot && { cardSlots: [slot] }, ...type === 'consumable' && rules.heal[i.Id] && { healHP: rules.heal[i.Id][0], healSP: rules.heal[i.Id][1] }, ...unsupportedEffect && { unsupportedEffect: true }, shop };
    if (type === 'equipment') {
        catalog.items[i.Id].equipSupported = !!slot && (i.Type !== 'IT_WEAPON' || !!weaponType) && (!i.Job || allowedClasses.length > 0);
        catalog.items[i.Id].refinable = catalog.items[i.Id].equipSupported && slot !== 'accessory' && i.Refine !== false;
    }
    if (i.Type === 'IT_WEAPON') {
        catalog.items[i.Id].weaponLevel = i.WeaponLv ?? 1;
        catalog.items[i.Id].attackRange = i.Range ?? 0;
    }
    if (unsupportedEffect) manifest.inertDropItems.push({ itemId: i.Id, aegisName: i.AegisName, sourceType: i.Type });
    return true;
}
for (const id of rules.shop) {
    if (!itemById[id] || !includeItem(itemById[id], true))
        throw new Error('Unsupported shop item ' + id);
}
for (const id of rules.catalogItems ?? []) {
    if (!itemById[id] || !includeItem(itemById[id]))
        throw new Error('Unsupported catalog item ' + id);
}
for (const id of Object.keys(rules.cards))
    includeItem(itemById[id]);
// Every referenced reagent remains a real source item. Unsupported usable
// scripts stay inert; presence in a skill cost never enables a script.
for (const id of new Set(Object.values(catalog.skills).flatMap(s => (s.itemCostByLevel ?? []).flat().map(cost => cost.itemId))))
    includeItem(itemById[id], false, true);
const challengeOverrides = new Map(rules.bosses.map(b => [b.monsterId, b]));
const miniBossIds = new Set(rules.miniBossMonsterIds);
const excludedMvpPrefixes = rules.excludedMvpSpritePrefixes ?? [];
const isMvpMonster = m => ((m.MvpExp ?? 0) > 0 || Object.keys(m.MvpDrops ?? {}).length > 0) &&
    !excludedMvpPrefixes.some(prefix => m.SpriteName.startsWith(prefix));
const monsterById = Object.fromEntries(parsed['mob_db.conf'].mob_db.map(m => [m.Id, m]));
const challengeMonsterRows = [...new Map([
    ...parsed['mob_db.conf'].mob_db.filter(isMvpMonster).map(m => [m.Id, m]),
    ...[...miniBossIds].map(id => {
        const monster = monsterById[id];
        if (!monster)
            throw new Error('Missing mini-boss monster ' + id);
        return [id, monster];
    }),
]).values()].sort((a, b) => a.Id - b.Id);
const monsterIds = [...new Set([
    ...rules.areas.flatMap(a => a.monsters),
    ...challengeMonsterRows.map(m => m.Id),
])];
function sourceDropRates(rate) {
    if (typeof rate === 'number') return [rate];
    if (Array.isArray(rate) && rate.length === 2 && typeof rate[0] === 'number' && typeof rate[1] === 'string') return [rate[0]];
    if (Array.isArray(rate)) return rate.flatMap(sourceDropRates);
    throw new Error('Unsupported Hercules drop rate: ' + JSON.stringify(rate));
}
function exportDrops(entries, monsterId) {
    const drops = [];
    for (const [name, rate] of Object.entries(entries ?? {})) {
        const item = itemByName[name];
        if (!item) throw new Error(`Missing Hercules item ${name} dropped by monster ${monsterId}`);
        includeItem(item, false, true);
        for (const chance of sourceDropRates(rate)) {
            if (!Number.isSafeInteger(chance) || chance < 0 || chance > 10000)
                throw new Error(`Invalid Hercules drop chance ${chance} for ${name}`);
            drops.push({ itemId: item.Id, chance });
        }
    }
    return drops;
}
for (const id of monsterIds) {
    const m = parsed['mob_db.conf'].mob_db.find(m => m.Id === id);
    if (!m)
        throw new Error('Missing monster ' + id);
    const spriteName = rules.monsterAliases[id] ?? m.SpriteName.toLowerCase();
    const path = 'data/sprite/몬스터/' + spriteName;
    const drops = exportDrops(m.Drops, id);
    const mvpDrops = exportDrops(m.MvpDrops, id);
    catalog.monsters[id] = { id, name: rules.monsterNameAliases?.[id] ?? m.Name, aegisName: m.SpriteName, sprite: { spr: path + '.spr', act: path + '.act' }, level: m.Lv ?? 1, hp: m.Hp ?? 1, attack: m.Attack ?? [0, 0], def: m.Def ?? 0, mdef: m.Mdef ?? 0, boss: m.Mode?.Boss === true, detector: m.Mode?.Detector === true, aggressive: m.Mode?.Aggressive === true, canMove: m.Mode?.CanMove === true, moveSpeedMs: m.MoveSpeed ?? 200, viewRange: m.ViewRange ?? 10, chaseRange: m.ChaseRange ?? 12, stats: Object.fromEntries(['Str', 'Agi', 'Vit', 'Int', 'Dex', 'Luk'].map(s => [s.toLowerCase(), m.Stats?.[s] ?? 0])), baseExp: m.Exp ?? 0, jobExp: m.JExp ?? 0, attackDelay: m.AttackDelay ?? 4000, ...(Number.isFinite(m.AttackMotion) ? { attackMotionMs: m.AttackMotion } : {}), ...(Number.isFinite(m.DamageMotion) ? { damageMotionMs: m.DamageMotion } : {}), attackRange: m.AttackRange ?? 1, element: (m.Element?.[0] ?? 'Ele_Neutral').replace('Ele_', '').toLowerCase(), elementLevel: m.Element?.[1] ?? 1, size: (m.Size ?? 'Size_Small').replace('Size_', '').toLowerCase(), race: (m.Race ?? 'RC_Formless').replace('RC_', '').toLowerCase(), drops, ...(mvpDrops.length ? { mvpDrops } : {}) };
}
manifest.monsterBehavior = {
    source: 'db/pre-re/mob_db.conf:Mode',
    movementSource: 'db/pre-re/mob_db.conf:MoveSpeed/ViewRange/ChaseRange/Mode.CanMove',
    aggressiveDefault: false,
    aggressiveMonsterIds: Object.values(catalog.monsters).filter(m => m.aggressive).map(m => m.id),
    passiveMonsterIds: Object.values(catalog.monsters).filter(m => !m.aggressive).map(m => m.id),
    detectorMonsterIds: Object.values(catalog.monsters).filter(m => m.detector).map(m => m.id),
};
const exp = parsed['exp_group_db.conf'];
catalog.exp.base = [0, ...exp.base_exp_group_db.FirstClasses.Exp, 0];
for (const [name, g] of Object.entries(exp.job_exp_group_db))
    catalog.exp.job[name] = [0, ...g.Exp, 0];
catalog.exp.baseTrans = [0, ...exp.base_exp_group_db.TranscendedClasses.Exp, 0];
for (const [defender, levels] of Object.entries(parsed['attr_fix.conf']))
    for (const [level, attackers] of Object.entries(levels))
        for (const [attacker, value] of Object.entries(attackers)) {
            const atk = attacker.replace('Ele_', '').toLowerCase(), def = defender.replace('Ele_', '').toLowerCase();
            catalog.elementModifiers[atk] ??= {};
            catalog.elementModifiers[atk][def] ??= [];
            catalog.elementModifiers[atk][def][Number(level.slice(2)) - 1] = value;
        }
const sizeRows = buffers['size_fix.txt'].toString('utf8').split(/\r?\n/).map(l => l.split('//')[0].trim()).filter(Boolean).map(l => l.split(',').map(Number));
for (const [weapon, col] of Object.entries({ dagger: 1, sword: 2, spear: 4, axe: 6, mace: 8, staff: 10, bow: 11, instrument: 13, whip: 14, katar: 16 }))
    catalog.sizeModifiers[weapon] = Object.fromEntries(['small', 'medium', 'large'].map((s, i) => [s, sizeRows[i][col]]));
const reward = (zeny, baseExp, jobExp, items = []) => ({ zeny, baseExp, jobExp, items });
catalog.quests = [{ id: 'first_hunt', name: 'Primeira caçada', description: 'Derrote 10 Porings.', kind: 'kills', target: 1002, amount: 10, reward: reward(200, 50, 30, [{ itemId: 501, quantity: 10 }]) }, { id: 'base_10', name: 'Rumo à aventura', description: 'Alcance Base 10.', kind: 'baseLevel', target: 10, amount: 10, reward: reward(500, 0, 0, [{ itemId: 505, quantity: 5 }]) }, { id: 'job_10', name: 'Profissão', description: 'Alcance Job 10.', kind: 'jobLevel', target: 10, amount: 10, reward: reward(500, 0, 0) }, { id: 'payon', name: 'Além dos campos', description: 'Visite a caverna de Payon.', kind: 'area', target: 'payon_cave', amount: 1, reward: reward(1200, 1000, 500) }, { id: 'base_40', name: 'Veterano', description: 'Alcance Base 40.', kind: 'baseLevel', target: 40, amount: 40, reward: reward(5000, 0, 0, [{ itemId: 984, quantity: 3 }, { itemId: 985, quantity: 3 }]) }, { id: 'refine_4', name: 'Artesão', description: 'Obtenha um equipamento +4.', kind: 'refine', target: 4, amount: 4, reward: reward(3000, 0, 0) }, { id: 'mastering_win', name: 'O rei dos Porings', description: 'Vença o desafio Mastering.', kind: 'challenge', target: 'mastering', amount: 1, reward: reward(2000, 0, 0) }, { id: 'base_99', name: 'Lenda de Rune-Midgard', description: 'Alcance Base 99.', kind: 'baseLevel', target: 99, amount: 99, reward: reward(50000, 0, 0) }];
const challengeNameCounts = new Map();
for (const monster of challengeMonsterRows)
    challengeNameCounts.set(monster.Name, (challengeNameCounts.get(monster.Name) ?? 0) + 1);
catalog.challenges = challengeMonsterRows.map(m => {
    const isMvp = isMvpMonster(m);
    const override = challengeOverrides.get(m.Id);
    const tier = Math.max(1, Math.ceil((m.Lv ?? 1) / 25));
    const quantity = Math.min(3, Math.ceil(tier / 2));
    const firstReward = override?.firstReward ?? reward(
        tier * (isMvp ? 4000 : 1000),
        tier * (isMvp ? 1500 : 400),
        tier * (isMvp ? 750 : 200),
        [{ itemId: 984, quantity }, { itemId: 985, quantity }],
    );
    const estimatedFightMs = Math.ceil((m.Hp ?? 1) / 500) * 1000;
    return {
        id: override?.id ?? `${isMvp ? 'mvp' : 'miniboss'}_${m.Id}`,
        name: override?.name ?? (challengeNameCounts.get(m.Name) > 1 ? `${m.Name} · variante ${m.Id}` : m.Name),
        monsterId: m.Id,
        category: isMvp ? 'mvp' : 'miniboss',
        minLevel: override?.minLevel ?? Math.max(isMvp ? 40 : 10, Math.min(99, (m.Lv ?? 1) - (isMvp ? 15 : 8))),
        cooldownMs: 3600000,
        timeoutMs: override?.timeoutMs ?? (isMvp ? Math.max(600000, Math.min(21600000, estimatedFightMs)) : 600000),
        firstReward,
    };
});
manifest.hpSpModifierSource = { path: 'src/map/status.c', url: 'https://github.com/HerculesWS/Hercules/blob/' + rules.commit + '/src/map/status.c', functions: ['status_get_base_maxhp', 'status_get_base_maxsp'], modifier: 'JOBL_UPPER: floor(base * 1.25)', sha256: rules.referenceHashes.statusC };
manifest.rulesSha256 = sha(await readFile(resolve(root, 'content/rules.json')));
manifest.spriteMappingSource = { url: 'https://github.com/MrAntares/roBrowserLegacy/blob/d88a3cd4acde0582530e3fc1908532a92e9accea/src/DB/Jobs/JobNameTable.js', license: 'GPL-3.0-or-later', sha256: rules.referenceHashes.jobNameTable };
catalog.source.hash = sha(JSON.stringify(catalog));
const text = JSON.stringify(catalog, null, 2) + '\n';
manifest.catalogSha256 = sha(text);
manifest.hashConvention = 'Catalog.source.hash = SHA256 of compact catalog with source.hash empty. catalogSha256 hashes emitted file bytes.';
const output = arg('--output') ? resolve(arg('--output')) : resolve(root, 'content/catalog.json');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, text);
await writeFile(resolve(dirname(output), 'source-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Exported ${Object.keys(catalog.monsters).length} monsters, ${Object.keys(catalog.items).length} items, ${Object.keys(catalog.classes).length} classes, ${Object.keys(catalog.skills).length} skills. SHA256 ${manifest.catalogSha256}`);
