const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../portal.js'),'utf8');
const settle=()=>new Promise(r=>setImmediate(r));
async function boot(user=null,search=''){
 const ids=new Map();for(const m of fs.readFileSync(path.join(__dirname,'../login.html'),'utf8').matchAll(/id="([^"]+)"/g))ids.set(m[1],{value:'',hidden:false,disabled:false,type:'password',textContent:'',setAttribute(k,v){this[k]=v},classList:{toggle(){}},reset(){}});
 const calls=[];let failure=false;
 const sandbox={document:{getElementById:id=>ids.get(id)},location:{search},URLSearchParams,AralBackend:{request:async(action,data)=>{calls.push({action,data});if(action==='me')return{user};if(failure)throw Error('Connection unavailable');return{user:{id:'7',role:'student',name:'Test',grade:'5',section:'A'}}}}};
 vm.runInNewContext(source,sandbox);await settle();return{ids,calls,fail(){failure=true}};
}
test('login and registration switch required fields and submit to the matching endpoint',async()=>{
 const g=await boot();assert.equal(g.ids.get('registerFields').hidden,true);assert.equal(g.ids.get('name').disabled,true);
 g.ids.get('registerTab').onclick();assert.equal(g.ids.get('name').disabled,false);assert.equal(g.ids.get('password').autocomplete,'new-password');
 for(const [k,v]of Object.entries({email:'test@example.test',password:'synthetic-test-password',name:'Test',grade:'5',section:'A'}))g.ids.get(k).value=v;
 g.ids.get('authForm').onsubmit({preventDefault(){}});await settle();assert.equal(g.calls.at(-1).action,'register');assert.equal(g.calls.at(-1).data.section,'A');assert.equal(g.ids.get('authForm').hidden,true);assert.equal(g.ids.get('teacherLink').hidden,true);
});
test('failed profile save preserves typed changes and teacher dashboard link',async()=>{
 const g=await boot({id:'1',role:'teacher',name:'Teacher',grade:'Teacher',section:'Teacher'});assert.equal(g.ids.get('teacherLink').hidden,false);
 g.ids.get('pName').value='Changed name';g.fail();g.ids.get('profileForm').onsubmit({preventDefault(){}});await settle();assert.equal(g.ids.get('pName').value,'Changed name');assert.equal(g.ids.get('status').textContent,'Connection unavailable');assert.equal(g.ids.get('saveProfile').disabled,false);
});
test('registration deep link opens registration and switching back clears password',async()=>{
 const g=await boot(null,'?mode=register');assert.equal(g.ids.get('registerFields').hidden,false);g.ids.get('password').value='synthetic';g.ids.get('loginTab').onclick();assert.equal(g.ids.get('password').value,'');assert.equal(g.ids.get('registerFields').hidden,true);
});
