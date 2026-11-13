const sharp=require("sharp"),path=require("path");
const src="<local>/portfolio/comma-drive/docs/my-copilot/captures/emulator/";
const list=process.argv.slice(2);
(async()=>{
 const tiles=[];
 for(const f of list){
  const out=path.join("img",f.replace(".png","-app.png"));
  await sharp(src+f).extract({left:853,top:90,width:1707,height:1210}).toFile(out);
  tiles.push(await sharp(out).resize(560).png().toBuffer());
 }
 const W=560,H=Math.round(1210*560/1707),cols=3,rows=Math.ceil(tiles.length/cols);
 await sharp({create:{width:W*cols,height:H*rows,channels:3,background:"#fff"}}).composite(tiles.map((t,i)=>({input:t,left:(i%cols)*W,top:Math.floor(i/cols)*H}))).jpeg().toFile("img/_sheet.jpg");
 console.log("ok",tiles.length);
})();
