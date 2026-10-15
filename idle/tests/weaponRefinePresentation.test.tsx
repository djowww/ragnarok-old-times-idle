// @vitest-environment jsdom
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import raw from '../content/catalog.json';
import { createInitialState, getSnapshot } from '../engine';
import type { Catalog, GameCommand, GameState } from '../shared/types';
import Build from '../web/panels/Build';
import App from '../web/App';
const qa=vi.hoisted(()=>({game:undefined as any}));
vi.mock('../web/api',()=>({useGame:()=>qa.game}));
vi.mock('../web/portal/AuthProvider',()=>({useAuth:()=>({logout:async()=>{}})}));
vi.mock('../web/components/Scene',()=>({default:()=> <div data-testid="live-scene" />}));
vi.mock('../web/components/CharacterSelect',()=>({default:({onEnter}:{onEnter:()=>void})=><button onClick={onEnter}>Entrar no mundo</button>}));
vi.mock('../web/components/ChatJournal',()=>({default:()=>null}));
vi.mock('../web/components/Offline',()=>({default:()=>null}));
vi.mock('../web/components/AudioToggle',()=>({default:()=>null}));
vi.mock('../web/components/ClassicLoading',()=>({default:()=>null}));

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class {observe(){} disconnect(){}});
  window.matchMedia=vi.fn(()=>({matches:false,addEventListener(){},removeEventListener(){}})) as any;
  localStorage.clear();
  vi.stubGlobal('fetch', async () => new Response('', {status: 404}));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
function setup() {
  const catalog = structuredClone(raw) as unknown as Catalog;
  Object.assign(catalog.skills.ws_weaponrefine, {implementation: 'supported', manualUse: 'weaponRefine'});
  const state = createInitialState(catalog, 0);
  Object.assign(state, {job: 'whitesmith', jobLevel: 49, baseLevel: 80, sp: 100, hp: 500});
  state.learnedSkills = {ws_weaponrefine: 10, bs_weaponresearch: 10};
  state.inventory = [{uid: 'weapon-a', itemId: 1201, quantity: 1, refine: 0, cards: [], favorite: false, identified: true},
    {uid: 'ore', itemId: 1010, quantity: 2, refine: 0, cards: [], favorite: false}];
  state.equipment = {};
  return {catalog, state};
}
const button = (text: string) => [...host.querySelectorAll('button')].find(b => b.textContent?.includes(text));
async function renderBuild(state: GameState, catalog: Catalog, command: (c: GameCommand) => Promise<boolean>, onOpen = vi.fn(), busy = false) {
  await act(async () => root.render(<Build catalog={catalog} snapshot={getSnapshot(state,catalog,0)}
    busy={busy} command={command} mode="skills" onOpenWeaponRefine={onOpen} />));
  return onOpen;
}
describe('manual weapon-refine activation', () => {
  it('opens a learned supported skill with useSkill while hunting, without stop or town navigation', async () => {
    const {state,catalog} = setup(); state.status = 'hunting';
    const commands: GameCommand[] = [], onOpen = vi.fn();
    await renderBuild(state,catalog,async c => { commands.push(c); return true; },onOpen);
    const open = button('Refinar arma'); expect(open).toBeDefined(); expect(open!.disabled).toBe(false);
    await act(async () => open!.click());
    expect(commands).toEqual([{type:'useSkill',skillId:'ws_weaponrefine'}]); expect(onOpen).toHaveBeenCalledTimes(1);
  });
  it('resumes an existing durable menu without another activation or SP requirement', async () => {
    const {state,catalog}=setup(); state.sp=0;
    state.weaponRefineMenu={id:'menu-a',openedAt:0,sceneKey:'town',deaths:0,catalogVersion:catalog.version,learnedLimit:10,
      offeredWeapons:[{uid:'weapon-a',itemId:1201,signature:'server-signature'}]};
    const commands:GameCommand[]=[];
    await renderBuild(state,catalog,async c=>{commands.push(c);return true;});
    const open=button('Retomar refino');expect(open).toBeDefined();expect(open!.disabled).toBe(false);
    await act(async()=>open!.click());expect(commands).toEqual([]);
  });
  it.each(['field','recovery'] as const)('blocks a fresh menu while sitting in %s rest',async restMode=>{
    const {state,catalog}=setup();state.status='resting';state.restMode=restMode;
    const commands:GameCommand[]=[];
    await renderBuild(state,catalog,async c=>{commands.push(c);return true;});
    const open=button('Refinar arma');expect(open).toBeDefined();expect(open!.disabled).toBe(true);
    await act(async()=>open!.click());expect(commands).toEqual([]);
  });
  it.each(['field','recovery'] as const)('resumes a paid menu while sitting in %s rest',async restMode=>{
    const {state,catalog}=setup();state.status='resting';state.restMode=restMode;state.sp=0;menuState(state,catalog);
    const commands:GameCommand[]=[];const onOpen=vi.fn();
    await renderBuild(state,catalog,async c=>{commands.push(c);return true;},onOpen);
    const open=button('Retomar refino');expect(open).toBeDefined();expect(open!.disabled).toBe(false);
    await act(async()=>open!.click());expect(commands).toEqual([]);expect(onOpen).toHaveBeenCalledTimes(1);
  });
  it.each(['unsupported','unlearned','busy'])('does not activate when %s',async why=>{
    const {state,catalog}=setup();
    if(why==='unsupported')catalog.skills.ws_weaponrefine.implementation='unsupported';
    if(why==='unlearned')delete state.learnedSkills.ws_weaponrefine;
    const commands:GameCommand[]=[];
    await renderBuild(state,catalog,async c=>{commands.push(c);return true;},vi.fn(),why==='busy');
    const open=button('Refinar arma');if(open){expect(open.disabled).toBe(true);await act(async()=>open.click());}
    expect(commands).toEqual([]);
  });
});


