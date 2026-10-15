// Local-only farm playground. No production auth, keys or database writes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..');
if(!process.env.PGLITE_MODULE){const local=path.resolve(root,'../tmp/farm-validation/node_modules/@electric-sql/pglite');if(fs.existsSync(local))process.env.PGLITE_MODULE=local;}
const {createDatabase,user,other}=require('../tests/helpers/farm-v3-db.cjs');
const accounts={1:{id:user,name:'말랑 테스터',coins:300},2:{id:other,name:'새싹 테스터',coins:30}};
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function startSandbox({port=4188}={}){
  const database=await createDatabase(),{db,setUser,rpc}=database;
  async function seed(number){
    const account=accounts[number];await setUser(account.id);await rpc('get_my_farm_v3_state');
    await db.query('update public.farm_wallets set coin_balance=$1,farm_money_balance=0 where user_id=$2',[account.coins,account.id]);
    if(number===1){
      for(const[id,total]of [['carrot',8],['potato',6],['strawberry',5],['tomato',4],['pumpkin',3],['corn',4],['sweetPotato',3]])await db.query("insert into public.farm_v3_collections(user_id,kind,item_id,total) values($1,'crop',$2,$3) on conflict(user_id,kind,item_id) do update set total=excluded.total",[account.id,id,total]);
      await db.query("insert into public.farm_v3_collections(user_id,kind,item_id,total) values($1,'fish','minnow',12) on conflict(user_id,kind,item_id) do update set total=excluded.total",[account.id]);
    }
    await rpc('get_my_farm_v3_state');
    await db.query('update public.farm_v3_profiles set nickname=$1,character_id=$2,plaza_x=$3,plaza_y=$4,plaza_message=$5 where user_id=$6',
      [account.name,number===1?'berry-slime':'sprout-slime',number===1?42:65,number===1?67:57,number===1?'오늘도 말랑하게! 🌱':'이제 막 시작했어 🫠',account.id]);
  }
  await seed(1);await seed(2);
  const base=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*src="(?:https:[^"]*|\.\/pwa-register\.js[^"]*)"[^>]*>[\s\S]*?<\/script>/gi,'');
  function page(number){
    const account=accounts[number];
    const stub=`<script>window.supabase={createClient:()=>({auth:{getSession:()=>new Promise(()=>{}),signOut:async()=>{location.href='/';return{error:null}}},rpc:async(name,params)=>fetch('/__sandbox/rpc',{method:'POST',headers:{'Content-Type':'application/json','X-Farm-Sandbox-Account':'${number}'},body:JSON.stringify({name,params})}).then(r=>r.json())})};</script>`;
    const boot=`<style>#sandboxBar{position:sticky;top:0;z-index:9999;background:#fff5d6;color:#493d27;padding:10px 16px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;font:12px sans-serif}#sandboxBar a,#sandboxBar button{padding:7px 10px;border:1px solid #d9c587;border-radius:8px;background:white;color:#493d27;text-decoration:none;cursor:pointer}.nav-item:not([data-page="farm"]),#openUserSettings{display:none!important}</style>
      <div id="sandboxBar"><strong>로컬 테스트 · ${escape(account.name)}</strong><span>서버를 끄면 테스트 기록은 초기화돼</span><a href="/?account=1">말랑 테스터</a><a href="/?account=2">새싹 테스터</a><button id="sandboxCoin">Coin +100</button><button id="sandboxReset">이 계정 초기화</button></div>
      <script>addEventListener('DOMContentLoaded',async()=>{
        document.documentElement.className='';document.body.classList.remove('auth-gated');document.querySelector('#authGate').hidden=true;document.querySelector('.auth-boot')?.remove();
        document.body.prepend(document.querySelector('#sandboxBar'));
        activeAuthUser={id:'${account.id}',user_metadata:{full_name:'${account.name}'}};farmDataHydrated=true;farmDataUserId=activeAuthUser.id;farmWalletHydrated=true;farmWalletUserId=activeAuthUser.id;taskDataHydrated=true;
        state.tasks=[];state.habits=[];focusTimerDatabaseUnavailable=true;for(const page of ['farm','today','focus','tasks','habits'])pageDataRefreshTimes.set(activeAuthUser.id+':'+page,Date.now()+86400000);
        document.querySelector('#profileName').textContent='${account.name}';
        document.querySelector('.brand').href='/';
        for(const button of document.querySelectorAll('[data-page]'))if(button.dataset.page!=='farm')button.hidden=true;
        await FarmV3.load(activeAuthUser);await SceneryCreations.load(activeAuthUser);showPage('farm');
        for(const [id,action]of [['sandboxCoin','coin'],['sandboxReset','reset']])document.getElementById(id).onclick=async()=>{const button=document.getElementById(id);button.disabled=true;try{const response=await fetch('/__sandbox/'+action,{method:'POST',headers:{'X-Farm-Sandbox-Account':'${number}'}});const result=await response.json();if(!response.ok||result.error)throw Error(result.error?.message||'테스트 작업 실패');FarmV3.reset();await FarmV3.load(activeAuthUser);}catch(error){showToast(error.message);}finally{button.disabled=false;}};
      });</script>`;
    return base.replace('<script src="./supabase-config.js">',stub+'<script src="./supabase-config.js">').replace('</body>',boot+'</body>');
  }
  const landing=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>농장 테스트 계정</title><style>body{font:16px sans-serif;background:#eff5ed;color:#24392c;max-width:680px;margin:10vh auto;padding:24px}a{display:block;margin:18px 0;background:white;color:inherit;border:1px solid #cbdcc8;border-radius:18px;padding:24px;text-decoration:none}strong{display:block;margin-bottom:10px}p{line-height:1.8;color:#526354}</style><h1>농장 테스트 계정</h1><p>비밀번호 없이 골라서 들어가면 돼. 서로 다른 탭에서 두 계정을 열어 광장 위치와 말풍선을 확인할 수 있어.</p><a href="/?account=1"><strong>말랑 테스터 · Coin 300</strong>수집 기록과 친구 3종이 준비된 계정</a><a href="/?account=2"><strong>새싹 테스터 · Coin 30</strong>처음부터 작물 해금 경로를 확인할 계정</a><p>운영 계정과 데이터는 분리돼 있어. 서버를 종료하면 이 테스트 기록은 초기화돼. 농장·낚시터·광장·캐릭터·도감을 테스트할 수 있어.</p></html>`;
  let chain=Promise.resolve();
  const server=http.createServer(async(request,response)=>{
    response.setHeader('Cache-Control','no-store');
    try{
      const url=new URL(request.url,'http://127.0.0.1'),pathname=decodeURIComponent(url.pathname);
      if(pathname.startsWith('/__sandbox/')){
        const number=Number(request.headers['x-farm-sandbox-account']),account=accounts[number];
        if(request.method!=='POST'||!account){response.writeHead(400).end();return;}
        // A tab carries its own fixed test-account header; cookies cannot swap
        // another open tab's identity. Serialize the connection's auth context.
        let body='';for await(const chunk of request){body+=chunk;if(body.length>65536)throw Error('Request too large');}
        const operation=chain.then(async()=>{
          await setUser(account.id);
          if(pathname==='/__sandbox/coin'){await db.query('update public.farm_wallets set coin_balance=coin_balance+100 where user_id=$1',[account.id]);return{data:await rpc('get_my_farm_v3_state'),error:null};}
          if(pathname==='/__sandbox/reset'){
            for(const table of ['farm_v3_runs','farm_v3_collections','farm_v3_unlocks','farm_v3_profiles','farm_action_log','farm_wallet_ledger','farm_wallet_idempotency'])await db.query(`delete from public.${table} where user_id=$1`,[account.id]);
            await seed(number);return{data:await rpc('get_my_farm_v3_state'),error:null};
          }
          if(pathname!=='/__sandbox/rpc')throw Error('Unknown route');
          const {name,params}=JSON.parse(body);if(!['get_my_farm_v3_state','get_farm_v3_plaza','perform_my_farm_v3_action','get_my_scenery_state'].includes(name))throw Error('This local playground supports farm features only');
          return{data:await rpc(name,params),error:null};
        }).catch(error=>({data:null,error:{message:error.message,code:error.code}}));
        chain=operation.then(()=>{});response.setHeader('Content-Type','application/json; charset=utf-8');response.end(JSON.stringify(await operation));return;
      }
      if(pathname==='/'){const number=Number(url.searchParams.get('account'));response.setHeader('Content-Type','text/html; charset=utf-8');response.end(accounts[number]?page(number):landing);return;}
      const file=path.resolve(root,'.'+pathname),ext=path.extname(file);
      if(!file.startsWith(root+path.sep)||(!pathname.startsWith('/assets/')&&path.dirname(file)!==root)||!['.js','.css','.png','.woff2','.ico','.json','.svg','.gif','.webmanifest'].includes(ext)){response.writeHead(404).end();return;}
      response.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.png':'image/png','.woff2':'font/woff2','.svg':'image/svg+xml'})[ext]||'application/octet-stream');response.end(fs.readFileSync(file));
    }catch(error){response.writeHead(500,{'Content-Type':'text/plain; charset=utf-8'}).end(error.message);}
  });
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}catch(error){await db.close();throw error;}
  return{server,database,accounts,url:`http://127.0.0.1:${server.address().port}`,close:async()=>{await new Promise(resolve=>server.close(resolve));await chain;await db.close();}};
}
if(require.main===module)startSandbox({port:Number(process.env.FARM_SANDBOX_PORT)||4188}).then(sandbox=>{console.log('Farm sandbox: '+sandbox.url);console.log('Account 1: '+sandbox.url+'/?account=1');console.log('Account 2: '+sandbox.url+'/?account=2');console.log('Local data only. Stop with Ctrl+C.');process.on('SIGINT',()=>sandbox.close().then(()=>process.exit(0)));}).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={startSandbox};
