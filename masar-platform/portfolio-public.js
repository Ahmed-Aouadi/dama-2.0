(function(){
"use strict";
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const slug=(params.get("id")||"").trim();
let portfolioData=null;
function esc(value){return String(value==null?"":value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function safeUrl(value,allowImageData){const raw=String(value||"").trim();if(!raw)return "";if(allowImageData&&/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(raw)&&raw.length<250000)return raw;if(/^data:video\/(?:mp4|webm|ogg);base64,/i.test(raw)&&raw.length<1000000)return raw;if(/^data:application\/(?:pdf|zip|octet-stream|vnd\.[a-z0-9.+-]+);base64,/i.test(raw)&&raw.length<750000)return raw;if(/^data:text\/plain;base64,/i.test(raw)&&raw.length<750000)return raw;try{const u=new URL(raw,location.href);return ["http:","https:"].includes(u.protocol)?u.href:""}catch(e){return ""}}
function getVideoMarkup(value){const url=safeUrl(value,false);if(!url)return "";try{const u=new URL(url),host=u.hostname.toLowerCase();if(host==="youtu.be"||host.endsWith("youtube.com")){const id=host==="youtu.be"?u.pathname.slice(1):(u.searchParams.get("v")||u.pathname.split("/").filter(Boolean).pop());if(id&&/^[A-Za-z0-9_-]{6,20}$/.test(id))return '<div style="margin-top:14px;aspect-ratio:16/9"><iframe title="فيديو العمل" src="https://www.youtube-nocookie.com/embed/'+esc(id)+'" loading="lazy" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen style="width:100%;height:100%;border:0;border-radius:12px"></iframe></div>'}if(host.endsWith("vimeo.com")){const id=u.pathname.split("/").filter(Boolean).pop();if(/^\d{5,15}$/.test(id||""))return '<div style="margin-top:14px;aspect-ratio:16/9"><iframe title="فيديو العمل" src="https://player.vimeo.com/video/'+esc(id)+'" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen style="width:100%;height:100%;border:0;border-radius:12px"></iframe></div>'}if(/\.(mp4|webm|ogg)(?:$|[?#])/i.test(u.pathname+u.search))return '<div style="margin-top:14px"><video controls preload="metadata" style="width:100%;max-height:320px;border-radius:12px;background:#17152b" src="'+esc(url)+'"></video></div>';return ""}catch(e){return ""}}
function projectCard(p,index){
const cover=safeUrl(p.cover,true)||(Array.isArray(p.mediaImages)&&safeUrl(p.mediaImages[0],true))||(Array.isArray(p.uploadedImages)&&safeUrl(p.uploadedImages[0],true))||"";
return '<button type="button" class="work project-tile" data-project-index="'+index+'" aria-label="عرض تفاصيل '+esc(p.title||"العمل")+'">'+
'<span class="work-cover">'+(cover?'<img loading="lazy" src="'+esc(cover)+'" alt="">':'<span class="cover-mark">✳</span>')+'</span>'+
'<span class="project-tile-title">'+esc(p.title||"عمل بدون عنوان")+'</span></button>';
}
function projectDetailsMarkup(p){
const display=portfolioData&&portfolioData.portfolio&&portfolioData.portfolio.display||{};
const cover=safeUrl(p.cover,true)||(Array.isArray(p.mediaImages)&&safeUrl(p.mediaImages[0],true))||(Array.isArray(p.uploadedImages)&&safeUrl(p.uploadedImages[0],true))||"";
const images=Array.from(new Set((Array.isArray(p.mediaImages)?p.mediaImages:[]).concat(Array.isArray(p.uploadedImages)?p.uploadedImages:[]).map(v=>safeUrl(v,true)).filter(Boolean))).slice(0,12);
const link=safeUrl(p.link,false),video=safeUrl(p.uploadedVideo||p.videoUrl,false),file=safeUrl(p.uploadedFile||p.fileUrl,false);
const workType=({general:"مشروع عام أو متكامل",software:"مشروع برمجي",website:"موقع إلكتروني",app:"تطبيق هاتف أو حاسوب",design:"تصميم جرافيكي أو هوية بصرية",video:"فيديو أو إنتاج مرئي",media:"مشروع إعلامي أو صناعة محتوى",journalism:"تقرير أو عمل صحفي",photography:"تصوير فوتوغرافي",writing:"كتابة أو تأليف",book:"كتاب أو كتيّب",research:"بحث أو دراسة",education:"محتوى تعليمي أو تدريب",business:"مشروع تجاري أو ريادي",engineering:"مشروع هندسي أو صناعي",community:"مبادرة أو نشاط مجتمعي",event:"فعالية أو تنظيم",document:"ملف أو مستند",gallery:"معرض صور أو أعمال فنية"})[p.workType]||"";const category=({design:"تصميم وفنون",tech:"برمجة وتقنية",media:"إعلام وإنتاج محتوى",writing:"كتابة وتأليف",study:"دراسة وبحث",education:"تعليم وتدريب",business:"أعمال وريادة",engineering:"هندسة وصناعة",science:"علوم وتجارب",community:"مبادرات ومجتمع",event:"فعاليات وتنظيم",personal:"مشروع شخصي",other:"أخرى"})[p.category]||"عمل شخصي";
const status=({done:"مكتمل",progress:"قيد العمل",idea:"فكرة"})[p.status]||"عمل";
const facts=[["نوع العمل",display.showWorkType===false?"":workType],["التصنيف",display.showWorkCategory===false?"":category],["الحالة",display.showWorkStatus===false?"":status],["دوري في العمل",display.showWorkRole===false?"":p.role],["الأدوات",display.showWorkTools===false?"":p.tools],["المهارات",display.showWorkTags===false?"":p.tags]].filter(x=>String(x[1]||"").trim());
return '<div class="project-detail">'+(cover?'<img class="project-detail-cover" src="'+esc(cover)+'" alt="صورة '+esc(p.title||"العمل")+'">':'<div class="project-detail-placeholder" aria-label="لا توجد صورة لهذا العمل"><span>✳</span><strong>لا توجد صورة مرفقة</strong><small>تفاصيل العمل متاحة أدناه</small></div>')+
'<div class="project-detail-heading"><span class="kicker">تفاصيل العمل</span><h2>'+esc(p.title||"عمل بدون عنوان")+'</h2>'+(p.featured?'<span class="tag">✦ عمل مميز</span>':"")+'</div>'+
(display.showWorkDescription!==false&&p.description?'<section class="project-detail-section"><h3>نبذة عن العمل</h3><p class="project-detail-description">'+esc(p.description)+'</p></section>':"")+
(facts.length?'<div class="facts">'+facts.map(x=>'<div class="fact"><strong>'+esc(x[0])+'</strong><span>'+esc(x[1])+'</span></div>').join("")+'</div>':"")+
(display.showWorkOutcome!==false&&p.outcome?'<section class="work-outcome"><strong>النتيجة أو ما تعلّمته</strong>'+esc(p.outcome)+'</section>':"")+
(images.length?'<section class="project-detail-media"><h3>صور إضافية</h3><div class="media-gallery">'+images.map(src=>'<a href="'+esc(src)+'" target="_blank" rel="noopener noreferrer" aria-label="عرض صورة إضافية"><img loading="lazy" src="'+esc(src)+'" alt="صورة إضافية للعمل"></a>').join("")+'</div></section>':"")+
(link?'<section class="project-detail-section project-detail-links"><h3>رابط العمل</h3><a class="public-project-link" href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">فتح رابط العمل ↗</a></section>':"")+
(video?'<section class="project-detail-media"><h3>الفيديو</h3>'+getVideoMarkup(video)+'</section>':"")+
(file&&p.showFileDownload===true?'<div class="media-links"><a href="'+esc(file)+'" target="_blank" rel="noopener noreferrer" download>تنزيل الملف ↗</a></div>':"")+
'</div>';
}
function ensureProjectDialog(){
if($("projectDetailsModal"))return;
const modal=document.createElement("div");modal.className="modal-backdrop project-details-backdrop";modal.id="projectDetailsModal";
modal.setAttribute("role","dialog");modal.setAttribute("aria-modal","true");modal.setAttribute("aria-labelledby","projectDetailsTitle");
modal.innerHTML='<section class="dialog-card project-details-dialog"><div class="dialog-head"><div><small>مَدى · معرض الأعمال</small><h2 id="projectDetailsTitle">تفاصيل العمل</h2></div><button class="dialog-close" type="button" data-modal-close="projectDetailsModal" aria-label="إغلاق">×</button></div><div id="projectDetailsContent"></div><div class="dialog-actions"><button class="btn" type="button" data-modal-close="projectDetailsModal">إغلاق التفاصيل</button></div></section>';
document.body.appendChild(modal);modal.addEventListener("click",e=>{if(e.target===modal)closeDialog("projectDetailsModal")});
}
function render(data){
portfolioData=data;
const p=data.portfolio||{},profile=p.profile||{},display=p.display||{},projects=(Array.isArray(p.projects)?p.projects:[]).filter(function(x){return !display.featuredOnly||x.featured});
ensureProjectDialog();
$("loadStatus").hidden=true;
const safeHex=(value,fallback)=>/^#[0-9a-f]{6}$/i.test(String(value||""))?String(value):fallback;
const accent=safeHex(display.accent,"#5b46e6"),background=safeHex(display.background,"#f6f4ff");
const template=["classic","editorial","minimal","mosaic"].includes(display.template)?display.template:"classic";
const columns=Math.max(2,Math.min(4,Number(display.columns)||3));
const view=$("portfolioView");
view.hidden=false;
view.className="portfolio-theme portfolio-template-"+template;
view.style.setProperty("--gallery-accent",accent);
view.style.setProperty("--gallery-paper",background);
view.style.setProperty("--gallery-columns",String(columns));
view.style.setProperty("--gallery-profile-bg",/^#[0-9a-f]{6}$/i.test(display.profileBackground||"")?display.profileBackground:"#17152b");
view.style.setProperty("--gallery-text",/^#[0-9a-f]{6}$/i.test(display.textColor||"")?display.textColor:"#17152b");
view.style.setProperty("--gallery-heading",/^#[0-9a-f]{6}$/i.test(display.headingColor||"")?display.headingColor:accent);
view.style.setProperty("--gallery-name-size",Math.max(22,Math.min(64,Number(display.nameSize)||38))+"px");
view.style.setProperty("--gallery-body-size",Math.max(12,Math.min(24,Number(display.bodySize)||16))+"px");
view.style.setProperty("--gallery-title-size",Math.max(18,Math.min(48,Number(display.sectionTitleSize)||30))+"px");
view.style.setProperty("--gallery-font",({system:"system-ui,Arial,sans-serif",cairo:"Cairo,Arial,sans-serif",tajawal:"Tajawal,Arial,sans-serif",almarai:"Almarai,Arial,sans-serif",amiri:"Amiri,Georgia,serif",reemkufi:"'Reem Kufi',Cairo,sans-serif",elmessiri:"'El Messiri',Cairo,sans-serif",serif:"Georgia,'Times New Roman',serif",mono:"ui-monospace,SFMono-Regular,monospace"})[display.fontFamily]||"system-ui,Arial,sans-serif");
view.style.setProperty("--gallery-card-bg",safeHex(display.cardBackground,"#ffffff"));
if(display.cardRadius!==undefined&&display.cardRadius!==""&&Number.isFinite(Number(display.cardRadius)))view.style.setProperty("--gallery-card-radius",Math.max(0,Math.min(32,Number(display.cardRadius)))+"px");else view.style.removeProperty("--gallery-card-radius");
view.dataset.density=["compact","comfortable","spacious"].includes(display.density)?display.density:"comfortable";
view.dataset.heroStyle=["dark","light","accent"].includes(display.heroStyle)?display.heroStyle:"dark";
view.dataset.pattern=["none","dots","grid"].includes(display.pattern)?display.pattern:"none";
{const cb=safeHex(display.cardBackground,"#ffffff"),lum=(parseInt(cb.slice(1,3),16)*.299+parseInt(cb.slice(3,5),16)*.587+parseInt(cb.slice(5,7),16)*.114);view.dataset.dark=lum<110?"1":"0"}
view.style.setProperty("--gallery-align",["right","center","left"].includes(display.textAlign)?display.textAlign:"right");
const backgroundImage=safeUrl(display.backgroundImage,false);
view.style.backgroundImage=backgroundImage?'linear-gradient(180deg,rgba(255,255,255,.86),rgba(255,255,255,.9)),url("'+backgroundImage.replace(/["\\]/g,"")+'")':"";
view.style.backgroundSize=backgroundImage?"cover":"";
view.style.backgroundPosition=backgroundImage?"center":"";
view.style.backgroundAttachment=backgroundImage?"fixed":"";
view.style.fontFamily="var(--gallery-font)";
view.style.color="var(--gallery-text)";
view.style.fontSize="var(--gallery-body-size)";
view.dataset.profileLayout=["side","stacked","centered"].includes(display.profileLayout)?display.profileLayout:"side";
view.dataset.cardStyle=["rounded","square","shadow"].includes(display.cardStyle)?display.cardStyle:"rounded";
document.documentElement.style.setProperty("--purple",accent);
document.documentElement.style.setProperty("--paper",background);
const skills=display.showSkills===false?[]:String(profile.skills||"").split(/[,،]/).map(x=>x.trim()).filter(Boolean).slice(0,24);
const avatar=display.showAvatar===false?"":safeUrl(profile.avatar||profile.photo,true);
const name=profile.name||data.authorName||data.username;
const hero='<header class="profile-hero"><div class="profile-copy"><span class="kicker">'+esc(display.brandText||"معرض أعمال شخصي · مَدى")+'</span><h1>'+esc(name)+'</h1>'+
(display.showRole!==false&&profile.role?'<p class="role">'+esc(profile.role)+'</p>':"")+
(display.showBio!==false&&profile.bio?'<p class="bio">'+esc(profile.bio)+'</p>':"")+
'<div class="profile-meta">'+(display.showCity!==false&&profile.city?'<span class="meta-chip">⌖ '+esc(profile.city)+'</span>':"")+(display.showEducation!==false&&profile.education?'<span class="meta-chip">▤ '+esc(profile.education)+'</span>':"")+(display.showExperience===true&&profile.experience?'<span class="meta-chip">✦ '+esc(profile.experience)+'</span>':"")+(display.showGoal===true&&profile.goal?'<span class="meta-chip">◎ '+esc(profile.goal)+'</span>':"")+(display.showProfileLink===true&&safeUrl(profile.link,false)?'<a class="meta-chip" href="'+esc(safeUrl(profile.link,false))+'" target="_blank" rel="noopener noreferrer">رابط الملف ↗</a>':"")+(display.showWorkCount!==false?'<span class="meta-chip">'+projects.length+' أعمال معروضة</span>':"")+'</div>'+
(display.showInterests===true&&profile.interests?'<p class="bio">الاهتمامات: '+esc(profile.interests)+'</p>':"")+
(skills.length?'<div class="skills">'+skills.map(x=>'<span class="skill">'+esc(x)+'</span>').join("")+'</div>':"")+
'</div>'+(avatar?'<div class="profile-avatar"><img src="'+esc(avatar)+'" alt="الصورة الشخصية"></div>':"")+'</header>';
const title=String(display.title||"الأعمال المختارة").trim();
const subtitle=String(display.subtitle||"أعمال وتجارب وروابط شاركها صاحب المعرض.").trim();
const sectionHead=(display.showSectionTitle===false?"":'<div class="section-head"><div><h2>'+esc(title||"الأعمال المختارة")+'</h2>'+(subtitle?'<p>'+esc(subtitle)+'</p>':"")+'</div>'+(display.showWorkCount!==false?'<span class="count">'+projects.length+' أعمال</span>':"")+'</div>');
const works=projects.length?'<section class="works-grid">'+projects.map((project,index)=>projectCard(project,index)).join("")+'</section>':'<div class="empty"><strong>لا توجد أعمال منشورة بعد</strong>هذا المعرض لا يحتوي على أعمال متاحة للعرض حاليًا.</div>';
const profileFirst=display.sectionOrder!=="works-first";
view.innerHTML=profileFirst?hero+sectionHead+works:sectionHead+works+hero;
}
async function load(){
if(!slug){$("loadStatus").textContent="رابط المعرض غير مكتمل. افتح الرابط الذي شاركه صاحب العمل.";return}
try{const r=await fetch("/api/account?action=public-portfolio&id="+encodeURIComponent(slug),{credentials:"same-origin",cache:"no-store"});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||"تعذّر تحميل المعرض.");render(data);document.title=(data.portfolio?.profile?.name||data.authorName||data.username)+" | معرض أعمال مَدى"}catch(error){$("loadStatus").textContent=error.message||"تعذّر تحميل المعرض.";const link=document.createElement("a");link.href="/";link.textContent="العودة إلى مَدى";link.style.color="var(--purple)";link.style.fontWeight="700";$("loadStatus").append(" ");$("loadStatus").appendChild(link)}}
let publicImageList=[],publicImageIndex=0;
function showPublicImage(index){
 if(!publicImageList.length)return;
 publicImageIndex=(index+publicImageList.length)%publicImageList.length;
 const host=$("publicMediaContent"),heading=$("publicMediaTitle"),original=$("publicMediaOriginal"),src=publicImageList[publicImageIndex];
 if(!host||!src)return;
 heading.textContent="صورة "+(publicImageIndex+1)+" من "+publicImageList.length;
 host.innerHTML='<div class="public-image-viewer"><button type="button" class="public-image-nav public-image-prev" aria-label="الصورة السابقة" '+(publicImageList.length<2?'hidden':'')+'>‹</button><img class="public-media-image" src="'+esc(src)+'" alt="صورة العمل '+(publicImageIndex+1)+'"><button type="button" class="public-image-nav public-image-next" aria-label="الصورة التالية" '+(publicImageList.length<2?'hidden':'')+'>›</button></div>'+(publicImageList.length>1?'<div class="public-image-counter">'+(publicImageIndex+1)+' / '+publicImageList.length+'</div>':'');
 if(original)original.hidden=true;
 const prev=host.querySelector(".public-image-prev"),next=host.querySelector(".public-image-next");
 if(prev)prev.onclick=()=>showPublicImage(publicImageIndex-1);
 if(next)next.onclick=()=>showPublicImage(publicImageIndex+1);
}
function openDialog(id){const el=$(id);if(el)el.classList.add("open")}
function closeDialog(id){const el=$(id);if(el)el.classList.remove("open")}

document.addEventListener("click",function(e){
 const close=e.target.closest("[data-modal-close]");
 if(close){closeDialog(close.dataset.modalClose);return}
 const tile=e.target.closest("[data-project-index]");if(tile){const projects=Array.isArray(portfolioData?.portfolio?.projects)?portfolioData.portfolio.projects:[];const project=projects[Number(tile.dataset.projectIndex)];if(project){ensureProjectDialog();$("projectDetailsTitle").textContent=project.title||"تفاصيل العمل";$("projectDetailsContent").innerHTML=projectDetailsMarkup(project);openDialog("projectDetailsModal");}return}
 const copyOriginal=e.target.closest("#publicMediaOriginal");if(copyOriginal){const value=copyOriginal.dataset.url||"";if(value&&navigator.clipboard)navigator.clipboard.writeText(value).catch(()=>window.prompt("انسخ رابط المصدر",value));else if(value)window.prompt("انسخ رابط المصدر",value);return}
 const anchor=e.target.closest("#portfolioView a[target='_blank'], #projectDetailsContent a[target='_blank']");
 if(!anchor)return;
 // Keep normal links and downloads native: YouTube/Vimeo open directly, and download links download the file.
 // Only image thumbnails should open the in-page image viewer.
 if(!anchor.querySelector("img") || anchor.hasAttribute("download"))return;
 e.preventDefault();
 const raw=anchor.href;const isImage=!!anchor.querySelector("img");const safe=safeUrl(raw,isImage);if(!safe)return;
 const host=$("publicMediaContent"),heading=$("publicMediaTitle"),original=$("publicMediaOriginal");
 heading.textContent=anchor.querySelector("img")?"معاينة صورة العمل":"معاينة العمل";
 original.dataset.url=safe;original.textContent="نسخ رابط المصدر";original.hidden=false;
 const u=new URL(safe,location.href),h=u.hostname.toLowerCase();
 if(anchor.querySelector("img")){const gallery=anchor.closest(".media-gallery");publicImageList=gallery?Array.from(gallery.querySelectorAll("a img")).map(img=>safeUrl(img.currentSrc||img.src,true)).filter(Boolean):[safe];publicImageIndex=Math.max(0,publicImageList.indexOf(safe));if(!publicImageList.length)publicImageList=[safe];showPublicImage(publicImageIndex);original.hidden=true}
 else if(h==="youtu.be"||h.endsWith("youtube.com")){
  const id=h==="youtu.be"?u.pathname.slice(1):(u.searchParams.get("v")||u.pathname.split("/").filter(Boolean).pop());
  if(id&&/^[A-Za-z0-9_-]{6,20}$/.test(id)){host.innerHTML='<iframe class="public-media-frame" title="فيديو العمل" src="https://www.youtube-nocookie.com/embed/'+esc(id)+'" allowfullscreen loading="lazy"></iframe>';original.hidden=true}
  else host.innerHTML='<iframe class="public-media-frame" title="معاينة العمل" src="'+esc(safe)+'" loading="lazy"></iframe>';
 }else if(h.endsWith("vimeo.com")){
  const id=u.pathname.split("/").filter(Boolean).pop();
  if(/^\d+$/.test(id||"")){host.innerHTML='<iframe class="public-media-frame" title="فيديو العمل" src="https://player.vimeo.com/video/'+esc(id)+'" allowfullscreen loading="lazy"></iframe>';original.hidden=true}
  else host.innerHTML='<iframe class="public-media-frame" title="معاينة العمل" src="'+esc(safe)+'" loading="lazy"></iframe>';
 }else if(/\.(mp4|webm|ogg)(?:$|[?#])/i.test(u.pathname+u.search)){host.innerHTML='<video class="public-media-video" controls playsinline preload="metadata" src="'+esc(safe)+'"></video>';original.hidden=true}
 else host.innerHTML='<iframe class="public-media-frame" title="معاينة العمل" src="'+esc(safe)+'" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>';
 openDialog("publicMediaModal");
});
["publicMediaModal"].forEach(id=>$(id).addEventListener("click",e=>{if(e.target.id===id)closeDialog(id)}));
document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeDialog("projectDetailsModal");closeDialog("publicMediaModal")}else if($("publicMediaModal")?.classList.contains("open")&&publicImageList.length>1){if(e.key==="ArrowLeft")showPublicImage(publicImageIndex+1);else if(e.key==="ArrowRight")showPublicImage(publicImageIndex-1)}});

if(location.hash==="#preview"){
  document.documentElement.classList.add("is-preview");
  window.addEventListener("message",function(e){
    if(e.origin!==location.origin||!e.data||e.data.type!=="mada-portfolio-preview")return;
    try{render({portfolio:e.data.portfolio||{},username:e.data.username||"",authorName:e.data.authorName||""})}catch(err){console.warn("preview render failed",err)}
  });
  try{window.parent.postMessage({type:"mada-preview-ready"},location.origin)}catch(e){}
}else load();

})();