function menuState(state:GameState,catalog:Catalog) {
  state.weaponRefineMenu={id:'menu-a',openedAt:0,sceneKey:'town',deaths:0,catalogVersion:catalog.version,learnedLimit:10,
    offeredWeapons:[{uid:'weapon-a',itemId:1201,signature:'server-signature'}]};
}
async function renderApp(state:GameState,catalog:Catalog,command:(c:GameCommand)=>Promise<boolean>=async()=>true,busy=false,profileId=state.id) {
  qa.game={catalog,snapshot:getSnapshot(state,catalog,0),busy,command,connected:true,sending:false,retryable:false,error:null,retry:async()=>{}};
  await act(async()=>root.render(<StrictMode><App identity={{accountId:'account-a',username:'tester',profileId,characterName:'Tester'}} onAuthRequired={()=>{}} /></StrictMode>));
}
async function enter() {await act(async()=>button('Entrar no mundo')!.click());}
const dialog=()=>host.querySelector<HTMLElement>('[role="dialog"][aria-label="Refino de arma"]');
describe('durable classical weapon-refine window',()=>{
  it('resumes after character selection, shows native 99.5% and keeps the destructive warning visible',async()=>{
    const {state,catalog}=setup();menuState(state,catalog);const commands:GameCommand[]=[];
    await renderApp(state,catalog,async c=>{commands.push(c);return true;});
    expect(dialog()).toBeNull();await enter();
    expect(dialog()).not.toBeNull();
    expect(dialog()!.textContent).toContain('99,5%');
    expect(dialog()!.textContent).toContain('SP já pago');
    expect(dialog()!.textContent).toContain('incluindo cartas e bônus');
    expect(dialog()!.textContent).toContain('Phracon');
    expect(dialog()!.textContent).toContain('Atual +0');
    expect(dialog()!.textContent).toContain('Próximo +1');
    expect(dialog()!.querySelector('.ro-drag-handle')).not.toBeNull();
    expect(host.querySelector('[data-testid="live-scene"]')).not.toBeNull();
    expect(commands).toEqual([]);
  });
  it('requires an explicit confirmation before sending only the offered UID and menu ID',async()=>{
    const {state,catalog}=setup();menuState(state,catalog);const commands:GameCommand[]=[];
    await renderApp(state,catalog,async c=>{commands.push(c);return true;});await enter();
    const confirm=button('Confirmar refino');expect(confirm).toBeDefined();expect(confirm!.disabled).toBe(true);
    const accept=dialog()!.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await act(async()=>accept.click());expect(confirm!.disabled).toBe(false);
    await act(async()=>{confirm!.click();confirm!.click();});
    expect(commands).toEqual([{type:'weaponRefine',menuId:'menu-a',uid:'weapon-a'}]);
  });
  it('distinguishes same-model weapons by cards, rarity and bonus before destructive consent',async()=>{
    const {state,catalog}=setup();menuState(state,catalog);
    const cards=Object.values(catalog.items).filter(item=>item.type==='card').slice(0,2);
    expect(cards).toHaveLength(2);
    Object.assign(state.inventory[0],{refine:3,cards:[cards[0].id],rarity:'epic',rarityBonus:{stat:'str',value:5},favorite:true});
    state.inventory.push({...structuredClone(state.inventory[0]),uid:'weapon-b',cards:[cards[1].id],rarity:'rare',rarityBonus:{stat:'int',value:2},favorite:false,broken:true});
    state.weaponRefineMenu!.offeredWeapons.push({uid:'weapon-b',itemId:1201,signature:'second-server-signature'});
    const commands:GameCommand[]=[];
    await renderApp(state,catalog,async c=>{commands.push(c);return true;});await enter();
    const select=dialog()!.querySelector<HTMLSelectElement>('.weapon-refine-select select')!;
    expect(select.options[0].textContent).toContain('Épico');
    expect(select.options[0].textContent).toContain('STR +5');
    expect(select.options[0].textContent).toContain(cards[0].name);
    expect(select.options[0].textContent).toContain('Favorita');
    expect(select.options[1].textContent).toContain('Raro');
    expect(select.options[1].textContent).toContain('INT +2');
    expect(select.options[1].textContent).toContain(cards[1].name);
    expect(select.options[1].textContent).toContain('Quebrada');
    for(const selector of ['.weapon-refine-detail','.weapon-refine-confirm']){
      expect(dialog()!.querySelector(selector)!.textContent).toContain(cards[0].name);
      expect(dialog()!.querySelector(selector)!.textContent).toContain('STR +5');
    }
    await act(async()=>dialog()!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    await act(async()=>{select.value='weapon-b';select.dispatchEvent(new Event('change',{bubbles:true}));});
    expect(button('Confirmar refino')!.disabled).toBe(true);
    for(const selector of ['.weapon-refine-detail','.weapon-refine-confirm']){
      const text=dialog()!.querySelector(selector)!.textContent;
      expect(text).toContain(cards[1].name);expect(text).toContain('INT +2');expect(text).not.toContain('STR +5');
    }
    await act(async()=>dialog()!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    await act(async()=>button('Confirmar refino')!.click());
    expect(commands).toEqual([{type:'weaponRefine',menuId:'menu-a',uid:'weapon-b'}]);
  });
  it.each(['cards','rarity','bonus','favorite','broken'])('requires fresh consent if selected weapon %s changes',async field=>{
    const {state,catalog}=setup();menuState(state,catalog);
    Object.assign(state.inventory[0],{rarity:'epic',rarityBonus:{stat:'str',value:5}});
    await renderApp(state,catalog);await enter();
    await act(async()=>dialog()!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect(button('Confirmar refino')!.disabled).toBe(false);
    const item=state.inventory[0];
    if(field==='cards')item.cards=[Object.values(catalog.items).find(i=>i.type==='card')!.id];
    if(field==='rarity')item.rarity='rare';
    if(field==='bonus')item.rarityBonus={stat:'str',value:4};
    if(field==='favorite')item.favorite=true;
    if(field==='broken')item.broken=true;
    await renderApp(state,catalog);
    expect(dialog()!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false);
    expect(button('Confirmar refino')!.disabled).toBe(true);
  });
  it.each(['ore','limit','maximum','equipped','unidentified'])('disables an unavailable selection: %s',async why=>{
    const {state,catalog}=setup();menuState(state,catalog);
    if(why==='ore')state.inventory=state.inventory.filter(i=>i.itemId!==1010);
    if(why==='limit'){state.inventory[0].refine=7;state.weaponRefineMenu!.learnedLimit=7;}
    if(why==='maximum')state.inventory[0].refine=10;
    if(why==='equipped')state.equipment.weapon='weapon-a';
    if(why==='unidentified')state.inventory[0].identified=false;
    await renderApp(state,catalog);await enter();
    expect(dialog()).not.toBeNull();
    expect(button('Confirmar refino')!.disabled).toBe(true);
    expect(dialog()!.querySelector('[data-refine-reason]')?.textContent).toBeTruthy();
  });
  it('accepts favorite broken weapons and explains that refining does not repair them',async()=>{
    const {state,catalog}=setup();menuState(state,catalog);Object.assign(state.inventory[0],{favorite:true,broken:true});
    await renderApp(state,catalog);await enter();
    expect(dialog()!.textContent).toContain('não conserta');
    await act(async()=>dialog()!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    expect(button('Confirmar refino')!.disabled).toBe(false);
  });
  it.each(['x','escape','backdrop'])('cancels exactly once through %s, even with two input events',async way=>{
    const {state,catalog}=setup();menuState(state,catalog);const commands:GameCommand[]=[];
    let resolve!:(result:boolean)=>void;
    await renderApp(state,catalog,c=>{commands.push(c);return new Promise<boolean>(done=>{resolve=done;});});await enter();
    await act(async()=>{
      for(let i=0;i<2;i++){
        if(way==='escape')window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
        else if(way==='x')dialog()!.querySelector<HTMLButtonElement>('.ro-window-close')!.click();
        else host.querySelector<HTMLButtonElement>('.ro-window-backdrop')!.click();
      }
    });
    expect(commands).toEqual([{type:'cancelWeaponRefine',menuId:'menu-a'}]);
    await act(async()=>resolve(true));expect(dialog()).toBeNull();
  });
  it('does not send cancellation on StrictMode cleanup or unmount',async()=>{
    const {state,catalog}=setup();menuState(state,catalog);const commands:GameCommand[]=[];
    await renderApp(state,catalog,async c=>{commands.push(c);return true;});await enter();
    await act(async()=>root.render(<div />));expect(commands).toEqual([]);
  });
  it('blocks confirmation and cancellation while the existing command receipt is pending',async()=>{
    const {state,catalog}=setup();menuState(state,catalog);const commands:GameCommand[]=[];
    await renderApp(state,catalog,async c=>{commands.push(c);return true;},true);await enter();
    expect(dialog()).not.toBeNull();expect(button('Confirmar refino')!.disabled).toBe(true);
    await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})));
    expect(commands).toEqual([]);expect(dialog()).not.toBeNull();
  });
  it('ignores a cancellation response after the current profile changes',async()=>{
    const {state,catalog}=setup();menuState(state,catalog);let resolve!:(result:boolean)=>void;
    await renderApp(state,catalog,()=>new Promise<boolean>(done=>{resolve=done;}));await enter();
    await act(async()=>dialog()!.querySelector<HTMLButtonElement>('.ro-window-close')!.click());
    const next=structuredClone(state);next.id='profile-b';next.weaponRefineMenu!.id='menu-b';
    await renderApp(next,catalog);expect(dialog()).not.toBeNull();
    await act(async()=>resolve(true));expect(dialog()).not.toBeNull();expect(dialog()!.textContent).toContain('SP já pago');
  });
  it.each([['failed','destruída'],['rejected','Não foi possível refinar'],['success','Refino concluído']])('distinguishes the %s result without reopening or recharging',async(outcome,text)=>{
    const {state,catalog}=setup();menuState(state,catalog);
    await renderApp(state,catalog);await enter();
    delete state.weaponRefineMenu;
    state.weaponRefineResult={menuId:'menu-a',outcome:outcome as 'failed'|'rejected'|'success',itemId:1201,fromRefine:0,toRefine:1};
    const commands:GameCommand[]=[];await renderApp(state,catalog,async c=>{commands.push(c);return true;});
    expect(dialog()!.textContent).toContain(text);expect(commands).toEqual([]);
  });
});
