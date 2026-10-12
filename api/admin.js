"use strict";
const crypto = require("node:crypto");
const { Pool } = require("@neondatabase/serverless");
let pool, schemaPromise;
const SESSION_HOURS = 8, COOKIE = "mada_admin_session";
const DEFAULT_SETTINGS = Object.freeze({maintenanceMode:false,maintenanceMessage:"نعمل على تحسين مَدى. سنعود قريبًا.",announcementEnabled:false,announcementText:"",registrationsEnabled:true,publicGalleryEnabled:true,publicDesignsEnabled:true});
function db(){if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL غير مضبوط في إعدادات الاستضافة.");if(!pool)pool=new Pool({connectionString:process.env.DATABASE_URL,max:4,idleTimeoutMillis:10000});return pool}
let settingsSchemaPromise;
async function ensureSettingsSchema(){if(!settingsSchemaPromise)settingsSchemaPromise=(async()=>{await db().query("CREATE TABLE IF NOT EXISTS mada_site_settings(key TEXT PRIMARY KEY,value JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");for(const [key,value]of Object.entries(DEFAULT_SETTINGS))await db().query("INSERT INTO mada_site_settings(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO NOTHING",[key,JSON.stringify(value)])})().catch(e=>{settingsSchemaPromise=null;throw e});return settingsSchemaPromise}
async function ensureSchema(){if(!schemaPromise)schemaPromise=(async()=>{const statements=[
"CREATE TABLE IF NOT EXISTS mada_users (id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,password_hash TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
"CREATE TABLE IF NOT EXISTS mada_sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES mada_users(id) ON DELETE CASCADE,expires_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
"CREATE TABLE IF NOT EXISTS mada_user_data (user_id TEXT PRIMARY KEY REFERENCES mada_users(id) ON DELETE CASCADE,data JSONB NOT NULL DEFAULT '{}'::jsonb,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
"CREATE TABLE IF NOT EXISTS mada_public_designs (design_id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES mada_users(id) ON DELETE CASCADE,design JSONB NOT NULL,is_public BOOLEAN NOT NULL DEFAULT FALSE,price_dzd INTEGER NOT NULL DEFAULT 0 CHECK(price_dzd>=0),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
"CREATE TABLE IF NOT EXISTS mada_public_portfolios (user_id TEXT PRIMARY KEY REFERENCES mada_users(id) ON DELETE CASCADE,username TEXT NOT NULL,slug TEXT NOT NULL UNIQUE,portfolio JSONB NOT NULL DEFAULT '{}'::jsonb,is_public BOOLEAN NOT NULL DEFAULT FALSE,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
"CREATE TABLE IF NOT EXISTS mada_admin_sessions(token_hash TEXT PRIMARY KEY,password_slot SMALLINT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),expires_at TIMESTAMPTZ NOT NULL,last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
"CREATE INDEX IF NOT EXISTS mada_admin_sessions_expiry_idx ON mada_admin_sessions(expires_at)",
"CREATE TABLE IF NOT EXISTS mada_admin_login_attempts(ip_hash TEXT PRIMARY KEY,attempts INTEGER NOT NULL DEFAULT 0,window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),blocked_until TIMESTAMPTZ)",
"CREATE TABLE IF NOT EXISTS mada_admin_audit(id BIGSERIAL PRIMARY KEY,password_slot SMALLINT NOT NULL DEFAULT 0,action TEXT NOT NULL,target_type TEXT NOT NULL DEFAULT '',target_id TEXT NOT NULL DEFAULT '',ip_hash TEXT NOT NULL DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
"CREATE INDEX IF NOT EXISTS mada_admin_audit_created_idx ON mada_admin_audit(created_at DESC)",
"CREATE TABLE IF NOT EXISTS mada_site_settings(key TEXT PRIMARY KEY,value JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
"CREATE TABLE IF NOT EXISTS mada_admin_user_flags(user_id TEXT PRIMARY KEY REFERENCES mada_users(id) ON DELETE CASCADE,disabled BOOLEAN NOT NULL DEFAULT FALSE,note TEXT NOT NULL DEFAULT '',updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
];for(const statement of statements)await db().query(statement);for(const [key,value]of Object.entries(DEFAULT_SETTINGS))await db().query("INSERT INTO mada_site_settings(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO NOTHING",[key,JSON.stringify(value)]);await db().query("DELETE FROM mada_admin_sessions WHERE expires_at<NOW()")})().catch(e=>{schemaPromise=null;throw e});return schemaPromise}
function send(res,status,payload,headers={}){res.statusCode=status;res.setHeader("Content-Type","application/json; charset=utf-8");res.setHeader("Cache-Control","no-store, max-age=0");res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("Referrer-Policy","no-referrer");res.setHeader("X-Frame-Options","DENY");for(const[k,v]of Object.entries(headers))res.setHeader(k,v);res.end(JSON.stringify(payload))}
function clean(v,max=300){return String(v==null?"":v).trim().slice(0,max)}
function safeEqual(a,b){const aa=Buffer.from(String(a||"")),bb=Buffer.from(String(b||""));return aa.length===bb.length&&aa.length>0&&crypto.timingSafeEqual(aa,bb)}
function passwords(){return[1,2,3,4].map(slot=>({slot,value:process.env["MADA_ADMIN_PASSWORD_"+slot]||""}))}
function validConfig(){const p=passwords(),secret=String(process.env.MADA_ADMIN_SESSION_SECRET||"");return Boolean(process.env.DATABASE_URL&&secret.length>=32&&!/REPLACE_WITH|CHANGE_ME|EXAMPLE/i.test(secret)&&p.every(x=>x.value.length>=16&&!/REPLACE_WITH|CHANGE_ME|EXAMPLE/i.test(x.value))&&new Set(p.map(x=>x.value)).size===4)}
function sameOrigin(req){const origin=String(req.headers.origin||""),host=String(req.headers["x-forwarded-host"]||req.headers.host||"").split(",")[0].trim().toLowerCase();if(!origin||!host)return false;try{const u=new URL(origin);return u.host.toLowerCase()===host&&["https:","http:"].includes(u.protocol)}catch{return false}}
function tokenFrom(req){const item=String(req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith(COOKIE+"="));if(!item)return"";try{return decodeURIComponent(item.slice(COOKIE.length+1))}catch{return""}}
function cookie(token,age){const secure=process.env.NODE_ENV==="production"?"; Secure":"";return COOKIE+"="+encodeURIComponent(token)+"; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age="+age+secure}
function ipHash(req){const ip=String(req.headers["x-forwarded-for"]||"").split(",")[0].trim()||String(req.socket&&req.socket.remoteAddress||"unknown");return crypto.createHmac("sha256",process.env.MADA_ADMIN_SESSION_SECRET).update(ip).digest("hex")}
async function currentAdmin(req){const token=tokenFrom(req);if(!token||token.length<40)return null;const hash=crypto.createHash("sha256").update(token).digest("hex"),r=await db().query("SELECT password_slot FROM mada_admin_sessions WHERE token_hash=$1 AND expires_at>NOW() LIMIT 1",[hash]);if(!r.rows[0])return null;await db().query("UPDATE mada_admin_sessions SET last_seen_at=NOW() WHERE token_hash=$1",[hash]);return{slot:Number(r.rows[0].password_slot),tokenHash:hash}}
async function audit(admin,req,action,type="",id=""){await db().query("INSERT INTO mada_admin_audit(password_slot,action,target_type,target_id,ip_hash) VALUES($1,$2,$3,$4,$5)",[admin?admin.slot:0,clean(action,80),clean(type,50),clean(id,180),ipHash(req)])}
async function readSettings(){const r=await db().query("SELECT key,value FROM mada_site_settings");return Object.assign({},DEFAULT_SETTINGS,Object.fromEntries(r.rows.map(x=>[x.key,x.value])))}
function normalizeSettings(s){s=s&&typeof s==="object"&&!Array.isArray(s)?s:{};return{maintenanceMode:s.maintenanceMode===true,maintenanceMessage:clean(s.maintenanceMessage,500)||DEFAULT_SETTINGS.maintenanceMessage,announcementEnabled:s.announcementEnabled===true,announcementText:clean(s.announcementText,700),registrationsEnabled:s.registrationsEnabled!==false,publicGalleryEnabled:s.publicGalleryEnabled!==false,publicDesignsEnabled:s.publicDesignsEnabled!==false}}
async function saveSettings(s){for(const[k,v]of Object.entries(s))await db().query("INSERT INTO mada_site_settings(key,value,updated_at) VALUES($1,$2::jsonb,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()",[k,JSON.stringify(v)])}
function like(q){return"%"+q.replace(/[\\%_]/g,"\\$&")+"%"}
module.exports=async function handler(req,res){
 const action=clean(req.query&&req.query.action,60);
 if(req.method==="OPTIONS")return send(res,204,{});
 if(!["GET","POST","PATCH"].includes(req.method))return send(res,405,{error:"الطريقة غير مدعومة."},{Allow:"GET, POST, PATCH, OPTIONS"});
 if(["POST","PATCH"].includes(req.method)&&!sameOrigin(req))return send(res,403,{error:"مصدر الطلب غير مسموح."});
 if(action==="login"&&req.method==="POST"&&!validConfig())return send(res,503,{error:"إعدادات لوحة التحكم غير مكتملة. أضف كلمات المرور الأربع السرية وMADA_ADMIN_SESSION_SECRET وDATABASE_URL إلى متغيرات البيئة."});
 try{
  if(action==="public-config"&&req.method==="GET"){await ensureSettingsSchema();const s=await readSettings();return send(res,200,{maintenanceMode:s.maintenanceMode,maintenanceMessage:s.maintenanceMessage,announcementEnabled:s.announcementEnabled,announcementText:s.announcementText,registrationsEnabled:s.registrationsEnabled,publicGalleryEnabled:s.publicGalleryEnabled,publicDesignsEnabled:s.publicDesignsEnabled})}
  await ensureSchema();
  if(action==="login"&&req.method==="POST"){
   if(!validConfig())return send(res,503,{error:"إعدادات لوحة التحكم غير مكتملة. أضف كلمات المرور الأربع السرية وMADA_ADMIN_SESSION_SECRET وDATABASE_URL إلى متغيرات البيئة."});
   const ip=ipHash(req),gate=await db().query("INSERT INTO mada_admin_login_attempts(ip_hash,attempts,window_started_at,blocked_until) VALUES($1,1,NOW(),NULL) ON CONFLICT(ip_hash) DO UPDATE SET attempts=CASE WHEN mada_admin_login_attempts.window_started_at<NOW()-INTERVAL '15 minutes' THEN 1 ELSE mada_admin_login_attempts.attempts+1 END,window_started_at=CASE WHEN mada_admin_login_attempts.window_started_at<NOW()-INTERVAL '15 minutes' THEN NOW() ELSE mada_admin_login_attempts.window_started_at END,blocked_until=CASE WHEN mada_admin_login_attempts.blocked_until>NOW() THEN mada_admin_login_attempts.blocked_until WHEN mada_admin_login_attempts.window_started_at<NOW()-INTERVAL '15 minutes' THEN NULL WHEN mada_admin_login_attempts.attempts>=9 THEN NOW()+INTERVAL '15 minutes' ELSE mada_admin_login_attempts.blocked_until END RETURNING attempts,blocked_until",[ip]);
   if(gate.rows[0].blocked_until&&new Date(gate.rows[0].blocked_until).getTime()>Date.now())return send(res,429,{error:"تم إيقاف محاولات الدخول مؤقتًا. انتظر 15 دقيقة."});
   const supplied=String(req.body&&req.body.password||"");let slot=0;
   for(const p of passwords())if(safeEqual(supplied,p.value))slot=p.slot;
   if(!slot){await audit(null,req,"login_failed");return send(res,401,{error:"كلمة المرور غير صحيحة."})}
   await db().query("DELETE FROM mada_admin_login_attempts WHERE ip_hash=$1",[ip]);
   const token=crypto.randomBytes(32).toString("base64url"),hash=crypto.createHash("sha256").update(token).digest("hex"),age=SESSION_HOURS*3600;
   await db().query("INSERT INTO mada_admin_sessions(token_hash,password_slot,expires_at) VALUES($1,$2,NOW()+($3 * INTERVAL '1 second'))",[hash,slot,age]);await audit({slot},req,"login");
   return send(res,200,{ok:true,expiresIn:age,slot},{ "Set-Cookie":cookie(token,age)});
  }
  if(action==="logout"&&req.method==="POST"){const t=tokenFrom(req);if(t)await db().query("DELETE FROM mada_admin_sessions WHERE token_hash=$1",[crypto.createHash("sha256").update(t).digest("hex")]);return send(res,200,{ok:true},{"Set-Cookie":cookie("",0)})}
  if(action==="me"&&req.method==="GET"){const a=await currentAdmin(req);return send(res,200,{authenticated:Boolean(a),slot:a?a.slot:null})}
  const admin=await currentAdmin(req);if(!admin)return send(res,401,{error:"انتهت جلسة الإدارة. سجّل الدخول مجددًا."});
  if(action==="overview"&&req.method==="GET"){
   const [u,p,d,pr,recent,logs]=await Promise.all([
    db().query("SELECT COUNT(*)::int AS count FROM mada_users"),
    db().query("SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE is_public=TRUE)::int AS published FROM mada_public_portfolios"),
    db().query("SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE is_public=TRUE)::int AS published FROM mada_public_designs"),
    db().query("SELECT COALESCE(SUM(jsonb_array_length(CASE WHEN jsonb_typeof(data->'projects')='array' THEN data->'projects' ELSE '[]'::jsonb END)),0)::int AS count FROM mada_user_data"),
    db().query("SELECT username,display_name,created_at FROM mada_users ORDER BY created_at DESC LIMIT 6"),
    db().query("SELECT action,target_type,target_id,password_slot,created_at FROM mada_admin_audit ORDER BY created_at DESC LIMIT 8")
   ]);
   return send(res,200,{stats:{users:u.rows[0].count,portfolios:p.rows[0].total,publicPortfolios:p.rows[0].published,designs:d.rows[0].total,publicDesigns:d.rows[0].published,projects:pr.rows[0].count},recentUsers:recent.rows,recentAudit:logs.rows})
  }
  if(action==="users"&&req.method==="GET"){const q=clean(req.query&&req.query.q,100),r=await db().query("SELECT u.id,u.username,u.display_name,u.created_at,COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(d.data->'projects')='array' THEN d.data->'projects' ELSE '[]'::jsonb END),0)::int AS projects,COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(d.data->'designs')='array' THEN d.data->'designs' ELSE '[]'::jsonb END),0)::int AS designs,EXISTS(SELECT 1 FROM mada_public_portfolios p WHERE p.user_id=u.id AND p.is_public=TRUE) AS has_public_portfolio,COALESCE((SELECT f.disabled FROM mada_admin_user_flags f WHERE f.user_id=u.id),FALSE) AS disabled FROM mada_users u LEFT JOIN mada_user_data d ON d.user_id=u.id WHERE ($1='' OR u.username ILIKE $2 OR u.display_name ILIKE $2) ORDER BY u.created_at DESC LIMIT 200",[q,like(q)]);return send(res,200,{users:r.rows})}
  if(action==="portfolios"&&req.method==="GET"){const q=clean(req.query&&req.query.q,100),r=await db().query("SELECT p.user_id,p.username,p.slug,p.is_public,p.updated_at,u.display_name,COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(p.portfolio->'projects')='array' THEN p.portfolio->'projects' ELSE '[]'::jsonb END),0)::int AS project_count,LEFT(COALESCE(p.portfolio->'profile'->>'name',u.display_name),100) AS author_name FROM mada_public_portfolios p JOIN mada_users u ON u.id=p.user_id WHERE ($1='' OR p.username ILIKE $2 OR u.display_name ILIKE $2 OR p.slug ILIKE $2) ORDER BY p.updated_at DESC LIMIT 200",[q,like(q)]);return send(res,200,{portfolios:r.rows})}
  if(action==="designs"&&req.method==="GET"){const q=clean(req.query&&req.query.q,100),r=await db().query("SELECT d.design_id,d.user_id,d.is_public,d.price_dzd,d.updated_at,u.username,u.display_name,LEFT(COALESCE(d.design->>'title',d.design->>'name','تصميم بلا عنوان'),120) AS title,LEFT(COALESCE(d.design->>'kind','تصميم'),60) AS kind FROM mada_public_designs d JOIN mada_users u ON u.id=d.user_id WHERE ($1='' OR u.username ILIKE $2 OR u.display_name ILIKE $2 OR d.design_id ILIKE $2 OR COALESCE(d.design->>'title',d.design->>'name','') ILIKE $2) ORDER BY d.updated_at DESC LIMIT 200",[q,like(q)]);return send(res,200,{designs:r.rows})}
  if(action==="account-status"&&req.method==="PATCH"){
   const id=clean(req.body&&req.body.id,100),disabled=req.body&&req.body.disabled===true;
   if(!id)return send(res,400,{error:"معرّف الحساب غير صالح."});
   const exists=await db().query("SELECT id FROM mada_users WHERE id=$1 LIMIT 1",[id]);
   if(!exists.rows[0])return send(res,404,{error:"الحساب غير موجود."});
   await db().query("INSERT INTO mada_admin_user_flags(user_id,disabled,note,updated_at) VALUES($1,$2,$3,NOW()) ON CONFLICT(user_id) DO UPDATE SET disabled=EXCLUDED.disabled,note=EXCLUDED.note,updated_at=NOW()",[id,disabled,disabled?"أوقف من لوحة إدارة مَدى":""]);
   if(disabled)await db().query("DELETE FROM mada_sessions WHERE user_id=$1",[id]);
   await audit(admin,req,disabled?"account_suspended":"account_reactivated","user",id);
   return send(res,200,{ok:true,disabled});
  }
  if(action==="moderate"&&req.method==="PATCH"){const type=clean(req.body&&req.body.type,20),id=clean(req.body&&req.body.id,100),visible=req.body&&req.body.visible===true;let r;if(type==="portfolio")r=await db().query("UPDATE mada_public_portfolios SET is_public=$2,updated_at=NOW() WHERE user_id=$1 RETURNING user_id,is_public",[id,visible]);else if(type==="design")r=await db().query("UPDATE mada_public_designs SET is_public=$2,updated_at=NOW() WHERE design_id=$1 RETURNING design_id,is_public",[id,visible]);else return send(res,400,{error:"نوع المحتوى غير صالح."});if(!r.rows[0])return send(res,404,{error:"لم نعثر على المحتوى المطلوب."});await audit(admin,req,visible?"content_published":"content_hidden",type,id);return send(res,200,{ok:true,visible:r.rows[0].is_public})}
  if(action==="settings"&&req.method==="GET")return send(res,200,{settings:await readSettings()});
  if(action==="settings"&&req.method==="POST"){const s=normalizeSettings(req.body&&req.body.settings);await saveSettings(s);await audit(admin,req,"settings_updated");return send(res,200,{ok:true,settings:s})}
  if(action==="audit"&&req.method==="GET"){const r=await db().query("SELECT id,password_slot,action,target_type,target_id,created_at FROM mada_admin_audit ORDER BY created_at DESC LIMIT 100");return send(res,200,{events:r.rows})}
  return send(res,404,{error:"القسم المطلوب غير موجود."})
 }catch(e){console.error("Mada admin API:",e&&e.message||e);return send(res,500,{error:"تعذر تنفيذ العملية. تحقق من إعدادات قاعدة البيانات وسجلات الخادم."})}
};
