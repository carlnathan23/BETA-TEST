// Visual test fixture only. Production index.html never loads this file.
const previewParams=new URLSearchParams(location.search),previewScene=previewParams.get('scene')||'pier';
startGame(previewParams.get('route')==='ig'?'ig':'bd');pending.clear();snd=false;syncSound();
$('card').classList.remove('on');$('fade').style.opacity=0;busy=false;
hudMin=true;step=previewScene==='swim'?4:['house','ladder','climb'].includes(previewScene)?2:previewScene==='elder'?(RT==='ig'?4:5):previewScene==='boat'?9:3;px=previewScene==='house'?210:['ladder','climb'].includes(previewScene)?HOUSE_LADDER.x:previewScene==='elder'?680:previewScene==='boat'?1530:430;pz=.5;home=false;hud();
if(previewScene==='swim'){runSwim({},()=>{busy=false});tutCb()}
if(previewScene==='climb'){beginClimb(1,0);climb.progress=.45;climb.cycle=.4}
if(previewScene==='terrace'){game(SIG[3].g,()=>{busy=false})}
if(previewScene==='room'){step=0;home=false;px=170;hud()}
