import { describe, expect, it } from 'vitest';
import { applyCommand, createInitialState } from '../engine/index';
import { parseCommandRequest } from '../server/validation';
import type { GameCommand } from '../shared/types';
import { fixture } from './engine-fixture';
function setup() {
 const c=fixture(); c.skills.defender={...c.skills.firebolt,id:'defender',sourceName:'CR_DEFENDER',kind:'buff',implementation:'supported'};
 c.classes.novice.skills.push('defender'); const s=createInitialState(c,0); s.learnedSkills.defender=5;
 s.buffs.defender={expiresAt:10000,effects:{}}; s.sp=0; return {s,c};
}
const cancel: GameCommand={type:'cancelBuff',skillId:'defender'};
describe('manual toggle status cancellation',()=>{
 it('cancels active learned Defender without SP and retains rotation',()=>{
  const {s,c}=setup(); s.rotation=['defender']; const next=applyCommand(s,c,cancel,0);
  expect(next.buffs.defender).toBeUndefined(); expect(next.sp).toBe(0); expect(next.rotation).toEqual(['defender']);
  expect(s.buffs.defender).toBeDefined();
 });
 it('rejects unsupported, unlearned, out of tree and inactive statuses',()=>{
  for(const mode of ['unsupported','unlearned','tree','inactive']) {
   const {s,c}=setup();
   if(mode==='unsupported') c.skills.defender.implementation='unsupported';
   if(mode==='unlearned') s.learnedSkills.defender=0;
   if(mode==='tree') c.classes.novice.skills=[];
   if(mode==='inactive') delete s.buffs.defender;
   expect(()=>applyCommand(s,c,cancel,0)).toThrow();
  }
 });
 it('rejects active statuses that have no classic cancellation mechanic',()=>{
  const {s,c}=setup(); c.skills.defender.sourceName='SA_AUTOSPELL';
  expect(()=>applyCommand(s,c,cancel,0)).toThrow();
 });
 it('accepts a token skill ID and rejects malformed cancellation requests',()=>{
  expect(parseCommandRequest({requestId:'cancel_123',command:cancel}).command).toEqual(cancel);
  for(const skillId of [null,'',123]) expect(()=>parseCommandRequest({requestId:'cancel_123',command:{type:'cancelBuff',skillId}})).toThrow();
 });
});
