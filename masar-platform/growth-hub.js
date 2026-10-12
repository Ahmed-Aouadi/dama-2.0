/* Mada Growth Hub. Intentionally isolated from Creative Studio internals. */
(function(){
"use strict";
const $=(s,r)=> (r||document).querySelector(s);
const $$=(s,r)=> Array.from((r||document).querySelectorAll(s));
const KEY="mada-platform-v1";
const initialGrowth=()=>({cv:{name:"",headline:"",email:"",phone:"",city:"",summary:"",education:"",experience:"",projects:"",skills:"",languages:"العربية، الفرنسية"},skills:[],paths:{},history:[],requests:[],locale:"ar"});
let appState={};
try{appState=JSON.parse(localStorage.getItem(KEY)||"{}")||{}}catch(e){appState={}}
let growth=Object.assign(initialGrowth(),appState.growth||{});
let serverRequests=[];
growth.cv=Object.assign(initialGrowth().cv,growth.cv||{});
growth.paths=growth.paths||{};growth.skills=Array.isArray(growth.skills)?growth.skills:[];growth.history=Array.isArray(growth.history)?growth.history:[];growth.requests=Array.isArray(growth.requests)?growth.requests:[];
const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const text=(v,alt="—")=>String(v||"").trim()||alt;
function readState(){try{return window.MadaApp&&window.MadaApp.getState?window.MadaApp.getState():(JSON.parse(localStorage.getItem(KEY)||"{}")||{})}catch(e){return {}}}
function persist(show=true,sync=true){
 try{appState=readState();appState.growth=growth;const encoded=JSON.stringify(appState);localStorage.setItem(KEY,encoded);
 if(window.MadaApp&&window.MadaApp.applyCloudState)window.MadaApp.applyCloudState(appState);
 if(sync!==false&&window.MadaAuth&&typeof window.MadaAuth.sync==="function")Promise.resolve(window.MadaAuth.sync(appState)).catch(()=>{});
 if(show)notify("حُفظت التغييرات.");renderStats();
 }catch(e){notify("تعذّر الحفظ. صدّر بياناتك أو حرّر مساحة التخزين.")}
}
function notify(message){let el=$("#growthToast");if(!el){el=document.createElement("div");el.id="growthToast";el.className="growth-toast";el.setAttribute("role","status");document.body.appendChild(el)}el.textContent=message;el.hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>{el.hidden=true},2600)}
function refreshGrowthState(){
 const s=readState(),saved=s.growth||{},defaults=initialGrowth();
 growth=Object.assign(defaults,saved,{cv:Object.assign({},defaults.cv,saved.cv||{})});
 growth.skills=Array.isArray(growth.skills)?growth.skills:[];growth.paths=growth.paths||{};growth.history=Array.isArray(growth.history)?growth.history:[];growth.requests=Array.isArray(growth.requests)?growth.requests:[];
 const map={growthCvName:"name",growthCvHeadline:"headline",growthCvEmail:"email",growthCvPhone:"phone",growthCvCity:"city",growthCvSummary:"summary",growthCvEducation:"education",growthCvExperience:"experience",growthCvProjects:"projects",growthCvSkills:"skills",growthCvLanguages:"languages"};
 Object.entries(map).forEach(([id,key])=>{const el=$("#"+id);if(el&&document.activeElement!==el)el.value=growth.cv[key]||""});
 renderLocale();renderStats();renderRequests();
}
function renderStats(){
 const s=readState(),projects=Array.isArray(s.projects)?s.projects:[],designs=Array.isArray(s.designs)?s.designs:[],quizzes=Array.isArray(s.quizzes)?s.quizzes:[];
 const metrics={"growthProjects":projects.length,"growthCompleted":projects.filter(p=>p.status==="done").length,"growthPublished":projects.filter(p=>p.galleryVisible===true&&p.visibility!=="private").length,"growthDesigns":designs.length,"growthQuizzes":quizzes.length,"growthSkillsTotal":growth.skills.length};
 Object.keys(metrics).forEach(id=>{const el=$("#"+id);if(el)el.textContent=new Intl.NumberFormat(growth.locale==="fr"?"fr-FR":"ar-DZ").format(metrics[id])});
 const pathTotal=pathsData.reduce((sum,path)=>sum+path.steps.length,0);const pathDone=Object.values(growth.paths).reduce((sum,steps)=>sum+(Array.isArray(steps)?steps.filter(Boolean).length:0),0);const total=projects.length+designs.length+quizzes.length+growth.skills.length+pathTotal;const completed=projects.filter(p=>p.status==="done").length+designs.length+quizzes.length+growth.skills.length+pathDone;
 const pct=total?Math.min(100,Math.round(completed/Math.max(total,1)*100)):0;
 const p=$("#growthProgress");if(p)p.style.width=pct+"%";const label=$("#growthProgressLabel");if(label)label.textContent=pct+"%";
 const skillCount=$("#growthSkillCount");if(skillCount)skillCount.textContent=growth.skills.length+" مهارة";renderCaseStudyOptions();renderSkillList();renderPaths();renderHistory();renderRequests();renderCV();
}
function renderCV(){
 const c=growth.cv,host=$("#growthCVPreview");if(!host)return;
 const locale=$("#growthCvLocale")?.value||"ar";const rtl=locale==="ar";
 const labels=rtl?{contact:"معلومات التواصل",summary:"نبذة مهنية",skills:"المهارات",experience:"الخبرة والمشاريع",education:"التعليم والتكوين",languages:"اللغات"}:{contact:"CONTACT",summary:"PROFILE",skills:"SKILLS",experience:"EXPERIENCE & PROJECTS",education:"EDUCATION",languages:"LANGUAGES"};
 host.dir=rtl?"rtl":"ltr";host.lang=locale;
 host.innerHTML='<h2>'+esc(text(c.name,rtl?"اسمك الكامل":"Your full name"))+'</h2><p style="font-weight:700;color:#6a6882">'+esc(text(c.headline,rtl?"التخصص أو المسمى المهني":"Professional title"))+'</p><p>'+esc([c.email,c.phone,c.city].filter(Boolean).join(" · "))+'</p><h3>'+labels.summary+'</h3><p>'+esc(text(c.summary,rtl?"اكتب نبذة قصيرة عنك.":"Add a short professional summary."))+'</p><h3>'+labels.skills+'</h3><p>'+esc(text(c.skills))+'</p><h3>'+labels.experience+'</h3><p>'+esc(text(c.experience))+'</p><p>'+esc(text(c.projects))+'</p><h3>'+labels.education+'</h3><p>'+esc(text(c.education))+'</p><h3>'+labels.languages+'</h3><p>'+esc(text(c.languages))+'</p>';
}
function renderSkillList(){
 const host=$("#growthSkillList");if(!host)return;
 if(!growth.skills.length){host.innerHTML='<div class="growth-empty">أضف مهاراتك ومستواك لتكوين بطاقة مهارات واضحة.</div>';return}
 host.innerHTML=growth.skills.map((s,i)=>'<div class="growth-skill"><div><strong>'+esc(s.name)+'</strong><small>'+esc(s.evidence||"أضف دليلًا أو مشروعًا يثبت المهارة")+'</small></div><select aria-label="مستوى '+esc(s.name)+'" data-skill-level="'+i+'"><option '+(s.level==="مبتدئ"?"selected":"")+' value="مبتدئ">مبتدئ</option><option '+(s.level==="متوسط"?"selected":"")+' value="متوسط">متوسط</option><option '+(s.level==="متقدم"?"selected":"")+' value="متقدم">متقدم</option><option '+(s.level==="أعلّمها"?"selected":"")+' value="أعلّمها">أعلّمها</option></select><button type="button" class="growth-small-btn" data-skill-delete="'+i+'">حذف</button></div>').join("");
}
const pathsData=[
{id:"web",title:"تطوير الويب",level:"مبتدئ",desc:"من صفحة بسيطة إلى مشروع قابل للعرض.",steps:["اكتب صفحة HTML فيها عنوان وفقرة ورابط.","نسّق الصفحة باستخدام CSS متجاوب.","أضف تفاعلًا صغيرًا باستخدام JavaScript.","انشر مشروعًا تجريبيًا وأضفه إلى ملف إنجازك."]},
{id:"design",title:"التصميم البصري",level:"مبتدئ",desc:"تعلّم أساسيات التكوين واللون ثم اصنع دراسة حالة.",steps:["حلّل تصميمًا يعجبك وحدّد سبب نجاحه.","أنشئ لوحة ألوان من 4 ألوان.","صمّم منشورًا بمقاسين مختلفين.","وثّق الهدف والقرارات والنتيجة في مشروعك."]},
{id:"content",title:"صناعة المحتوى",level:"مبتدئ",desc:"من الفكرة إلى قطعة محتوى واضحة.",steps:["حدّد الجمهور والهدف في جملة.","اكتب مخططًا من 5 نقاط.","أنشئ نسخة أولى ثم راجع الوضوح.","انشر نموذجًا ودوّن ما تعلّمته."]},
{id:"business",title:"ريادة الأعمال",level:"مبتدئ",desc:"اختبر حاجة حقيقية قبل بناء منتج كامل.",steps:["تحدّث إلى 3 أشخاص عن مشكلة محددة.","اكتب فرضية حل واحدة.","صمّم نموذجًا أوليًا بسيطًا.","سجّل الملاحظات والخطوة التالية."]}
];
function renderPaths(){
 const host=$("#growthPathList");if(!host)return;
 host.innerHTML=pathsData.map(p=>{const done=(growth.paths[p.id]||[]).filter(Boolean).length;return '<article class="growth-path"><div class="growth-list-icon">↗</div><div class="growth-path-copy"><strong>'+esc(p.title)+' <span class="growth-badge">'+done+'/'+p.steps.length+'</span></strong><p>'+esc(p.desc)+'</p><div class="growth-progress"><span style="width:'+Math.round(done/p.steps.length*100)+'%"></span></div><div style="display:grid;gap:7px;margin-top:10px">'+p.steps.map((step,i)=>'<label class="growth-check"><input type="checkbox" data-path="'+p.id+'" data-step="'+i+'" '+((growth.paths[p.id]||[])[i]?"checked":"")+'><span>'+esc(step)+'</span></label>').join("")+'</div></div></article>'}).join("");
}
function renderHistory(){
 const host=$("#growthHistory");if(!host)return;
 if(!growth.history.length){host.innerHTML='<div class="growth-empty">لا توجد لقطات محفوظة بعد. أنشئ لقطة قبل تجربة تغييرات كبيرة.</div>';return}
 host.innerHTML=growth.history.map((h,i)=>'<article class="growth-history"><div class="growth-list-icon">↺</div><div class="growth-history-copy"><strong>'+esc(h.label||"لقطة محفوظة")+'</strong><p>'+esc(h.date||"")+' · '+(h.projects||0)+' مشروع · '+(h.designs||0)+' تصميم</p><button type="button" class="growth-small-btn" data-history-restore="'+i+'">استعادة هذه اللقطة</button> <button type="button" class="growth-small-btn" data-history-delete="'+i+'">حذف</button></div></article>').join("");
}
function renderRequests(){
 const host=$("#growthRequests");if(!host)return;
 const local=growth.requests.map((r,i)=>'<article class="growth-request"><div class="growth-list-icon">✉</div><div class="growth-request-copy"><strong>'+esc(r.title)+'</strong><p>مسودة محلية · '+esc(r.type)+' · '+esc(r.person||"لم يُحدد الطرف الآخر")+' · '+esc(r.date)+'</p><p>'+esc(r.message)+'</p><button type="button" class="growth-small-btn" data-request-copy="'+i+'">نسخ الطلب</button> <button type="button" class="growth-small-btn" data-request-delete="'+i+'">حذف المسودة</button></div></article>').join("");
 const statusLabel={pending:"بانتظار الرد",accepted:"مقبول",declined:"مرفوض",cancelled:"ملغى"};
 const remote=serverRequests.map(r=>'<article class="growth-request"><div class="growth-list-icon">'+(r.direction==="incoming"?"↙":"↗")+'</div><div class="growth-request-copy"><strong>'+esc(r.title)+'</strong><p>'+esc(r.direction==="incoming"?"من @"+r.sender_username:"إلى @"+r.recipient_username)+' · '+esc(r.request_type)+' · '+esc(statusLabel[r.status]||r.status)+'</p><p>'+esc(r.message)+'</p>'+(r.status==="pending"&&r.direction==="incoming"?'<button type="button" class="growth-small-btn" data-collab-update="accepted" data-collab-id="'+esc(r.id)+'">قبول</button> <button type="button" class="growth-small-btn" data-collab-update="declined" data-collab-id="'+esc(r.id)+'">رفض</button>':'')+(r.status==="pending"&&r.direction==="outgoing"?' <button type="button" class="growth-small-btn" data-collab-update="cancelled" data-collab-id="'+esc(r.id)+'">إلغاء الطلب</button>':'')+'</div></article>').join("");
 host.innerHTML=remote+local||'<div class="growth-empty">لا توجد طلبات حتى الآن. سجّل الدخول لإرسال طلب فعلي إلى مستخدم آخر، أو احفظ مسودة خاصة.</div>';
}
async function refreshCollaboration(){
 try{const response=await fetch("/api/account?action=collaboration-list",{credentials:"same-origin",cache:"no-store"});if(!response.ok)return;const data=await response.json();serverRequests=Array.isArray(data.requests)?data.requests:[];renderRequests()}catch(e){}
}
async function updateCollaboration(id,status){
 try{const response=await fetch("/api/account?action=collaboration-update",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status})});const data=await response.json();if(!response.ok){notify(data.error||"تعذر تحديث الطلب.");return}await refreshCollaboration();notify("تم تحديث حالة طلب التعاون.")}catch(e){notify("تعذر الاتصال بالخادم. حاول لاحقًا.")}
}
const templates=[
{id:"cv",icon:"▤",title:"قالب سيرة ذاتية",desc:"سيرة منظمة قابلة للطباعة على A4، مع أقسام واضحة ومناسبة للتعديل.",paid:false},
{id:"case",icon:"◈",title:"قالب دراسة حالة مشروع",desc:"المشكلة، الهدف، دورك، الأدوات، القرارات، النتيجة وما تعلمته.",paid:false},
{id:"study",icon:"✓",title:"مخطط دراسة أسبوعي",desc:"أهداف الأسبوع، تقسيم الوقت، الأولويات ومراجعة الإنجاز.",paid:false},
{id:"brief",icon:"✳",title:"ملخص موجز لمشروع تصميم",desc:"نموذج موجز لتحديد الجمهور والرسالة والألوان والمخرجات.",paid:false},
{id:"invoice",icon:"▧",title:"نموذج عرض سعر بسيط",desc:"هيكل قابل للطباعة لتوثيق الخدمة والتكلفة وشروط التسليم.",paid:false},
{id:"premium",icon:"✦",title:"مساحة قوالب احترافية",desc:"مكان مهيأ لقوالب مميزة لاحقًا. الدفع غير مفعل في هذه النسخة.",paid:true}
];
function downloadTemplate(id){
 const t=templates.find(x=>x.id===id);if(!t||t.paid){notify("البيع والدفع غير مفعلين بعد؛ لم يتم تحصيل أي مبلغ.");return}
 const defs={
 cv:["سيرة ذاتية","الاسم الكامل","المسمى المهني","نبذة مهنية","المهارات","الخبرة والمشاريع","التعليم والتكوين","اللغات","معلومات التواصل"],
 case:["دراسة حالة مشروع","ملخص المشروع","المشكلة","الهدف والجمهور","دوري ومسؤولياتي","القرارات والأدوات","النتيجة والأثر","ما تعلمته","الخطوة التالية"],
 study:["مخطط دراسة أسبوعي","أهم 3 أهداف","المهام حسب اليوم","جلسات التركيز","المراجعة الأسبوعية","ما يحتاج تحسينًا"],
 brief:["موجز مشروع تصميم","الهدف","الجمهور","الرسالة الأساسية","المراجع","الألوان والخطوط","المخرجات والمقاسات","موعد التسليم"],
 invoice:["عرض سعر","مقدم الخدمة","العميل","وصف الخدمة","الكمية والسعر","الإجمالي","مدة التنفيذ","الشروط"]
 }[id];
 const html='<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>'+esc(t.title)+'</title><style>body{font-family:Arial,sans-serif;max-width:820px;margin:35px auto;padding:24px;color:#17152b;line-height:1.8}h1{color:#5b46e6;border-bottom:3px solid #34d6b0;padding-bottom:12px}section{border:1px solid #ddd8eb;border-radius:12px;padding:12px 16px;margin:14px 0;min-height:60px}h2{font-size:16px}p{color:#777}button{background:#5b46e6;color:white;border:0;padding:10px 16px;border-radius:8px}@media print{button{display:none}body{margin:0}}</style><h1 contenteditable="true">'+esc(defs[0])+'</h1><p contenteditable="true">انقر على النصوص لتعديلها. اطبع الصفحة أو احفظها PDF.</p>'+defs.slice(1).map(x=>'<section contenteditable="true"><h2>'+esc(x)+'</h2><p>اكتب هنا...</p></section>').join("")+'<button onclick="window.print()">طباعة / حفظ PDF</button></html>';
 const url=URL.createObjectURL(new Blob([html],{type:"text/html;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=id+"-mada-template.html";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notify("تم تنزيل قالب قابل للتعديل.");
}
function renderTemplates(){const host=$("#growthTemplates");if(!host)return;host.innerHTML='<div class="growth-empty">جارٍ تحميل القوالب المتاحة…</div>';fetch("/api/admin?action=public-config",{credentials:"same-origin",cache:"no-store"}).then(r=>{if(!r.ok)throw new Error("templates unavailable");return r.json()}).then(d=>{const list=Array.isArray(d.growthTemplates)?d.growthTemplates:[];host.innerHTML=list.map(t=>'<article class="growth-template"><div class="growth-template-icon">'+esc(t.icon||"✦")+'</div><div class="growth-template-copy"><strong>'+esc(t.title)+' '+(t.paid?'<span class="pill gray">قريبًا</span>':'<span class="growth-badge">جاهز للاستخدام</span>')+'</strong><p>'+esc(t.intro||"قالب عملي قابل للتعبئة والطباعة.")+'</p><div class="growth-template-actions"><button type="button" data-template-download="'+esc(t.id)+'">'+(t.paid?"التفاصيل":"استعمال القالب")+'</button></div></div></article>').join("")||'<div class="growth-empty">لا توجد قوالب جاهزة حاليًا. ستظهر القوالب التي يضيفها مدير المنصة هنا.</div>'}).catch(()=>{host.innerHTML='<div class="growth-empty">تعذر تحميل القوالب الآن. حاول تحديث الصفحة.</div>'})}
function snapshot(){
 const s=readState();const snap={id:Date.now().toString(36),label:"لقطة "+new Date().toLocaleString("ar-DZ"),date:new Date().toLocaleString("ar-DZ"),projects:Array.isArray(s.projects)?s.projects.length:0,designs:Array.isArray(s.designs)?s.designs.length:0,data:{profile:s.profile||{},projects:s.projects||[],designs:s.designs||[],quizzes:s.quizzes||[],settings:s.settings||{},portfolioSettings:s.portfolioSettings||{}}};
 if(JSON.stringify(snap).length>450000){notify("حجم اللقطة كبير بسبب الوسائط المضمنة. صدّر نسخة JSON من الإعدادات قبل التغييرات بدل حفظ لقطة داخلية.");return}
 growth.history.unshift(snap);growth.history=growth.history.slice(0,3);persist(false);renderHistory();notify("حُفظت لقطة من ملفك ومشاريعك وتصميماتك.");
}
function printGrowthDocument(html){let frame=document.getElementById("growthPrintFrame");if(frame)frame.remove();frame=document.createElement("iframe");frame.id="growthPrintFrame";frame.title="مستند للطباعة";frame.style.cssText="position:fixed;right:0;bottom:0;width:100vw;height:100vh;opacity:0;border:0;pointer-events:none";document.body.appendChild(frame);const doc=frame.contentDocument;doc.open();doc.write(html);doc.close();setTimeout(function(){try{frame.contentWindow.focus();frame.contentWindow.print()}catch(e){notify("تعذرت الطباعة داخل الصفحة. جرّب أمر الطباعة في المتصفح.")}},500);frame.contentWindow.onafterprint=function(){setTimeout(function(){frame.remove()},1200)}}
function exportCV(){const host=$("#growthCVPreview");if(!host)return;const html='<!doctype html><html lang="'+(host.lang||"ar")+'" dir="'+(host.dir||"rtl")+'"><head><meta charset="utf-8"><title>CV - Mada</title><style>body{font-family:Arial,sans-serif;margin:18mm;color:#17152b;line-height:1.7}h2{color:#5b46e6}h3{border-bottom:1px solid #ddd;padding-bottom:4px}p{white-space:pre-wrap;overflow-wrap:anywhere}@page{size:A4;margin:15mm}</style></head><body>'+host.innerHTML+'</body></html>';printGrowthDocument(html)}

function renderCaseStudyOptions(){
 const select=$("#growthCaseStudySelect");if(!select)return;const s=readState(),projects=Array.isArray(s.projects)?s.projects:[];
 const previous=select.value;select.innerHTML=projects.length?projects.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.title||"مشروع بدون عنوان")+'</option>').join(""):'<option value="">لا توجد مشاريع بعد</option>';
 if(previous&&projects.some(p=>String(p.id)===previous))select.value=previous;
 const btn=$("#growthExportCaseStudy");if(btn)btn.disabled=!projects.length;
}
function exportCaseStudy(){
 const s=readState(),p=(s.projects||[]).find(x=>String(x.id)===$("#growthCaseStudySelect")?.value);if(!p){notify("أضف مشروعًا في ملف إنجازي أولًا.");return}
 const html='<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>دراسة حالة - '+esc(p.title||"مشروع")+'</title><style>body{font-family:Arial,sans-serif;max-width:850px;margin:30px auto;padding:22px;color:#17152b;line-height:1.9}h1{color:#5b46e6;border-bottom:4px solid #34d6b0;padding-bottom:12px}h2{font-size:16px;margin-bottom:5px}section{padding:8px 0;border-bottom:1px solid #e9e6f1}p{white-space:pre-wrap;overflow-wrap:anywhere}.meta{color:#6a6882;font-size:12px}.print{background:#5b46e6;color:white;border:0;border-radius:8px;padding:10px 14px}@media print{.print{display:none}body{margin:0}}@page{size:A4;margin:16mm}</style><h1>'+esc(text(p.title,"دراسة حالة مشروع"))+'</h1><p class="meta">'+esc(p.category||"")+" · "+esc(p.status||"")+'</p><section><h2>ملخص المشروع</h2><p>'+esc(text(p.description))+'</p></section><section><h2>المشكلة والهدف</h2><p>'+esc(text(p.goal||p.brief||"أضف الهدف في وصف المشروع لتوثيقه هنا."))+'</p></section><section><h2>دوري ومسؤولياتي</h2><p>'+esc(text(p.role))+'</p></section><section><h2>الأدوات والتقنيات</h2><p>'+esc(text(p.tools))+'</p></section><section><h2>النتيجة والأثر</h2><p>'+esc(text(p.outcome))+'</p></section><section><h2>ما تعلمته</h2><p>'+esc(text(p.learning||"أضف ما تعلمته إلى وصف المشروع قبل التصدير."))+'</p></section><p class="meta">تم إعداد هذه الدراسة من بيانات ملف الإنجاز في مَدى.</p><button class="print" onclick="window.print()">طباعة / حفظ PDF</button></html>';
 printGrowthDocument(html);
}
function printSkills(){
 const list=growth.skills;if(!list.length){notify("أضف مهارة واحدة على الأقل أولًا.");return}
 const html='<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>بطاقة مهارات مَدى</title><style>body{font-family:Arial,sans-serif;max-width:760px;margin:30px auto;padding:25px;color:#17152b;line-height:1.8}h1{color:#5b46e6}.skill{border:1px solid #ddd8eb;border-radius:12px;padding:12px;margin:10px 0}.level{color:#5b46e6;font-weight:bold;font-size:12px}@page{size:A4;margin:15mm}</style><h1>بطاقة المهارات</h1><p>'+esc(text(readState().profile?.name,"ملف مهارات شخصي"))+'</p>'+list.map(s=>'<section class="skill"><strong>'+esc(s.name)+'</strong><div class="level">'+esc(s.level)+'</div><p>'+esc(s.evidence)+'</p></section>').join("")+'<p>هذه البطاقة توثق ما أدخله صاحب الملف، وليست شهادة اعتماد مستقلة.</p><script>window.onload=function(){setTimeout(function(){window.print()},250)}</script></html>';
 printGrowthDocument(html);
}

function renderLocale(){const fr=growth.locale==="fr";const el=$("#growthLocaleLabel");if(el)el.textContent=fr?"Langue du CV : Français":"لغة السيرة الذاتية: العربية";const b=$("#growthLocaleToggle");if(b)b.textContent=fr?"العربية":"Français";const cvLocale=$("#growthCvLocale");if(cvLocale&&cvLocale.value!==(fr?"fr":"ar")){cvLocale.value=fr?"fr":"ar";renderCV()}}
function bindCV(){
 const map={growthCvName:"name",growthCvHeadline:"headline",growthCvEmail:"email",growthCvPhone:"phone",growthCvCity:"city",growthCvSummary:"summary",growthCvEducation:"education",growthCvExperience:"experience",growthCvProjects:"projects",growthCvSkills:"skills",growthCvLanguages:"languages"};
 Object.entries(map).forEach(([id,key])=>{const el=$("#"+id);if(!el)return;el.value=growth.cv[key]||"";el.addEventListener("input",()=>{growth.cv[key]=el.value;persist(false,false);renderCV()})});
 const locale=$("#growthCvLocale");if(locale)locale.addEventListener("change",renderCV);
}
document.addEventListener("click",e=>{
 const templateButton=e.target.closest("[data-template-download]");if(templateButton){downloadTemplate(templateButton.dataset.templateDownload);return}
 const collabAction=e.target.closest("[data-collab-update]");if(collabAction){updateCollaboration(collabAction.dataset.collabId,collabAction.dataset.collabUpdate);return}
 const tab=e.target.closest("[data-growth-tab]");if(tab){const key=tab.dataset.growthTab;Array.prototype.forEach.call(document.querySelectorAll(".growth-tabs [data-growth-tab]"),function(b){const selected=b.dataset.growthTab===key;b.classList.toggle("active",selected);b.setAttribute("aria-selected",selected?"true":"false");b.tabIndex=selected?0:-1});Array.prototype.forEach.call(document.querySelectorAll("[data-growth-panel]"),function(p){p.hidden=p.dataset.growthPanel!==key});return}

 const del=e.target.closest("[data-skill-delete]");if(del){growth.skills.splice(Number(del.dataset.skillDelete),1);persist(false);renderSkillList();return}
 const restore=e.target.closest("[data-history-restore]");if(restore){const h=growth.history[Number(restore.dataset.historyRestore)];if(!h||!h.data)return;if(!confirm("ستُستبدل المشاريع والتصميمات والملف الشخصي الحاليون بنسخة اللقطة. يفضّل إنشاء لقطة للحالة الحالية أولًا. هل تريد المتابعة؟"))return;const current=readState();snapshot();const next=Object.assign({},current,h.data,{growth:growth});if(window.MadaApp&&window.MadaApp.applyCloudState)window.MadaApp.applyCloudState(next);else localStorage.setItem(KEY,JSON.stringify(next));if(window.MadaAuth&&typeof window.MadaAuth.sync==="function")Promise.resolve(window.MadaAuth.sync(next)).catch(()=>{});appState=next;notify("تمت استعادة اللقطة.");renderStats();return}
 const hd=e.target.closest("[data-history-delete]");if(hd){growth.history.splice(Number(hd.dataset.historyDelete),1);persist(false);renderHistory();return}
 const rd=e.target.closest("[data-request-delete]");if(rd){growth.requests.splice(Number(rd.dataset.requestDelete),1);persist(false);renderRequests();return}
 const rc=e.target.closest("[data-request-copy]");if(rc){const r=growth.requests[Number(rc.dataset.requestCopy)];if(r)navigator.clipboard?.writeText("طلب تعاون: "+r.title+"\nالنوع: "+r.type+"\nالطرف الآخر: "+r.person+"\nالتفاصيل: "+r.message).then(()=>notify("تم نسخ نص الطلب."),()=>notify("تعذّر النسخ التلقائي."));return}
});
document.addEventListener("change",e=>{const cb=e.target.closest("[data-path]");if(cb){const p=cb.dataset.path,i=Number(cb.dataset.step);growth.paths[p]=growth.paths[p]||[];growth.paths[p][i]=cb.checked;persist(false);renderPaths();renderStats();return}const sel=e.target.closest("[data-skill-level]");if(sel){const s=growth.skills[Number(sel.dataset.skillLevel)];if(s)s.level=sel.value;persist(false)}});
const skillForm=$("#growthSkillForm");if(skillForm)skillForm.addEventListener("submit",e=>{e.preventDefault();const name=$("#growthSkillName").value.trim();if(!name)return;if(growth.skills.some(s=>s.name.toLowerCase()===name.toLowerCase())){notify("هذه المهارة موجودة بالفعل.");return}growth.skills.push({name,level:$("#growthSkillLevel").value,evidence:$("#growthSkillEvidence").value.trim()});skillForm.reset();persist();renderSkillList()});
const cvForm=$("#growthCvForm");if(cvForm)cvForm.addEventListener("submit",e=>{e.preventDefault();persist();notify("تم حفظ بيانات السيرة الذاتية.")});
const requestForm=$("#growthRequestForm");if(requestForm)requestForm.addEventListener("submit",async e=>{e.preventDefault();const title=$("#growthRequestTitle").value.trim(),message=$("#growthRequestMessage").value.trim(),person=$("#growthRequestPerson").value.trim();if(!title||!message)return;
 if(person){try{const response=await fetch("/api/account?action=collaboration-create",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({title,requestType:$("#growthRequestType").value,recipientUsername:person,message})});const data=await response.json();if(response.ok){requestForm.reset();await refreshCollaboration();notify("أُرسل طلب التعاون إلى @"+esc(person)+".");return}if(response.status!==401){notify(data.error||"تعذّر إرسال طلب التعاون.");return}}catch(err){notify("تعذّر الاتصال بالخادم؛ تحقق من اتصالك.");return}}
 growth.requests.unshift({title,type:$("#growthRequestType").value,person:person,message,date:new Date().toLocaleDateString("ar-DZ")});growth.requests=growth.requests.slice(0,30);requestForm.reset();persist();renderRequests();notify(person?"حُفظت المسودة محليًا؛ سجّل الدخول لإرسالها فعليًا.":"حُفظت مسودة خاصة. أدخل اسم مستخدم لإرسال طلب فعلي.")});
