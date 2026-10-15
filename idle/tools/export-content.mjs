#!/usr/bin/env node
/** Reproducible selected Hercules catalog. GPL-3.0-or-later. Never evaluates scripts. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseTeleportMapFlags } from './teleport-mapflags.mjs';
import { orderedConfigEntries, parseConfig, resolveInheritance } from './libconfig.mjs';
import { staticDefenseElement } from './itemDefenseElement.mjs';
import { parseMapSpawnScript, validateMapSpawnSelections } from './mapSpawns.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rules = JSON.parse(await readFile(resolve(root, 'content/rules.json'), 'utf8'));
const sha = b => createHash('sha256').update(b).digest('hex');
const args = process.argv.slice(2);
const arg = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const source = arg('--source');
const files = ['mob_skill_db.conf', 'mob_db.conf', 'item_db.conf', 'job_db.conf', 'exp_group_db.conf', 'skill_db.conf', 'skill_tree.conf', 'attr_fix.conf', 'size_fix.txt', 'autospell_db.conf', 'unit_parameters_db.conf'];
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
const mapSpawnMonsterIds = new Map();
const repairPath = 'npc/merchants/refine.txt';
const repairUrl = `https://raw.githubusercontent.com/HerculesWS/Hercules/${rules.commit}/${repairPath}`;
const repairBuffer = source ? await readFile(resolve(source, repairPath)) : Buffer.from(await (await fetch(repairUrl)).arrayBuffer());
if (sha(repairBuffer) !== rules.sourceHashes[repairPath]) throw new Error('Pinned source hash mismatch: ' + repairPath);
manifest.sources.push({ path: repairPath, url: repairUrl, sha256: sha(repairBuffer) });
const teleportFlagPath = 'npc/mapflag/noteleport.txt';
const teleportFlagUrl = `https://raw.githubusercontent.com/HerculesWS/Hercules/${rules.commit}/${teleportFlagPath}`;
const teleportFlagBuffer = source ? await readFile(resolve(source, teleportFlagPath)) : Buffer.from(await (await fetch(teleportFlagUrl)).arrayBuffer());
if (sha(teleportFlagBuffer) !== rules.sourceHashes[teleportFlagPath]) throw new Error('Pinned source hash mismatch: ' + teleportFlagPath);
const teleportBlockedMaps = parseTeleportMapFlags(teleportFlagBuffer.toString('utf8'));
if (!teleportBlockedMaps.length) throw new Error('Empty source noteleport list');
manifest.sources.push({ path: teleportFlagPath, url: teleportFlagUrl, sha256: sha(teleportFlagBuffer) });
if (!/function\s+script\s+repairmain/i.test(repairBuffer.toString('utf8')) || !/\.\@repairprice\s*=\s*5000/.test(repairBuffer.toString('utf8')))
    throw new Error('Pinned NPC repair service changed');
manifest.npcRepair = { source: 'npc/merchants/refine.txt:1145..1229', pricePerEquipment: 5000, repairs: 'all broken equipment in one NPC transaction', discount: false };
for (const path of rules.mapSpawnSources ?? []) {
    const url = `https://raw.githubusercontent.com/HerculesWS/Hercules/${rules.commit}/${path}`;
    const buffer = source ? await readFile(resolve(source, path)) : Buffer.from(await (await fetch(url)).arrayBuffer());
    if (sha(buffer) !== rules.sourceHashes[path])
        throw new Error('Pinned source hash mismatch: ' + path);
    buffers[path] = buffer;
    manifest.sources.push({ path, url, sha256: sha(buffer) });
    for (const [map, ids] of parseMapSpawnScript(buffer.toString('utf8'))) {
        const monsters = mapSpawnMonsterIds.get(map) ?? new Set();
        for (const id of ids) monsters.add(id);
        mapSpawnMonsterIds.set(map, monsters);
    }
}
validateMapSpawnSelections(rules.areas, mapSpawnMonsterIds);
manifest.mapSpawnValidation = { maps: rules.areas.map(area => area.map),
    selection: 'All selected monsters must appear on their configured map in the pinned spawn scripts; missing maps are rejected.' };
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
for (const path of ['db/job_db2.txt', 'db/pre-re/sc_config.conf', 'src/map/battle.c', 'src/map/status.c', 'src/map/skill.c', 'src/map/pc.c', 'src/map/pc.h', 'src/map/unit.c', 'src/map/mob.c', 'src/map/mob.h', 'db/produce_db.txt', 'npc/merchants/shops.txt', 'npc/merchants/alchemist.txt', 'npc/pre-re/merchants/shops.txt', 'src/map/clif.c']) {
    const url = `https://raw.githubusercontent.com/HerculesWS/Hercules/${rules.commit}/${path}`;
    const buffer = source ? await readFile(resolve(source, path)) : Buffer.from(await (await fetch(url)).arrayBuffer());
    if (sha(buffer) !== rules.sourceHashes[path]) throw new Error('Pinned source hash mismatch: ' + path);
    buffers[path] = buffer;
    manifest.sources.push({ path, url, sha256: sha(buffer) });
}
const converterRecipes=buffers['db/produce_db.txt'].toString('utf8').split(/\r?\n/).filter(line=>/^1211[4-7],/.test(line)).map(line=>{
 const [outputItemId,itemLevel,skillId,skillLevel,...material]=line.split(',').map(Number);
 const ingredients=[];for(let n=0;n<material.length;n+=2)ingredients.push({itemId:material[n],quantity:material[n+1]});
 return {outputItemId,itemLevel,skillId,skillLevel,ingredients};
});
const expectedConverters=[{outputItemId:12114,itemLevel:23,skillId:1007,skillLevel:1,ingredients:[{itemId:7433,quantity:1},{itemId:904,quantity:3}]},{outputItemId:12115,itemLevel:23,skillId:1007,skillLevel:1,ingredients:[{itemId:7433,quantity:1},{itemId:946,quantity:3}]},{outputItemId:12116,itemLevel:23,skillId:1007,skillLevel:1,ingredients:[{itemId:7433,quantity:1},{itemId:947,quantity:3}]},{outputItemId:12117,itemLevel:23,skillId:1007,skillLevel:1,ingredients:[{itemId:7433,quantity:1},{itemId:1013,quantity:3}]}];
if(JSON.stringify(converterRecipes)!==JSON.stringify(expectedConverters))throw new Error('Pinned converter recipes differ');
if(!buffers['npc/merchants/shops.txt'].toString('utf8').includes('sellitem Scroll;'))throw new Error('Pinned Blank Scroll shop absent');
manifest.converterCraft={recipeSource:'db/produce_db.txt:389..395',shopSource:'npc/merchants/shops.txt:913..916',recipes:converterRecipes,spPerActivation:30,quantityLimit:[1,1000],randomDraws:'1+quantity after validation, even guaranteed100%',acquisitionAdaptation:'Prontera aggregate paid NPC shop:7433/904/947 source prices;946/1013 existing drops',netWeight:true};
const expectedPharmacyRows = ["501,22,228,1,7144,0,507,1,1093,1", "503,22,228,1,7144,0,508,1,1093,1", "504,22,228,1,7144,0,509,1,1093,1", "505,22,228,1,7144,0,510,1,911,1,1093,1", "545,22,228,1,7133,0,501,1,1092,1,952,1", "546,22,228,1,7133,0,503,1,1092,1,1017,1", "547,22,228,1,7133,0,504,1,1092,1,1061,1", "7135,22,228,1,7128,0,970,1,1059,1,713,1", "7136,22,228,1,7129,0,713,1,929,1", "7137,22,228,1,7130,0,713,1,1032,2", "7138,22,228,1,7131,0,713,1,1050,1,1051,1", "7139,22,228,1,7132,0,970,1,950,1,1044,1,713,1", "12118,22,228,1,7434,0,1012,2,716,1,1093,1", "12119,22,228,1,7434,0,950,3,717,1,1093,1", "12120,22,228,1,7434,0,7126,2,715,1,1093,1", "12121,22,228,1,7434,0,1057,3,717,1,1093,1", "605,22,228,1,7144,0,708,1,970,1,713,1", "606,22,228,1,7144,0,704,1,518,1,713,1", "970,22,228,1,7127,0,713,1,7033,5,905,5,1092,1", "7142,22,228,1,7144,0,7140,1,7141,1,7143,1"];
const pharmacyRows = buffers['db/produce_db.txt'].toString('utf8').split(/\r?\n/).filter(line => /^\d+,\d+,228,/.test(line));
if (JSON.stringify(pharmacyRows) !== JSON.stringify(expectedPharmacyRows)) throw new Error('Pinned Pharmacy recipes differ');
const pharmacyRecipes = pharmacyRows.map(line => {
  const [outputItemId,itemLevel,skillId,skillLevel,...materials]=line.split(',').map(Number),ingredients=[];
  for(let i=0;i<materials.length;i+=2)ingredients.push({itemId:materials[i],quantity:materials[i+1]});
  return {outputItemId,itemLevel,skillId,skillLevel,ingredients};
});
const pharmacySource=skillByName.AM_PHARMACY;
if(pharmacySource?.Id!==228||pharmacySource.MaxLevel!==10||pharmacySource.Requirements?.SPCost!==5||
 JSON.stringify(pharmacySource.Requirements?.Items)!==JSON.stringify({Medicine_Bowl:1}))throw new Error('Pinned Pharmacy activation differs');
const pharmacyNpcStock=[
 {itemId:7134,price:8,discount:false,source:'npc/merchants/alchemist.txt'},
 ...[7144,7127,7128,7129,7130,7131,7132].map(itemId=>({itemId,price:100000,discount:false,source:'npc/merchants/alchemist.txt'})),
 {itemId:7133,price:240000,discount:false,source:'npc/merchants/alchemist.txt'},
 ...[[1092,3],[1093,10]].map(([itemId,price])=>({itemId,price,discount:true,source:'npc/pre-re/merchants/shops.txt'})),
 ...[[7140,60000],[7141,20000],[7143,5000]].map(([itemId,price])=>({itemId,price,discount:true,source:'npc/merchants/shops.txt'}))
];
const alchemistShopSource=buffers['npc/merchants/alchemist.txt'].toString('utf8');
if(!/\.@sell\s*=\s*\.@input\s*\*\s*8\s*;/.test(alchemistShopSource))throw new Error('Pinned Medicine Bowl price differs');
for(const [name,price] of [['Normal_Potion_Book',100000],['Alcol_Create_Book',100000],['FireBottle_Create_Book',100000],['Acid_Create_Book',100000],['Plant_Create_Book',100000],['Mine_Create_Book',100000],['Coating_Create_Book',100000],['Slim_Potion_Create_Book',240000]])
 if(!new RegExp('S_SellManual,\\s*'+name+',\\s*'+price).test(alchemistShopSource))throw new Error('Pinned manual price differs:'+name);
const geffenShopSource=buffers['npc/pre-re/merchants/shops.txt'].toString('utf8').match(/geffen_in,171,123,4\s+trader\s+Tool Dealer#gef2\s+1_M_WIZARD,\{([\s\S]*?)^\}/m)?.[1];
if(!geffenShopSource||!/sellitem Empty_Cylinder;/.test(geffenShopSource)||!/sellitem Empty_Potion;/.test(geffenShopSource))throw new Error('Pinned Pharmacy trader differs');
const inertPharmacyOutputIds=new Set([545,546,547,605,606,7142,12118,12119,12120,12121]);
manifest.pharmacyCraft={recipeSource:'db/produce_db.txt:329..380',recipes:pharmacyRecipes,
 activationSource:'db/pre-re/skill_db.conf AM_PHARMACY',spPerAttempt:5,activationItem:{itemId:7134,quantity:1},
 guideRule:'Quantity-zero materials require inventory presence and are not consumed.',
 chanceSource:'src/map/skill.c:20249..20482 and20553; potion_produce_rate100; no homunculus or Baby system',
 productionRule:'N repeated qty1 attempts, including costs and RNG on failures; inner RNG on success.',
 confirmationAdaptation:'Free preview; town-only atomic batch charged on confirmation. Worst-case success weight must permit all activations.',
 npcStock:pharmacyNpcStock,locationAdaptation:'Paid native NPC stock aggregated into Prontera city services.',
 scriptRule:'Production never evaluates item scripts; existing explicit handlers only.',inertOutputItemIds:[...inertPharmacyOutputIds],
 unavailableAcquisition:[{itemId:7434,reason:'Original Pisruik research not yet available; no NPC sale enabled.'}]};

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
const sourceAliases = { ...rules.skillAliases, ...Object.fromEntries(rules.skills.map(s => [s.source, s.id])), ...rules.skillIdOverrides };
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
const motionKeys = { Fist: 'fist', Dagger: 'dagger', Sword: 'sword', TwoHandSword: 'twoHandSword', Spear: 'spear', TwoHandSpear: 'twoHandSpear', Axe: 'axe', TwoHandAxe: 'twoHandAxe', Mace: 'mace', TwoHandMace: 'twoHandMace', Rod: 'staff', TwoHandRod: 'twoHandStaff', Bow: 'bow', Knuckle: 'knuckle', Instrument: 'instrument', Whip: 'whip', Book: 'book', Katar: 'katar' };
const parameterGroups = parsed['unit_parameters_db.conf'];
function resolveParameterGroup(name, trail = []) {
    if (trail.includes(name)) throw new Error(`Unit parameter inheritance cycle: ${[...trail, name].join(' -> ')}`);
    const row = parameterGroups[name];
    if (!row) throw new Error(`Missing unit parameter group: ${name}`);
    const parent = row.Inherit;
    if (parent !== undefined && typeof parent !== 'string') throw new Error(`Invalid unit parameter inheritance for ${name}`);
    return { ...(parent ? resolveParameterGroup(parent, [...trail, name]) : {}), ...row };
}
const resolvedParameterGroups = Object.fromEntries(Object.keys(parameterGroups).map(name => [name, resolveParameterGroup(name)]));
const allItems = parsed['item_db.conf'].item_db;
const itemByName = Object.fromEntries(allItems.map(i => [i.AegisName, i]));
const itemById = Object.fromEntries(allItems.map(i => [i.Id, i]));
manifest.bookWeapon = {
    source: 'db/pre-re/item_db.conf:1550..1582 + job_db.conf:BaseASPD + size_fix.txt:Book',
    classes: ['Sage', 'Professor', 'Priest', 'High Priest'],
    shopItem: { id: 1550, sourceBuyPrice: itemById[1550]?.Buy, acquisition: 'Idle aggregated shop; npc/merchants/shops.txt contains no Book sale' },
    advancedBook: { masteryAttackPerLevel: 3, masterySource: 'src/map/battle.c:804..806', aspdRatePerLevel: -5, aspdRateScale: 1000, aspdSource: 'src/map/status.c:2141..2142', hitBonus: false },
    actorSource: 'roBrowserLegacy d88a3cd4 DB/Items/WeaponTable.js:28, DB/Items/WeaponType.js:25',
    attackActionSource: 'roBrowserLegacy d88a3cd4 DB/Jobs/WeaponAction.js: Priest/Sage BOOK variant 2; direction-group offset 8*11=88',
};
function inheritedItem(item, trail = []) { if (!item.CloneItem)
    return item; if (trail.includes(item.Id))
    throw new Error('CloneItem cycle'); const parent = typeof item.CloneItem === 'number' ? itemById[item.CloneItem] : itemByName[item.CloneItem]; if (!parent)
    throw new Error('Missing CloneItem'); return { ...inheritedItem(parent, [...trail, item.Id]), ...item }; }
const catalog = { version: rules.version, source: { commit: rules.commit, files: manifest.sources.map(s => s.path), hash: '' }, rates: rules.rates, monsters: {}, items: {}, classes: {}, skills: {}, areas: rules.areas, quests: [], challenges: [], exp: { base: [], job: {} }, elementModifiers: {}, sizeModifiers: {} };
catalog.teleportBlockedMaps = teleportBlockedMaps;
catalog.autospellChoices = Object.fromEntries(parsed['autospell_db.conf'].autospell_db.map(row =>
    [row.SkillId, Array.from({ length: 10 }, (_, i) => typeof row.SkillLevel === 'number'
        ? row.SkillLevel : row.SkillLevel?.['Lv' + (i + 1)] ?? 0)]));
function actorSprite(job, gender) { const sex = gender === 'male' ? '남' : '여'; const base = 'data/sprite/인간족/몸통/' + sex + '/' + rules.spriteJobs[job] + '_' + sex; const head = 'data/sprite/인간족/머리통/' + sex + '/1_' + sex; return { spr: base + '.spr', act: base + '.act', headSpr: head + '.spr', headAct: head + '.act' }; }
for (const rule of rules.classes) {
    const job = resolveInheritance(jobs, rule.source);
    const parameterGroup = job.ParametersGroup;
    const maxAspd = resolvedParameterGroups[parameterGroup]?.MaxASPD;
    if (!Number.isSafeInteger(maxAspd) || maxAspd <= 0 || maxAspd > 200) throw new Error(`Invalid MaxASPD for ${rule.source}: ${maxAspd}`);
    const { source, spriteJob, mountedSpriteJob, ...rest } = rule;
    const jobCap = rule.tier === 0 ? 10 : rule.trans && rule.tier === 2 ? 70 : 50;
    const bonus = Object.fromEntries(statKeys.map(k => [k, 0]));
    const jobBonuses = Array.from({ length: jobCap }, (_, index) => { const stat = statKeys[(bonusRows[jobIds[source]]?.[index] ?? 0) - 1]; if (stat) bonus[stat]++; return { ...bonus }; });
    const attackMotion = Object.fromEntries(Object.entries(job.BaseASPD ?? {}).map(([k, v]) => [motionKeys[k] ?? k, v]));
    const weaponAspd = { ...Object.fromEntries(Object.entries(attackMotion).filter(([k]) => ['dagger', 'sword', 'twoHandSword', 'spear', 'twoHandSpear', 'axe', 'twoHandAxe', 'mace', 'twoHandMace', 'staff', 'twoHandStaff', 'book', 'bow', 'instrument', 'whip', 'katar'].includes(k))), unarmed: attackMotion.fist ?? 2000 };
    catalog.classes[rule.id] = { ...rest, skills: Object.keys(treeByClass[rule.id]).map(skillId), jobCap, expGroup: job.JobExpGroup, hp: job.HPTable.slice(0, 99).map(n => rule.trans ? n + Math.floor(n * 25 / 100) : n), sp: job.SPTable.slice(0, 99).map(n => rule.trans ? n + Math.floor(n * 25 / 100) : n), jobBonuses: Object.fromEntries(statKeys.map(k => [k, jobBonuses.map(row => row[k])])), attackMotion, weaponAspd, minimumAttackMotionMs: 2000 - 10 * maxAspd, baseWeight: (job.Weight ?? 20000) / 10, sprite: { male: actorSprite(spriteJob, rule.gender ?? 'male'), female: actorSprite(spriteJob, rule.gender ?? 'female') } };
    if (mountedSpriteJob) catalog.classes[rule.id].mountedSprite = {
        male: actorSprite(mountedSpriteJob, 'male'), female: actorSprite(mountedSpriteJob, 'female'),
    };
    manifest.classSources[rule.id] = { job: source, sourceJobId: jobIds[source], baseExpGroup: job.BaseExpGroup, jobExpGroup: job.JobExpGroup, skillTree: source, jobBonuses: 'db/job_db2.txt', attackMotion: 'db/pre-re/job_db.conf:BaseASPD', minimumAttackMotion: { source: `db/pre-re/unit_parameters_db.conf:${parameterGroup}.MaxASPD`, formula: '2000 - 10 * MaxASPD', pcCapMacro: 'src/map/pc.h:pc_max_aspd' },
        ...(mountedSpriteJob && { mountedSpriteJob, mountedSpriteSource: 'roBrowserLegacy d88a3cd4 DB/Jobs/JobNameTable.js' }) };
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
const spellBalanceSources = new Set(['PR_TURNUNDEAD', 'CR_GRANDCROSS', 'HW_GRAVITATION', 'HW_MAGICCRASHER']);
const healSkills = new Set(['NV_FIRSTAID', 'AL_HEAL', 'PR_SANCTUARY', 'AM_POTIONPITCHER', 'CR_SLIMPITCHER']);
// A source row alone is not an implementation. Every supported non-damage
// skill must have an Effects translation or an explicit engine dispatcher.
const effectSkills = new Set(['AL_BLESSING', 'AL_INCAGI', 'MC_LOUD', 'PR_IMPOSITIO', 'PR_GLORIA', 'AC_CONCENTRATION', 'KN_TWOHANDQUICKEN', 'BS_ADRENALINE', 'CR_SPEARQUICKEN', 'BS_OVERTHRUST', 'WS_OVERTHRUSTMAX', 'LK_CONCENTRATION', 'SN_SIGHT', 'SN_WINDWALK', 'MO_EXPLOSIONSPIRITS', 'BA_WHISTLE', 'BA_ASSASSINCROSS', 'BA_POEMBRAGI', 'BA_APPLEIDUN', 'DC_HUMMING', 'DC_FORTUNEKISS', 'DC_SERVICEFORYOU', 'AL_ANGELUS', 'CR_AUTOGUARD', 'CR_REFLECTSHIELD', 'LK_PARRYING', 'HP_ASSUMPTIO', 'SA_FLAMELAUNCHER', 'SA_FROSTWEAPON', 'SA_LIGHTNINGLOADER', 'SA_SEISMICWEAPON']);
const passiveSkills = new Set(['SM_SWORD', 'SM_TWOHAND', 'SM_RECOVERY', 'SM_MOVINGRECOVERY', 'SM_FATALBLOW', 'KN_SPEARMASTERY', 'MG_SRECOVERY', 'AC_OWL', 'AC_VULTURE', 'AL_DEMONBANE', 'TF_DOUBLE', 'TF_MISS', 'MO_IRONHAND', 'MO_DODGE', 'MO_TRIPLEATTACK', 'PR_MACEMASTERY', 'HT_BEASTBANE', 'HT_STEELCROW', 'HT_FALCON', 'BA_MUSICALLESSON', 'DC_DANCINGLESSON', 'BS_HILTBINDING', 'BS_WEAPONRESEARCH', 'MC_DISCOUNT', 'MC_OVERCHARGE', 'MC_INCCARRY', 'ALL_INCCARRY', 'MC_PUSHCART', 'AM_AXEMASTERY', 'AS_KATAR', 'AS_SONICACCEL', 'ASC_KATAR', 'CR_TRUST', 'HW_SOULDRAIN', 'HP_MEDITATIO', 'HP_MANARECHARGE', 'AM_LEARNINGPOTION', 'BS_SKINTEMPER', 'SA_DRAGONOLOGY', 'AL_DP', 'RG_SNATCHER', 'SA_ADVANCEDBOOK']);
for (const name of ['BS_UNFAIRLYTRICK', 'RG_TUNNELDRIVE', 'MO_SPIRITSRECOVERY']) passiveSkills.add(name);
for (const name of ['KN_RIDING', 'KN_CAVALIERMASTERY']) passiveSkills.add(name);
const activeSpecial = new Set(['MG_SIGHT', 'MG_SAFETYWALL', 'MG_STONECURSE', 'MG_ENERGYCOAT', 'WZ_QUAGMIRE', 'HW_MAGICPOWER', 'TF_STEAL', 'RG_STEALCOIN', 'TF_HIDING', 'AS_CLOAKING', 'BS_HAMMERFALL', 'BA_FROSTJOKE', 'BA_PANGVOICE', 'DC_SCREAM', 'MO_CALLSPIRITS', 'MO_ABSORBSPIRITS', 'MO_BLADESTOP', 'CH_SOULCOLLECT', 'PR_KYRIE', 'PR_MAGNIFICAT', 'WS_CARTBOOST', 'SM_PROVOKE', 'AL_DECAGI', 'AL_CRUCIS', 'LK_AURABLADE', 'LK_JOINTBEAT', 'PR_LEXDIVINA', 'PR_LEXAETERNA', 'BS_WEAPONPERFECT', 'BS_MAXIMIZE', 'PR_ASPERSIO', 'RG_STRIPWEAPON', 'RG_STRIPARMOR', 'RG_STRIPHELM', 'PF_HPCONVERSION', 'RG_STRIPSHIELD', 'AS_ENCHANTPOISON', 'MC_IDENTIFY']);
activeSpecial.add('DC_DONTFORGETME');
const oneShotTraps = new Set(['HT_LANDMINE', 'HT_BLASTMINE', 'HT_CLAYMORETRAP', 'HT_FREEZINGTRAP']);
const controlTraps = ['HT_SKIDTRAP', 'HT_ANKLESNARE', 'HT_SANDMAN', 'HT_FLASHER'];
for (const name of controlTraps) activeSpecial.add(name);
for (const name of ['MO_STEELBODY', 'LK_BERSERK', 'ASC_EDP', 'NV_TRICKDEAD']) activeSpecial.add(name);
for (const name of ['ST_FULLSTRIP', 'ST_REJECTSWORD', 'SM_AUTOBERSERK']) activeSpecial.add(name);
for (const name of ['AS_VENOMDUST', 'PF_SPIDERWEB']) activeSpecial.add(name);
for (const name of ['AS_POISONREACT', 'AS_SPLASHER']) activeSpecial.add(name);
activeSpecial.add('KN_AUTOCOUNTER');
activeSpecial.add('LK_TENSIONRELAX');
for (const name of ['SA_AUTOSPELL', 'PF_DOUBLECASTING', 'PF_MEMORIZE', 'AL_PNEUMA', 'SM_ENDURE', 'CR_DEFENDER']) activeSpecial.add(name);
for (const name of ['ALL_RESURRECTION', 'PF_SOULCHANGE']) activeSpecial.add(name);
activeSpecial.add('TF_PICKSTONE');
for (const name of ['SA_CASTCANCEL','SA_SPELLBREAKER','SA_MAGICROD']) activeSpecial.add(name);
for (const name of ['AL_CURE', 'TF_DETOXIFY', 'PR_SLOWPOISON']) activeSpecial.add(name);
activeSpecial.add('PR_STRECOVERY');
for (const name of ['CR_SHRINK', 'PA_SACRIFICE']) activeSpecial.add(name);
for(const name of ['SA_CREATECON','SA_ELEMENTWATER','SA_ELEMENTGROUND','SA_ELEMENTFIRE','SA_ELEMENTWIND'])activeSpecial.add(name);
passiveSkills.add('RG_COMPULSION');
passiveSkills.add('RG_PLAGIARISM');
passiveSkills.add('SA_FREECAST');
activeSpecial.add('WZ_ESTIMATION');
activeSpecial.add('AL_RUWACH');
activeSpecial.add('DC_WINKCHARM');
activeSpecial.add('RG_CLOSECONFINE');
activeSpecial.add('PF_MINDBREAKER');
activeSpecial.add('PF_FOGWALL');
activeSpecial.add('MO_BODYRELOCATION');
activeSpecial.add('ST_PRESERVE');
activeSpecial.add('ST_CHASEWALK');
for (const name of ['SA_VOLCANO', 'SA_DELUGE', 'SA_VIOLENTGALE']) activeSpecial.add(name);
activeSpecial.add('AL_TELEPORT');
for (const name of ['WS_MELTDOWN', 'AM_POTIONPITCHER', 'AM_PHARMACY']) activeSpecial.add(name);
const unsupported = {
    NV_BASIC: 'Ações sociais do Aprendiz não existem na simulação de caça.', WE_BABY: 'Requer sistema de família e personagens vinculados.', WE_CALLPARENT: 'Requer sistema de família e personagens vinculados.', WE_CALLBABY: 'Requer sistema de família e personagens vinculados.',
    AL_WARP: 'Portais para mapas e memorizações de coordenadas exigem navegação em mapa.', AL_HOLYWATER: 'Produção de Água Benta exige células de água e Frasco Vazio.', PR_REDEMPTIO: 'Ressurreição de grupo exige outros personagens.',
    MC_VENDING: 'Requer comércio com outros personagens.', ALL_BUYING_STORE: 'Requer comércio com outros personagens.', MC_CARTDECORATE: 'Decoração de carrinho exige objetos de carrinho.', MC_CHANGECART: 'Aparência do carrinho exige objetos de carrinho.',
    RG_GRAFFITI: 'Requer inscrições em células do mapa.', RG_FLAGGRAFFITI: 'Requer bandeiras de guilda no mapa.', RG_CLEANER: 'Requer inscrições em células do mapa.', RG_GANGSTER: 'Requer aliados da mesma classe.',
    CR_DEVOTION: 'Requer outro personagem para transferir dano.', PR_BENEDICTIO: 'Requer dois Noviços e células de mapa.', HP_BASILICA: 'Requer área protegida e interação com vários personagens.', PA_GOSPEL: 'Requer efeitos aleatórios de grupo.', MO_KITRANSLATION: 'Requer outro personagem para transferir esferas.', PF_SOULBURN: 'Requer SP do alvo; monstros não têm SP no catálogo.', HT_SHOCKWAVE: 'Requer SP do alvo; monstros não têm SP no catálogo.',
    SA_ABRACADABRA: 'Requer seleção aleatória de habilidades especiais e transformações.', SA_LANDPROTECTOR: 'Requer células de mapa e cancelamento de campos.',
    BS_REPAIRWEAPON: 'O reparo por NPC usa o serviço Reparo Geral da Oficina; esta habilidade exige selecionar um jogador e equipamento por um fluxo de alvo distinto, ainda indisponível.',
    PF_SPIDERWEB: 'Requer imobilização ligada a uma unidade de solo e consumo da teia por dano de Fogo.',
    AM_CP_WEAPON: 'Proteção contra quebra e remoção exige estado de equipamento quebrado ou removido do personagem.', AM_CP_SHIELD: 'Proteção contra quebra e remoção exige estado de equipamento quebrado ou removido do personagem.', AM_CP_ARMOR: 'Proteção contra quebra e remoção exige estado de equipamento quebrado ou removido do personagem.', AM_CP_HELM: 'Proteção contra quebra e remoção exige estado de equipamento quebrado ou removido do personagem.', CR_FULLPROTECTION: 'Proteção completa exige estado de equipamento quebrado ou removido do personagem.',
    CG_MARIONETTE: 'Requer outro personagem para transferir atributos.', CG_MOONLIT: 'Requer parceiro e interação espacial de grupo.', CG_LONGINGFREEDOM: 'Requer parceiro durante dueto.', CG_HERMODE: 'Requer guilda e área de combate entre personagens.', CG_TAROTCARD: 'Requer baralho aleatório com efeitos de combate entre personagens.',
    WZ_ICEWALL: 'Requer edição de células bloqueadas do mapa.', HW_GANBANTEIN: 'Requer remoção de unidades de habilidades em células do mapa.',
    CR_SLIMPITCHER: 'Requer cura específica da poção compacta e seus modificadores.',
};
const townPatterns = /^(BS_(IRON|STEEL|ENCHANTEDSTONE|ORIDEOCON|DAGGER|SWORD|TWOHANDSWORD|AXE|MACE|KNUCKLE|SPEAR|REPAIRWEAPON|FINDINGORE)|AM_(PHARMACY|CANNIBALIZE|SPHEREMINE|BIOETHICS|CALLHOMUN|REST|RESURRECTHOMUN|TWILIGHT\d)|CR_CULTIVATION|ASC_CDP|SA_CREATECON|AC_MAKINGARROW|WS_WEAPONREFINE|HT_(REMOVETRAP|SPRINGTRAP|TALKIEBOX)|BD_)/;
function backslidingSourceMatchesSourceContract(source) {
    const requirements = source.Requirements ?? {};
    const requirementKeys = Object.keys(requirements);
    const skillTypeKeys = Object.keys(source.SkillType ?? {});
    const damageTypeKeys = Object.keys(source.DamageType ?? {});
    return source.Id === 150 && source.Name === 'TF_BACKSLIDING' && source.MaxLevel === 1 &&
        source.Hit === 'BDT_SKILL' && source.AttackType === 'Misc' &&
        source.SkillType?.Self === true && skillTypeKeys.length === 1 && skillTypeKeys[0] === 'Self' &&
        source.DamageType?.NoDamage === true && damageTypeKeys.length === 1 && damageTypeKeys[0] === 'NoDamage' &&
        source.KnockBackTiles === 5 && requirementKeys.length === 1 && requirements.SPCost === 7 &&
        source.CastTime === undefined && source.AfterCastActDelay === undefined && source.CoolDown === undefined &&
        source.InterruptCast !== true && source.Unit === undefined && source.SplashRange === undefined;
}
const descriptions = {
    AL_TELEPORT: 'Teleporta para uma posição aleatória passável do mapa. No nível 2, permite voltar a Prontera. Uso manual durante a caça; custo pelo nível aprendido. O destino aleatório permanece na região conectada da caça.',
    ST_CHASEWALK: 'Oculta você dos monstros comuns e permite caminhar, com atraso de 35−5×nível%. Consome 10+2×nível SP a cada 10s; o primeiro pulso concede STR 2^(nível−1) por 30s, sem renovar um bônus ativo. Impede atacar ou usar outras habilidades; chefes, detectores e magia já conjurada ainda podem atingir você. Desativar é imediato e gratuito.',
    RG_PLAGIARISM: 'Copia uma magia de monstro que causar dano sem derrotar você. O nível fica limitado pelo Plágio, sem consumir pontos. Uma nova magia substitui a anterior; receber a mesma não melhora a cópia. As quatro magias de Mago presentes nos ataques NPC são copiáveis; outras fontes ainda não estão simuladas.',
    ST_PRESERVE: 'Protege a magia copiada contra substituição por dez minutos. Conjuração base de um segundo e custo de 30 SP. A caça automática só ativa após obter uma cópia. O efeito termina na morte, ao sair da conta ou reconectar; a magia copiada continua salva.',
    TF_BACKSLIDING: 'Desliza imediatamente até cinco células para trás, na direção oposta ao seu olhar, parando na primeira parede ou borda do mapa. Custa 7 SP; não conjura, não interrompe uma conjuração em andamento e não tem recarga. Use manualmente durante uma caça em mapa com navegação carregada.',
    PR_STRECOVERY: 'Recuperação de Status em um monstro: no elemento Morto-Vivo efetivo, tenta Cegueira com resistência por atributos e nível; nos demais, remove Petrificação, Congelamento, Sono, Atordoamento, Prisão Branca e Netherworld. Solta o alvo de ataque e interrompe a perseguição, preservando conjurações NPC já iniciadas e seus custos. Cegueira reduz a visão do monstro a três células; ele pode readquirir o alvo sem proteção garantida. Alcance nove, 5 SP e pós-conjuração de dois segundos. A rotação usa apenas monstros Mortos-Vivos que estejam atacando e ainda sem Cegueira. Não permite escapar do próprio Atordoamento.',
    PR_LEXDIVINA: 'Aplica Silêncio a um monstro, sujeito a VIT, SOR, nível e imunidade de chefes. Silêncio impede o início de novas habilidades NPC; ataques normais continuam e conjurações já iniciadas terminam normalmente. Usar em um monstro já silenciado remove o efeito; a rotação evita essa remoção e escolhe somente monstros com ações NPC implementadas. Alcance cinco, conjuração instantânea e pós-conjuração de três segundos.',
    RG_COMPULSION: 'Desconto nas compras de NPC: 9%, 13%, 17%, 21% e 25% nos níveis um a cinco. Usa o maior desconto entre esta habilidade e Desconto do Mercador, sem somar. O preço é truncado e tem mínimo de 1 zeny; não altera vendas. Requer estudar Gangster, cujo efeito de aliados continua indisponível.',
    ALL_RESURRECTION: 'Na caça solo, ataca apenas monstros de elemento Morto-Vivo com dano mágico Sagrado, sujeito à DEFM e ao elemento do alvo. A chance própria pode usar o HP atual como dano bruto; chefes recebem somente o dano menor. Consome 60 SP e uma Gema Azul. Ressuscitar outros personagens continua adiado; Recuperação de Status é o pré-requisito normal da árvore.',
    PF_SOULCHANGE: 'Na caça solo, recupera 3% do seu SP máximo, truncado e limitado ao máximo, ao usar um monstro vivo não chefe. Cada instância de monstro permite um único uso durante sua vida. É uma utilidade amistosa com alcance de nove células, custo de 5 SP, conjuração de 3 segundos e pós-conjuração de 5 segundos. A rotação evita uso com SP cheio ou ganho inútil. Trocar SP entre personagens continua adiado; estudar os pré-requisitos não concede os efeitos indisponíveis de Espelho Mágico e Desconjurar.',
    KN_RIDING: 'Permite montar e desmontar um Peco Peco manualmente. Montado, caminha mais rápido e carrega 1000 de peso adicional. Lanças contra monstros médios usam a correção de monstros grandes e o bônus de Perícia com Lança aumenta. Cavalaria reduz a penalidade de velocidade de ataque.',
    KN_CAVALIERMASTERY: 'Reduz a penalidade de velocidade de ataque enquanto montado: de 50% sem Cavalaria até nenhuma penalidade no nível 5. O efeito depende da montaria ativa.',
    KN_BRANDISHSPEAR: 'Requer Peco Peco ativo e lança de uma ou duas mãos. Golpeia células direcionais à frente do alvo, com dano diferente por faixa e recuo de três células. A área cresce com o nível; chefes e monstros imunes não recuam.',
    MO_SPIRITSRECOVERY: 'Enquanto sentado, recupera HP e SP adicionais a cada 10 segundos. Com peso a partir de 50%, o intervalo é de 20 segundos. Os canais e quantidades seguem o Hercules; levantar zera somente os acumuladores extras sentados.',
    SA_CASTCANCEL: 'Cancela manualmente a sua conjuração em curso. Paga 2 SP normais e adicional de 90/70/50/30/10% do custo-base da magia cancelada, limitado ao SP restante. Não recupera Memorize nem resolve a magia cancelada.',
    SA_SPELLBREAKER: 'Interrompe a conjuração atual de um monstro em alcance 9. Custa 10 SP e tem conjuração base de 700 ms, reduzida por DEX. Monstro normal perde 2% de HP máximo; nível 5 cura metade do valor calculado. Boss tem 10% de chance e não sofre dano nem cura HP. A rotação só inicia quando pode concluir antes do monstro.',
    SA_MAGICROD: 'Prepara uma reação por 400/600/800/1000/1200 ms. Intercepta magia NPC que conclua dentro da janela e recupera 20/40/60/80/100% do SP-base da magia recebida. Custa 2 SP; sem conjuração ou recarga própria.',
    LK_TENSIONRELAX: 'Use manualmente durante a caça para sentar e relaxar. Custa 15 SP inicialmente e dura até 3 minutos, com checagem de HP a cada 10 segundos. Acelera somente recuperação de HP natural e por habilidade em três vezes; com peso acima de 50%, permite HP sem o multiplicador. Levantar encerra o efeito. A fonte fixada não cobra SP recorrente.',
    KN_AUTOCOUNTER: 'Postura de Contra-Ataque por 0,4 segundo por nível. Custa 3 SP e impede caminhar ou iniciar outras habilidades. Intercepta ataques normais vindos da frente ou diagonais próximas, até o alcance da arma +1; a mesma célula aceita qualquer direção. Consome a postura antes do golpe de arma com movimento pela metade. Ataques básicos também podem consumi-la no ramo crítico; multihit preserva a postura. Não pode ser usada com arco.',
    BS_UNFAIRLYTRICK: 'Mammonita custa 10% menos zeny. O desconto é truncado antes de subtrair do preço. Não altera dano ou SP.',
    RG_TUNNELDRIVE: 'Permite caminhar durante Esconderijo. A penalidade de velocidade diminui com o nível. Mantém drenagem de SP, detecção, restrição de ataques e recuperação de Esconderijo.',
    AS_POISONREACT: 'Prepara reações a ataques normais recebidos, inclusive tentativas bloqueadas. Contra corpo de Veneno dispara um ataque neutro e encerra o efeito; contra outros corpos há 50% de chance de usar Envenenar 5 sem custo adicional de SP. Cargas e duração seguem o Hercules.',
    AS_SPLASHER: 'Arma uma bomba em alvo não chefe com até 75% do HP. Consome uma Gema Vermelha. Detona após 5,5 a 10 segundos na posição atual do alvo; raio de duas células, bônus pelo nível de Refletir Veneno. A revisão fixada ignora elemento e esquiva e não divide o dano. Morte do alvo cancela a bomba.',
    ST_FULLSTRIP: 'Uma tentativa conjunta pode remover arma, escudo, armadura e elmo do monstro. Contra monstros reduz ATQ, DEF, VIT e INT; chance e duração usam DEX efetiva. Afeta também chefes conforme o Hercules fixado.',
    ST_REJECTSWORD: 'Prepara três reações bem-sucedidas. Cada uma tem 15 × nível por cento de chance de reduzir à metade o dano físico residual e devolver essa metade ao monstro. Permanece ativo até consumir as três cargas.',
    SM_AUTOBERSERK: 'Ative manualmente por 1 SP. Enquanto ligado e com HP estritamente abaixo de um quarto do máximo, aplica Provocar 10: ATQ +32% e defesa de VIT −55%. Não reduz hard DEF. Recuperar HP encerra somente o bônus automático.',
    CR_SHRINK: 'Ative por 15 SP enquanto estiver com um escudo equipado; dura 5 minutos e pode ser desativado sem custo. Quando Auto Guard bloqueia um ataque de arma, há outra chance de 5% por nível de Auto Guard para recuar o agressor em 2 células. A chance usa o nível ativo de Auto Guard. Chefes e alvos imunes a recuo ainda consomem essa chance, mas não se deslocam.',
    PA_SACRIFICE: 'Ative por 100 SP para preparar 5 cargas. Cada ataque básico elegível vira um golpe físico Neutro cuja base é 9% do HP máximo, com proporção de 100% a 140% pelo nível; ignora DEF e esquiva, mas ainda considera elemento, refino e maestria. Depois do dano ao alvo, cada golpe remove 9% do HP máximo atual da ativação, mesmo se causar dano zero. A perda própria pode derrotar você. Não consome cargas com outras habilidades. Requer estudar Devoção nível 3; estudar não concede o efeito de Devoção.',
    MO_BLADESTOP: 'Consome 10 SP e uma esfera. Prepara uma espera de 0,5 a 1,3 segundo pelo ataque básico de um monstro não chefe a até duas células; cria um vínculo recíproco por 20 a 60 segundos. O vínculo interrompe caminhada e ataques básicos do par. Durante o vínculo, Golpe de Esferas requer nível 2, Impacto Psíquico 3, Combo Quádruplo 4 e Punho Supremo 5. O Combo Quádruplo dispensa Ataque Triplo e continua a sequência; Punho Supremo consome quatro esferas. A espera AFK só é ativada diante de um ataque elegível prestes a chegar.',
    MO_STEELBODY: 'Consome cinco esferas e 200 SP. Fixa DEF e DEFM de equipamentos em 90, reduz a velocidade de ataque e fixa o tempo por célula em 200 ms. Permite ataques normais e impede habilidades durante 30 segundos por nível.',
    LK_BERSERK: 'Frenesi triplica o HP máximo e recupera o HP ao ativar; zera SP e defesas, reduz esquiva e acelera ataques e caminhada. Bloqueia habilidades, itens e troca de equipamentos. Drena 5% do HP máximo a cada 15 segundos, até 5 minutos. Ao terminar, limita HP a 100 e bloqueia recuperação natural por 5 minutos.',
    ASC_EDP: 'Consome uma Garrafa de Veneno. Aumenta dano de arma antes da defesa e permite Veneno Mortal em ataques normais, sem mudar o elemento da arma. Garrafas podem ser compradas na loja do Idle; estudar Criar Veneno Mortal cumpre o pré-requisito, mas sua produção ainda não está disponível.',
    HT_SKIDTRAP: 'Coloca uma armadilha no chão, verificada a cada segundo. Empurra o inimigo na direção oposta à que ele está olhando; chefes e monstros imunes não são empurrados. Na rotação, mantém uma cópia armada de cada habilidade.',
    HT_ANKLESNARE: 'Armadilha fixa que prende o movimento de um inimigo sem impedir seus ataques. Duração reduzida por AGI e contra chefes, com mínimo de 5 segundos. Consome 1 Armadilha.',
    HT_SANDMAN: 'Armadilha de Sono em área de 5 × 5 células. Chance base de 40 + 10 × nível por cento, antes das resistências; dano acorda o alvo. Consome 1 Armadilha.',
    HT_FLASHER: 'Armadilha de Cegueira em área de 3 × 3 células. Chance base de 30 + 10 × nível por cento, antes das resistências. Consome 2 Armadilhas.',
    SA_AUTOSPELL: 'Escolha uma magia aprendida para invocá-la automaticamente nos ataques normais. Chance, nível e custo de SP seguem o Hercules pré-renovação.',
    PF_DOUBLECASTING: 'Lanças de Fogo, Gelo e Relâmpago podem ser repetidas após o movimento do ataque, sem segundo custo de SP. A repetição não gera outra repetição.',
    PF_MEMORIZE: 'Prepara cinco cargas que reduzem pela metade a conjuração elegível. A carga é consumida no início da conjuração, inclusive se ela for interrompida.',
    AL_PNEUMA: 'Cria uma área fixa de 3 × 3 células por 10 segundos que bloqueia ataques físicos à distância. Não acompanha o personagem nem pode sobrepor Escudo Mágico.',
    SM_ENDURE: 'Aumenta a DEFM e impede a reação de dano por um número limitado de golpes recebidos. A duração depende do nível e a habilidade não impede interrupções de conjuração.',
    CR_DEFENDER: 'Requer escudo. Reduz dano físico à distância, aumenta o tempo de deslocamento e aplica a penalidade de velocidade de ataque do Hercules.',
    RG_SNATCHER: 'Ataques normais corpo a corpo podem tentar Furto automaticamente, sem custo adicional de SP. A chance depende dos níveis de Gank e Furto.',
    RG_STRIPSHIELD: 'Tenta remover o escudo do alvo. Contra monstros reduz a defesa em 15%; chance e duração dependem da diferença de DEX.',
    AS_ENCHANTPOISON: 'Encanta a arma com Veneno. Ataques normais podem envenenar o alvo; a resistência e a duração seguem o Hercules. Substitui Aspersio e não pode ser usado sobre encantamentos elementais de Sábio.',
    MC_IDENTIFY: 'Identifica um equipamento na mochila por 10 SP, revelando também sua raridade e seus bônus. Não consome Lupa.',
    RG_CLOSECONFINE: 'Confinamento prende você e um monstro adjacente por 10 segundos. O alvo pode continuar atacando e recebendo seus golpes; a caça volta a se mover quando o alvo morre ou o efeito termina. Custa 25 SP e só é usado contra um alvo vivo em contato durante a caça no campo.',
    WS_MELTDOWN: 'Ataques físicos podem enfraquecer a arma e a armadura de monstros comuns. O nível escolhido define SP, conjuração e duração; chefes são imunes.',
    AM_POTIONPITCHER: 'Arremessa uma poção em si mesmo. Níveis 1–4 usam poções Vermelha, Laranja, Amarela e Branca; nível 5 usa Azul para SP. A recuperação usa o nível aprendido e Pesquisa de Poções.',
    ...(rules.skillDescriptions ?? {}),
};
const statusChances = { MG_FROSTDIVER: l => 35 + 3 * l, WZ_FROSTNOVA: l => 35 + 3 * l, MG_STONECURSE: l => 20 + 4 * l, WZ_METEOR: l => 3 * l, WZ_VERMILION: l => 4 * l, HW_NAPALMVULCAN: () => 5, TF_POISON: l => 10 + 4 * l, AS_SONICBLOW: l => 10 + 2 * l, BA_FROSTJOKE: l => 15 + 5 * l, BA_PANGVOICE: () => 50, DC_SCREAM: l => 25 + 5 * l, BS_HAMMERFALL: l => 20 + 10 * l, HT_LANDMINE: l => 30 + 5 * l, HT_FREEZINGTRAP: l => 35 + 3 * l, SA_FROSTWEAPON: l => Math.min(100, 60 + 10 * l), SA_SEISMICWEAPON: l => Math.min(100, 60 + 10 * l), SA_FLAMELAUNCHER: l => Math.min(100, 60 + 10 * l), SA_LIGHTNINGLOADER: l => Math.min(100, 60 + 10 * l) };
statusChances.DC_WINKCHARM = () => 70;
statusChances.PF_MINDBREAKER = l => 55 + 5 * l;
for (const name of skillNames) {
    const src = skillByName[name];
    if (!src) throw new Error('Missing source skill ' + name);
    const rule = rules.skills.find(s => s.source === name);
    const backslidingSupported = name === 'TF_BACKSLIDING' && backslidingSourceMatchesSourceContract(src);
    const maxLevel = Math.min(src.MaxLevel, Math.max(...Object.values(treeByClass).map(tree => typeof tree[name] === 'number' ? tree[name] : tree[name]?.MaxLevel ?? 0)));
    const prerequisitesByClass = Object.fromEntries(Object.entries(treeByClass).filter(([, tree]) => tree[name]).map(([job, tree]) => [job, Object.entries(typeof tree[name] === 'number' ? {} : tree[name]).filter(([key]) => !['MaxLevel', 'MinJobLevel'].includes(key)).map(([key, level]) => ({ skillId: skillId(key), level }))]));
    const targetType = ['SA_FLAMELAUNCHER', 'SA_FROSTWEAPON', 'SA_LIGHTNINGLOADER', 'SA_SEISMICWEAPON'].includes(name) ? 'self' : name === 'ALL_RESURRECTION' ? 'enemy' : !src.SkillType ? 'passive' : src.SkillType.Place ? 'ground' : src.SkillType.Enemy ? 'enemy' : src.SkillType.Self ? 'self' : 'support';
    let kind = targetType === 'passive' ? 'passive' : healSkills.has(name) ? 'heal' : ['TF_STEAL', 'RG_STEALCOIN'].includes(name) ? 'steal' : magicRatios[name] ? 'magical' : weaponRatios[name] || miscSkills.has(name) ? 'physical' : 'buff';
    if (name === 'AS_POISONREACT') kind = 'buff';
    if (name === 'ALL_RESURRECTION') kind = 'magical';
    let damageType = magicRatios[name] ? 'magic' : weaponRatios[name] ? 'weapon' : miscSkills.has(name) ? 'misc' : 'none';
    if (name === 'ALL_RESURRECTION') damageType = 'magic';
    const supportedMechanic = magicRatios[name] || weaponRatios[name] || miscSkills.has(name) || effectSkills.has(name) || passiveSkills.has(name) || activeSpecial.has(name) || backslidingSupported || ['NV_FIRSTAID', 'AL_HEAL', 'PR_SANCTUARY'].includes(name);
    const unsupportedReason = (['AS_VENOMDUST', 'PF_SPIDERWEB'].includes(name) ? undefined : unsupported[name]) ?? (src.SkillInfo?.Spirit ? 'Requer estado de Espírito da classe, ainda não implementado.' : (!['SA_CREATECON','AM_PHARMACY'].includes(name) && townPatterns.test(name)) ? 'Requer produção, objetos persistentes, parceiros ou edição de células do mapa.' : !supportedMechanic ? 'Mecânica Hercules importada; a simulação atual ainda não executa este efeito.' : undefined);
    const implementation = unsupportedReason ? 'unsupported' : 'supported';
    if (name === 'PF_SOULBURN') damageType = 'none';
    const rawHits = byLevel(src.NumberOfHits, maxLevel, 1);
    const hitCount = rawHits.map(Math.abs);
    const itemCostByLevel = Array.from({ length: maxLevel }, (_, i) => Object.entries(src.Requirements?.Items ?? {}).flatMap(([itemName, amount]) => { const item = itemByName[itemName]; if (!item) throw new Error('Missing reagent: ' + itemName); const quantity = byLevel(amount, maxLevel)[i]; return quantity > 0 ? [{ itemId: item.Id, quantity }] : []; }));
    const power = Array.from({ length: maxLevel }, (_, i) => (magicRatios[name] ?? weaponRatios[name] ?? (name === 'NV_FIRSTAID' ? () => 5 : name === 'PR_SANCTUARY' ? l => l > 6 ? 777 : 100 * l : () => 0))(i + 1));
    const idleDamageMultiplierPct = damageType === 'magic' || spellBalanceSources.has(name)
        ? Array.from({ length: maxLevel }, (_, i) => Number(rule?.idleDamageMultiplierPct?.[i] ?? 100))
        : undefined;
    const inheritedEffect = name === 'AC_OWL' ? { dex: 1 } : name === 'TF_MISS' ? { flee: 3 } : undefined;
    // A negative SplashRange selects the default AREA_SIZE (14). Negative
    // Unit.Layout values instead select special cell layouts and are not radii.
    const radius = byLevel(src.SplashRange ?? src.Unit?.Layout ?? src.Unit?.Range, maxLevel).map(n => src.SplashRange !== undefined && n < 0 ? 14 : Math.max(0, n));
    const duration = byLevel(src.SkillData1, maxLevel);
    const statusEffect = src.StatusChange ?? (name === 'BS_HAMMERFALL' ? 'SC_STUN' : name === 'BA_PANGVOICE' ? 'SC_CONFUSION' : undefined);
    const draining = ['BS_MAXIMIZE', 'TF_HIDING', 'AS_CLOAKING'].includes(name);
    const spDrainIntervalMs = name === 'TF_HIDING' ? Array.from({ length: maxLevel }, (_, i) => (i + 4) * 1000) : duration;
    const weaponRequirements = Object.keys(src.Requirements?.WeaponTypes ?? {}).filter(k => src.Requirements.WeaponTypes[k]);
    const requiredWeapon = [...new Set(weaponRequirements.map(k => ({ Daggers: 'dagger', '1HSwords': 'sword', '2HSwords': 'sword', '1HSpears': 'spear', '2HSpears': 'spear', '1HAxes': 'axe', '2HAxes': 'axe', Maces: 'mace', '2HMaces': 'mace', Staves: 'staff', '2HStaves': 'staff', Bows: 'bow', Katars: 'katar', Instruments: 'instrument', Whips: 'whip' })[k]).filter(Boolean))];
    const onlyTwoHanded = weaponRequirements.length && weaponRequirements.every(k => ['2HSwords', '2HSpears', '2HAxes', '2HMaces', '2HStaves'].includes(k));
    catalog.skills[skillId(name)] = {
        id: skillId(name), name: ({ AL_TELEPORT: 'Teleporte', RG_PLAGIARISM: 'Plágio', ST_PRESERVE: 'Preservar', ST_CHASEWALK: 'Furtividade' })[name] ?? rule?.name ?? rules.skillNames?.[name] ?? src.Description, kind, maxLevel,
        herculesId: src.Id, sourceName: name, mechanic: name, implementation, ...(unsupportedReason && { unsupportedReason }),
        ...(name === 'MC_IDENTIFY' && { manualUse: 'inventory' }),
        ...(name === 'AL_TELEPORT' && { manualUse: 'teleport' }),
        ...(name === 'SM_AUTOBERSERK' && { manualUse: 'toggle', toggle: true }),
        ...(name === 'CR_SHRINK' && { manualUse: 'toggle', toggle: true }),
        ...(name === 'NV_TRICKDEAD' && { manualUse: 'toggle', toggle: true }),
        ...(name === 'ST_CHASEWALK' && { manualUse: 'toggle', toggle: true }),
        ...(['PA_SACRIFICE', 'WS_MELTDOWN', 'AM_POTIONPITCHER'].includes(name) && { manualUse: 'activate' }),
        ...(name === 'MO_BLADESTOP' && { manualUse: 'activate' }),
        ...(name === 'SA_MAGICROD' && { manualUse: 'activate' }),
        ...(backslidingSupported && { manualUse: 'activate' }),
        ...(['SA_FLAMELAUNCHER', 'SA_FROSTWEAPON', 'SA_LIGHTNINGLOADER', 'SA_SEISMICWEAPON', 'SA_VOLCANO', 'SA_DELUGE', 'SA_VIOLENTGALE'].includes(name) && { manualUse: 'activate' }),
        ...(name === 'SA_CASTCANCEL' && { manualUse: 'castCancel' }),
        ...(name === 'SA_CREATECON' && { manualUse: 'converterCraft' }),
        ...(name === 'AM_PHARMACY' && { manualUse: 'pharmacyCraft' }),
        ...(name === 'WZ_ESTIMATION' && { manualUse: 'inspect' }),
        ...(name === 'LK_TENSIONRELAX' && { manualUse: 'rest' }),
        ...(name === 'KN_RIDING' && { manualUse: 'mount' }),
        description: descriptions[name] ?? `${src.Description}. ${targetType === 'passive' ? 'Habilidade passiva.' : damageType === 'magic' ? 'Dano mágico conforme Hercules pré-renovação.' : damageType === 'weapon' ? 'Dano de arma conforme Hercules pré-renovação.' : damageType === 'misc' ? 'Fórmula específica de dano conforme Hercules pré-renovação.' : src.StatusChange ? 'Aplica ' + src.StatusChange.replace('SC_', '') + '.' : 'Habilidade utilitária.'}${unsupportedReason ? ' ' + unsupportedReason : ''}`,
        iconResource: 'data/texture/유저인터페이스/item/' + src.Name.toLowerCase() + '.bmp',
        spCost: byLevel(src.Requirements?.SPCost, maxLevel), power,
        ...(idleDamageMultiplierPct && { idleDamageMultiplierPct }),
        cooldownMs: name === 'SA_MAGICROD' ? 0 : byLevel(src.CoolDown, maxLevel)[0],
        castTimeMs: name === 'SA_MAGICROD' ? Array(maxLevel).fill(0) : byLevel(src.CastTime, maxLevel),
        afterCastDelayMs: name === 'SA_MAGICROD' ? Array(maxLevel).fill(0) : byLevel(src.AfterCastActDelay, maxLevel),
        interruptCast: src.InterruptCast === true,
        ...(src.CastDefRate !== undefined && { castDefenseReductionPct: src.CastDefRate }),
        hitCount, sourceHitCount: rawHits, aoeRadius: radius, range: byLevel(src.Range, maxLevel), targetType, damageType,
        ...(src.SkillInfo?.RangeModByVulture && { rangeBonusByVulture: true }),
        ...(src.SkillInfo?.AllowPlagiarism === true && { allowPlagiarism: true }),
        prerequisites: Object.values(prerequisitesByClass)[0] ?? [], prerequisitesByClass,
        minimumJobLevel: Math.max(1, ...Object.values(treeByClass).map(tree => tree[name]?.MinJobLevel ?? 0)),
        ...(src.Element && { element: src.Element.replace('Ele_', '').toLowerCase() }),
        ...(src.CastTimeOptions?.IgnoreDex && { ignoresDex: true }),
        ...(src.CastTimeOptions?.IgnoreStatusEffect && { ignoresStatusEffects: true }),
        ...(src.DamageType?.SplitDamage && { splitDamage: true }), ...(src.DamageType?.IgnoreDefense && { ignoreDefense: true }),
        ...(src.DamageType?.IgnoreElement && { ignoreElement: true }),
        ...(src.DamageType?.IgnoreFlee && { ignoreFlee: true }),
        ...(statusEffect && { statusEffect, statusDurationMs: byLevel(['AS_ENCHANTPOISON', 'SM_ENDURE', 'MO_STEELBODY', 'LK_BERSERK', 'ASC_EDP', 'DC_WINKCHARM', 'WS_MELTDOWN'].includes(name) ? src.SkillData1 : src.SkillData2 ?? src.SkillData1, maxLevel) }),
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
manifest.skillSources[skillId(name)] = { id: src.Id, name, sourceMaxLevel: src.MaxLevel, sourceRequirements: src.Requirements ?? {}, sourceDamageType: src.DamageType ?? {}, sourceUnit: src.Unit ?? {}, sourceHitCount: rawHits, sourceSplashRange: src.SplashRange ?? 0, implementation, ...(idleDamageMultiplierPct && { idleDamageMultiplierPct }), ...(unsupportedReason && { unsupportedReason }), ...(name === 'WZ_SIGHTBLASTER' && { adaptation: 'One volatile charge; its first source-radius contact damages eligible nearby targets and pushes each by three cells. Boss, monster NoKnockback and map NoKnockback prevent movement.' }), ...(name === 'AL_RUWACH' && { adaptation: 'Self aura for 10 seconds; event-driven 20 ms pulses reveal the five Hercules concealment statuses in radius 2 and deal 145% Holy MATK only to each newly revealed enemy. AFK arms during approach and does not provoke before damage.' }), ...(name === 'LK_JOINTBEAT' && { adaptation: 'Selects one random body part before weapon damage; neck doubles only the additive skill ratio. A successful hit rolls 5 + 5*level percent to apply/refresh cumulative SC_JOINTBEAT flags for 30 s; waist, shoulder, wrist, knee and ankle feed ATK, DEF, attack-delay and movement consumers. Neck also attempts SC_BLOODING using its own source resistance and 10 s / 200-799 HP ticks. Bosses reject the body-part status.' }), ...(name === 'PF_FOGWALL' && { adaptation: 'Solo adaptation: places a fixed 5x3 ground field under the caster, with at most two groups and defense only while inside live cells. Volcano/Gale cells reject Fog; only cells overlapping Deluge last 40 seconds instead of 20. Geometry and SC_FOGWALL are NoSave. AFK places it when the target has normal range above 3 or a modeled NPC magic skill with range above 3; lowers ordinary ranged hit rate by 50 percentage points and quarters ranged normal-attack damage. Targeted NPC magic has a 75% cast-end failure roll and a 25% damage reduction on a hit. The Hercules blind-on-occupants ground-cell behavior is not simulated.' }), ...(['SA_VOLCANO', 'SA_DELUGE', 'SA_VIOLENTGALE'].includes(name) && { adaptation: 'Solo placement centered under the caster; fixed source 7x7 terrain-clipped cells, independent entry/exit and elemental-defense snapshots per actor. Original resource costs and remaining-time replacement; NoSave group and excess HP. Ground textures use a projected flat plane rather than the native 3D cone.' }), ...(name === 'PF_MINDBREAKER' && { adaptation: 'Single-target no-damage skill at range 9; source success chance 55 + 5 per level, 30 s duration, 12% per-level MATK increase and soft-MDEF scalar reduction. Bosses and undead targets are rejected; successful application ends Freeze, Stone and Sleep and cancels a modeled enemy cast. AFK only consumes SP after the existing target/range/resource gates. Its MATK increase applies to modeled NPC magic.' }), ratioSource: magicRatios[name] || weaponRatios[name] ? 'src/map/battle.c:battle_calc_skillratio (pre-renewal branches)' : miscSkills.has(name) ? 'src/map/battle.c:battle_calc_misc_attack / battle_calc_weapon_attack' : 'src/map/skill.c and src/map/status.c', unsupportedRequirements: Object.keys(src.Requirements ?? {}).filter(k => !['SPCost', 'ZenyCost', 'Items', 'WeaponTypes', 'State', 'HPCost', 'HPRateCost', 'SpiritSphereCost'].includes(k)) };
}
manifest.skillSources.ws_meltdown.adaptation = 'Native self buff at the selected learned level; SkillData1 lifetime15–60s, original SP/cast clocks, physical-hit weapon/armor break chances100/70 per level on scale10000. MD_BOSS immunity; native strip Lv0 overlap, duration from RG_STRIP_*Lv1. One additional-effect phase per living hit target, excluding Cart Termination/Tomahawk/Reflect Shield. AFK skips all-boss battles. NoSave buff and captured level are process-local, cleared on caster new connection/logout; NoDeathReset survives defeat. Monster NoSave strips remain on the same live instance across caster reconnect/logout, disappear on process restart and never transfer to a respawn ID. Emperium rejects status before its draw; BG/Gravity Control systems are absent. Native generic equipment-break contributions are not produced by the current solo engine.';
manifest.skillSources.potion_pitcher.adaptation = 'Self-only solo use; selected Lv1–5 consumes exactly Red/Orange/Yellow/White/Blue Potion and1SP, with native500ms after-cast delay and no extra potion cooldown. Recovery uses full learned Pitcher plus Learning Potion and target VIT/INT/Recovery, with native stage truncation. Current item export retains deterministic script midpoints55/125/205/365HP and50SP. Item-heal/caster-heal/received-heal bonuses, Soul Link and recovery-blocking statuses have no current producers and pass zero/false; helper covers their source arithmetic. AFK uses positive configured HP threshold capped at70%, or positive configured SP threshold, only if useful, with offense between support actions. No party target system.';
manifest.skillSources.ba_pangvoice.adaptation = 'Single-target no-damage cast at range 9 during field hunting; applies source SC_CONFUSION for 17 s at a 50% base chance. Bosses reject it. Solo adaptation releases the monster attack target and randomizes movement within the source AREA_SIZE / 2 (7-cell) envelope until expiry.';
manifest.rogueCopy = {
    maxCopiedSlots: 1, incomingScope: 'modeled NPC magic',
    sourceNames: ['MG_FIREBOLT', 'MG_COLDBOLT', 'MG_LIGHTNINGBOLT', 'MG_SOULSTRIKE'],
    source: 'src/map/skill.c:1260..1279,3670..3737; src/map/pc.c:1522..1535,8893..8918,12830..12853',
    flag: 'SkillInfo.AllowPlagiarism', level: 'min(incoming level, known Plagiarism level)',
    damageGate: 'positive final skill damage strictly below target HP before application',
    permanentSkills: 'paid levels and points remain separate; same copied ID cannot upgrade',
    committedCastSurvivesReplacement: true,
    preserve: { noSave: true, clearedOnDeath: true, durationMs: 600000, sp: 30, baseCastMs: 1000,
        source: 'db/pre-re/skill_db.conf:14688..14705; db/pre-re/sc_config.conf:1175..1182',
        adaptation: 'AFK arms only after acquiring a valid copy. Per-profile process-memory status clears on new connection, explicit logout and process restart; browser disconnect alone keeps AFK simulation running.' },
};
manifest.skillSources.rg_plagiarism.adaptation = 'Separate durable copied slot learned only through real modeled NPC magical damage, without points or RNG. Current incoming scope has four Mage spells; other incoming spells and PvP are not modeled. Actual job changes clear the slot; death retains it. Started casts keep their ID and level snapshot after replacement.';
manifest.skillSources.st_chasewalk.adaptation = 'Manual self cast:1200ms modified by DEX,10SP; active recast ends immediately for no SP. Main status persists, drains10+2*level SP each10s and adds35-5*level percent walking delay. Only when absent, a paid pulse grants2^(level-1) STR for30s without refresh. Child survives main ending but has NoSave; death clears both. Ordinary mobs stop acquisition, bosses/detectors and already-started targeted NPC casts may hit; positive HP damage ends main. No Soul Link/GvG adaptation or AFK auto-toggle.';
manifest.skillSources.st_preserve.adaptation = 'Normal self-buff with source 1000 ms cast,30 SP and600 s duration. Protects the copied slot from replacement while active; death and NoSave session boundaries clear it. AFK waits for a valid copy before arming it. Uses original icon and existing generic native cast; no unsupported official VFX ID is invented.';
manifest.skillSources.mo_bladestop.adaptation = 'Waits 500/700/900/1100/1300 ms for a basic attack by a non-boss within two cells, after Auto Counter; spends 10 SP and one sphere only when AFK has such an attack due in the window. Links the actual attacker reciprocally for 20/30/40/50/60 seconds, blocking pair movement and basic attacks while other monsters act. The four source skill-level gates are checked against Blade Stop level. Chain Combo bypasses only the Triple Attack prerequisite in this linked state; Asura spends four spheres. Source SC_BLADESTOP has NoSave and is cleared on a new connection. SC_BLADESTOP_WAIT has no NoSave flag in this source; clearing the short Idle wait on a new connection is an explicit Idle lifecycle adaptation. Both states release on death, partner loss, map exit or expiry; movement clocks resume when volatile state is removed.';
manifest.skillSources.dc_winkcharm.adaptation = 'Single-target no-damage cast at range 9 during field hunting; 70% chance to charm a lower-level common Demon, Demi-human, or Angel monster for 10 s. Auto-casts only when an NPC special skill is modeled. Blocks new NPC special skills while preserving committed casts and normal attacks; hunting movement already tracks the player, so separate walk-to-range-3 pathing is not modeled.';
manifest.skillSources.rg_closeconfine.adaptation = 'Single-target no-damage cast on an adjacent living field-hunt target; costs 25 SP and applies SC_RG_CCONFINE_S for 10 s. The owner and target cannot move, but may continue normal attacks. Owner movement resumes when the last linked target dies or its status expires. Challenges are excluded; the source-bound status is cleared on death, map transfer, or stop, and its deadline shifts across Idle pause/reconnect.';
manifest.skillSources.dc_dontforgetme.adaptation = 'Self-placed 7x7 enemy field; pulses every 3 s for 180 s. Applies the Hercules DEX/AGI and Dancing Lesson-derived values, grants the 20 s out-of-area grace, drains 1 SP every 10 s, and ends when the next charge cannot be paid. Applied to solo field movement and attack intervals without damage.';
manifest.skillSources.mo_bodyrelocation.adaptation = 'Field-hunting approach only: consumes 14 SP and one spirit sphere (zero while Explosion Spirits is active), then relocates instantly to a one-cell offset from the selected living mob at up to 18 cells. It does no damage and excludes challenge instances; the next Extremity Fist is blocked for 2 s. Exact GAT collision and cell occupancy are outside the normalized Idle formation.';
manifest.elementalConversion={sources:['skill.c:8996..9017','status.c:7097,7828..7830,7948..7958,6084..6114','sc_config.conf:2011..2026'],status:'SC_ARMOR_PROPERTY',durationMs:1800000,elementLevels:[1,2,3,4],bossRandomDraws:0,newRandomDraws:2,strongOverlapRandomDraws:1,dispelRemovable:false,perInstance:true};
manifest.playerStatusProduction = { scope: 'Selected NPC subset, not full monster AI', monsters: { 1175: 'NPC_POISON1', 1061: 'NPC_BLINDATTACK3' }, producerSource: 'db/pre-re/mob_skill_db.conf', treatmentScope: 'Own character in solo hunting', diseaseRules: 'src/map/status.c:6937..7218,8224..8232,12469..12494', firstAttack: 'normal', npcRateComparison: 'rnd()%10000 <= Rate', deathClears: true };
const npcMagicRuntimeIds = [1120, 1150, 1190, 1708];
manifest.npcMagicProduction = { source: 'db/pre-re/mob_skill_db.conf + db/pre-re/skill_db.conf', runtimeMonsterIds: npcMagicRuntimeIds,
    runtimeRows: [],
    sourceFixtureMonsterIds: [1033], sourceFixtureRows: [
        { sourceName: 'MG_FIREBOLT', state: 'MSS_BERSERK', level: 3, rate: 500, castTimeMs: 1500, delayMs: 5000, cancelable: true, target: 'MST_TARGET', condition: 'MSC_ALWAYS' },
        { sourceName: 'MG_FIREBOLT', state: 'MSS_RUSH', level: 3, rate: 500, castTimeMs: 1500, delayMs: 5000, cancelable: true, target: 'MST_TARGET', condition: 'MSC_ALWAYS' },
    ], actions: ['MG_FIREBOLT', 'MG_COLDBOLT', 'MG_LIGHTNINGBOLT', 'MG_SOULSTRIKE'],
    importedStates: ['MSS_BERSERK', 'MSS_RUSH'], importedConditions: ['MSC_ALWAYS', 'MSC_SKILLUSED'],
    exclusionPolicy: 'Rows with unsupported target, state, condition, or missing MSC_SKILLUSED ConditionData are skipped. No unsupported row is enabled with approximate behavior; NPC_MAGICALATTACK is a separate, unimplemented mechanism.',
    decisionCadence: 'Existing solo attack decision deadlines; casts replace one due basic attack and the next ordinary attack retains source AttackDelay cadence.',
    monsterSp: 'No SP pool or NPC charging. Source SP cost is metadata for Magic Rod.',
    basicRange: 'Unchanged; bolt reach applies only to the NPC magical action.',
    magicRodFlags: 'SC_MAGICROD is NoSave and NoClearanceReset. It lives in process memory for the existing session, clears on a new session or death, and expires at its source deadline.' };
manifest.skillCoverage = { classes: rules.classes.length, skills: skillNames.length, supported: Object.values(catalog.skills).filter(s => s.implementation === 'supported').length, unsupported: Object.values(catalog.skills).filter(s => s.implementation === 'unsupported').length };
manifest.skillCoverage.byClass = Object.fromEntries(Object.values(catalog.classes).map(job => [job.id, { sourceTree: job.skills.length, supported: job.skills.filter(id => catalog.skills[id].implementation === 'supported').length, unsupported: job.skills.filter(id => catalog.skills[id].implementation === 'unsupported').length }]));
manifest.skillCoverage.supportedSourceNames = Object.values(catalog.skills).filter(s => s.implementation === 'supported').map(s => s.sourceName);
manifest.skillCoverage.unavailable = Object.values(catalog.skills).filter(s => s.implementation === 'unsupported').map(s => ({ skillId: s.id, sourceName: s.sourceName, reason: s.unsupportedReason }));
manifest.senseInspection = {
    skill: 'WZ_ESTIMATION', packet: 'ZC_MONSTER_INFO', packetId: '0x18c',
    packetSource: 'src/map/clif.c:6194..6229', senseType: 3, senseTypeSource: 'src/map/battle.c:7872',
    defenseSource: 'src/map/status.c:3898..3933', targetSource: 'src/map/skill.c:8434..8447',
    currentHp: true, elementalOrder: ['water', 'earth', 'fire', 'wind', 'poison', 'holy', 'dark', 'ghost', 'undead'],
    negativeElementRateClamp: 0, manualOnly: true,
    identityAdaptation: 'Correlate the source packet snapshot with the explicitly selected living Idle actor and encounter generation; never by species alone.',
};
manifest.ruwach = {
    skill: 'AL_RUWACH', status: 'SC_RUWACH', durationMs: 10000, radius: 2, spCost: 10,
    concealmentStatuses: ['SC_HIDING', 'SC_CLOAKING', 'SC_CAMOUFLAGE', 'SC_CLOAKINGEXCEED', 'SC_NEWMOON'],
    damage: '145% MATK, Holy, Hercules level 1; only when concealment is removed',
    sources: ['skill_db.conf:1189..1224', 'skill.c:7569..7577', 'status.c:8297..8303,12422..12434,13346..13355', 'battle.c:1673..1675'],
    pulseMs: 20, scheduling: 'Next valid source pulse is scheduled by target contact; no continuous 20 ms polling',
    idleAdaptation: 'Cast before a concealed target enters radius when it can reach the aura before expiry; only the reveal damage provokes the field mob.',
};
manifest.skillCoverage.combatExpansion = ['AM_LEARNINGPOTION', 'BS_SKINTEMPER', 'BS_WEAPONPERFECT', 'BS_MAXIMIZE', 'SA_DRAGONOLOGY', 'AL_DP', 'PR_ASPERSIO', 'RG_STRIPWEAPON', 'RG_STRIPARMOR', 'RG_STRIPHELM', 'PF_HPCONVERSION', ...oneShotTraps, 'RG_SNATCHER', 'RG_STRIPSHIELD', 'AS_ENCHANTPOISON', 'MC_IDENTIFY'];
manifest.skillCoverage.combatExpansion.push('SA_AUTOSPELL', 'PF_DOUBLECASTING', 'PF_MEMORIZE', 'AL_PNEUMA', 'SM_ENDURE', 'CR_DEFENDER');
manifest.skillCoverage.combatExpansion.push(...controlTraps);
manifest.skillCoverage.combatExpansion.push('MO_STEELBODY', 'LK_BERSERK', 'ASC_EDP');
manifest.skillCoverage.combatExpansion.push('ST_FULLSTRIP', 'ST_REJECTSWORD', 'SM_AUTOBERSERK');
manifest.skillCoverage.combatExpansion.push('AS_POISONREACT', 'AS_SPLASHER');
manifest.skillCoverage.combatExpansion.push('KN_AUTOCOUNTER', 'BS_UNFAIRLYTRICK', 'RG_TUNNELDRIVE');
manifest.skillCoverage.combatExpansion.push('AL_RUWACH');
manifest.skillCoverage.combatExpansion.push('DC_DONTFORGETME');
manifest.skillCoverage.combatExpansion.push('BA_PANGVOICE');
manifest.skillCoverage.combatExpansion.push('DC_WINKCHARM');
manifest.skillCoverage.combatExpansion.push('RG_CLOSECONFINE');
manifest.skillCoverage.combatExpansion.push('PF_MINDBREAKER');
manifest.skillCoverage.combatExpansion.push('PF_FOGWALL', 'SA_VOLCANO', 'SA_DELUGE', 'SA_VIOLENTGALE');
manifest.skillCoverage.combatExpansion.push('MO_BODYRELOCATION');
manifest.skillCoverage.combatExpansion.push('MO_BLADESTOP');
manifest.formulaEvidence = {
    mindBreaker: ['skill.c:8819..8851 source eligibility, chance, status, interrupt and CC cleanup', 'skill_db.conf:12318..12353 range, 30 s, SP and after-cast delay', 'status.c:4541..4553,8737..8739 MDEF percent and MATK percent values', 'status.c:5356..5390 pre-renewal soft MDEF scalar'],
    fogWall: ['skill_db.conf:12381..12412 5x3 ground field, range9, 20 s and 25 SP', 'skill.c:1821..1824 blind applied to field occupants;20317..20326 field layout', 'battle.c:3337..3344 75% ranged weapon and 25% direct-skill reduction;5034..5036 50 point hit penalty for normal ranged attacks'],
    castControl: ['skill.c:8918..8933 Cast Cancel raw additional SP and unit cancel type1', 'skill.c:8934..8976 Spell Breaker current timer boss10pct normal2pct and level5heal', 'unit.c:2519..2574 cancellation types ignore damage interruption flags', 'status.c:278..281 saturating SP zap and300..356 passive damage preserves controls', 'skill_db.conf:8244..8261 and8296..8319 exact SP/cast/range'],
    castControlIdleAdaptations: ['Cast Cancel is exclusively manual with expected own action identity', 'Spell Breaker AFK selects a live engaged NPC caster within9 with strictly useful finish window', 'Solo monsters have no Magic Rod producer; NPC Poison and Blind base SP are zero', 'No PvP actor or general monster SP pool is simulated'],
    priestSoloControl: ['skill.c:8362..8391 Recovery effective undead branch, source controls and mob_unlocktarget', 'skill.c:7113..7121 Lex Silence removal or start100', 'status.c:6951..6961 and7013..7017 Silence/Blind resistance;7110..7218 source integer rounding', 'status.c:7348..7354 resistance RNG before7684..7688 boss and7721..7731 overlap', 'status.c:933..950 Silence gates skill start;10683..10686 cast cancellation controlled by default BL_NUL battle.c:8017', 'mob.c:1585..1634 unlock attack/chase without skill cancellation;1727..1746 minimum think and Blind view3;1794..1864 attacker memory and acquisition', 'mob.h:43..47 minimum random walk4000 and think100', 'pc.c:4503..4523 Haggle uses max merchant/rogue discount and truncation;battle.c:8137 minimum price1'],
    priestSoloControlIdleAdaptations: ['Attack target is separate from pending NPC skill target; encounter membership and paid clocks survive release', 'Only released monsters scan on a100ms deadline; normal combat retains its existing cadence', 'Recent real damage memory is retained through release until a decision; old normal-combat memory is discarded after the minimum100ms think opportunity', 'No loot/slave/assist/rude attack/full AI simulation; normalized geometry is retained and random-walk deadline persists without granting protection', 'AFK Recovery selects effective-undead active attack targets without Blind; Lex selects unsilenced nonboss producers of implemented NPC actions', 'Source toggle and normal Recovery monster-control branches remain in resolver; self escape and other PC targets are outside this solo delivery'],
    poisonBombs: ['battle.c:7141..7161 normal-attempt React including blocked hits, body element and RNG order', 'status.c:7906..7909 integer charges and50pct', 'skill.c:22573 omitted element defaults Neutral', 'skill.c:9327..9342 Splasher HP/boss check and cooldown', 'status.c:12651..12664 actual Splasher duration+500ms', 'skill.c:5252..5261 pre-re weapon explosion and5330..5337 target search/item ownership', 'skill_db.conf:5063..5067 IgnoreElement/IgnoreFlee and no SplitDamage', 'skill.c:1717..1722 Poison additional effect and secondary duration'],
    poisonBombIdleAdaptations: ['Automatic rotation does not recast an active React buff or refresh an armed bomb', 'Invalid automatic bomb targets are skipped before spending resources; Hercules cast-end rejection spends SP before its HP/boss check', 'Bomb identity and deadlines persist through AFK reconnect and shift with the explicit Idle pause'],
    reactiveSolo: ['skill.c:3050..3075,8569..8589 joint FullStrip attempt and chemical slots', 'sc_config.conf:455..510 strip statuses have no NoBoss flag', 'status.c:4177,4252,4448,4516 additive strip stat percentages', 'battle.c:6305..6328 reflection before Reject and primary channel halving', 'status.c:8466 Reject three charges and infinite duration', 'status.c:363,563,7879,11389 automatic Provoke threshold and ownership', 'battle.c:1485..1511 pre-re PC soft DEF only', 'battle.c:5573..5595 ATK percentage before skill ratio'],
    reactiveSoloIdleAdaptations: ['Auto Berserk uses a pure current HP/maxHP projection so every HP change and maximum-HP change reconciles the automatic Provoke immediately', 'Full Strip targets monster stat penalties; no monster inventory or equipment removal is fabricated'],
    soloStances: ['status.c:5167,5318 SteelBody hard DEF/MDEF90', 'status.c:5596 and5863 SteelBody speed/ASPD rate', 'status.c:5963 and10093..10098 Berserk HP/SP/activation drain', 'battle.c:3087..3089 pre-re Berserk skillratio', 'status.c:11559..11569 and12630..12635 Berserk ending, regeneration and timer', 'pc.c:5371,10266,10505 item and equipment locks', 'skill_db.conf:7911..7940 and10883..10900 source costs/duration'],
    deadlyPoison: ['battle.c:5830..5840 pre-re EDP weapon rate and exclusions', 'status.c:7894..7901 chance and rate', 'skill.c:1695..1698 normal hit DPOISON', 'status.c:8210..8232 initial damage and tick values', 'status.c:12473..12494 lethal periodic damage', 'skill_db.conf:11543..11598 duration, SP and Poison Bottle'],
    hunterControlTraps: ['skill.c:4189..4224 NOFOOTSET includes caster and neutral monsters', 'skill.c:14178..14500 trap timer, splash and used-unit lifetime', 'skill.c:1789..1805 Sleep/Blind rates', 'status.c:7023..7027 and7189..7200 Ankle boss/AGI resistance and five-second floor', 'skill.c:3085..3142 knockback immunity and direction reversal', 'skill.c:19613..19654 unused trap floor refund'],
    hunterTrapIdleAdaptations: ['Automatic rotation keeps one armed unit per skill and chooses a free nearby cell', 'Source cells use the authoritative normalized scene; GAT wall and map noknockback flags are not simulated by this server', 'Unused trap floor drops use the same automatic collection and visible loot as monster drops'],
    sageCasting: ['db/pre-re/autospell_db.conf learned-spell caps', 'battle.c:7049..7075 normal-attack proc and discounted SP', 'skill.c:3963..3971 nonrecursive Bolt timer', 'status.c:8472..8474 five Memorize charges', 'unit.c:1779..1780 and1984..1985 IgnoreStatusEffect guard', 'skill.c:17563..17585 Memorize cast-time and consumption'],
    classicDefenses: ['skill.c:12082..12092 ground NOREITERATION and4153..4166 Pneuma layout', 'battle.c:3253 ranged nonmagic Pneuma block', 'status.c:8859..8865 Defender reduction and rate', 'status.c:3396..3401 ASPD rate before motion clamp', 'status.c:338 Endure charge removal below zero', 'battle.c:4864 motion snapshot before status_damage'],
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
    soloSkills: ['skill.c:1645..1656 pre-renewal Gank probability and pc_steal_item call', 'status.c:4516..4517 shield strip DEF percent additive category', 'skill.c:1641..1694 normal-hit Enchant Poison', 'status.c:7936..7946 enchant chance and replacement', 'skill.c:7619..7631 Enchant Poison property rejection', 'skill.c:8456..8466 Identify flat SP cost'],
    range: ['battle.c:7685 player circular/client and monster square range', 'path.c:494..505 floor(max(0,sqrt(dx*dx+dy*dy)-0.0625)) client range', 'skill.c:1096..1115 negative skill range absolute under default skillrange_from_weapon=BL_NUL; RangeModByVulture', 'mob_db.conf AttackRange', 'item_db.conf Range'],
};
const slotFromLoc = loc => { if (Array.isArray(loc))
    loc = loc.join('|'); return /EQP_ARMS|EQP_WEAPON/.test(loc ?? '') ? 'weapon' : /EQP_ARMOR/.test(loc ?? '') ? 'armor' : /EQP_SHIELD/.test(loc ?? '') ? 'shield' : /EQP_HEAD/.test(loc ?? '') ? 'head' : /EQP_GARMENT/.test(loc ?? '') ? 'garment' : /EQP_SHOES/.test(loc ?? '') ? 'shoes' : /EQP_ACC/.test(loc ?? '') ? 'accessory' : undefined; };
const weaponTypes = { W_DAGGER: 'dagger', W_1HSWORD: 'sword', W_2HSWORD: 'sword', W_1HSPEAR: 'spear', W_2HSPEAR: 'spear', W_1HAXE: 'axe', W_2HAXE: 'axe', W_MACE: 'mace', W_2HMACE: 'mace', W_STAFF: 'staff', W_2HSTAFF: 'staff', W_BOW: 'bow', W_BOOK: 'book', W_KATAR: 'katar', W_MUSICAL: 'instrument', W_WHIP: 'whip' };
// Reagents keep their inventory role even when their native usable script is inert.
const protectedReagentIds = new Set(Object.values(catalog.skills).flatMap(skill =>
    (skill.itemCostByLevel ?? []).flatMap(costs => costs.map(cost => cost.itemId))));
for (const line of buffers['db/produce_db.txt'].toString('utf8').split(/\r?\n/)) {
    if (!/^\d+,/.test(line)) continue;
    const values = line.split(',').map(Number);
    if (values[2] !== 228) continue;
    for (let i = 4; i < values.length; i += 2)
        if (Number.isSafeInteger(values[i]) && values[i] > 0) protectedReagentIds.add(values[i]);
}
for(const recipe of pharmacyRecipes)protectedReagentIds.add(recipe.outputItemId);
manifest.materialProtection = { sources: ['db/pre-re/skill_db.conf ItemCost', 'db/produce_db.txt AM_PHARMACY'],
    behavior: 'Skill reagents and potion recipe materials/manuals are excluded from the bulk common-loot sale; individual sale remains available.' };
function includeItem(raw, shop = false, drop = false) {
    const i = inheritedItem(raw);
    const defenseElement = staticDefenseElement(i);
    if (catalog.items[i.Id]) {
        if (shop)
            catalog.items[i.Id].shop = true;
        return true;
    }
    let type = 'loot', slot = slotFromLoc(i.Loc), weaponType = weaponTypes[i.Subtype], unsupportedEffect = false;
    if ((rules.converterMaterials??[]).includes(i.Id)) { type='material';unsupportedEffect=!!i.Script; }
    else if (protectedReagentIds.has(i.Id) && !rules.heal[i.Id] && i.Id !== 611 && !['IT_WEAPON', 'IT_ARMOR', 'IT_CARD'].includes(i.Type)) { type = 'material'; unsupportedEffect = !!i.Script; }
    else if (i.Type === 'IT_CARD') {
        type = 'card';
        if (!rules.cards[i.Id] && !defenseElement) {
            if (!drop) return false;
            unsupportedEffect = true;
        }
    }
    else if (i.Type === 'IT_HEALING' || i.Type === 'IT_USABLE' || i.Type === 'IT_DELAYCONSUME') {
        // Poison Bottle is a reagent here; its original drinking script is not executed.
        if (i.Id === 678) { type = 'material'; unsupportedEffect = true; }
        else if (rules.heal[i.Id] || i.Id === 611) type = 'consumable';
        else {
            if (!drop) return false;
            unsupportedEffect = true;
        }
    }
    else if (i.Type === 'IT_WEAPON' || i.Type === 'IT_ARMOR') {
        type = 'equipment';
        unsupportedEffect = !!i.Script && !rules.itemEffects[i.Id] && !defenseElement;
    }
    else if ([984, 985, 990, 716, 717, 1025, 7136].includes(i.Id))
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
    if (defenseElement) catalog.items[i.Id].defenseElement = defenseElement;
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
// All and only complete property-only body scripts; compound scripts stay inert.
manifest.bodyElementItems = [];
for (const raw of Object.values(itemById)) {
    const item = inheritedItem(raw), element = staticDefenseElement(item);
    if (!element) continue;
    includeItem(raw);
    manifest.bodyElementItems.push({ itemId: item.Id, element, scriptSha256: sha(item.Script) });
}
manifest.bodyElementItems.sort((a, b) => a.itemId - b.itemId);
// Every referenced reagent remains a real source item. Unsupported usable
// scripts stay inert; presence in a skill cost never enables a script.
for (const id of new Set(Object.values(catalog.skills).flatMap(s => (s.itemCostByLevel ?? []).flat().map(cost => cost.itemId))))
    includeItem(itemById[id], false, true);
const pharmacyItemIds=new Set(pharmacyRecipes.flatMap(recipe=>[recipe.outputItemId,...recipe.ingredients.map(i=>i.itemId)]));
for(const id of pharmacyItemIds)if(!itemById[id]||!includeItem(itemById[id],false,true))throw new Error('Missing Pharmacy item '+id);
for(const id of inertPharmacyOutputIds){const item=catalog.items[id];item.type='material';item.unsupportedEffect=true;item.effects={};}
for(const row of pharmacyNpcStock){
 if(!itemById[row.itemId]||!includeItem(itemById[row.itemId],true,true))throw new Error('Missing Pharmacy shop item '+row.itemId);
 const item=catalog.items[row.itemId];if(row.discount&&item.buyPrice!==row.price)throw new Error('Pinned Pharmacy trader price differs:'+row.itemId);
 item.shopPrice=row.price;item.shopDiscount=row.discount;
}
if(catalog.items[7434].shop)throw new Error('Elemental guide requires Pisruik; sale forbidden');

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
    const magicMonsterIds = new Set([1033, 1120, 1150, 1190, 1708]);
    const supportedNpcMagic = new Set(['MG_FIREBOLT', 'MG_COLDBOLT', 'MG_LIGHTNINGBOLT', 'MG_SOULSTRIKE']);
    const sourceRows = parsed['mob_skill_db.conf'].mob_skill_db[0][m.SpriteName] ?? {};
    const npcStatusSkills = [];
    let sourceRowIndex = 0;
    for (const [sourceName, npcEntry] of orderedConfigEntries(sourceRows)) {
        const rowIndex = sourceRowIndex++;
        const selectedStatus = id === 1175 && sourceName === 'NPC_POISON' || id === 1061 && sourceName === 'NPC_BLINDATTACK';
        const selectedMagic = magicMonsterIds.has(id) && supportedNpcMagic.has(sourceName);
        if (!selectedStatus && !selectedMagic) continue;
        const condition = npcEntry.CastCondition ?? 'MSC_ALWAYS';
        const state = npcEntry.SkillState;
        const npcDb = skillByName[sourceName];
        if (!npcDb || npcEntry.SkillTarget !== 'MST_TARGET' || !['MSS_BERSERK', 'MSS_RUSH'].includes(state) ||
            !['MSC_ALWAYS', 'MSC_SKILLUSED'].includes(condition) || condition === 'MSC_SKILLUSED' && !Number.isSafeInteger(npcEntry.ConditionData))
            continue;
        if (selectedStatus) {
            if (state !== 'MSS_BERSERK' || condition !== 'MSC_ALWAYS') throw new Error('Invalid selected NPC status source: ' + id);
            npcStatusSkills.push({ skillId: npcDb.Id, sourceName, level: npcEntry.SkillLevel ?? 1, rate: npcEntry.Rate ?? 1,
                castTimeMs: npcEntry.CastTime ?? 0, delayMs: npcEntry.Delay ?? 0, cancelable: npcEntry.Cancelable ?? false,
                range: Math.abs(npcDb.Range ?? 9), status: npcDb.StatusChange,
                durationMs: typeof npcDb.SkillData2 === 'number' ? npcDb.SkillData2 : Object.values(npcDb.SkillData2 ?? {})[0],
                state, condition, sourceRowIndex: rowIndex, ...(npcEntry.ConditionData === undefined ? {} : { conditionData: npcEntry.ConditionData }) });
            continue;
        }
        const level = npcEntry.SkillLevel ?? 1;
        const hits = Math.abs(byLevel(npcDb.NumberOfHits, npcDb.MaxLevel ?? level, 1)[level - 1] ?? 1);
        npcStatusSkills.push({ skillId: npcDb.Id, sourceName, damageType: 'magic', element: (npcDb.Element ?? 'Ele_Neutral').replace('Ele_', '').toLowerCase(),
            hitCount: hits, baseSp: byLevel(npcDb.Requirements?.SPCost, npcDb.MaxLevel ?? level)[level - 1] ?? 0,
            level, rate: npcEntry.Rate ?? 1, castTimeMs: npcEntry.CastTime ?? 0, delayMs: npcEntry.Delay ?? 0,
            cancelable: npcEntry.Cancelable ?? false, range: Math.abs(npcDb.Range ?? 9), state, condition, sourceRowIndex: rowIndex,
            ...(npcEntry.ConditionData === undefined ? {} : { conditionData: npcEntry.ConditionData }) });
    }
    catalog.monsters[id] = { ...(npcStatusSkills.length && { npcStatusSkills }), id, name: rules.monsterNameAliases?.[id] ?? m.Name, aegisName: m.SpriteName, sprite: { spr: path + '.spr', act: path + '.act' }, level: m.Lv ?? 1, hp: m.Hp ?? 1, attack: m.Attack ?? [0, 0], def: m.Def ?? 0, mdef: m.Mdef ?? 0, boss: m.Mode?.Boss === true, detector: m.Mode?.Detector === true, aggressive: m.Mode?.Aggressive === true, canMove: m.Mode?.CanMove === true, noKnockback: m.Mode?.NoKnockback === true, moveSpeedMs: m.MoveSpeed ?? 200, viewRange: m.ViewRange ?? 10, chaseRange: m.ChaseRange ?? 12, stats: Object.fromEntries(['Str', 'Agi', 'Vit', 'Int', 'Dex', 'Luk'].map(s => [s.toLowerCase(), m.Stats?.[s] ?? 0])), baseExp: m.Exp ?? 0, jobExp: m.JExp ?? 0, attackDelay: m.AttackDelay ?? 4000, ...(Number.isFinite(m.AttackMotion) ? { attackMotionMs: m.AttackMotion } : {}), ...(Number.isFinite(m.DamageMotion) ? { damageMotionMs: m.DamageMotion } : {}), attackRange: m.AttackRange ?? 1, element: (m.Element?.[0] ?? 'Ele_Neutral').replace('Ele_', '').toLowerCase(), elementLevel: m.Element?.[1] ?? 1, size: (m.Size ?? 'Size_Small').replace('Size_', '').toLowerCase(), race: (m.Race ?? 'RC_Formless').replace('RC_', '').toLowerCase(), drops, ...(mvpDrops.length ? { mvpDrops } : {}) };
}
manifest.npcMagicProduction.runtimeRows = npcMagicRuntimeIds.flatMap(monsterId => (catalog.monsters[monsterId].npcStatusSkills ?? [])
    .filter(row => row.damageType === 'magic').map(row => ({ monsterId, sourceRowIndex: row.sourceRowIndex, sourceName: row.sourceName,
        level: row.level, rate: row.rate, castTimeMs: row.castTimeMs, delayMs: row.delayMs, cancelable: row.cancelable,
        range: row.range, hitCount: row.hitCount, baseSp: row.baseSp, state: row.state, condition: row.condition,
        ...(row.conditionData === undefined ? {} : { conditionData: row.conditionData }) })));
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
for (const [weapon, col] of Object.entries({ dagger: 1, sword: 2, spear: 4, axe: 6, mace: 8, staff: 10, bow: 11, instrument: 13, whip: 14, book: 15, katar: 16 }))
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
manifest.skillSources.al_teleport.adaptation = 'Manual field-hunting only: current learned-level SP cost for either menu choice; Random uses interior passable cells in the existing navigation component to keep AFK routes reachable. Level2 offers the sole Idle save-point Prontera. Town, sitting and challenge use are excluded; source noteleport flags gate both choices. Warp cancels encounter targeting/casts and owned ground groups, preserving population HP/IDs/respawns and ordinary progression. No AFK automatic teleport.';
manifest.mountedPecoEvidence = {
    mechanics: ['pc.c:695..700,8985..8988,9220..9227,9391..9398', 'status.c:1857..1861,2140..2148,2173..2174,5421..5441,5534..5599', 'battle.c:764..770,2145..2156', 'skill.c:7971..7973,17857..18012'],
    visuals: ['roBrowserLegacy d88a3cd4 DB/Jobs/JobNameTable.js:30,39,59,67', 'DB/Jobs/WeaponJobTable.js:50..59,130..140', 'DB/Jobs/WeaponAction.js:171..182,247..257', 'DB/Skills/SkillAction.js:137..143'],
    adaptations: ['Peco state is optional for older profiles; mount/dismount is explicit and idempotent without invented rental cost', 'Directional Brandish uses normalized encounter cells; source GAT walls and canonical map noknockback flags are not imported by this export pipeline'],
};
manifest.sightBlasterSource = {
    skill: 'db/pre-re/skill_db.conf:18587..18610',
    statusFlags: 'db/pre-re/sc_config.conf:1264..1273 (NoSave, NoDeathReset)',
    castAndStatus: ['src/map/skill.c:7568..7583', 'src/map/status.c:8297..8303,12422..12434,13361..13375'],
    damage: 'src/map/battle.c:4019..4065',
    knockback: 'src/map/skill.c:3085..3145',
    volatileStatusPolicy: 'kept in process memory for the browser connection and cleared on a new connection',
    contactPolicy: 'one successful pulse across the target and all eligible nearby enemies, processed on the combat deadline timeline',
};
catalog.source.hash = sha(JSON.stringify(catalog));
manifest.weaponCadence = {
    source: 'src/map/status.c:14166..14177,14300..14308,14983..14988,3763..3779',
    inheritance: 'Copy final parent BaseASPD, then override own weapon entries; defaults2000',
    keyMapping: { Instrument: 'instrument', Fist: 'unarmed' },
    twoHandedKeys: { sword: 'twoHandSword', spear: 'twoHandSpear', axe: 'twoHandAxe', mace: 'twoHandMace', staff: 'twoHandStaff' },
    unarmed: 'Fist or native2000 default', equippedMissingSubtype: 2000,
    statsFormula: 'base - trunc(base * (4 * AGI + DEX) / 1000)',
    shieldPolicy: 'No RENEWAL_ASPD shield surcharge in pre-renewal',
};
const text = JSON.stringify(catalog, null, 2) + '\n';
manifest.catalogSha256 = sha(text);
manifest.hashConvention = 'Catalog.source.hash = SHA256 of compact catalog with source.hash empty. catalogSha256 hashes emitted file bytes.';
const output = arg('--output') ? resolve(arg('--output')) : resolve(root, 'content/catalog.json');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, text);
await writeFile(resolve(dirname(output), 'source-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Exported ${Object.keys(catalog.monsters).length} monsters, ${Object.keys(catalog.items).length} items, ${Object.keys(catalog.classes).length} classes, ${Object.keys(catalog.skills).length} skills. SHA256 ${manifest.catalogSha256}`);
