const { Pool } = require("@neondatabase/serverless");
let pool;
function db(){if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is not configured.");if(!pool)pool=new Pool({connectionString:process.env.DATABASE_URL,max:2,idleTimeoutMillis:10000});return pool;}
function xml(value){return String(value||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");}
module.exports=async function handler(req,res){
 if(req.method!=="GET"){res.setHeader("Allow","GET");res.statusCode=405;return res.end("Method Not Allowed");}
 try{
  const rawHost=String(req.headers.host||"dama-20.vercel.app").split(",")[0].trim();
  const host=/^[a-z0-9.-]+(?::\\d{1,5})?$/i.test(rawHost)?rawHost:"dama-20.vercel.app";
  const origin=(host.startsWith("localhost")?"http://":"https://")+host;
  const flags=await db().query("SELECT key,value FROM mada_site_settings WHERE key=$1 OR key=$2",["publicGalleryEnabled","maintenanceMode"]);
  const flagMap=Object.fromEntries(flags.rows.map(row=>[row.key,row.value]));
  const galleryEnabled=flagMap.publicGalleryEnabled!==false&&flagMap.maintenanceMode!==true;
  const result=galleryEnabled?await db().query("SELECT u.username,p.updated_at FROM mada_public_portfolios p JOIN mada_users u ON u.id=p.user_id LEFT JOIN mada_admin_user_flags f ON f.user_id=u.id WHERE p.is_public=TRUE AND NOT (COALESCE(f.disabled,FALSE)=TRUE AND (f.disabled_until IS NULL OR f.disabled_until>NOW())) ORDER BY p.updated_at DESC LIMIT 10000"):{rows:[]};
  const urls=[{loc:origin+"/",lastmod:new Date().toISOString(),priority:"1.0"}].concat(result.rows.map(row=>({loc:origin+"/@"+encodeURIComponent(row.username),lastmod:row.updated_at?new Date(row.updated_at).toISOString():new Date().toISOString(),priority:"0.7"})));
  const body='<?xml version="1.0" encoding="UTF-8"?>'+'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(item=>'<url><loc>'+xml(item.loc)+'</loc><lastmod>'+xml(item.lastmod)+'</lastmod><priority>'+item.priority+'</priority></url>').join("")+'</urlset>';
  res.statusCode=200;res.setHeader("Content-Type","application/xml; charset=utf-8");res.setHeader("Cache-Control","public, max-age=300, s-maxage=600");return res.end(body);
 }catch(error){console.error("Mada sitemap error:",error?.message||error);res.statusCode=503;res.setHeader("Content-Type","text/plain; charset=utf-8");res.setHeader("Cache-Control","no-store");return res.end("Sitemap temporarily unavailable.");}
};