module.exports=function handler(req,res){
 if(req.method!=="GET"){res.setHeader("Allow","GET");res.statusCode=405;return res.end("Method Not Allowed");}
 const host=String(req.headers["x-forwarded-host"]||req.headers.host||"dama-20.vercel.app").split(",")[0].trim();
 const origin=(host.startsWith("localhost")?"http://":"https://")+host;
 const body=["User-agent: *","Allow: /","Disallow: /api/","Disallow: /mada-ops-7f3c9a","Sitemap: "+origin+"/sitemap.xml",""].join("\n");
 res.statusCode=200;res.setHeader("Content-Type","text/plain; charset=utf-8");res.setHeader("Cache-Control","public, max-age=3600, s-maxage=3600");return res.end(body);
};