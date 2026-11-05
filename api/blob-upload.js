const { handleUpload } = require("@vercel/blob/client");
const { Pool } = require("@neondatabase/serverless");
const crypto = require("node:crypto");
let pool;
function db(){if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL غير مضبوط.");if(!pool)pool=new Pool({connectionString:process.env.DATABASE_URL,max:3});return pool;}
function send(res,status,data){res.statusCode=status;res.setHeader("Content-Type","application/json; charset=utf-8");res.setHeader("Cache-Control","no-store");res.end(JSON.stringify(data));}
function cookie(req){const v=String(req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("mada_session="));try{return v?decodeURIComponent(v.slice(13)):"";}catch{return "";}}
module.exports=async function(req,res){
 if(req.method!=="POST")return send(res,405,{error:"Method not allowed"});
 try{
  const origin=String(req.headers.origin||""),host=String(req.headers.host||"").split(",")[0].trim().toLowerCase();
  const originUrl=origin?new URL(origin):null;const localOrigin=originUrl&&["localhost","127.0.0.1"].includes(originUrl.hostname);if(!originUrl||originUrl.host.toLowerCase()!==host||(!localOrigin&&originUrl.protocol!=="https:"))return send(res,403,{error:"مصدر الطلب غير مسموح."});
  if(!process.env.BLOB_READ_WRITE_TOKEN)return send(res,503,{error:"اربط Vercel Blob بالمشروع أولًا."});
  const token=cookie(req);if(token.length<40)return send(res,401,{error:"سجّل الدخول أولًا."});
  const q=await db().query("SELECT u.id FROM mada_sessions s JOIN mada_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND NOT EXISTS (SELECT 1 FROM mada_admin_user_flags f WHERE f.user_id=u.id AND f.disabled=TRUE AND (f.disabled_until IS NULL OR f.disabled_until>NOW())) LIMIT 1",[crypto.createHash("sha256").update(token).digest("hex")]);
  if(!q.rows[0])return send(res,401,{error:"انتهت الجلسة."});
  const uid=q.rows[0].id;
  const result=await handleUpload({body:req.body,request:req,onBeforeGenerateToken:async(pathname)=>{
   if(!String(pathname||"").startsWith("mada-project-files/")||String(pathname||"").includes(".."))throw new Error("مسار رفع غير صالح.");
   return {maximumSizeInBytes:50*1024*1024,addRandomSuffix:true,tokenPayload:JSON.stringify({uid})};
  },onUploadCompleted:async({blob,tokenPayload})=>{const p=JSON.parse(tokenPayload||"{}");if(p.uid!==uid||!String(blob.pathname||"").startsWith("mada-project-files/"))throw new Error("تعذر التحقق من الملف.");\n   await db().query("CREATE TABLE IF NOT EXISTS mada_private_files (pathname TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES mada_users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");\n   await db().query("INSERT INTO mada_private_files(pathname,user_id) VALUES($1,$2) ON CONFLICT(pathname) DO UPDATE SET user_id=EXCLUDED.user_id",[blob.pathname,uid]);}});
  return send(res,200,result);
 }catch(e){console.error("Blob upload:",e&&e.message||e);return send(res,400,{error:e&&e.message||"تعذر رفع الملف."});}
};
module.exports.config={api:{bodyParser:{sizeLimit:"1mb"}}};