const snapBtn=$("#growthSnapshotBtn");if(snapBtn)snapBtn.addEventListener("click",snapshot);
const caseBtn=$("#growthExportCaseStudy");if(caseBtn)caseBtn.addEventListener("click",exportCaseStudy);
const skillsPrint=$("#growthPrintSkills");if(skillsPrint)skillsPrint.addEventListener("click",printSkills);
const printBtn=$("#growthPrintCv");if(printBtn)printBtn.addEventListener("click",exportCV);
const addLink=$("#growthPortfolioShortcut");if(addLink)addLink.addEventListener("click",()=>{const btn=$("#portfolioShareLink");if(btn&&btn.href&&btn.href!==""){window.open(btn.href,"_blank","noopener");return}const publish=$("#publishPortfolioBtn");if(publish){publish.click();notify("افتح قسم ملف الإنجاز لإكمال نشر المعرض.");return}notify("انتقل إلى ملف إنجازي ثم انشر المعرض للحصول على رابط المشاركة.")});
const localeBtn=$("#growthLocaleToggle");if(localeBtn)localeBtn.addEventListener("click",()=>{growth.locale=growth.locale==="fr"?"ar":"fr";persist(false);renderLocale();renderStats()});
bindCV();renderTemplates();renderLocale();renderStats();refreshCollaboration();document.addEventListener("mada:authchange",function(){refreshGrowthState();refreshCollaboration()});
})();