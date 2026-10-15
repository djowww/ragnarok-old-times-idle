import {assetUrl} from './items';
export function falconSoundResource(source:string):string|undefined{
 if(source==='HT_DETECTING')return 'data/wav/effect/hunter_detecting.wav';
 if(['HT_BLITZBEAT','SN_FALCONASSAULT'].includes(source))return 'data/wav/effect/hunter_blitzbeat.wav';
 return undefined;
}
/** Two lazy native WAVs; browser audio is resumed only by the user's effects toggle. */
export class FalconSoundBank {
 private context:AudioContext|undefined;
 private enabled=false;
 private version=0;
 private seen=new Set<string>();
 private buffers=new Map<string,Promise<AudioBuffer|null>>();
 private failedUntil=new Map<string,number>();
 private active=new Set<AudioBufferSourceNode>();
 constructor(private readonly createContext:()=>AudioContext=()=>new AudioContext(),
  private readonly load:(url:string)=>Promise<ArrayBuffer>=async url=>{
   const response=await fetch(url,{signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw new Error('Native sound unavailable');return response.arrayBuffer();
  }){}
 async enable(enabled:boolean):Promise<boolean>{
  const version=++this.version;this.enabled=false;
  if(!enabled){for(const node of this.active)try{node.stop();}catch{}this.active.clear();return false;}
  try{this.context??=this.createContext();await this.context.resume();if(version===this.version)this.enabled=true;}
  catch{this.enabled=false;}return this.enabled;
 }
 async play(id:string,source:string):Promise<void>{
  if(this.seen.has(id))return;
  this.seen.add(id);if(this.seen.size>64)this.seen.delete(this.seen.values().next().value!);
  const path=falconSoundResource(source),context=this.context,version=this.version;
  if(!this.enabled||!context||!path||(this.failedUntil.get(path)??0)>Date.now())return;
  let buffer=this.buffers.get(path);
  if(!buffer){buffer=this.load(assetUrl(path)).then(bytes=>context.decodeAudioData(bytes)).catch(()=>{
   this.buffers.delete(path);this.failedUntil.set(path,Date.now()+30000);return null;
  });this.buffers.set(path,buffer);}
  const decoded=await buffer;if(!decoded||!this.enabled||version!==this.version)return;
  if(this.active.size>=4){const oldest=this.active.values().next().value!;try{oldest.stop();}catch{}this.active.delete(oldest);}
  const node=context.createBufferSource(),gain=context.createGain();gain.gain.value=.15;
  node.buffer=decoded;node.connect(gain);gain.connect(context.destination);
  node.onended=()=>this.active.delete(node);this.active.add(node);node.start();
 }
}
export const falconSounds=new FalconSoundBank();
