import crypto from 'node:crypto';
const API='https://api.netlify.com/api/v1';
function json(status,body){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})}
function token(){const t=process.env.NETLIFY_AUTH_TOKEN;if(!t)throw Error('NETLIFY_AUTH_TOKEN belum disetel di Netlify Environment Variables.');return t}
function slug(v){return String(v||'noxxa-site').toLowerCase().trim().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48)||'noxxa-site'}
function headers(t,extra={}){return {Authorization:`Bearer ${t}`,Accept:'application/json','User-Agent':'NOXXA-Website-Builder',...extra}}
export default async(req)=>{
 if(req.method!=='POST')return json(405,{ok:false,error:'Method tidak diizinkan'});
 try{
  const t=token(), b=await req.json(); const name=slug(b.name), title=String(b.title||'NOXXA Website').slice(0,100), desc=String(b.description||'Website dibuat dengan NOXXA').slice(0,180);
  let site, deploy;
  if(b.sourceType==='folder'){
   const raw=String(b.zipBase64||''); if(!raw) return json(400,{ok:false,error:'ZIP website kosong.'});
   if(raw.length>6000000) return json(413,{ok:false,error:'Website terlalu besar untuk cloud function. Kurangi ukuran folder menjadi sekitar 4.5 MB atau kurang.'});
   const zip=Buffer.from(raw,'base64');
   const cr=await fetch(`${API}/sites`,{method:'POST',headers:headers(t,{'Content-Type':'application/json'}),body:JSON.stringify({name})});
   const ct=await cr.text(); if(!cr.ok)return json(cr.status,{ok:false,error:`Netlify gagal membuat site (${cr.status}).`,detail:ct.slice(0,700)}); site=JSON.parse(ct);
   const dr=await fetch(`${API}/sites/${site.id}/deploys`,{method:'POST',headers:headers(t,{'Content-Type':'application/zip'}),body:zip});
   const dt=await dr.text(); if(!dr.ok)return json(dr.status,{ok:false,error:`Netlify gagal mengupload website (${dr.status}).`,detail:dt.slice(0,700)}); deploy=JSON.parse(dt);
  }else{
   const url=String(b.url||'').trim(); if(!/^https?:\/\/[^\s]+$/i.test(url))return json(400,{ok:false,error:'URL sumber tidak valid.'});
   const html=`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(desc)}"><meta http-equiv="refresh" content="0;url=${escapeAttr(url)}"><style>html,body{height:100%;margin:0;background:#080b12;color:#fff;font-family:system-ui;display:grid;place-items:center}main{text-align:center;padding:24px}a{color:#ff4b6e}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>Membuka website…</p><p><a href="${escapeAttr(url)}">Lanjutkan</a></p></main><script>location.replace(${JSON.stringify(url)})</script></body></html>`;
   const sha=crypto.createHash('sha1').update(html).digest('hex');
   const cr=await fetch(`${API}/sites`,{method:'POST',headers:headers(t,{'Content-Type':'application/json'}),body:JSON.stringify({name})});
   const ct=await cr.text(); if(!cr.ok)return json(cr.status,{ok:false,error:`Netlify gagal membuat site (${cr.status}).`,detail:ct.slice(0,700)}); site=JSON.parse(ct);
   const dr=await fetch(`${API}/sites/${site.id}/deploys`,{method:'POST',headers:headers(t,{'Content-Type':'application/json'}),body:JSON.stringify({files:{'/index.html':sha}})});
   const dt=await dr.text(); if(!dr.ok)return json(dr.status,{ok:false,error:`Netlify gagal membuat deploy (${dr.status}).`,detail:dt.slice(0,700)}); deploy=JSON.parse(dt);
   const ur=await fetch(`${API}/deploys/${deploy.id}/files/index.html`,{method:'PUT',headers:headers(t,{'Content-Type':'application/octet-stream'}),body:Buffer.from(html)});
   if(!ur.ok)return json(ur.status,{ok:false,error:`Netlify gagal mengupload index.html (${ur.status}).`});
  }
  return json(200,{ok:true,siteId:site.id,deployId:deploy.id,url:site.ssl_url||site.url||`https://${site.name}.netlify.app`,siteName:site.name,state:deploy.state||'processing',message:'Website berhasil dikirim ke Netlify.'});
 }catch(e){return json(500,{ok:false,error:e.message||'Gagal publish website'});}
}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function escapeAttr(v){return escapeHtml(v).replace(/`/g,'&#96;')}
