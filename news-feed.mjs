const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

const CATEGORIES = {
  semua: '',
  indonesia: 'Indonesia OR Jakarta OR Jawa',
  dunia: 'world OR dunia OR international',
  teknologi: 'teknologi OR AI OR smartphone OR internet',
  olahraga: 'olahraga OR sepakbola OR badminton OR basket',
  ekonomi: 'ekonomi OR bisnis OR saham OR keuangan',
  hiburan: 'hiburan OR film OR musik OR selebriti',
  kesehatan: 'kesehatan OR medis OR kesehatan masyarakat',
  sains: 'sains OR science OR antariksa OR penelitian',
  game: 'game OR gaming OR esports OR PlayStation OR Xbox'
};

function decodeXml(v='') {
  return v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/<[^>]+>/g,'').trim();
}

function parseItems(xml='') {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(m => {
    const x=m[1];
    const pick=(tag)=>decodeXml((x.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,'i'))||[])[1]||'');
    return {title:pick('title'),link:pick('link'),pubDate:pick('pubDate'),source:pick('source')||'Google News'};
  }).filter(x=>x.title && x.link);
}

async function fetchFeed(feed) {
  const r=await fetch(feed,{headers:{'User-Agent':'NOXXA-News/2.0'},signal:AbortSignal.timeout(9000)});
  if(!r.ok) throw new Error(`RSS HTTP ${r.status}`);
  return parseItems(await r.text());
}

export default async (req) => {
  if(req.method === 'OPTIONS') return new Response('', {status:204, headers:cors});
  try {
    const url = new URL(req.url);
    const q=(url.searchParams.get('q')||'').trim();
    const category=(url.searchParams.get('category')||'semua').toLowerCase();
    const lang=url.searchParams.get('lang')||'id';
    const max=Math.min(Math.max(Number(url.searchParams.get('limit')||100),10),150);
    const base=`hl=${lang}&gl=ID&ceid=ID:${lang}`;

    let feeds=[];
    if(q) {
      feeds=[`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${base}`];
    } else if(category==='semua') {
      feeds=[
        `https://news.google.com/rss?${base}`,
        ...Object.entries(CATEGORIES).filter(([k])=>k!=='semua').map(([,term])=>`https://news.google.com/rss/search?q=${encodeURIComponent(term)}&${base}`)
      ];
    } else {
      const term=CATEGORIES[category]||CATEGORIES.indonesia;
      feeds=[`https://news.google.com/rss/search?q=${encodeURIComponent(term)}&${base}`];
    }

    const results=await Promise.allSettled(feeds.map(fetchFeed));
    const all=results.flatMap(x=>x.status==='fulfilled'?x.value:[]);
    const seen=new Set();
    const items=all.filter(x=>{
      const key=(x.link||x.title).toLowerCase();
      if(seen.has(key)) return false; seen.add(key); return true;
    }).sort((a,b)=>{
      const ta=Date.parse(a.pubDate)||0,tb=Date.parse(b.pubDate)||0; return tb-ta;
    }).slice(0,max);

    return new Response(JSON.stringify({ok:true,updatedAt:Date.now(),category,q,sourceCount:feeds.length,items}),{status:200,headers:{'Content-Type':'application/json',...cors}});
  } catch(e) {
    return new Response(JSON.stringify({ok:false,error:e.message,items:[]}),{status:502,headers:{'Content-Type':'application/json',...cors}});
  }
};
