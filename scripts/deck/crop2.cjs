const sharp=require("sharp");
const I="img/";
const jobs=[
 ["E22-01-chooser-pickup-app.png","s-choose.png",{left:0,top:0,width:1707,height:700}],
 // s-prepare: 2026-11-13 부터 E33-01(공조 전원 · 핸들 열선을 모름으로 표시한 출품본) — E22-02 는 시연 기본값을 현재값처럼 보였다
 ["E33-01-unknown-not-same-app.png","s-prepare.png",{left:0,top:0,width:1010,height:1150}],
 ["E22-03-seat-heat-applied-vehicle-app.png","s-applied.png",{left:0,top:0,width:1010,height:1000}],
 ["E22-08-waiting-next-leg-suggestion-app.png","s-wait.png",{left:0,top:0,width:1010,height:1210}],
 ["E23-05-app-verified-after-destination-reread-app.png","s-route.png",{left:0,top:0,width:1010,height:1000}],
 ["E24-08-slots-full-asks-which-app.png","s-ev.png",{left:0,top:0,width:1010,height:1210}],
 ["E24-06-navi-waypoint-added-real-app.png","s-navi.png",{left:0,top:0,width:1707,height:1210}],
];
(async()=>{for(const [a,b,r] of jobs){const m=await sharp(I+a).extract(r).toFile(I+b);console.log(b,m.width,m.height)}})();
