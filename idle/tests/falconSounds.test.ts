import {describe,it,expect,vi} from 'vitest';
import {falconSoundResource,FalconSoundBank} from '../web/assets/falconSounds';
describe('original Falcon sound resources',()=>{
 it.each(['HT_BLITZBEAT','SN_FALCONASSAULT'])('%s uses native Blitz sound',source=>expect(falconSoundResource(source)).toBe('data/wav/effect/hunter_blitzbeat.wav'));
 it('uses the Detect sound, with no generic aura sound',()=>expect(falconSoundResource('HT_DETECTING')).toBe('data/wav/effect/hunter_detecting.wav'));
 it('does not invent resources for another skill',()=>expect(falconSoundResource('HT_FALCON')).toBeUndefined());
});

function audioFixture(){
 const nodes:any[]=[],context={resume:vi.fn(async()=>{}),destination:{},decodeAudioData:vi.fn(async()=>({})),createGain:()=>({gain:{value:0},connect:vi.fn()}),createBufferSource:()=>{const node={connect:vi.fn(),start:vi.fn(),stop:vi.fn(),buffer:null,onended:null};nodes.push(node);return node;}};
 const load=vi.fn(async()=>new ArrayBuffer(8)),bank=new FalconSoundBank(()=>context as unknown as AudioContext,load);return{bank,nodes,context,load};
}
describe('optional source sound playback',()=>{
 it('loads nothing and stays silent until the user enables effects',async()=>{const{bank,nodes,load}=audioFixture();await bank.play('a','HT_BLITZBEAT');expect(load).not.toHaveBeenCalled();expect(nodes).toHaveLength(0);});
 it('resumes on enable, caches the native WAV and plays once per action',async()=>{const{bank,nodes,context,load}=audioFixture();expect(await bank.enable(true)).toBe(true);expect(context.resume).toHaveBeenCalledTimes(1);await bank.play('a','HT_BLITZBEAT');await bank.play('a','HT_BLITZBEAT');await bank.play('b','SN_FALCONASSAULT');expect(load).toHaveBeenCalledTimes(1);expect(nodes).toHaveLength(2);expect(nodes[0].start).toHaveBeenCalledTimes(1);});
 it('stops active sources and cannot play a disabled or unsupported effect',async()=>{const{bank,nodes,load}=audioFixture();await bank.enable(true);await bank.play('a','HT_BLITZBEAT');await bank.enable(false);expect(nodes[0].stop).toHaveBeenCalledTimes(1);await bank.play('b','HT_DETECTING');await bank.play('c','HT_FALCON');expect(load).toHaveBeenCalledTimes(1);});
});
