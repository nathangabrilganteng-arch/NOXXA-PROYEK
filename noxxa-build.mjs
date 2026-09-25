const GH_API = 'https://api.github.com';
function json(status, body){ return new Response(JSON.stringify(body), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}}); }
function cfg(){
  const token=process.env.GITHUB_TOKEN, owner=process.env.GITHUB_OWNER, repo=process.env.GITHUB_REPO;
  if(!token||!owner||!repo) throw new Error('NOXXA cloud build belum dikonfigurasi. Isi GITHUB_TOKEN, GITHUB_OWNER, dan GITHUB_REPO di Netlify Environment Variables.');
  return {token,owner,repo};
}
function validPackage(v){ return /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(v); }
export default async (req)=>{
  if(req.method!=='POST') return json(405,{ok:false,error:'Method tidak diizinkan'});
  try{
    const {token,owner,repo}=cfg();
    const b=await req.json();
    let url=String(b.url||'').trim(); if(!/^https?:\/\/[^\s]+$/i.test(url)) return json(400,{ok:false,error:'URL harus http:// atau https://'});
    const appName=String(b.name||'NOXXA App').trim().slice(0,50)||'NOXXA App';
    const packageName=String(b.packageName||'com.noxxa.webapp').trim().toLowerCase();
    const versionName=String(b.versionName||'1.0.0').trim().slice(0,30)||'1.0.0';
    if(!validPackage(packageName)) return json(400,{ok:false,error:'Package Android tidak valid'});
    const buildId=`${Date.now()}-${crypto.randomUUID().slice(0,8)}`;
    const r=await fetch(`${GH_API}/repos/${owner}/${repo}/actions/workflows/build-noxxa-apk.yml/dispatches`,{
      method:'POST',headers:{authorization:`Bearer ${token}`,accept:'application/vnd.github+json','content-type':'application/json','user-agent':'NOXXA-Netlify'},
      body:JSON.stringify({ref:process.env.GITHUB_BRANCH||'main',inputs:{url,app_name:appName,package_name:packageName,version_name:versionName,build_id:buildId}})
    });
    if(!r.ok){const t=await r.text(); return json(502,{ok:false,error:`GitHub tidak menerima build (${r.status})`,detail:t.slice(0,500)});}
    return json(202,{ok:true,buildId,status:'queued',message:'Build dikirim ke GitHub Actions.'});
  }catch(e){return json(500,{ok:false,error:e.message||'Gagal memulai build'});}
};
