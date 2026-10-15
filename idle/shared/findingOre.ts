/** Hercules410b9738 db/pre-re/item_chain.conf ITMCHAIN_ORE; GPL-3.0-or-later. */
export const findingOreChain: ReadonlyArray<Readonly<{itemId:number;chance:number}>> = Object.freeze([
 [1002,600],[998,380],[993,100],[1003,80],[992,100],[1010,600],[991,100],[990,100],[999,50],[1011,380],
 [757,70],[756,80],[997,40],[996,40],[995,40],[994,40],[985,20],[984,20],[969,10],[714,5],
].map(([itemId,chance])=>Object.freeze({itemId,chance})));
/** itemdb.c:220..236: uniform entry first, then its own strict chance roll. */
export function rollFindingOre(draw:(modulus:number)=>number):number|undefined {
 const entry=findingOreChain[draw(findingOreChain.length)];
 const roll=draw(10000);
 return roll<entry.chance?entry.itemId:undefined;
}
