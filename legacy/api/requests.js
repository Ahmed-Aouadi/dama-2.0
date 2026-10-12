const crypto = require("crypto");
const { getPool } = require("./db");

const CATEGORIES = new Set(["water","roads","clean","light","transport","other"]);
const STATUSES = new Set(["received","triage","assigned","working","waiting","resolved","rejected"]);
const STATUS_LABELS = {received:"تم الاستلام",triage:"قيد الفرز",assigned:"أُحيل إلى المصلحة المختصة",working:"قيد المعالجة",waiting:"بانتظار معلومات أو تدخل خارجي",resolved:"أُنجز العمل",rejected:"أُغلق مع توضيح السبب"};
let schemaReady;
async function db() {
  const pool = getPool();
  if (!schemaReady) schemaReady = pool.query(`
    CREATE TABLE IF NOT EXISTS civic_requests (
      id BIGSERIAL PRIMARY KEY,
      reference_code TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      wilaya TEXT NOT NULL,
      municipality TEXT NOT NULL,
      area TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      urgency TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'received',
      status_note TEXT NOT NULL DEFAULT '',
      assigned_unit TEXT NOT NULL DEFAULT '',
      contact_method TEXT NOT NULL DEFAULT 'none',
      contact_value TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    )
  `).catch(e => { schemaReady = null; throw e; });
  await schemaReady;
  return pool;
}
function reply(res, code, body) {
  res.status(code).setHeader("Cache-Control","no-store").setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Headers","Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods","GET, POST, PATCH, OPTIONS");
  return res.json(body);
}
function clean(v, max=500) { return String(v ?? "").trim().slice(0,max); }
function toPublic(row) {
  return { reference:row.reference_code,category:row.category,wilaya:row.wilaya,municipality:row.municipality,area:row.area,title:row.title,urgency:row.urgency,status:row.status,statusLabel:STATUS_LABELS[row.status]||row.status,statusNote:row.status_note,assignedUnit:row.assigned_unit,createdAt:row.created_at,updatedAt:row.updated_at,resolvedAt:row.resolved_at };
}
function adminAuthorized(req) {
  const expected = process.env.CIVIC_ADMIN_TOKEN;
  const supplied = String(req.headers.authorization || "").replace(/^Bearer\s+/i,"");
  if (!expected || expected.length < 32 || !supplied || supplied.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(expected));
}
module.exports = async function handler(req,res) {
  if (req.method === "OPTIONS") return res.status(204).setHeader("Access-Control-Allow-Origin","*").setHeader("Access-Control-Allow-Headers","Content-Type, Authorization").setHeader("Access-Control-Allow-Methods","GET, POST, PATCH, OPTIONS").end();
  try {
    const pool = await db();
    if (req.method === "POST") {
      const b = req.body || {};
      const category=clean(b.category,30),wilaya=clean(b.wilaya,80),municipality=clean(b.municipality,100),area=clean(b.area,160),title=clean(b.title,140),description=clean(b.description,2500),urgency=b.urgency==="urgent"?"urgent":"normal";
      if (!CATEGORIES.has(category) || !wilaya || !municipality || title.length<8 || description.length<20) return reply(res,400,{error:"أكمل نوع الطلب والولاية والبلدية، واكتب عنوانًا ووصفًا واضحين."});
      if (b.contactMethod && !["none","phone","email"].includes(b.contactMethod)) return reply(res,400,{error:"طريقة التواصل غير صالحة."});
      const contactMethod=b.contactMethod||"none",contactValue=contactMethod==="none"?"":clean(b.contactValue,180);
      if(contactMethod!=="none"&&!contactValue) return reply(res,400,{error:"أدخل وسيلة التواصل التي اخترتها أو اختر عدم ترك بيانات تواصل."});
      const reference="BLG-"+new Date().getFullYear()+"-"+crypto.randomBytes(8).toString("hex").toUpperCase();
      const {rows}=await pool.query(`INSERT INTO civic_requests(reference_code,category,wilaya,municipality,area,title,description,urgency,contact_method,contact_value) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING reference_code,category,wilaya,municipality,area,title,urgency,status,status_note,assigned_unit,created_at,updated_at,resolved_at`,[reference,category,wilaya,municipality,area,title,description,urgency,contactMethod,contactValue]);
      return reply(res,201,{request:toPublic(rows[0]),message:"تم تسجيل الطلب في قاعدة البيانات. احتفظ برقم المتابعة."});
    }
    if (req.method === "GET") {
      const ref=clean(req.query?.ref,40).toUpperCase();
      if(ref) {
        const {rows}=await pool.query("SELECT reference_code,category,wilaya,municipality,area,title,urgency,status,status_note,assigned_unit,created_at,updated_at,resolved_at FROM civic_requests WHERE reference_code=$1",[ref]);
        if(!rows.length)return reply(res,404,{error:"لم نعثر على طلب بهذا الرقم."});
        return reply(res,200,{request:toPublic(rows[0])});
      }
      if(!adminAuthorized(req))return reply(res,401,{error:"يلزم رمز الإدارة الصحيح."});
      const status=clean(req.query?.status,30);
      const values=[],where=status&&STATUSES.has(status)?(values.push(status)," WHERE status=$1"):"";
      const {rows}=await pool.query("SELECT id,reference_code,category,wilaya,municipality,area,title,description,urgency,status,status_note,assigned_unit,contact_method,contact_value,created_at,updated_at,resolved_at FROM civic_requests"+where+" ORDER BY created_at DESC LIMIT 500",values);
      return reply(res,200,{requests:rows.map(r=>({...toPublic(r),id:r.id,description:r.description,contactMethod:r.contact_method,contactValue:r.contact_value}))});
    }
    if(req.method==="PATCH") {
      if(!adminAuthorized(req))return reply(res,401,{error:"يلزم رمز الإدارة الصحيح."});
      const b=req.body||{},ref=clean(b.reference,40).toUpperCase(),status=clean(b.status,30),note=clean(b.statusNote,1000),unit=clean(b.assignedUnit,120);
      if(!ref||!STATUSES.has(status))return reply(res,400,{error:"رقم الطلب أو الحالة غير صالح."});
      const {rows}=await pool.query(`UPDATE civic_requests SET status=$2,status_note=$3,assigned_unit=$4,updated_at=NOW(),resolved_at=CASE WHEN $2='resolved' THEN COALESCE(resolved_at,NOW()) ELSE NULL END WHERE reference_code=$1 RETURNING reference_code,category,wilaya,municipality,area,title,urgency,status,status_note,assigned_unit,created_at,updated_at,resolved_at`,[ref,status,note,unit]);
      if(!rows.length)return reply(res,404,{error:"الطلب غير موجود."});
      return reply(res,200,{request:toPublic(rows[0]),message:"تم تحديث حالة الطلب وتسجيل وقت التحديث."});
    }
    return reply(res,405,{error:"الطريقة غير مدعومة."});
  } catch(e) {
    console.error("civic requests API:",e);
    return reply(res,500,{error:"تعذّر الاتصال بقاعدة البيانات. تحقق من إعداد DATABASE_URL وسجلات الخادم."});
  }
};