"use strict";
const crypto = require("node:crypto");
const { Pool } = require("@neondatabase/serverless");
const DEFAULT_CAREER_PATHS = require("./career-paths-default.json");
let pool, schemaPromise;
const SESSION_HOURS = 8, COOKIE = "mada_admin_session";
const DEFAULT_GROWTH_TEMPLATES = Object.freeze([{id:"cv",title:"سيرة ذاتية احترافية",intro:"نموذج منظم لعرض خبراتك ومهاراتك.",fixedText:"راجع بيانات الاتصال قبل مشاركة السيرة.",icon:"▤",paid:false,fields:[{id:"name",label:"الاسم الكامل",type:"text",required:true},{id:"headline",label:"التخصص أو المسمى المهني",type:"text",required:true},{id:"summary",label:"نبذة مهنية",type:"textarea"},{id:"skills",label:"المهارات",type:"textarea"},{id:"experience",label:"الخبرة والمشاريع",type:"textarea"},{id:"education",label:"التعليم والتكوين",type:"textarea"},{id:"contact",label:"معلومات التواصل",type:"textarea"}]},{id:"case",title:"دراسة حالة مشروع",intro:"وثّق المشكلة والهدف ودورك ونتيجة العمل.",icon:"◈",paid:false,fields:[{id:"project",label:"اسم المشروع",type:"text",required:true},{id:"problem",label:"المشكلة",type:"textarea"},{id:"goal",label:"الهدف والجمهور",type:"textarea"},{id:"role",label:"دوري ومسؤولياتي",type:"textarea"},{id:"tools",label:"الأدوات والقرارات",type:"textarea"},{id:"result",label:"النتيجة وما تعلمته",type:"textarea"}]},{id:"study",title:"مخطط دراسة أسبوعي",intro:"قسّم أهدافك ومهامك بطريقة عملية.",icon:"✓",paid:false,fields:[{id:"goals",label:"أهداف الأسبوع",type:"textarea",required:true},{id:"tasks",label:"المهام حسب اليوم",type:"textarea"},{id:"focus",label:"جلسات التركيز",type:"textarea"},{id:"review",label:"المراجعة الأسبوعية",type:"textarea"}]},{id:"brief",title:"موجز مشروع تصميم",intro:"حدد الجمهور والرسالة والمخرجات قبل البدء.",icon:"✳",paid:false,fields:[{id:"goal",label:"الهدف",type:"textarea"},{id:"audience",label:"الجمهور المستهدف",type:"textarea"},{id:"message",label:"الرسالة الأساسية",type:"textarea"},{id:"reference",label:"رابط مرجعي",type:"url"},{id:"deliverables",label:"المخرجات والمقاسات",type:"textarea"}]},{id:"invoice",title:"عرض سعر خدمة",intro:"نموذج أولي لتوثيق الخدمة والتكلفة والشروط.",icon:"▧",paid:false,fields:[{id:"provider",label:"مقدم الخدمة",type:"text"},{id:"client",label:"العميل",type:"text"},{id:"service",label:"وصف الخدمة",type:"textarea",required:true},{id:"price",label:"الكمية والسعر والإجمالي",type:"textarea"},{id:"terms",label:"مدة التنفيذ والشروط",type:"textarea"}]}]);
const DEFAULT_SETTINGS = Object.freeze({maintenanceMode:false,maintenanceMessage:"نعمل على تحسين مَدى. سنعود قريبًا.",announcementEnabled:false,announcementText:"",registrationsEnabled:true,publicGalleryEnabled:true,publicDesignsEnabled:true,studioSectionEnabled:true,careersSectionEnabled:true,growthSectionEnabled:true,profileSectionEnabled:true,settingsSectionEnabled:true,growthTemplates:DEFAULT_GROWTH_TEMPLATES,careerPaths:DEFAULT_CAREER_PATHS});
function db(){if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL غير مضبوط في إعدادات الاستضافة.");if(!pool)pool=new Pool({connectionString:process.env.DATABASE_URL,max:4,idleTimeoutMillis:10000});return pool}
let settingsSchemaPromise;
async function ensureSettingsSchema(){if(!settingsSchemaPromise)settingsSchemaPromise=(async()=>{await db().query("CREATE TABLE IF NOT EXISTS mada_site_settings(key TEXT PRIMARY KEY,value JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");await db().query("CREATE TABLE IF NOT EXISTS mada_career_completions(visitor_id TEXT NOT NULL,path_key TEXT NOT NULL,completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(visitor_id,path_key))");await db().query("CREATE INDEX IF NOT EXISTS mada_career_completions_path_idx ON mada_career_completions(path_key,completed_at DESC)");await db().query("CREATE TABLE IF NOT EXISTS mada_career_progress_attempts(ip_hash TEXT PRIMARY KEY,attempts INTEGER NOT NULL DEFAULT 0,window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");for(const [key,value]of Object.entries(DEFAULT_SETTINGS))await db().query("INSERT INTO mada_site_settings(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO NOTHING",[key,JSON.stringify(value)])})().catch(e=>{settingsSchemaPromise=null;throw e});return settingsSchemaPromise}
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
"CREATE TABLE IF NOT EXISTS mada_admin_user_flags(user_id TEXT PRIMARY KEY REFERENCES mada_users(id) ON DELETE CASCADE,disabled BOOLEAN NOT NULL DEFAULT FALSE,disabled_until TIMESTAMPTZ,note TEXT NOT NULL DEFAULT '',updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
"ALTER TABLE mada_admin_user_flags ADD COLUMN IF NOT EXISTS disabled_until TIMESTAMPTZ"
];for(const statement of statements)await db().query(statement);for(const [key,value]of Object.entries(DEFAULT_SETTINGS))await db().query("INSERT INTO mada_site_settings(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO NOTHING",[key,JSON.stringify(value)]);await db().query("DELETE FROM mada_admin_sessions WHERE expires_at<NOW()")})().catch(e=>{schemaPromise=null;throw e});return schemaPromise}
function send(res,status,payload,headers={}){res.statusCode=status;res.setHeader("Content-Type","application/json; charset=utf-8");res.setHeader("Cache-Control","no-store, max-age=0");res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("Referrer-Policy","no-referrer");res.setHeader("X-Frame-Options","DENY");for(const[k,v]of Object.entries(headers))res.setHeader(k,v);res.end(JSON.stringify(payload))}
function clean(v,max=300){return String(v==null?"":v).trim().slice(0,max)}
function safeEqual(a,b){const aa=Buffer.from(String(a||"")),bb=Buffer.from(String(b||""));return aa.length===bb.length&&aa.length>0&&crypto.timingSafeEqual(aa,bb)}
function passwords(){return[1,2,3,4].map(slot=>({slot,value:process.env["MADA_ADMIN_PASSWORD_"+slot]||""}))}
function validConfig(){const p=passwords(),secret=String(process.env.MADA_ADMIN_SESSION_SECRET||"");return Boolean(process.env.DATABASE_URL&&secret.length>=32&&!/REPLACE_WITH|CHANGE_ME|EXAMPLE/i.test(secret)&&p.every(x=>x.value.length>=16&&!/REPLACE_WITH|CHANGE_ME|EXAMPLE/i.test(x.value))&&new Set(p.map(x=>x.value)).size===4)}
function sameOrigin(req){const origin=String(req.headers.origin||""),host=String(req.headers.host||"").split(",")[0].trim().toLowerCase();if(!origin||!host)return false;try{const u=new URL(origin);return u.host.toLowerCase()===host&&(process.env.NODE_ENV==="production"?u.protocol==="https:":["https:","http:"].includes(u.protocol))}catch{return false}}
function tokenFrom(req){const item=String(req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith(COOKIE+"="));if(!item)return"";try{return decodeURIComponent(item.slice(COOKIE.length+1))}catch{return""}}
function cookie(token,age){const secure=process.env.NODE_ENV==="production"?"; Secure":"";return COOKIE+"="+encodeURIComponent(token)+"; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age="+age+secure}
function ipHash(req){const ip=String(req.headers["x-forwarded-for"]||"").split(",")[0].trim()||String(req.socket&&req.socket.remoteAddress||"unknown");return crypto.createHmac("sha256",process.env.MADA_ADMIN_SESSION_SECRET).update(ip).digest("hex")}
async function currentAdmin(req){const token=tokenFrom(req);if(!token||token.length<40)return null;const hash=crypto.createHash("sha256").update(token).digest("hex"),r=await db().query("SELECT password_slot FROM mada_admin_sessions WHERE token_hash=$1 AND expires_at>NOW() LIMIT 1",[hash]);if(!r.rows[0])return null;await db().query("UPDATE mada_admin_sessions SET last_seen_at=NOW() WHERE token_hash=$1",[hash]);return{slot:Number(r.rows[0].password_slot),tokenHash:hash}}
async function audit(admin,req,action,type="",id=""){await db().query("INSERT INTO mada_admin_audit(password_slot,action,target_type,target_id,ip_hash) VALUES($1,$2,$3,$4,$5)",[admin?admin.slot:0,clean(action,80),clean(type,50),clean(id,180),ipHash(req)])}
async function readSettings(){const r=await db().query("SELECT key,value FROM mada_site_settings");return Object.assign({},DEFAULT_SETTINGS,Object.fromEntries(r.rows.map(x=>[x.key,x.value])))}
function normalizeCareerPaths(input){
 const source=Array.isArray(input)?input:DEFAULT_CAREER_PATHS;
 const seen=new Set();
 return source.slice(0,100).map((raw,index)=>{
  const p=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw:{};
  let key=clean(p.key,40).toLowerCase().replace(/[^a-z0-9_-]/g,"");
  if(!key||seen.has(key))key="career-"+(index+1);
  seen.add(key);
  const questions=(Array.isArray(p.questions)?p.questions:[]).slice(0,100).map((rawQ,qi)=>{
   const q=rawQ&&typeof rawQ==="object"&&!Array.isArray(rawQ)?rawQ:{};
   const answers=(Array.isArray(q.a)?q.a:[]).slice(0,5).map(a=>clean(a,220)).filter(Boolean);
   const correct=Number.isInteger(Number(q.correct))?Number(q.correct):0;
   if(!clean(q.q,500)||answers.length<2)return null;
   return {q:clean(q.q,500),a:answers,correct:Math.max(0,Math.min(answers.length-1,correct)),why:clean(q.why,700)};
  }).filter(Boolean);
  const color=v=>/^#[0-9a-fA-F]{6}$/.test(String(v||""))?String(v):"#eee9ff";
  const interest=Array.isArray(p.interest)?p.interest.slice(0,8).map(v=>clean(v,30)).filter(Boolean):["explore"];
  return {key,category:clean(p.category,50)||"عام",title:clean(p.title,120)||"مسار جديد",name:clean(p.name,120)||clean(p.title,120)||"مسار جديد",icon:clean(p.icon,10)||"✦",color:color(p.color),ink:color(p.ink)==="#eee9ff"?"#5140a8":color(p.ink),description:clean(p.description,500),outcome:clean(p.outcome,500),task:clean(p.task,120)||questions.length+" أسئلة عملية",interest,search:clean(p.search,500),questions};
 }).filter(p=>p.questions.length>0);
}
async function getCareerPathsWithMigration(settings){
 const current=Array.isArray(settings.careerPaths)?settings.careerPaths:[];
 if(Number(settings.careerPathsCatalogVersion||0)<2){
  const known=new Set(current.map(p=>p&&p.key).filter(Boolean));
  const merged=current.concat(DEFAULT_CAREER_PATHS.filter(p=>!known.has(p.key)));
  const paths=normalizeCareerPaths(merged);
  await db().query("INSERT INTO mada_site_settings(key,value,updated_at) VALUES($1,$2::jsonb,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()",["careerPaths",JSON.stringify(paths)]);
  await db().query("INSERT INTO mada_site_settings(key,value,updated_at) VALUES($1,$2::jsonb,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()",["careerPathsCatalogVersion",JSON.stringify(2)]);
  settings.careerPaths=paths;settings.careerPathsCatalogVersion=2;
  return paths;
 }
 return normalizeCareerPaths(settings.careerPaths);
}
async function readCareerStats(){
 const r=await db().query("SELECT path_key,COUNT(*)::int AS count FROM mada_career_completions GROUP BY path_key");
 return Object.fromEntries(r.rows.map(row=>[row.path_key,Number(row.count)||0]));
}
function normalizeGrowthTemplates(input){if(!Array.isArray(input))return DEFAULT_GROWTH_TEMPLATES.map(t=>({...t,fields:t.fields.map(f=>({...f}))}));return input.slice(0,100).map((t,i)=>{t=t&&typeof t==="object"&&!Array.isArray(t)?t:{};const fields=Array.isArray(t.fields)?t.fields.slice(0,40).map((f,j)=>{f=f&&typeof f==="object"&&!Array.isArray(f)?f:{};const type=["text","textarea","url","image"].includes(f.type)?f.type:"text";return{id:clean(f.id,60).replace(/[^a-zA-Z0-9_-]/g,"")||("field"+j),label:clean(f.label,90),type,required:f.required===true,shape:["square","circle","rounded"].includes(f.shape)?f.shape:"square"}}).filter(f=>f.label):[];const layoutInput=t.layout&&typeof t.layout==="object"&&!Array.isArray(t.layout)?t.layout:{};const elements=Array.isArray(layoutInput.elements)?layoutInput.elements.slice(0,60).map((e,j)=>{e=e&&typeof e==="object"&&!Array.isArray(e)?e:{};const fieldId=clean(e.fieldId,60).replace(/[^a-zA-Z0-9_-]/g,"");const color=/^#[0-9a-fA-F]{6}$/.test(e.color||"")?e.color:"#25233a";return{id:clean(e.id,60).replace(/[^a-zA-Z0-9_-]/g,"")||("element"+j),fieldId,type:["field","title","text","image"].includes(e.type)?e.type:"field",label:clean(e.label,120),text:clean(e.text,1200),x:Math.max(0,Math.min(100,Number(e.x)||0)),y:Math.max(0,Math.min(100,Number(e.y)||0)),width:Math.max(1,Math.min(100,Number(e.width)||30)),height:Math.max(1,Math.min(100,Number(e.height)||12)),fontSize:Math.max(6,Math.min(96,Number(e.fontSize)||14)),color,rotation:Math.max(-180,Math.min(180,Number(e.rotation)||0)),zIndex:Math.max(0,Math.min(100,Number(e.zIndex)||j+1))}}).filter(e=>!e.fieldId||fields.some(f=>f.id===e.fieldId)||["title","text"].includes(e.type)):[];return{id:clean(t.id,80)||("template-"+(i+1)),title:clean(t.title,100),intro:clean(t.intro,300),fixedText:clean(t.fixedText,3000),icon:clean(t.icon,8)||"✦",paid:t.paid===true,fields,layout:{elements}}}).filter(t=>t.title&&t.fields.length)}
function normalizeSettings(s){s=s&&typeof s==="object"&&!Array.isArray(s)?s:{};return{maintenanceMode:s.maintenanceMode===true,maintenanceMessage:clean(s.maintenanceMessage,500)||DEFAULT_SETTINGS.maintenanceMessage,announcementEnabled:s.announcementEnabled===true,announcementText:clean(s.announcementText,700),registrationsEnabled:s.registrationsEnabled!==false,publicGalleryEnabled:s.publicGalleryEnabled!==false,publicDesignsEnabled:s.publicDesignsEnabled!==false,studioSectionEnabled:s.studioSectionEnabled!==false,careersSectionEnabled:s.careersSectionEnabled!==false,growthSectionEnabled:s.growthSectionEnabled!==false,profileSectionEnabled:s.profileSectionEnabled!==false,settingsSectionEnabled:s.settingsSectionEnabled!==false}}
async function saveSettings(s){for(const[k,v]of Object.entries(s))await db().query("INSERT INTO mada_site_settings(key,value,updated_at) VALUES($1,$2::jsonb,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()",[k,JSON.stringify(v)])}
function like(q){return"%"+q.replace(/[\\%_]/g,"\\$&")+"%"}
module.exports=async function handler(req,res){
 const action=clean(req.query&&req.query.action,60);
 if(req.method==="OPTIONS")return send(res,204,{});
 if(!["GET","POST","PATCH"].includes(req.method))return send(res,405,{error:"الطريقة غير مدعومة."},{Allow:"GET, POST, PATCH, OPTIONS"});
 if(["POST","PATCH"].includes(req.method)&&!sameOrigin(req))return send(res,403,{error:"مصدر الطلب غير مسموح."});
 if(["POST","PATCH"].includes(req.method)&&!(req.headers["content-type"]||"").toLowerCase().includes("application/json"))return send(res,415,{error:"أرسل البيانات بصيغة JSON."});
 if(["POST","PATCH"].includes(req.method)){const declaredLength=Number(req.headers["content-length"]||0);if(Number.isFinite(declaredLength)&&declaredLength>1024*1024)return send(res,413,{error:"حجم الطلب أكبر من الحد المسموح (1 ميغابايت)."});if(!req.body||typeof req.body!=="object"||Array.isArray(req.body))return send(res,400,{error:"جسم الطلب يجب أن يكون كائن JSON صالحًا."});let bodySize=0;try{bodySize=Buffer.byteLength(JSON.stringify(req.body||{}),"utf8")}catch{return send(res,400,{error:"بيانات الطلب غير صالحة."})}if(bodySize>1024*1024)return send(res,413,{error:"حجم الطلب أكبر من الحد المسموح (1 ميغابايت)."})}
 if(!["public-config","login","logout","me","overview","users","portfolios","designs","account-status","delete-user","moderate","settings","growth-templates","career-paths","career-progress","audit"].includes(action))return send(res,400,{error:"طلب غير معروف."});
 const methodsByAction={"public-config":["GET"],login:["POST"],logout:["POST"],me:["GET"],overview:["GET"],users:["GET"],portfolios:["GET"],designs:["GET"],"account-status":["PATCH"],"delete-user":["POST"],moderate:["PATCH"],settings:["GET","POST"],"growth-templates":["GET","POST"],"career-paths":["GET","POST"],"career-progress":["POST"],audit:["GET"]};
 if(!methodsByAction[action].includes(req.method))return send(res,405,{error:"طريقة الطلب غير مسموحة لهذا الإجراء."},{Allow:methodsByAction[action].join(", ")});
 if(action==="login"&&req.method==="POST"&&!validConfig())return send(res,503,{error:"إعدادات لوحة التحكم غير مكتملة. أضف كلمات المرور الأربع السرية وMADA_ADMIN_SESSION_SECRET وDATABASE_URL إلى متغيرات البيئة."});
 try{
  if(action==="career-progress"&&req.method==="POST"){
   await ensureSettingsSchema();
   const pathKey=clean(req.body&&req.body.pathKey,40).toLowerCase().replace(/[^a-z0-9_-]/g,"");
   const visitorId=clean(req.body&&req.body.visitorId,80).replace(/[^a-zA-Z0-9_-]/g,"");
   if(!pathKey||visitorId.length<16||visitorId.length>80)return send(res,400,{error:"بيانات إكمال المسار غير صالحة."});
   const settings=await readSettings(),paths=normalizeCareerPaths(settings.careerPaths);
   if(!paths.some(p=>p.key===pathKey))return send(res,400,{error:"المسار غير موجود."});
   const sourceIp=String(req.headers["x-real-ip"]||req.headers["x-vercel-forwarded-for"]||req.headers["x-forwarded-for"]||req.socket&&req.socket.remoteAddress||"unknown").split(",")[0].trim();
   const rateKey=crypto.createHmac("sha256",String(process.env.MADA_ADMIN_SESSION_SECRET||process.env.DATABASE_URL||"mada")).update("career-progress:"+sourceIp).digest("hex");
   const rate=await db().query("INSERT INTO mada_career_progress_attempts(ip_hash,attempts,window_started_at) VALUES($1,1,NOW()) ON CONFLICT(ip_hash) DO UPDATE SET attempts=CASE WHEN mada_career_progress_attempts.window_started_at<NOW()-INTERVAL '5 minutes' THEN 1 ELSE mada_career_progress_attempts.attempts+1 END,window_started_at=CASE WHEN mada_career_progress_attempts.window_started_at<NOW()-INTERVAL '5 minutes' THEN NOW() ELSE mada_career_progress_attempts.window_started_at END RETURNING attempts",[rateKey]);
   if(Number(rate.rows[0]&&rate.rows[0].attempts||0)>60)return send(res,429,{error:"تم تجاوز عدد تحديثات التقدم المسموح به. حاول بعد بضع دقائق."},{"Retry-After":"300"});
   await db().query("INSERT INTO mada_career_completions(visitor_id,path_key) VALUES($1,$2) ON CONFLICT(visitor_id,path_key) DO NOTHING",[visitorId,pathKey]);
   return send(res,200,{ok:true,counts:await readCareerStats()});
  }
  if(action==="public-config"&&req.method==="GET"){await ensureSettingsSchema();const s=await readSettings();return send(res,200,{maintenanceMode:s.maintenanceMode,maintenanceMessage:s.maintenanceMessage,announcementEnabled:s.announcementEnabled,announcementText:s.announcementText,registrationsEnabled:s.registrationsEnabled,publicGalleryEnabled:s.publicGalleryEnabled,publicDesignsEnabled:s.publicDesignsEnabled,studioSectionEnabled:s.studioSectionEnabled!==false,careersSectionEnabled:s.careersSectionEnabled!==false,growthSectionEnabled:s.growthSectionEnabled!==false,profileSectionEnabled:s.profileSectionEnabled!==false,settingsSectionEnabled:s.settingsSectionEnabled!==false,growthTemplates:normalizeGrowthTemplates(s.growthTemplates),careerPaths:await getCareerPathsWithMigration(s),careerStats:await readCareerStats()})}
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
  if(["POST","PATCH"].includes(req.method)&&!["login","logout"].includes(action)){
   const sourceIp=String(req.headers["x-real-ip"]||req.headers["x-vercel-forwarded-for"]||req.socket&&req.socket.remoteAddress||"unknown").split(",")[0].trim();
   const key=crypto.createHmac("sha256",process.env.MADA_ADMIN_SESSION_SECRET).update("write:"+action+":"+sourceIp).digest("hex");
   const gate=await db().query("INSERT INTO mada_admin_login_attempts(ip_hash,attempts,window_started_at,blocked_until) VALUES($1,1,NOW(),NULL) ON CONFLICT(ip_hash) DO UPDATE SET attempts=CASE WHEN mada_admin_login_attempts.window_started_at<NOW()-INTERVAL '5 minutes' THEN 1 ELSE mada_admin_login_attempts.attempts+1 END,window_started_at=CASE WHEN mada_admin_login_attempts.window_started_at<NOW()-INTERVAL '5 minutes' THEN NOW() ELSE mada_admin_login_attempts.window_started_at END RETURNING attempts",[key]);
   if(Number(gate.rows[0]?.attempts||0)>120)return send(res,429,{error:"طلبات كثيرة إلى لوحة الإدارة. انتظر بضع دقائق."},{"Retry-After":"300"});
  }
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
  if(action==="users"&&req.method==="GET"){const q=clean(req.query&&req.query.q,100),r=await db().query("SELECT u.id,u.username,u.display_name,u.created_at,COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(d.data->'projects')='array' THEN d.data->'projects' ELSE '[]'::jsonb END),0)::int AS projects,COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(d.data->'designs')='array' THEN d.data->'designs' ELSE '[]'::jsonb END),0)::int AS designs,EXISTS(SELECT 1 FROM mada_public_portfolios p WHERE p.user_id=u.id AND p.is_public=TRUE) AS has_public_portfolio,(COALESCE((SELECT f.disabled FROM mada_admin_user_flags f WHERE f.user_id=u.id),FALSE) AND NOT EXISTS(SELECT 1 FROM mada_admin_user_flags fx WHERE fx.user_id=u.id AND fx.disabled_until IS NOT NULL AND fx.disabled_until<=NOW())) AS disabled,(SELECT f.disabled_until FROM mada_admin_user_flags f WHERE f.user_id=u.id) AS disabled_until FROM mada_users u LEFT JOIN mada_user_data d ON d.user_id=u.id WHERE ($1='' OR u.username ILIKE $2 OR u.display_name ILIKE $2) ORDER BY u.created_at DESC LIMIT 200",[q,like(q)]);return send(res,200,{users:r.rows})}
  if(action==="portfolios"&&req.method==="GET"){const q=clean(req.query&&req.query.q,100),r=await db().query("SELECT p.user_id,p.username,p.slug,p.is_public,p.updated_at,u.display_name,COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(p.portfolio->'projects')='array' THEN p.portfolio->'projects' ELSE '[]'::jsonb END),0)::int AS project_count,LEFT(COALESCE(p.portfolio->'profile'->>'name',u.display_name),100) AS author_name FROM mada_public_portfolios p JOIN mada_users u ON u.id=p.user_id WHERE ($1='' OR p.username ILIKE $2 OR u.display_name ILIKE $2 OR p.slug ILIKE $2) ORDER BY p.updated_at DESC LIMIT 200",[q,like(q)]);return send(res,200,{portfolios:r.rows})}
  if(action==="designs"&&req.method==="GET"){const q=clean(req.query&&req.query.q,100),r=await db().query("SELECT d.design_id,d.user_id,d.is_public,d.price_dzd,d.updated_at,u.username,u.display_name,LEFT(COALESCE(d.design->>'title',d.design->>'name','تصميم بلا عنوان'),120) AS title,LEFT(COALESCE(d.design->>'kind','تصميم'),60) AS kind FROM mada_public_designs d JOIN mada_users u ON u.id=d.user_id WHERE ($1='' OR u.username ILIKE $2 OR u.display_name ILIKE $2 OR d.design_id ILIKE $2 OR COALESCE(d.design->>'title',d.design->>'name','') ILIKE $2) ORDER BY d.updated_at DESC LIMIT 200",[q,like(q)]);return send(res,200,{designs:r.rows})}
  if(action==="account-status"&&req.method==="PATCH"){
   const id=clean(req.body&&req.body.id,100),disabled=req.body&&req.body.disabled===true,rawDuration=req.body&&req.body.durationHours;
   const durationHours=rawDuration===null||rawDuration===undefined?null:Number(rawDuration);
   if(!id)return send(res,400,{error:"معرّف الحساب غير صالح."});
   if(disabled&&durationHours!==null&&![1,24,168].includes(durationHours))return send(res,400,{error:"مدة الإيقاف غير صالحة. اختر ساعة أو 24 ساعة أو 7 أيام أو إيقافًا دائمًا."});
   const exists=await db().query("SELECT id FROM mada_users WHERE id=$1 LIMIT 1",[id]);
   if(!exists.rows[0])return send(res,404,{error:"الحساب غير موجود."});
   const result=await db().query("INSERT INTO mada_admin_user_flags(user_id,disabled,disabled_until,note,updated_at) VALUES($1,$2,CASE WHEN $2 AND $3::int IS NOT NULL THEN NOW()+($3::int * INTERVAL '1 hour') ELSE NULL END,$4,NOW()) ON CONFLICT(user_id) DO UPDATE SET disabled=EXCLUDED.disabled,disabled_until=EXCLUDED.disabled_until,note=EXCLUDED.note,updated_at=NOW() RETURNING disabled,disabled_until",[id,disabled,durationHours,disabled?(durationHours===null?"إيقاف دائم من لوحة إدارة مَدى":"إيقاف مؤقت من لوحة إدارة مَدى"):""]);
   if(disabled)await db().query("DELETE FROM mada_sessions WHERE user_id=$1",[id]);
   await audit(admin,req,disabled?(durationHours===null?"account_suspended_permanently":"account_suspended_temporarily"):"account_reactivated","user",id);
   return send(res,200,{ok:true,disabled:result.rows[0].disabled,disabledUntil:result.rows[0].disabled_until});
  }
  if(action==="delete-user"&&req.method==="POST"){
   const id=clean(req.body&&req.body.id,100),confirmation=clean(req.body&&req.body.confirmation,30);
   if(!id||confirmation!=="DELETE")return send(res,400,{error:"تأكيد حذف الحساب غير صالح."});
   const exists=await db().query("SELECT id,username FROM mada_users WHERE id=$1 LIMIT 1",[id]);
   if(!exists.rows[0])return send(res,404,{error:"الحساب غير موجود."});
   await audit(admin,req,"account_deleted","user",id);
   await db().query("DELETE FROM mada_users WHERE id=$1",[id]);
   return send(res,200,{ok:true,deleted:true,username:exists.rows[0].username});
  }
  if(action==="moderate"&&req.method==="PATCH"){const type=clean(req.body&&req.body.type,20),id=clean(req.body&&req.body.id,100),visible=req.body&&req.body.visible===true;let r;if(type==="portfolio")r=await db().query("UPDATE mada_public_portfolios SET is_public=$2,updated_at=NOW() WHERE user_id=$1 RETURNING user_id,is_public",[id,visible]);else if(type==="design")r=await db().query("UPDATE mada_public_designs SET is_public=$2,updated_at=NOW() WHERE design_id=$1 RETURNING design_id,is_public",[id,visible]);else return send(res,400,{error:"نوع المحتوى غير صالح."});if(!r.rows[0])return send(res,404,{error:"لم نعثر على المحتوى المطلوب."});await audit(admin,req,visible?"content_published":"content_hidden",type,id);return send(res,200,{ok:true,visible:r.rows[0].is_public})}
  if(action==="settings"&&req.method==="GET")return send(res,200,{settings:await readSettings()});
  if(action==="settings"&&req.method==="POST"){const s=normalizeSettings(req.body&&req.body.settings);await saveSettings(s);await audit(admin,req,"settings_updated");return send(res,200,{ok:true,settings:s})}
   if(action==="growth-templates"&&req.method==="GET"){await ensureSettingsSchema();const s=await readSettings();return send(res,200,{templates:normalizeGrowthTemplates(s.growthTemplates)})}
   if(action==="growth-templates"&&req.method==="POST"){const templates=normalizeGrowthTemplates(req.body&&req.body.templates);if(!Array.isArray(req.body&&req.body.templates))return send(res,400,{error:"قائمة القوالب غير صالحة."});if((req.body.templates||[]).length>100)return send(res,400,{error:"الحد الأقصى 100 قالب."});await db().query("INSERT INTO mada_site_settings(key,value,updated_at) VALUES($1,$2::jsonb,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()",["growthTemplates",JSON.stringify(templates)]);await audit(admin,req,"growth_templates_updated","templates",String(templates.length));return send(res,200,{ok:true,templates})}
  if(action==="career-paths"&&req.method==="GET"){await ensureSettingsSchema();const settings=await readSettings();return send(res,200,{paths:await getCareerPathsWithMigration(settings),counts:await readCareerStats()})}
  if(action==="career-paths"&&req.method==="POST"){
   const incoming=req.body&&req.body.paths;
   if(!Array.isArray(incoming)||incoming.length<1||incoming.length>100)return send(res,400,{error:"يجب أن تحتوي قائمة المسارات على مجال واحد على الأقل وبحد أقصى 100 مجال."});
   const paths=normalizeCareerPaths(incoming);
   if(paths.length!==incoming.length)return send(res,400,{error:"تأكد من أن لكل مجال سؤالًا صالحًا واحدًا على الأقل وإجابتين على الأقل لكل سؤال."});
   const keys=new Set(paths.map(p=>p.key));
   if(keys.size!==paths.length)return send(res,400,{error:"معرّفات المجالات يجب أن تكون فريدة."});
   await db().query("INSERT INTO mada_site_settings(key,value,updated_at) VALUES($1,$2::jsonb,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()",["careerPaths",JSON.stringify(paths)]);
   await audit(admin,req,"career_paths_updated","career-paths",String(paths.length));
   return send(res,200,{ok:true,paths,counts:await readCareerStats()});
  }
  if(action==="audit"&&req.method==="GET"){const r=await db().query("SELECT id,password_slot,action,target_type,target_id,created_at FROM mada_admin_audit ORDER BY created_at DESC LIMIT 100");return send(res,200,{events:r.rows})}
  return send(res,404,{error:"القسم المطلوب غير موجود."})
 }catch(e){console.error("Mada admin API:",e&&e.message||e);return send(res,500,{error:"تعذر تنفيذ العملية. تحقق من إعدادات قاعدة البيانات وسجلات الخادم."})}
};
