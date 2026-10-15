(function(){
"use strict";
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const slug=(params.get("id")||"").trim();
const isPreview=params.get("preview")==="1";
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
function publicDownloadItems(p){
 const title=String(p.title||"work").replace(/[^a-zA-Z0-9._-]+/g,"-").slice(0,60)||"work",items=[];
 function add(key,label,name,url,type){if(url)items.push({key,label,name,url,type:type||"file"})}
 add("cover","صورة الغلاف","cover-"+title+".jpg",safeUrl(p.cover,true),"image");
 (Array.isArray(p.uploadedImages)?p.uploadedImages:[]).forEach((url,i)=>add("uploaded-image-"+i,"الصورة المرفوعة "+(i+1),"image-"+(i+1)+"-"+title+".jpg",safeUrl(url,true),"image"));
 (Array.isArray(p.mediaImages)?p.mediaImages:[]).forEach((url,i)=>add("linked-image-"+i,"صورة برابط "+(i+1),"image-link-"+(i+1)+"-"+title+".jpg",safeUrl(url,true),"image"));
 add("file","الملف المرفق","file-"+title,p.uploadedFile||safeUrl(p.fileUrl,false),"file");
 add("video","الفيديو","video-"+title+".mp4",p.uploadedVideo||safeUrl(p.videoUrl,false),"video");
 const link=safeUrl(p.link,false);if(link)add("link","رابط المشروع","project-link-"+title+".url","data:text/plain;charset=utf-8,"+encodeURIComponent("[InternetShortcut]\r\nURL="+link),"link");
 const allowed=Array.isArray(p.downloadableItems)?new Set(p.downloadableItems):null;
 return items.filter(it=>!allowed||allowed.has(it.key));
}
function publicCrc32(bytes){let crc=0xffffffff;for(let i=0;i<bytes.length;i++){crc^=bytes[i];for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}return (crc^0xffffffff)>>>0}
async function publicDownloadBytes(item){const url=String(item.url||"");if(url.startsWith("data:")){const i=url.indexOf(",");if(i<0)throw Error("bad data URL");const meta=url.slice(0,i),payload=url.slice(i+1);if(/;base64/i.test(meta)){const raw=atob(payload),bytes=new Uint8Array(raw.length);for(let n=0;n<raw.length;n++)bytes[n]=raw.charCodeAt(n);return bytes}return new TextEncoder().encode(decodeURIComponent(payload))}const r=await fetch(url,{mode:"cors",credentials:"omit"});if(!r.ok)throw Error("download failed");return new Uint8Array(await r.arrayBuffer())}
function publicMakeZip(files){const enc=new TextEncoder(),parts=[],central=[];let offset=0;const now=new Date(),time=(now.getHours()<<11)|(now.getMinutes()<<5)|Math.floor(now.getSeconds()/2),date=((Math.max(1980,now.getFullYear())-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate(),u16=v=>[v&255,(v>>>8)&255],u32=v=>[v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255],join=arr=>{const out=new Uint8Array(arr.reduce((n,x)=>n+x.length,0));let at=0;arr.forEach(x=>{out.set(x,at);at+=x.length});return out};files.forEach(f=>{const name=enc.encode(f.name),data=f.bytes,crc=publicCrc32(data),local=new Uint8Array([...u32(0x04034b50),...u16(20),...u16(0x0800),...u16(0),...u16(time),...u16(date),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0)]);parts.push(local,name,data);const head=new Uint8Array([...u32(0x02014b50),...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(time),...u16(date),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset)]);central.push(head,name);offset+=local.length+name.length+data.length});const cd=join(central),end=new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(cd.length),...u32(offset),...u16(0)]);return new Blob([...parts,cd,end],{type:"application/zip"})}
async function downloadPublicProjectFiles(p){const items=publicDownloadItems(p);if(!items.length){alert("لم يحدد صاحب العمل أي عناصر متاحة للتنزيل.");return}if(items.length===1){const it=items[0];try{const bytes=await publicDownloadBytes(it),mime=it.type==="image"?"image/jpeg":it.type==="video"?"video/mp4":"application/octet-stream",url=URL.createObjectURL(new Blob([bytes],{type:mime})),a=document.createElement("a");a.href=url;a.download=it.name;a.rel="noopener noreferrer";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);return}catch(error){console.warn("Single public download fallback:",error);const a=document.createElement("a");a.href=it.url;a.download=it.name;a.rel="noopener noreferrer";a.target="_blank";document.body.appendChild(a);a.click();a.remove();return}}try{const files=[];let shortcutCount=0;for(const item of items){try{files.push({name:item.name,bytes:await publicDownloadBytes(item)})}catch(fetchError){if(!/^https?:/i.test(String(item.url||"")))throw fetchError;shortcutCount++;files.push({name:item.name.replace(/\.[^.]+$/,"")+".url",bytes:new TextEncoder().encode("[InternetShortcut]\r\nURL="+item.url)})}}const blob=publicMakeZip(files),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=(String(p.title||"mada-work").replace(/[^a-zA-Z0-9._-]+/g,"-").slice(0,60)||"mada-work")+".zip";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);if(shortcutCount)console.info("Some external items were included as URL shortcuts:",shortcutCount)}catch(error){console.warn("Mada public download:",error);alert("بعض الروابط الخارجية تمنع جمع الملفات في ZIP. سيتم فتحها كرابط مستقل.");items.forEach((it,i)=>setTimeout(()=>{const a=document.createElement("a");a.href=it.url;a.download=it.name;a.target="_blank";a.rel="noopener noreferrer";document.body.appendChild(a);a.click();a.remove()},i*350))}}
function projectDetailsMarkup(p){
const display=portfolioData&&portfolioData.portfolio&&portfolioData.portfolio.display||{};
const cover=safeUrl(p.cover,true)||(Array.isArray(p.mediaImages)&&safeUrl(p.mediaImages[0],true))||(Array.isArray(p.uploadedImages)&&safeUrl(p.uploadedImages[0],true))||"";
const images=Array.from(new Set((Array.isArray(p.mediaImages)?p.mediaImages:[]).concat(Array.isArray(p.uploadedImages)?p.uploadedImages:[]).map(v=>safeUrl(v,true)).filter(Boolean))).slice(0,12);
const link=safeUrl(p.link,false),video=safeUrl(p.uploadedVideo||p.videoUrl,false),file=safeUrl(p.uploadedFile||p.fileUrl,false),downloadItems=p.showFileDownload===true?publicDownloadItems(p):[],templateUrl=p.allowTemplateUse===true?safeUrl(p.templateUrl,false):"";
const workType=({general:"مشروع عام أو متكامل",software:"مشروع برمجي",website:"موقع إلكتروني",app:"تطبيق هاتف أو حاسوب",design:"تصميم جرافيكي أو هوية بصرية",video:"فيديو أو إنتاج مرئي",media:"مشروع إعلامي أو صناعة محتوى",journalism:"تقرير أو عمل صحفي",photography:"تصوير فوتوغرافي",writing:"كتابة أو تأليف",book:"كتاب أو كتيّب",research:"بحث أو دراسة",education:"محتوى تعليمي أو تدريب",business:"مشروع تجاري أو ريادي",engineering:"مشروع هندسي أو صناعي",community:"مبادرة أو نشاط مجتمعي",event:"فعالية أو تنظيم",document:"ملف أو مستند",gallery:"معرض صور أو أعمال فنية"})[p.workType]||"";const category=({design:"تصميم وفنون",tech:"برمجة وتقنية",media:"إعلام وإنتاج محتوى",writing:"كتابة وتأليف",study:"دراسة وبحث",education:"تعليم وتدريب",business:"أعمال وريادة",engineering:"هندسة وصناعة",science:"علوم وتجارب",community:"مبادرات ومجتمع",event:"فعاليات وتنظيم",personal:"مشروع شخصي",other:"أخرى"})[p.category]||"عمل شخصي";
const status=({done:"مكتمل",progress:"قيد العمل",idea:"فكرة"})[p.status]||"عمل";
const facts=[["نوع العمل",display.showWorkType===false?"":workType],["التصنيف",display.showWorkCategory===false?"":category],["الحالة",display.showWorkStatus===false?"":status],["دوري في العمل",display.showWorkRole===false?"":p.role],["الأدوات",display.showWorkTools===false?"":p.tools],["المهارات",display.showWorkTags===false?"":p.tags]].filter(x=>String(x[1]||"").trim());
return '<div class="project-detail">'+(cover?'<img class="project-detail-cover" src="'+esc(cover)+'" alt="صورة '+esc(p.title||"العمل")+'">':'<div class="project-detail-placeholder" aria-label="لا توجد صورة لهذا العمل"><span>✳</span><strong>لا توجد صورة مرفقة</strong><small>تفاصيل العمل متاحة أدناه</small></div>')+
'<div class="project-detail-heading"><span class="kicker">تفاصيل العمل</span><h2>'+esc(p.title||"عمل بدون عنوان")+'</h2>'+(p.featured?'<span class="tag">✦ عمل مميز</span>':"")+'</div>'+
(display.showWorkDescription!==false&&p.description?'<section class="project-detail-section"><h3>نبذة عن العمل</h3><p class="project-detail-description">'+esc(p.description)+'</p></section>':"")+
(facts.length?'<div class="facts">'+facts.map(x=>'<div class="fact"><strong>'+esc(x[0])+'</strong><span>'+esc(x[1])+'</span></div>').join("")+'</div>':"")+
(display.showWorkOutcome!==false&&p.outcome?'<section class="work-outcome"><strong>النتيجة أو ما تعلّمته</strong>'+esc(p.outcome)+'</section>':"")+
(images.length?'<section class="project-detail-media"><h3>صور إضافية</h3><div class="media-gallery">'+images.map(src=>'<a href="'+esc(src)+'" target="_blank" rel="noopener noreferrer" aria-label="عرض صورة إضافية"><img loading="lazy" src="'+esc(src)+'" alt="صورة إضافية للعمل"></a>').join("")+'</div></section>':"")+
(link?'<section class="project-detail-section project-detail-links"><h3>رابط العمل</h3><a class="btn" href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">فتح رابط العمل ↗</a></section>':"")+
(video?'<section class="project-detail-media"><h3>الفيديو</h3>'+getVideoMarkup(video)+'</section>':"")+
(downloadItems.length?'<section class="project-detail-section"><h3>الملفات المتاحة للتنزيل</h3><p class="project-detail-description">اختار صاحب العمل العناصر المسموح بتنزيلها. عند وجود عدة عناصر ستُنزل في ملف ZIP واحد.</p><button type="button" class="btn" data-download-public-project="'+esc(p.id)+'">تنزيل الملفات المتاحة ('+downloadItems.length+')</button></section>':"")+(templateUrl?'<section class="project-detail-section"><h3>قالب قابل للاستعمال</h3><p class="project-detail-description">يمكنك إنشاء نسخة مستقلة من هذا التصميم وتعديلها دون تغيير الأصل.</p><a class="public-project-link" href="'+esc(templateUrl)+'" rel="noopener noreferrer">استعمال القالب ↗</a></section>':"")+
'</div>';
}
function ensureProjectDialog(){
if($("projectDetailsModal"))return;
const modal=document.createElement("div");modal.className="modal-backdrop project-details-backdrop";modal.id="projectDetailsModal";
modal.setAttribute("role","dialog");modal.setAttribute("aria-modal","true");modal.setAttribute("aria-labelledby","projectDetailsTitle");
modal.innerHTML='<section class="dialog-card project-details-dialog"><div class="dialog-head"><div><small>مَدى · معرض الأعمال</small><h2 id="projectDetailsTitle">تفاصيل العمل</h2></div><button class="dialog-close" type="button" data-modal-close="projectDetailsModal" aria-label="إغلاق">×</button></div><div id="projectDetailsContent"></div><div class="dialog-actions"><button class="btn" type="button" data-modal-close="projectDetailsModal">إغلاق التفاصيل</button></div></section>';
document.body.appendChild(modal);modal.addEventListener("click",e=>{if(e.target===modal)closeDialog("projectDetailsModal")});
}
/* Custom work sections only appear when the owner assigns at least one section. */
function render(data){
portfolioData=data;
const p=data.portfolio||{},profile=p.profile||{},display=p.display||{},projects=(Array.isArray(p.projects)?p.projects:[]).filter(function(x){const id=String(x.gallerySection||"general"),sections=Array.isArray(display.gallerySections)?display.gallerySections:[];const section=sections.find(function(item){return String(item.id)===id});return (id==="general"||!section||section.visible!==false)&&(!display.featuredOnly||x.featured)});
ensureProjectDialog();
$("loadStatus").hidden=true;
const safeHex=(value,fallback)=>/^#[0-9a-f]{6}$/i.test(String(value||""))?String(value):fallback;
const accent=safeHex(display.accent,"#5b46e6"),background=safeHex(display.background,"#f6f4ff");
const template=["classic","mosaic","split","magazine","timeline","sidebar"].includes(display.template)?display.template:"classic";
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
view.style.setProperty("--gallery-name-size",Math.max(22,Math.min(64,Number(display.profileNameSize)||38))+"px");
view.style.setProperty("--gallery-profile-name-size",Math.max(20,Math.min(64,Number(display.profileNameSize)||38))+"px");
view.style.setProperty("--gallery-body-size",Math.max(12,Math.min(24,Number(display.bodySize)||16))+"px");
view.style.setProperty("--gallery-profile-body-size",Math.max(11,Math.min(24,Number(display.profileBodySize)||16))+"px");
view.style.setProperty("--gallery-title-size",Math.max(18,Math.min(48,Number(display.sectionTitleSize)||30))+"px");
view.style.setProperty("--gallery-profile-name-color",safeHex(display.profileNameColor,"#ffffff"));
view.style.setProperty("--gallery-profile-kicker-color",safeHex(display.profileKickerColor,"#a79bff"));
view.style.setProperty("--gallery-profile-font",({system:"system-ui,Arial,sans-serif",cairo:"Cairo,Arial,sans-serif",tajawal:"Tajawal,Arial,sans-serif",almarai:"Almarai,Arial,sans-serif",amiri:"Amiri,Georgia,serif",reemkufi:"\'Reem Kufi\',Cairo,sans-serif",elmessiri:"\'El Messiri\',Cairo,sans-serif",serif:"Georgia,\'Times New Roman\',serif",mono:"ui-monospace,SFMono-Regular,monospace"})[display.profileFontFamily]||"Tajawal,Arial,sans-serif");
view.style.setProperty("--gallery-profile-role-color",safeHex(display.profileRoleColor,"#d4d0e5"));
view.style.setProperty("--gallery-profile-bio-color",safeHex(display.profileBioColor,"#c8c4db"));
view.style.setProperty("--gallery-profile-meta-color",safeHex(display.profileMetaColor,"#eeebfa"));
view.style.setProperty("--gallery-profile-avatar-size",Math.max(56,Math.min(200,Number(display.profileAvatarSize)||112))+"px");
view.style.setProperty("--gallery-profile-radius",Math.max(0,Math.min(48,Number.isFinite(Number(display.profileCardRadius))?Number(display.profileCardRadius):28))+"px");
view.style.setProperty("--gallery-profile-padding",Math.max(12,Math.min(64,Number(display.profileCardPadding)||36))+"px");
view.style.setProperty("--gallery-profile-gap",Math.max(0,Math.min(56,Number.isFinite(Number(display.profileCardGap))?Number(display.profileCardGap):25))+"px");
view.style.setProperty("--gallery-profile-border-color",safeHex(display.profileCardBorderColor,"#ffffff"));
view.style.setProperty("--gallery-profile-border-width",Math.max(0,Math.min(6,Number(display.profileCardBorderWidth)||0))+"px");
view.style.setProperty("--gallery-profile-name-weight",["600","700","800","900"].includes(String(display.profileNameWeight))?String(display.profileNameWeight):"700");
view.style.setProperty("--gallery-profile-align",["right","center","left"].includes(display.profileTextAlign)?display.profileTextAlign:"right");
view.dataset.profileCardShadow=["none","soft","strong"].includes(display.profileCardShadow)?display.profileCardShadow:"soft";
view.dataset.profileDecoration=display.profileShowDecoration===false?"off":"on";
view.dataset.profileKicker=display.profileShowKicker===false?"off":"on";
view.style.setProperty("--gallery-font",({system:"Tajawal,Arial,sans-serif",cairo:"Cairo,Arial,sans-serif",tajawal:"Tajawal,Arial,sans-serif",almarai:"Almarai,Arial,sans-serif",amiri:"Amiri,Georgia,serif",reemkufi:"'Reem Kufi',Cairo,sans-serif",elmessiri:"'El Messiri',Cairo,sans-serif",serif:"Georgia,'Times New Roman',serif",mono:"ui-monospace,SFMono-Regular,monospace"})[display.fontFamily]||"Tajawal,Arial,sans-serif");
view.style.setProperty("--gallery-card-bg",safeHex(display.cardBackground,"#ffffff"));
view.style.setProperty("--gallery-contact-button-bg",safeHex(display.contactButtonColor,accent));
view.style.setProperty("--gallery-contact-button-text",safeHex(display.contactButtonTextColor,"#ffffff"));
view.dataset.contactButtonSize=["compact","normal","large"].includes(display.contactButtonSize)?display.contactButtonSize:"normal";
view.dataset.contactButtonPosition=["right","center","left"].includes(display.contactButtonPosition)?display.contactButtonPosition:"right";
if(display.cardRadius!==undefined&&display.cardRadius!==""&&Number.isFinite(Number(display.cardRadius)))view.style.setProperty("--gallery-card-radius",Math.max(0,Math.min(32,Number(display.cardRadius)))+"px");else view.style.removeProperty("--gallery-card-radius");
view.dataset.density=["compact","comfortable","spacious"].includes(display.density)?display.density:"comfortable";
view.dataset.imageRatio=["landscape","classic","square"].includes(display.cardImageRatio)?display.cardImageRatio:"landscape";view.dataset.hover=display.cardHover===false?"off":"on";
view.dataset.contentWidth=["narrow","standard","wide"].includes(display.contentWidth)?display.contentWidth:"wide";view.dataset.cardShadow=["none","soft","strong"].includes(display.cardShadow)?display.cardShadow:"soft";view.dataset.borderStyle=["none","subtle","contrast"].includes(display.borderStyle)?display.borderStyle:"subtle";view.dataset.avatarShape=["circle","rounded","square"].includes(display.avatarShape)?display.avatarShape:"rounded";view.dataset.heroAlign=["right","center","left"].includes(display.heroAlign)?display.heroAlign:"right";view.style.setProperty("--gallery-section-spacing",Math.max(16,Math.min(80,Number(display.sectionSpacing)||32))+"px");
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
const contactOrder=Array.isArray(display.contactOrder)?display.contactOrder:["phone","whatsapp","email"];
const normalizeWhatsAppNumber=function(value){
 let digits=String(value||"").replace(/\D/g,"");
 if(digits.startsWith("00"))digits=digits.slice(2);
 // Accept common Algerian local formats as well as full international numbers.
 if(digits.startsWith("0")&&digits.length===10)digits="213"+digits.slice(1);
 else if(/^[567]\d{8}$/.test(digits))digits="213"+digits;
 return digits;
};
const contactLinks={
 phone:display.showContactPhone===true&&String(display.contactPhone||"").trim()?'<a class="contact-action contact-phone" href="tel:'+esc(String(display.contactPhone).trim().replace(/[^+0-9().\-\s]/g,"").replace(/\s+/g,""))+'">☎ <span>اتصال هاتفي</span></a>':"",
 whatsapp:(function(){const number=normalizeWhatsAppNumber(display.contactWhatsapp);return display.showContactWhatsapp===true&&number.length>=8&&number.length<=15?'<a class="contact-action contact-whatsapp" href="https://wa.me/'+number+'?text='+encodeURIComponent("مرحبًا، تواصلت معك عبر معرض أعمالك على مَدى.")+'" target="_blank" rel="noopener noreferrer" aria-label="فتح محادثة واتساب مباشرة مع '+esc(name)+'" title="فتح محادثة واتساب مباشرة">◉ <span>راسلني على واتساب</span></a>':""})(),
 email:display.showContactEmail===true&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(display.contactEmail||"").trim())?'<a class="contact-action contact-email" href="mailto:'+esc(String(display.contactEmail).trim())+'">✉ <span>البريد الإلكتروني</span></a>':""
};
const contactHtml=contactOrder.filter((key,index,array)=>["phone","whatsapp","email"].includes(key)&&array.indexOf(key)===index).map(key=>contactLinks[key]).filter(Boolean).join("");
const contactSection=contactHtml?'<nav class="gallery-contact-actions" aria-label="طرق التواصل">'+contactHtml+'</nav>':"";
const bioHtml=display.showBio!==false&&profile.bio?'<p class="bio">'+esc(profile.bio)+'</p>':"";
const bioPreview=display.showBio!==false&&profile.bio?'<p class="bio bio-preview">'+esc(profile.bio)+'</p>':"";
const compactMeta='<div class="profile-meta">'+(display.showCity!==false&&profile.city?'<span class="meta-chip">⌖ '+esc(profile.city)+'</span>':"")+(display.showWorkCount!==false?'<span class="meta-chip">'+projects.length+' أعمال معروضة</span>':"")+'</div>';
const extraMeta=(display.showEducation!==false&&profile.education?'<span class="meta-chip">▤ '+esc(profile.education)+'</span>':"")+(display.showExperience===true&&profile.experience?'<span class="meta-chip">✦ '+esc(profile.experience)+'</span>':"")+(display.showGoal===true&&profile.goal?'<span class="meta-chip">◎ '+esc(profile.goal)+'</span>':"")+(display.showProfileLink===true&&safeUrl(profile.link,false)?'<a class="meta-chip" href="'+esc(safeUrl(profile.link,false))+'" target="_blank" rel="noopener noreferrer">رابط الملف ↗</a>':"");
const extraInterests=display.showInterests===true&&profile.interests?'<p class="bio">الاهتمامات: '+esc(profile.interests)+'</p>':"";
const extraSkills=skills.length?'<div class="skills">'+skills.map(x=>'<span class="skill">'+esc(x)+'</span>').join("")+'</div>':"";
const extraContent=bioHtml+(extraMeta?'<div class="profile-meta">'+extraMeta+'</div>':"")+extraInterests+extraSkills;
const extraDetails=extraContent?'<details class="profile-extra"><summary>عرض النبذة والمهارات والتفاصيل</summary><div class="profile-extra-content">'+extraContent+'</div></details>':"";
const hero='<header class="profile-hero"><div class="profile-copy"><span class="kicker">'+esc(display.brandText||"معرض أعمال شخصي · مَدى")+'</span><h1>'+esc(name)+'</h1>'+
(display.showRole!==false&&profile.role?'<p class="role">'+esc(profile.role)+'</p>':"")+
bioPreview+compactMeta+contactSection+extraDetails+'</div>'+(avatar?'<div class="profile-avatar"><img src="'+esc(avatar)+'" alt="الصورة الشخصية"></div>':"")+'</header>';
const title=String(display.title||"الأعمال المختارة").trim();
const subtitle=String(display.subtitle||"أعمال وتجارب وروابط شاركها صاحب المعرض.").trim();
const sectionHead=(display.showSectionTitle===false?"":'<div class="section-head"><div><h2>'+esc(title||"الأعمال المختارة")+'</h2>'+(subtitle?'<p>'+esc(subtitle)+'</p>':"")+'</div>'+(display.showWorkCount!==false?'<span class="count">'+projects.length+' أعمال</span>':"")+'</div>');
const sectionDefs=Array.isArray(display.gallerySections)?display.gallerySections:[];
const visibleSections=sectionDefs.filter(function(section){return section.visible!==false});
const sectionById=new Map(visibleSections.map(function(section){return [String(section.id),section]}));
const generalSection=sectionById.get("general")||{id:"general",name:"أعمال عامة",description:"أعمال لم تُسند إلى قسم محدد",visible:true,locked:true};
const groupedProjects=projects.filter(function(project){const id=String(project.gallerySection||"general");return id==="general"||sectionById.has(id)});
const works=groupedProjects.length?(function(){
 const groups=new Map();
 visibleSections.forEach(function(section){groups.set(String(section.id),{section:section,projects:[]})});
 if(!groups.has("general"))groups.set("general",{section:generalSection,projects:[]});
 groupedProjects.forEach(function(project){const id=String(project.gallerySection||"general"),key=groups.has(id)?id:"general";groups.get(key).projects.push(project)});
 return Array.from(groups.values()).filter(function(group){return group.projects.length>0}).map(function(group){const section=group.section;return '<section class="gallery-work-group" data-gallery-section="'+esc(section.id)+'"><div class="section-head gallery-group-heading"><div><h2>'+esc(section.name)+'</h2>'+(section.description?'<p>'+esc(section.description)+'</p>':"")+'</div><span class="count">'+group.projects.length+' أعمال</span></div><div class="works-grid">'+group.projects.map(function(project){return projectCard(project,projects.indexOf(project))}).join("")+'</div></section>'}).join("");
})():'<div class="empty"><strong>لا توجد أعمال منشورة بعد</strong>هذا المعرض لا يحتوي على أعمال متاحة للعرض حاليًا.</div>';
const profileFirst=display.sectionOrder!=="works-first";
view.innerHTML=profileFirst?hero+sectionHead+works:sectionHead+works+hero;
}
async function load(){
if(isPreview){$("loadStatus").textContent="جارٍ تجهيز المعاينة المباشرة…";return}
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
 const downloadBtn=e.target.closest("[data-download-public-project]");if(downloadBtn){const projects=Array.isArray(portfolioData?.portfolio?.projects)?portfolioData.portfolio.projects:[];const project=projects.find(p=>String(p.id)===String(downloadBtn.dataset.downloadPublicProject));if(project)downloadPublicProjectFiles(project);return}
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

window.addEventListener("message",function(event){
 if(!isPreview||event.source!==window.parent||event.origin!==window.location.origin)return;
 const message=event.data;
 if(!message||message.type!=="mada-portfolio-preview"||!message.payload||typeof message.payload!=="object")return;
 try{
  render(message.payload);
  document.title=(message.payload.portfolio&&message.payload.portfolio.profile&&message.payload.portfolio.profile.name||"معاينة معرض الأعمال")+" | معاينة مَدى";
  const status=$("loadStatus");if(status)status.hidden=true;
 }catch(error){const status=$("loadStatus");if(status){status.hidden=false;status.textContent="تعذّر عرض المعاينة. تحقق من بيانات المعرض."}console.error("Mada live portfolio preview failed:",error)}
});
load();
})();