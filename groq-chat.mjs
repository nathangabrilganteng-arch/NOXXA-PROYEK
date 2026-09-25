export default async (req) => {
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
  const key=process.env.GROQ_API_KEY;
  if(req.method==='GET') return new Response(JSON.stringify({ok:!!key,model:'openai/gpt-oss-120b',message:key?'AI server siap':'GROQ_API_KEY belum disetel di Netlify Environment Variables.'}),{status:200,headers});
  if(req.method!=='POST') return new Response(JSON.stringify({error:'Method Not Allowed'}),{status:405,headers});
  if(!key) return new Response(JSON.stringify({error:'GROQ_API_KEY belum disetel di Netlify Environment Variables.'}),{status:500,headers});
  try{
    const body=await req.json();
    const messages=Array.isArray(body.messages)?body.messages.slice(-20).map(m=>({role:['system','user','assistant'].includes(m?.role)?m.role:'user',content:String(m?.content??'').slice(0,8000)})):[];
    if(!messages.some(m=>m.role==='user')) return new Response(JSON.stringify({error:'Pesan user kosong.'}),{status:400,headers});
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),25000);
    let r;
    try{r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:'openai/gpt-oss-120b',messages,temperature:0.7,max_completion_tokens:2048}),signal:controller.signal});}finally{clearTimeout(timer)}
    const raw=await r.text(); let payload; try{payload=JSON.parse(raw)}catch{payload={error:'Groq returned a non-JSON response',detail:raw.slice(0,500)}}
    if(!r.ok)return new Response(JSON.stringify({error:payload?.error?.message||payload?.error||'Groq API error',detail:payload?.error?.type||payload?.detail||null,status:r.status}),{status:r.status,headers});
    const answer=payload?.choices?.[0]?.message?.content;
    if(!answer)return new Response(JSON.stringify({error:'Groq tidak mengembalikan teks jawaban.',detail:payload?.choices?.[0]?.finish_reason||null}),{status:502,headers});
    return new Response(JSON.stringify(payload),{status:200,headers});
  }catch(e){return new Response(JSON.stringify({error:e?.name==='AbortError'?'AI timeout, coba lagi.':'AI server error',detail:String(e?.message||e)}),{status:500,headers});}
};
