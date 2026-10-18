import {expect,it} from 'vitest';
import {FrameCadence} from '../web/assets/frameCadence';
it.each([60,75,90,120,144,165,240])('preserves 60 render opportunities per second at %i Hz',hz=>{
 const cadence=new FrameCadence();let count=0;
 for(let tick=0;tick<hz;tick++)if(cadence.shouldRender(tick*1000/hz,1000/60))count++;
 expect(count).toBe(60);
});
it('keeps reduced motion at four frames per second',()=>{
 const cadence=new FrameCadence();let count=0;
 for(let tick=0;tick<144;tick++)if(cadence.shouldRender(tick*1000/144,250))count++;
 expect(count).toBe(4);
});
it('does not replay missed frames or render twice at a timestamp after a stall',()=>{
 const cadence=new FrameCadence();expect(cadence.shouldRender(0,1000/60)).toBe(true);
 expect(cadence.shouldRender(20000,1000/60)).toBe(true);
 expect(cadence.shouldRender(20000,1000/60)).toBe(false);
 expect(cadence.shouldRender(20001,1000/60)).toBe(false);
});
it('resets after visibility changes, clock resets or motion preference changes',()=>{
 const cadence=new FrameCadence();expect(cadence.shouldRender(500,250)).toBe(true);
 expect(cadence.shouldRender(501,250)).toBe(false);
 expect(cadence.shouldRender(502,1000/60)).toBe(true);
 cadence.reset();expect(cadence.shouldRender(503,1000/60)).toBe(true);
 expect(cadence.shouldRender(0,1000/60)).toBe(true);
 expect(cadence.shouldRender(1,1000/60)).toBe(false);
});
