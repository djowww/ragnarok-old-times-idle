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
const allItems = parsed['item_db.conf'].item_db;
const itemByName = Object.fromEntries(allItems.map(i => [i.AegisName, i]));
const itemById = Object.fromEntries(allItems.map(i => [i.Id, i]));
function inheritedItem(item, trail = []) { if (!item.CloneItem)
    return item; if (trail.includes(item.Id))
    throw new Error('CloneItem cycle'); const parent = typeof item.CloneItem === 'number' ? itemById[item.CloneItem] : itemByName[item.CloneItem]; if (!parent)
    throw new Error('Missing CloneItem'); return { ...inheritedItem(parent, [...trail, item.Id]), ...item }; }
const catalog = { version: rules.version, source: { commit: rules.commit, files: files.map(f => 'db/pre-re/' + f), hash: '' }, rates: rules.rates, monsters: {}, items: {}, classes: {}, skills: {}, areas: rules.areas, quests: [], challenges: [], exp: { base: [], job: {} }, elementModifiers: {}, sizeModifiers: {} };
function actorSprite(job, gender) { const sex = gender === 'male' ? '남' : '여'; const base = 'data/sprite/인간족/몸통/' + sex + '/' + rules.spriteJobs[job] + '_' + sex; const head = 'data/sprite/인간족/머리통/' + sex + '/1_' + sex; return { spr: base + '.spr', act: base + '.act', headSpr: head + '.spr', headAct: head + '.act' }; }
for (const rule of rules.classes) {
    const job = resolveInheritance(jobs, rule.source);
    const { source, spriteJob, ...rest } = rule;
    catalog.classes[rule.id] = { ...rest, jobCap: rule.tier === 0 ? 10 : rule.trans && rule.tier === 2 ? 70 : 50, expGroup: job.JobExpGroup, hp: job.HPTable.slice(0, 99).map(n => rule.trans ? n + Math.floor(n * 25 / 100) : n), sp: job.SPTable.slice(0, 99).map(n => rule.trans ? n + Math.floor(n * 25 / 100) : n), sprite: { male: actorSprite(spriteJob, rule.gender ?? 'male'), female: actorSprite(spriteJob, rule.gender ?? 'female') } };
    manifest.classSources[rule.id] = { job: source, baseExpGroup: job.BaseExpGroup, jobExpGroup: job.JobExpGroup };
}
function byLevel(value, max) { return Array.from({ length: max }, (_, i) => typeof value === 'number' ? value : Number(value?.['Lv' + (i + 1)] ?? 0)); }
for (const rule of rules.skills) {
    const src = skillByName[rule.source];
    if (!src)
        throw new Error('Missing source skill ' + rule.source);
    const { source, powerStart, powerStep, ...rest } = rule;
    const maxLevel = Math.min(src.MaxLevel, rule.maxLevel);
    catalog.skills[rule.id] = { ...rest, maxLevel, iconResource: 'data/texture/유저인터페이스/item/' + src.Name.toLowerCase() + '.bmp', description: rule.description, spCost: byLevel(src.Requirements?.SPCost ?? 0, maxLevel), power: Array.from({ length: maxLevel }, (_, i) => powerStart + i * powerStep), ...src.Requirements?.ZenyCost && { zenyCost: byLevel(src.Requirements.ZenyCost, maxLevel) } };
    manifest.skillSources[rule.id] = { id: src.Id, name: source, sourceMaxLevel: src.MaxLevel, sourceRequirements: src.Requirements ?? {}, unsupportedRequirements: Object.keys(src.Requirements ?? {}).filter(k => !['SPCost', 'ZenyCost'].includes(k)) };
}
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
        if (rules.heal[i.Id]) type = 'consumable';
        else {
            if (!drop) return false;
            unsupportedEffect = true;
        }
    }
    else if (i.Type === 'IT_WEAPON' || i.Type === 'IT_ARMOR') {
        if (slot && (i.Type !== 'IT_WEAPON' || weaponType) && (!i.Script || rules.itemEffects[i.Id])) type = 'equipment';
        else {
            if (!drop) return false;
            unsupportedEffect = true;
        }
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
    if (type === 'equipment')
        catalog.items[i.Id].refinable = slot !== 'accessory' && i.Refine !== false;
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
    catalog.monsters[id] = { id, name: rules.monsterNameAliases?.[id] ?? m.Name, aegisName: m.SpriteName, sprite: { spr: path + '.spr', act: path + '.act' }, level: m.Lv ?? 1, hp: m.Hp ?? 1, attack: m.Attack ?? [0, 0], def: m.Def ?? 0, mdef: m.Mdef ?? 0, stats: Object.fromEntries(['Str', 'Agi', 'Vit', 'Int', 'Dex', 'Luk'].map(s => [s.toLowerCase(), m.Stats?.[s] ?? 0])), baseExp: m.Exp ?? 0, jobExp: m.JExp ?? 0, attackDelay: m.AttackDelay ?? 4000, element: (m.Element?.[0] ?? 'Ele_Neutral').replace('Ele_', '').toLowerCase(), elementLevel: m.Element?.[1] ?? 1, size: (m.Size ?? 'Size_Small').replace('Size_', '').toLowerCase(), race: (m.Race ?? 'RC_Formless').replace('RC_', '').toLowerCase(), drops, ...(mvpDrops.length ? { mvpDrops } : {}) };
}
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
