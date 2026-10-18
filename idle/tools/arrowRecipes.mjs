/** Literal Hercules create_arrow_db.txt rows; never evaluates source scripts. */
export function parseArrowRecipes(text) {
 const recipes=[];const seen=new Set();
 for(const line of text.split(/\r?\n/)){
  const content=line.split('//')[0].trim();if(!content)continue;
  const values=content.split(',').map(s=>Number(s.trim()));
  if(values.length<3||values.length>11||values.length%2!==1||values.some(n=>!Number.isSafeInteger(n)||n<=0)||seen.has(values[0]))throw Error('Invalid arrow recipe');
  seen.add(values[0]);const outputs=[];
  for(let i=1;i<values.length;i+=2)outputs.push({itemId:values[i],quantity:values[i+1]});
  recipes.push({materialItemId:values[0],outputs});
 }
 return recipes;
}
