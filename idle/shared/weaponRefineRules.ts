/** Hercules pre-re refine_db normal rates, indexed by CURRENT refinement. */
export const WEAPON_REFINE_NORMAL_RATES: readonly (readonly number[])[] = [
 [100,100,100,100,100,100,100,60,40,19],
 [100,100,100,100,100,100,60,40,20,19],
 [100,100,100,100,100,60,50,20,20,19],
 [100,100,100,100,60,40,40,20,20,9],
];
function weaponLevel(w:number):void {
 if(!Number.isSafeInteger(w)||w<1||w>4)throw new RangeError('Invalid weapon level');
}
export function weaponRefineMaterial(w:number):number {
 weaponLevel(w);return [1010,1011,984,984][w-1];
}
export function weaponRefineThreshold(w:number,r:number,j:number):number {
 weaponLevel(w);
 if(!Number.isSafeInteger(r)||r<0||r>9||!Number.isSafeInteger(j)||j<0)
  throw new RangeError('Invalid refinement or Job level');
 return WEAPON_REFINE_NORMAL_RATES[w-1][r]*10+5*(j-50);
}
export function weaponRefineChancePercent(w:number,r:number,j:number):number {
 return Math.max(0,Math.min(100,weaponRefineThreshold(w,r,j)/10));
}
