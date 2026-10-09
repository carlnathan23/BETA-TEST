const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('character selection retains both routes without a draft label',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const selection=html.slice(html.indexOf('id="sel"'),html.indexOf('id="opt"'));
  assert.match(selection,/Buhay sa Dagat/);
  assert.match(selection,/Buhay sa Ilaya/);
  assert.doesNotMatch(selection,/draft/i);
});
