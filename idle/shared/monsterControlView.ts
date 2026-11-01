import type {BattleEnemy} from './types.js';
export function monsterControlLabel(enemy:BattleEnemy|undefined,at:number):string {
 const effect=enemy?.statuses?.SC_ARMOR_PROPERTY;
 const names:Record<string,string>={water:'Água',earth:'Terra',fire:'Fogo',wind:'Vento'};
 const conversion=effect&&effect.expiresAt>at&&names[effect.element??'']&&effect.elementLevel?`Conversão: ${names[effect.element!]} Nv. ${effect.elementLevel}`:'';
 return [['SC_BLIND','Cegueira'],['SC_SILENCE','Silêncio']].filter(([status])=>(enemy?.statuses?.[status]?.expiresAt??0)>at).map(([,label])=>label).concat(conversion?[conversion]:[]).join(' · ');
}
