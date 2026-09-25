const GH_API='https://api.github.com';
function json(status,body){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})}
function cfg(){const token=process.env.GITHUB_TOKEN,owner=process.env.GITHUB_OWNER,repo=process.env.GITHUB_REPO;if(!token||!owner||!repo)throw Error('Cloud build belum dikonfigurasi di Netlify.');return{token,owner,repo}}
async function gh(url,token){const r=await fetch(url,{headers:{authorization:`Bearer ${token}`,accept:'application/vnd.github+json','user-agent':'NOXXA-Netlify'}});if(!r.ok)throw Error(`GitHub API ${r.status}`);return r.json()}
export default async(req)=>{
 if(req.method!=='GET')return json(405,{ok:false,error:'Method tidak diizinkan'});
 try{const {token,owner,repo}=cfg();const id=new URL(req.url).searchParams.get('id');if(!id)return json(400,{ok:false,error:'build id kosong'});
  const runs=await gh(`${GH_API}/repos/${owner}/${repo}/actions/workflows/build-noxxa-apk.yml/runs?per_page=20`,token);
  const run=(runs.workflow_runs||[]).find(x=>x.display_title===`NOXXA Build ${id}`||x.name===`NOXXA Build ${id}`);
  if(!run)return json(200,{ok:true,buildId:id,status:'queued',message:'Menunggu GitHub Actions memulai build…'});
  if(run.status!=='completed')return json(200,{ok:true,buildId:id,status:run.status,conclusion:null,runUrl:run.html_url,message:run.status==='in_progress'?'APK sedang dibuat oleh Android Gradle…':'Build sedang menunggu runner…'});
  if(run.conclusion!=='success')return json(200,{ok:false,buildId:id,status:'error',conclusion:run.conclusion,runUrl:run.html_url,error:'Build Android gagal. Buka log GitHub Actions untuk detail.'});
  try{const rel=await gh(`${GH_API}/repos/${owner}/${repo}/releases/tags/noxxa-${encodeURIComponent(id)}`,token);const asset=(rel.assets||[]).find(a=>a.name.endsWith('.apk'));if(asset)return json(200,{ok:true,buildId:id,status:'done',conclusion:'success',runUrl:run.html_url,apk:asset.browser_download_url,message:'APK selesai dibuat.'});}catch{}
  return json(200,{ok:true,buildId:id,status:'publishing',runUrl:run.html_url,message:'Build selesai. Menunggu file APK dipublikasikan…'});
 }catch(e){return json(500,{ok:false,error:e.message||'Gagal membaca status build'})}
};
