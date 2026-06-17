import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import southKorea from "@svg-maps/south-korea";
import PalletSimulator from "./PalletSimulator";
import StandardFare from "./StandardFare";
import { db } from "./firebase";
import { collection, onSnapshot } from "firebase/firestore";

// ─── 한국 지도 SVG 경로 (실제 지리 데이터) ─────────────────────────────
// viewBox="0 0 524 631" — @svg-maps/south-korea 패키지 기준
const KO_TO_ID = {
  서울:"seoul", 인천:"incheon", 경기:"gyeonggi",
  강원:"gangwon", 충북:"north-chungcheong", 충남:"south-chungcheong",
  세종:"sejong", 대전:"daejeon", 경북:"north-gyeongsang",
  대구:"daegu", 전북:"north-jeolla", 광주:"gwangju",
  전남:"south-jeolla", 경남:"south-gyeongsang", 울산:"ulsan",
  부산:"busan", 제주:"jeju",
};
const _locMap = Object.fromEntries(southKorea.locations.map(l=>[l.id,l.path]));
const PROVINCE_PATHS = Object.fromEntries(
  Object.entries(KO_TO_ID).map(([ko,id])=>[ko,_locMap[id]||""])
);

const PROVINCE_LABEL_POS = {
  서울: [152, 127],
  인천: [100, 140],
  경기: [168, 178],
  강원: [326, 132],
  충북: [248, 218],
  충남: [142, 265],
  세종: [192, 260],
  대전: [200, 282],
  경북: [352, 272],
  대구: [300, 338],
  전북: [168, 352],
  광주: [148, 408],
  전남: [160, 470],
  경남: [290, 415],
  울산: [366, 372],
  부산: [348, 407],
  제주: [118, 611],
};

const PROVINCE_COLORS = {
  서울: "#a8c4dc", 인천: "#98b4d0", 경기: "#b4a0d8",
  강원: "#98bcd8", 충북: "#eeacc0", 충남: "#94b4e4",
  세종: "#a4d49c", 대전: "#94c88c", 경북: "#eec49c",
  대구: "#eca4a4", 전북: "#eee09e", 광주: "#9cd494",
  전남: "#c8e490", 경남: "#eebca8", 울산: "#8cb4d0",
  부산: "#84acc8", 제주: "#9cd4a0",
};

const PROVINCE_COORDS = {
  서울:[37.5665,126.978], 인천:[37.4563,126.705], 경기:[37.4138,127.518],
  강원:[37.822,128.155], 충북:[36.636,127.491], 충남:[36.659,126.673],
  세종:[36.480,127.289], 대전:[36.350,127.384], 경북:[36.492,128.889],
  대구:[35.871,128.601], 전북:[35.820,127.109], 광주:[35.160,126.853],
  전남:[34.868,126.991], 경남:[35.461,128.213], 울산:[35.538,129.311],
  부산:[35.180,129.076], 제주:[33.489,126.498],
};

// ─── 시군구 ────────────────────────────────────────────────────────────────
const CITIES = {
  서울:[
    {n:"강남구",la:37.517,lo:127.047},{n:"강동구",la:37.530,lo:127.124},{n:"강북구",la:37.639,lo:127.026},
    {n:"강서구",la:37.551,lo:126.850},{n:"관악구",la:37.478,lo:126.952},{n:"광진구",la:37.538,lo:127.082},
    {n:"구로구",la:37.495,lo:126.888},{n:"금천구",la:37.456,lo:126.896},{n:"노원구",la:37.654,lo:127.056},
    {n:"도봉구",la:37.669,lo:127.047},{n:"동대문구",la:37.574,lo:127.040},{n:"동작구",la:37.513,lo:126.940},
    {n:"마포구",la:37.566,lo:126.901},{n:"서대문구",la:37.579,lo:126.937},{n:"서초구",la:37.484,lo:127.032},
    {n:"성동구",la:37.563,lo:127.037},{n:"성북구",la:37.589,lo:127.017},{n:"송파구",la:37.514,lo:127.106},
    {n:"양천구",la:37.517,lo:126.867},{n:"영등포구",la:37.526,lo:126.896},{n:"용산구",la:37.532,lo:126.990},
    {n:"은평구",la:37.602,lo:126.929},{n:"종로구",la:37.573,lo:126.979},{n:"중구",la:37.564,lo:126.998},
    {n:"중랑구",la:37.606,lo:127.093},
  ],
  인천:[
    {n:"강화군",la:37.742,lo:126.487},{n:"계양구",la:37.537,lo:126.738},{n:"남동구",la:37.447,lo:126.731},
    {n:"동구",la:37.474,lo:126.643},{n:"미추홀구",la:37.454,lo:126.651},{n:"부평구",la:37.508,lo:126.723},
    {n:"서구",la:37.546,lo:126.676},{n:"연수구",la:37.410,lo:126.678},{n:"옹진군",la:37.468,lo:126.214},
    {n:"중구",la:37.473,lo:126.622},
  ],
  경기:[
    {n:"가평군",la:37.831,lo:127.510},{n:"고양시",la:37.658,lo:126.832},{n:"과천시",la:37.429,lo:126.987},
    {n:"광명시",la:37.479,lo:126.864},{n:"광주시",la:37.430,lo:127.255},{n:"구리시",la:37.596,lo:127.130},
    {n:"군포시",la:37.362,lo:126.935},{n:"김포시",la:37.615,lo:126.716},{n:"남양주시",la:37.636,lo:127.216},
    {n:"동두천시",la:37.904,lo:127.060},{n:"부천시",la:37.503,lo:126.766},{n:"성남시",la:37.420,lo:127.127},
    {n:"수원시",la:37.263,lo:127.029},{n:"시흥시",la:37.380,lo:126.803},{n:"안산시",la:37.322,lo:126.831},
    {n:"안성시",la:37.009,lo:127.280},{n:"안양시",la:37.394,lo:126.951},{n:"양주시",la:37.784,lo:127.046},
    {n:"양평군",la:37.491,lo:127.488},{n:"여주시",la:37.299,lo:127.637},{n:"연천군",la:38.096,lo:127.075},
    {n:"오산시",la:37.150,lo:127.077},{n:"용인시",la:37.241,lo:127.178},{n:"의왕시",la:37.344,lo:126.969},
    {n:"의정부시",la:37.738,lo:127.034},{n:"이천시",la:37.272,lo:127.443},{n:"파주시",la:37.760,lo:126.779},
    {n:"평택시",la:36.992,lo:127.113},{n:"포천시",la:37.895,lo:127.200},{n:"하남시",la:37.540,lo:127.215},
    {n:"화성시",la:37.200,lo:126.831},
  ],
  강원:[
    {n:"강릉시",la:37.751,lo:128.876},{n:"고성군",la:38.380,lo:128.468},{n:"동해시",la:37.525,lo:129.114},
    {n:"삼척시",la:37.450,lo:129.165},{n:"속초시",la:38.207,lo:128.592},{n:"양구군",la:38.106,lo:127.989},
    {n:"양양군",la:38.080,lo:128.619},{n:"영월군",la:37.184,lo:128.462},{n:"원주시",la:37.342,lo:127.920},
    {n:"인제군",la:38.069,lo:128.171},{n:"정선군",la:37.380,lo:128.660},{n:"철원군",la:38.146,lo:127.314},
    {n:"춘천시",la:37.882,lo:127.730},{n:"태백시",la:37.174,lo:128.986},{n:"평창군",la:37.370,lo:128.392},
    {n:"홍천군",la:37.697,lo:127.889},{n:"화천군",la:38.107,lo:127.708},{n:"횡성군",la:37.492,lo:127.985},
  ],
  충북:[
    {n:"괴산군",la:36.815,lo:127.787},{n:"단양군",la:36.985,lo:128.365},{n:"보은군",la:36.490,lo:127.729},
    {n:"영동군",la:36.175,lo:127.779},{n:"옥천군",la:36.306,lo:127.572},{n:"음성군",la:36.940,lo:127.690},
    {n:"제천시",la:37.133,lo:128.191},{n:"증평군",la:36.786,lo:127.583},{n:"진천군",la:36.856,lo:127.436},
    {n:"청주시",la:36.642,lo:127.490},{n:"충주시",la:36.991,lo:127.926},
  ],
  충남:[
    {n:"계룡시",la:36.275,lo:127.249},{n:"공주시",la:36.447,lo:127.119},{n:"금산군",la:36.109,lo:127.488},
    {n:"논산시",la:36.187,lo:127.099},{n:"당진시",la:36.890,lo:126.628},{n:"보령시",la:36.333,lo:126.613},
    {n:"부여군",la:36.275,lo:126.910},{n:"서산시",la:36.785,lo:126.450},{n:"서천군",la:36.079,lo:126.691},
    {n:"아산시",la:36.790,lo:127.002},{n:"예산군",la:36.680,lo:126.849},{n:"천안시",la:36.808,lo:127.114},
    {n:"청양군",la:36.459,lo:126.801},{n:"태안군",la:36.745,lo:126.298},{n:"홍성군",la:36.601,lo:126.661},
  ],
  세종:[{n:"세종시",la:36.480,lo:127.289}],
  대전:[
    {n:"대덕구",la:36.387,lo:127.415},{n:"동구",la:36.312,lo:127.455},{n:"서구",la:36.355,lo:127.384},
    {n:"유성구",la:36.362,lo:127.356},{n:"중구",la:36.325,lo:127.421},
  ],
  경북:[
    {n:"경산시",la:35.825,lo:128.741},{n:"경주시",la:35.856,lo:129.225},{n:"고령군",la:35.727,lo:128.263},
    {n:"구미시",la:36.119,lo:128.344},{n:"군위군",la:36.240,lo:128.570},{n:"김천시",la:36.140,lo:128.113},
    {n:"문경시",la:36.586,lo:128.186},{n:"봉화군",la:36.893,lo:128.732},{n:"상주시",la:36.410,lo:128.160},
    {n:"성주군",la:35.919,lo:128.283},{n:"안동시",la:36.568,lo:128.729},{n:"영덕군",la:36.415,lo:129.365},
    {n:"영양군",la:36.667,lo:129.113},{n:"영주시",la:36.806,lo:128.624},{n:"영천시",la:35.973,lo:128.938},
    {n:"예천군",la:36.658,lo:128.452},{n:"울릉군",la:37.481,lo:130.905},{n:"울진군",la:36.993,lo:129.400},
    {n:"의성군",la:36.352,lo:128.697},{n:"청도군",la:35.647,lo:128.737},{n:"청송군",la:36.436,lo:129.057},
    {n:"칠곡군",la:35.994,lo:128.401},{n:"포항시",la:36.019,lo:129.343},
  ],
  대구:[
    {n:"군위군",la:36.240,lo:128.570},{n:"남구",la:35.846,lo:128.597},{n:"달성군",la:35.775,lo:128.432},
    {n:"달서구",la:35.830,lo:128.532},{n:"동구",la:35.887,lo:128.635},{n:"북구",la:35.885,lo:128.583},
    {n:"서구",la:35.872,lo:128.559},{n:"수성구",la:35.858,lo:128.631},{n:"중구",la:35.869,lo:128.607},
  ],
  전북:[
    {n:"고창군",la:35.436,lo:126.702},{n:"군산시",la:35.967,lo:126.737},{n:"김제시",la:35.803,lo:126.881},
    {n:"남원시",la:35.416,lo:127.390},{n:"무주군",la:35.906,lo:127.661},{n:"부안군",la:35.731,lo:126.733},
    {n:"순창군",la:35.374,lo:127.138},{n:"완주군",la:35.905,lo:127.162},{n:"익산시",la:35.948,lo:126.954},
    {n:"임실군",la:35.617,lo:127.289},{n:"장수군",la:35.647,lo:127.522},{n:"전주시",la:35.822,lo:127.148},
    {n:"정읍시",la:35.570,lo:126.856},{n:"진안군",la:35.791,lo:127.425},
  ],
  광주:[
    {n:"광산구",la:35.140,lo:126.794},{n:"남구",la:35.133,lo:126.903},{n:"동구",la:35.146,lo:126.923},
    {n:"북구",la:35.174,lo:126.912},{n:"서구",la:35.152,lo:126.890},
  ],
  전남:[
    {n:"강진군",la:34.642,lo:126.767},{n:"고흥군",la:34.611,lo:127.276},{n:"곡성군",la:35.282,lo:127.292},
    {n:"광양시",la:34.941,lo:127.696},{n:"구례군",la:35.202,lo:127.463},{n:"나주시",la:35.016,lo:126.711},
    {n:"담양군",la:35.321,lo:126.988},{n:"목포시",la:34.812,lo:126.392},{n:"무안군",la:34.991,lo:126.481},
    {n:"보성군",la:34.772,lo:127.080},{n:"순천시",la:34.950,lo:127.487},{n:"신안군",la:34.830,lo:126.107},
    {n:"여수시",la:34.760,lo:127.662},{n:"영광군",la:35.277,lo:126.512},{n:"영암군",la:34.800,lo:126.696},
    {n:"완도군",la:34.310,lo:126.755},{n:"장성군",la:35.302,lo:126.785},{n:"장흥군",la:34.682,lo:126.907},
    {n:"진도군",la:34.487,lo:126.263},{n:"함평군",la:35.066,lo:126.517},{n:"해남군",la:34.574,lo:126.599},
    {n:"화순군",la:35.064,lo:126.987},
  ],
  경남:[
    {n:"거제시",la:34.880,lo:128.622},{n:"거창군",la:35.687,lo:127.909},{n:"고성군",la:34.974,lo:128.323},
    {n:"김해시",la:35.234,lo:128.881},{n:"남해군",la:34.837,lo:127.892},{n:"밀양시",la:35.503,lo:128.746},
    {n:"사천시",la:35.004,lo:128.064},{n:"산청군",la:35.415,lo:127.874},{n:"양산시",la:35.335,lo:129.034},
    {n:"의령군",la:35.322,lo:128.261},{n:"진주시",la:35.180,lo:128.107},{n:"창녕군",la:35.544,lo:128.492},
    {n:"창원시",la:35.228,lo:128.682},{n:"통영시",la:34.854,lo:128.433},{n:"하동군",la:35.068,lo:127.752},
    {n:"함안군",la:35.273,lo:128.409},{n:"함양군",la:35.520,lo:127.725},{n:"합천군",la:35.566,lo:128.166},
  ],
  울산:[
    {n:"남구",la:35.540,lo:129.332},{n:"동구",la:35.505,lo:129.416},{n:"북구",la:35.582,lo:129.361},
    {n:"울주군",la:35.520,lo:129.242},{n:"중구",la:35.570,lo:129.332},
  ],
  부산:[
    {n:"강서구",la:35.212,lo:128.981},{n:"금정구",la:35.243,lo:129.093},{n:"기장군",la:35.244,lo:129.222},
    {n:"남구",la:35.136,lo:129.084},{n:"동구",la:35.179,lo:129.044},{n:"동래구",la:35.199,lo:129.086},
    {n:"부산진구",la:35.163,lo:129.053},{n:"북구",la:35.197,lo:128.991},{n:"사상구",la:35.151,lo:128.984},
    {n:"사하구",la:35.100,lo:128.974},{n:"서구",la:35.098,lo:129.024},{n:"수영구",la:35.144,lo:129.115},
    {n:"연제구",la:35.176,lo:129.080},{n:"영도구",la:35.091,lo:129.068},{n:"중구",la:35.105,lo:129.032},
    {n:"해운대구",la:35.163,lo:129.163},
  ],
  제주:[{n:"서귀포시",la:33.253,lo:126.560},{n:"제주시",la:33.499,lo:126.531}],
};

// ─── 차량 종류 ─────────────────────────────────────────────────────────────
const VEHICLE_TYPES = [
  {id:"bike",   name:"오토바이",      base:8000,  perKm:180,  min:15000,  L100km:4,  smallOnly:true},
  {id:"damas",  name:"라보/다마스",   base:12000, perKm:350,  min:25000,  L100km:8,  smallOnly:true},
  {id:"1ton",   name:"1톤",          base:20000, perKm:690,  min:50000,  L100km:12},
  {id:"1.4ton", name:"1.4톤",        base:24000, perKm:780,  min:60000,  L100km:14},
  {id:"2.5ton", name:"2.5톤",        base:32000, perKm:980,  min:80000,  L100km:18},
  {id:"3.5ton", name:"3.5톤",        base:38000, perKm:1100, min:100000, L100km:22},
  {id:"3.5tonW",name:"3.5톤(광폭)",  base:42000, perKm:1200, min:110000, L100km:24},
  {id:"5ton",   name:"5톤",          base:48000, perKm:1280, min:120000, L100km:27},
  {id:"5tonP",  name:"5톤+",         base:52000, perKm:1380, min:130000, L100km:29},
  {id:"5tonAx", name:"5톤+축",       base:56000, perKm:1480, min:140000, L100km:30},
  {id:"11ton",  name:"11톤",         base:68000, perKm:1680, min:180000, L100km:35},
  {id:"18ton",  name:"18톤",         base:86000, perKm:2100, min:240000, L100km:38},
  {id:"25ton",  name:"25톤",         base:108000,perKm:2380, min:300000, L100km:42},
  {id:"trailer",name:"추레라",       base:125000,perKm:2600, min:350000, L100km:45},
  {id:"lowbed", name:"로베드",       base:135000,perKm:2800, min:380000, L100km:47},
];

const CARGO_TYPES = [
  {id:"일반",  name:"일반"},
  {id:"냉장",  name:"냉장/냉동", surcharge:0.12},
  {id:"위험물",name:"위험물",   surcharge:0.20},
];

const PREF_LABELS = ["없음","보통","다소 선호","선호","매우 선호"];

const TMAP_KEY = "rmzwkLwH9N4i9ayxDj9GR6l8hyFDaEk52ZQs4yer";

const SIDO_MAP = {
  "서울특별시":"서울","부산광역시":"부산","대구광역시":"대구","인천광역시":"인천",
  "광주광역시":"광주","대전광역시":"대전","울산광역시":"울산","세종특별자치시":"세종",
  "경기도":"경기","강원도":"강원","강원특별자치도":"강원",
  "충청북도":"충북","충청남도":"충남","전라북도":"전북","전북특별자치도":"전북",
  "전라남도":"전남","경상북도":"경북","경상남도":"경남","제주특별자치도":"제주","제주도":"제주",
};

const SURCHARGE_MANUAL = {
  bike:0, damas:20000, "1ton":40000, "1.4ton":45000,
  "2.5ton":60000, "3.5ton":75000, "3.5tonW":80000,
  "5ton":100000, "5tonP":110000, "5tonAx":115000,
  "11ton":140000, "18ton":180000, "25ton":220000,
  trailer:270000, lowbed:310000,
};

const searchTmapPOI = async (keyword, setter) => {
  if (!keyword || keyword.trim().length < 2) { setter([]); return; }
  try {
    const url = `https://apis.openapi.sk.com/tmap/pois?version=1&searchKeyword=${encodeURIComponent(keyword.trim())}&count=8&resCoordType=WGS84GEO`;
    const res = await fetch(url, { headers: { appKey: TMAP_KEY } });
    if (!res.ok) { setter([]); return; }
    const data = await res.json();
    const pois = data?.searchPoiInfo?.pois?.poi || [];
    const results = pois.map(p => ({
      name: p.name || "",
      prov: SIDO_MAP[p.upperAddrName || ""] || null,
      addr: [p.middleAddrName, p.lowerAddrName].filter(Boolean).join(" "),
      full: [p.upperAddrName, p.middleAddrName, p.lowerAddrName].filter(Boolean).join(" "),
      la: parseFloat(p.frontLat || p.noorLat || 0),
      lo: parseFloat(p.frontLon || p.noorLon || 0),
    })).filter(p => p.prov && p.la && p.lo);
    setter(results);
  } catch { setter([]); }
};

// ─── 계산 함수 ─────────────────────────────────────────────────────────────
function haversine(la1,lo1,la2,lo2){
  const R=6371, d1=(la2-la1)*Math.PI/180, d2=(lo2-lo1)*Math.PI/180;
  const a=Math.sin(d1/2)**2+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(d2/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function calcRate(fromC,toC,vtId,ctId){
  const [la1,lo1]=fromC, [la2,lo2]=toC;
  const roadDist=Math.round(haversine(la1,lo1,la2,lo2)*1.35);
  const vt=VEHICLE_TYPES.find(v=>v.id===vtId)||VEHICLE_TYPES[1];
  const ct=CARGO_TYPES.find(c=>c.id===ctId)||CARGO_TYPES[0];
  const base=vt.base+vt.perKm*roadDist;
  const surchargedBase=Math.max(vt.min,base)*(1+(ct.surcharge||0));
  const avg=Math.round(surchargedBase/5000)*5000;
  const minFare=Math.round(avg*0.83/5000)*5000;
  const maxFare=Math.round(avg*1.17/5000)*5000;
  const fuelCost=Math.round(vt.L100km/100*roadDist*1650);
  const mins=Math.round(roadDist/80*60);
  return{distance:roadDist,min:minFare,max:maxFare,avg,fuelCost,mins};
}

// ─── 혼적(합짐) 요율표 ────────────────────────────────────────────────────
const MIXED_TIERS=[
  {maxKm:100,  base:28000, per100kg:3500,  label:"단거리"},
  {maxKm:200,  base:42000, per100kg:5500,  label:"중단거리"},
  {maxKm:300,  base:58000, per100kg:8000,  label:"중거리"},
  {maxKm:500,  base:78000, per100kg:12000, label:"장거리"},
  {maxKm:Infinity, base:95000, per100kg:16000, label:"초장거리"},
];

function calcMixedRate(fromC,toC,ctId,weightKg,cbm){
  const [la1,lo1]=fromC, [la2,lo2]=toC;
  const roadDist=Math.round(haversine(la1,lo1,la2,lo2)*1.35);
  const ct=CARGO_TYPES.find(c=>c.id===ctId)||CARGO_TYPES[0];
  const effWeight=Math.max(weightKg||0, (cbm||0)*250);
  const tier=MIXED_TIERS.find(r=>roadDist<=r.maxKm)||MIXED_TIERS[MIXED_TIERS.length-1];
  const units=Math.max(1,Math.ceil(effWeight/100));
  const rawCost=tier.base+tier.per100kg*(units-1);
  const withSurcharge=rawCost*(1+(ct.surcharge||0));
  const avg=Math.round(withSurcharge/1000)*1000;
  const minFare=Math.round(avg*0.85/1000)*1000;
  const maxFare=Math.round(avg*1.15/1000)*1000;
  const mins=Math.round(roadDist/80*60);
  return{distance:roadDist,min:minFare,max:maxFare,avg,mins,effWeight,units,tier:tier.label,per100kg:tier.per100kg};
}

const fmtMoney=(n)=>{
  if(n>=10000){const v=(n/10000);return v%1===0?`${v}만원`:`${v.toFixed(1)}만원`;}
  return `${n.toLocaleString()}원`;
};
const fmtTime=(m)=>{const h=Math.floor(m/60);const mm=m%60;return h>0?`${h}h ${mm}m`:`${mm}m`;};

// ─── 차량 아이콘 SVG (라인아트) ──────────────────────────────────────────────
function VehicleIconSvg({ id, sel }) {
  const c = sel ? "white" : "#1B2B4B";
  const p = { fill:"none", stroke:c, strokeWidth:"1.8", strokeLinecap:"round", strokeLinejoin:"round" };
  if(id==="bike") return (
    <svg viewBox="0 0 44 30" style={{width:"100%",maxWidth:54,height:28,display:"block"}} {...p}>
      <circle cx="10" cy="22" r="7"/><circle cx="34" cy="22" r="7"/>
      <path d="M10 22L16 10L25 10"/><path d="M16 10L22 22"/>
      <path d="M25 10L31 6"/><circle cx="31" cy="6" r="2.5"/>
    </svg>
  );
  if(id==="damas") return (
    <svg viewBox="0 0 50 30" style={{width:"100%",maxWidth:54,height:28,display:"block"}} {...p}>
      <path d="M2 22V10L30 10L42 18V22Z"/>
      <path d="M30 10V22"/>
      <rect x="4" y="12" width="22" height="8" rx="1" strokeWidth="1.4"/>
      <circle cx="11" cy="26" r="4"/><circle cx="35" cy="26" r="4"/>
    </svg>
  );
  if(["1ton","1.4ton","2.5ton"].includes(id)) return (
    <svg viewBox="0 0 52 28" style={{width:"100%",maxWidth:54,height:28,display:"block"}} {...p}>
      <rect x="2" y="5" width="30" height="19" rx="1.5"/>
      <path d="M32 9L32 24L50 24L50 13L44 9Z"/>
      <path d="M44 9V24"/><line x1="32" y1="17" x2="50" y2="17" strokeWidth="1.3"/>
      <circle cx="11" cy="24" r="4"/><circle cx="44" cy="24" r="4"/>
    </svg>
  );
  if(["3.5ton","3.5tonW","5ton","5tonP","5tonAx"].includes(id)) return (
    <svg viewBox="0 0 58 28" style={{width:"100%",maxWidth:54,height:28,display:"block"}} {...p}>
      <rect x="2" y="4" width="38" height="20" rx="1.5"/>
      <path d="M40 9L40 24L56 24L56 13L50 9Z"/>
      <path d="M50 9V24"/><line x1="40" y1="17" x2="56" y2="17" strokeWidth="1.3"/>
      <circle cx="11" cy="24" r="4"/><circle cx="27" cy="24" r="4"/>
      <circle cx="50" cy="24" r="4"/>
    </svg>
  );
  if(["11ton","18ton","25ton"].includes(id)) return (
    <svg viewBox="0 0 62 28" style={{width:"100%",maxWidth:54,height:28,display:"block"}} {...p}>
      <rect x="2" y="4" width="42" height="20" rx="1.5"/>
      <path d="M44 9L44 24L60 24L60 13L54 9Z"/>
      <path d="M54 9V24"/><line x1="44" y1="17" x2="60" y2="17" strokeWidth="1.3"/>
      <circle cx="10" cy="24" r="4"/><circle cx="23" cy="24" r="4"/>
      <circle cx="36" cy="24" r="4"/><circle cx="54" cy="24" r="4"/>
    </svg>
  );
  return (
    <svg viewBox="0 0 66 28" style={{width:"100%",maxWidth:54,height:28,display:"block"}} {...p}>
      <rect x="2" y="6" width="40" height="18" rx="1.5"/>
      <path d="M42 10L42 24L62 24L62 14L56 10Z"/>
      <path d="M56 10V24"/><line x1="42" y1="17" x2="62" y2="17" strokeWidth="1.3"/>
      <circle cx="11" cy="24" r="4"/><circle cx="24" cy="24" r="4"/>
      <circle cx="38" cy="24" r="4"/><circle cx="56" cy="24" r="4"/>
    </svg>
  );
}

// ─── 전국운임조회 탭 (차량그리드 + 지도) ─────────────────────────────────────
function NationalFareTab() {
  const [vehicle,setVehicle]=useState("1ton");
  const [cargoType,setCargoType]=useState("일반");
  const [step,setStep]=useState("from");
  const [fromP,setFromP]=useState(null);
  const [fromC,setFromC]=useState(null);
  const [toP,setToP]=useState(null);
  const [toC,setToC]=useState(null);
  const [hover,setHover]=useState(null);
  const [cityStep,setCityStep]=useState(null);
  const provinces=Object.keys(PROVINCE_PATHS);
  const SMALLS=["서울","인천","세종","대전","대구","광주","울산","부산","제주"];

  const result=useMemo(()=>{
    if(!fromC||!toC) return null;
    return calcRate([fromC.la,fromC.lo],[toC.la,toC.lo],vehicle,cargoType);
  },[fromC,toC,vehicle,cargoType]);

  const reset=useCallback(()=>{
    setStep("from");setFromP(null);setFromC(null);setToP(null);setToC(null);setCityStep(null);
  },[]);

  const onProvClick=(prov)=>{
    if(step==="from"){setFromP(prov);setCityStep("from");}
    else if(step==="to"){setToP(prov);setCityStep("to");}
  };
  const onCitySelect=(city)=>{
    if(cityStep==="from"){setFromC(city);setStep("to");setCityStep(null);}
    else if(cityStep==="to"){setToC(city);setStep("result");setCityStep(null);}
  };

  const aFrom=fromP?PROVINCE_LABEL_POS[fromP]:null;
  const aTo=toP?PROVINCE_LABEL_POS[toP]:null;
  let aPath=null;
  if(aFrom&&aTo&&step==="result"){
    const[fx,fy]=[aFrom[0],aFrom[1]-11];
    const[tx,ty]=[aTo[0],aTo[1]-11];
    aPath=`M ${fx},${fy} Q ${(fx+tx)/2},${(fy+ty)/2-50} ${tx},${ty}`;
  }

  const vehicles=VEHICLE_TYPES.filter(v=>!(v.smallOnly&&cargoType==="냉장"));

  return (
    <div className="flex gap-5 min-h-0" style={{height:"calc(100vh - 230px)",minHeight:580}}>

      {/* ── 왼쪽 패널 (입력/선택) ── */}
      <div className="flex-[4] flex flex-col gap-5 overflow-y-auto pr-1 min-w-0">

        {/* 상·하차지 */}
        <div>
          <p className="text-[14px] font-extrabold text-[#1B2B4B] mb-2.5">
            상·하차지를 입력해주세요 <span className="text-red-500">*</span>
          </p>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer border-b border-gray-100 transition ${step==="from"||cityStep==="from"?"bg-blue-50/60":""}`}
              onClick={()=>{setStep("from");setCityStep(null);setFromP(null);setFromC(null);setToC(null);setToP(null);}}>
              <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0"/>
              <span className="text-[12px] text-gray-400 font-bold w-11 shrink-0">상차지</span>
              {fromC?<span className="font-extrabold text-[14px] text-[#1B2B4B]">{fromP} {fromC.n}</span>
                    :<span className="text-[13px] text-gray-300 font-medium">상차지를 추가하세요</span>}
              {fromC&&<button className="ml-auto text-gray-300 hover:text-red-400 text-[18px] leading-none" onClick={e=>{e.stopPropagation();reset();}}>×</button>}
            </div>
            <div className={`flex items-center gap-3 px-4 py-3.5 cursor-pointer transition ${step==="to"||cityStep==="to"?"bg-orange-50/60":""}`}
              onClick={()=>{if(fromC){setStep("to");setCityStep(null);setToP(null);setToC(null);}}}>
              <div className="w-2 h-2 rounded-full bg-orange-400 shrink-0"/>
              <span className="text-[12px] text-gray-400 font-bold w-11 shrink-0">하차지</span>
              {toC?<span className="font-extrabold text-[14px] text-[#1B2B4B]">{toP} {toC.n}</span>
                  :<span className="text-[13px] text-gray-300 font-medium">{fromC?"하차지를 추가하세요":"상차지 먼저 선택"}</span>}
              {toC&&<button className="ml-auto text-gray-300 hover:text-red-400 text-[18px] leading-none" onClick={e=>{e.stopPropagation();setToP(null);setToC(null);setStep("to");}}>×</button>}
            </div>
          </div>
          {(fromP||toP)&&<button onClick={reset} className="mt-1.5 text-[11px] text-gray-400 hover:text-red-500 transition">초기화</button>}
        </div>

        {/* 차량 선택 */}
        <div>
          <p className="text-[14px] font-extrabold text-[#1B2B4B] mb-2.5">
            차량을 선택해주세요 <span className="text-red-500">*</span>
          </p>
          <div className="grid grid-cols-5 gap-1.5">
            {vehicles.map(v=>(
              <button key={v.id} onClick={()=>setVehicle(v.id)}
                className={`flex flex-col items-center pt-3 pb-2 px-1 rounded-xl border-2 transition ${vehicle===v.id
                  ?"bg-[#1B2B4B] border-[#1B2B4B] shadow-lg"
                  :"bg-white border-gray-200 hover:border-[#1B2B4B]/50 hover:shadow-sm"}`}>
                <div className="flex items-center justify-center" style={{width:48,height:28}}>
                  <VehicleIconSvg id={v.id} sel={vehicle===v.id}/>
                </div>
                <span className={`text-[10px] font-bold text-center mt-1.5 leading-tight ${vehicle===v.id?"text-white":"text-gray-700"}`}>{v.name}</span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5">차량 선택이 어렵다면, 상단의 차량제원을 참고하세요.</p>
        </div>

        {/* 화물 유형 */}
        <div>
          <p className="text-[14px] font-extrabold text-[#1B2B4B] mb-2.5">화물 유형</p>
          <div className="flex gap-2">
            {CARGO_TYPES.map(ct=>(
              <button key={ct.id} onClick={()=>setCargoType(ct.id)}
                className={`flex-1 py-3 rounded-xl text-[13px] font-bold border-2 transition ${cargoType===ct.id
                  ?"bg-[#1B2B4B] text-white border-[#1B2B4B] shadow-md"
                  :"bg-white text-gray-500 border-gray-200 hover:border-[#1B2B4B]/40"}`}>
                {ct.name}
              </button>
            ))}
          </div>
        </div>

        {/* 결과 카드 */}
        {result&&step==="result"&&(
          <div className="rounded-2xl overflow-hidden shadow-xl border border-[#1B2B4B]/10"
            style={{background:"linear-gradient(150deg,#0f1e38 0%,#1B2B4B 50%,#243a60 100%)"}}>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-white/15 text-white">{VEHICLE_TYPES.find(v=>v.id===vehicle)?.name}</span>
                <span className="text-[10px] text-white/40">{fromP} {fromC?.n} → {toP} {toC?.n}</span>
              </div>
              <div className="mb-4">
                <div className="text-[10px] text-white/40 font-semibold mb-1 tracking-wide">예상 운임 (VAT 별도)</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[26px] font-black text-white">{fmtMoney(result.min)}</span>
                  <span className="text-white/30 text-[18px]">~</span>
                  <span className="text-[26px] font-black text-white">{fmtMoney(result.max)}</span>
                </div>
              </div>
              <div className="bg-white/8 rounded-xl p-3.5 mb-4">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[11px] text-white/50 font-semibold">평균 운임</span>
                  <span className="text-[18px] font-black text-yellow-300">{fmtMoney(result.avg)}</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-blue-400 to-yellow-300 rounded-full" style={{width:"55%"}}/>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {[{l:"거리",v:`약 ${result.distance}km`},{l:"예상시간",v:fmtTime(result.mins)},
                  {l:"연료비",v:`${result.fuelCost?.toLocaleString()}원`},{l:"차종",v:VEHICLE_TYPES.find(v=>v.id===vehicle)?.name}
                ].map(({l,v})=>(
                  <div key={l} className="bg-white/6 rounded-xl px-3 py-2">
                    <div className="text-[9px] text-white/35 font-semibold">{l}</div>
                    <div className="text-[12px] font-bold text-white/85">{v}</div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={reset} className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/18 text-white text-[12px] font-bold transition">다시 조회</button>
                <button onClick={()=>navigator.clipboard.writeText(
                  `[운임견적]\n경로: ${fromP} ${fromC?.n} → ${toP} ${toC?.n}\n차종: ${VEHICLE_TYPES.find(v=>v.id===vehicle)?.name}\n거리: 약 ${result.distance}km / 예상 ${fmtTime(result.mins)}\n운임: ${fmtMoney(result.min)}~${fmtMoney(result.max)} (평균 ${fmtMoney(result.avg)})\n※ VAT 별도 · 광고시세 기준`
                ).catch(()=>{})} className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/18 text-white/70 text-[12px] font-bold transition">복사</button>
              </div>
            </div>
          </div>
        )}

        {/* 시군구 선택 패널 */}
        {cityStep&&(
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-extrabold shrink-0 ${cityStep==="from"?"bg-[#1B2B4B]":"bg-orange-400"}`}>
                {cityStep==="from"?"출":"하"}
              </div>
              <span className="text-[14px] font-extrabold text-[#1B2B4B]">{cityStep==="from"?fromP:toP}</span>
              <button className="ml-auto text-[11px] text-gray-400 hover:text-[#1B2B4B] border border-gray-200 rounded-lg px-2.5 py-1"
                onClick={()=>{setCityStep(null);if(cityStep==="from")setFromP(null);else setToP(null);}}>← 재선택</button>
            </div>
            <div className="grid grid-cols-3 gap-1.5 max-h-[200px] overflow-y-auto">
              {(CITIES[cityStep==="from"?fromP:toP]||[]).map(city=>(
                <button key={city.n} onClick={()=>onCitySelect(city)}
                  className="px-2 py-2 text-[11px] font-semibold text-gray-600 border border-gray-100 rounded-xl hover:bg-[#1B2B4B] hover:text-white hover:border-[#1B2B4B] transition bg-gray-50">
                  {city.n}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── 오른쪽 패널 (지도) ── */}
      <div className="flex-[6] min-w-0 rounded-2xl border border-gray-200 shadow-sm flex flex-col overflow-hidden bg-white">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-3 shrink-0">
          {step!=="result"&&(
            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold ${step==="from"?"bg-[#1B2B4B] text-white":"bg-orange-400 text-white"}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-white/80"/>
              {step==="from"?"출발 지역을 선택하세요":"도착 지역을 선택하세요"}
            </div>
          )}
          {step==="result"&&fromP&&toP&&(
            <div className="flex items-center gap-2 text-[13px]">
              <span className="font-extrabold text-blue-600">{fromP} {fromC?.n}</span>
              <span className="text-gray-300">→</span>
              <span className="font-extrabold text-orange-500">{toP} {toC?.n}</span>
            </div>
          )}
          {(fromP||toP)&&<button onClick={reset} className="ml-auto text-[11px] text-gray-400 hover:text-red-500 border border-gray-200 rounded-md px-2 py-1">초기화</button>}
        </div>
        <div className="flex-1 min-h-0">
          <svg viewBox="0 0 524 631" className="w-full h-full" preserveAspectRatio="xMidYMid meet" style={{userSelect:"none",display:"block"}}>
            <defs>
              <linearGradient id="nfLight" x1="15%" y1="5%" x2="85%" y2="95%">
                <stop offset="0%" stopColor="white" stopOpacity="0.45"/>
                <stop offset="100%" stopColor="#0a1428" stopOpacity="0.15"/>
              </linearGradient>
              <radialGradient id="nfGlow" cx="38%" cy="30%" r="65%">
                <stop offset="0%" stopColor="white" stopOpacity="0.5"/>
                <stop offset="100%" stopColor="white" stopOpacity="0"/>
              </radialGradient>
              <filter id="nfShad" x="-4%" y="-4%" width="108%" height="108%">
                <feDropShadow dx="0.5" dy="1.5" stdDeviation="1.5" floodColor="#4a6080" floodOpacity="0.18"/>
              </filter>
              <filter id="nfHovF" x="-8%" y="-8%" width="116%" height="116%">
                <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#3b82f6" floodOpacity="0.35"/>
              </filter>
              <filter id="nfSelF" x="-10%" y="-10%" width="120%" height="120%">
                <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#3b82f6" floodOpacity="0.45"/>
              </filter>
              <marker id="nfArr" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
                <path d="M 0,1 L 9,5 L 0,9 Z" fill="#3b82f6"/>
              </marker>
            </defs>
            <rect width="524" height="631" fill="white"/>
            {provinces.map(prov=>{
              const isFr=prov===fromP,isTo=prov===toP,isHov=prov===hover,isAct=isFr||isTo;
              let fill=PROVINCE_COLORS[prov]||"#c8d8e8";
              if(isFr) fill="#3b82f6";
              else if(isTo) fill="#f97316";
              else if(isHov) fill="#9ac0e8";
              return(
                <g key={prov}>
                  <path d={PROVINCE_PATHS[prov]} fill={fill}
                    stroke={isAct?"rgba(255,255,255,0.95)":isHov?"#4a8fcc":"rgba(255,255,255,0.8)"}
                    strokeWidth={isAct?2:isHov?1.5:1}
                    filter={isAct?"url(#nfSelF)":isHov?"url(#nfHovF)":"url(#nfShad)"}
                    style={{cursor:"pointer",transition:"fill 0.15s"}}
                    onMouseEnter={()=>setHover(prov)} onMouseLeave={()=>setHover(null)}
                    onClick={()=>onProvClick(prov)}/>
                  <path d={PROVINCE_PATHS[prov]} fill={isAct?"url(#nfGlow)":"url(#nfLight)"} stroke="none" style={{pointerEvents:"none"}}/>
                </g>
              );
            })}
            {provinces.map(prov=>{
              if(prov===fromP||prov===toP) return null;
              const isSmall=SMALLS.includes(prov),isHovL=prov===hover;
              const [lx,ly]=PROVINCE_LABEL_POS[prov]||[0,0];
              return(
                <text key={`nl-${prov}`} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
                  fontSize={isSmall?11:14} fontWeight={isHovL?"800":"700"}
                  fill={isHovL?"#1a5fa8":"#1B2B4B"} style={{pointerEvents:"none",transition:"fill 0.15s"}}>{prov}</text>
              );
            })}
            {[fromP&&{prov:fromP,label:"출",color:"#3b82f6",border:"#2563eb"},
              toP&&{prov:toP,label:"하",color:"#f97316",border:"#ea580c"}]
              .filter(Boolean).map(({prov,label,color,border})=>{
                const pos=PROVINCE_LABEL_POS[prov];
                if(!pos) return null;
                const [bx,by]=pos,stemY=by-(SMALLS.includes(prov)?28:34);
                return(
                  <g key={label} style={{pointerEvents:"none"}}>
                    <circle cx={bx} cy={by} r={5} fill={color} fillOpacity="0.85"/>
                    <line x1={bx} y1={by-6} x2={bx} y2={stemY+22} stroke={color} strokeWidth="2" strokeOpacity="0.6"/>
                    <circle cx={bx} cy={stemY} r={20} fill={color} stroke="white" strokeWidth="2.5" filter="url(#nfSelF)"/>
                    <text x={bx} y={stemY} textAnchor="middle" dominantBaseline="middle" fontSize="13" fontWeight="900" fill="white">{label}</text>
                    <rect x={bx-22} y={stemY+23} width="44" height="16" rx="8" fill="white" fillOpacity="0.92" stroke={border} strokeWidth="1"/>
                    <text x={bx} y={stemY+31} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="800" fill={border}>{prov}</text>
                  </g>
                );
              })}
            {aPath&&<path d={aPath} fill="none" stroke="#3b82f6" strokeWidth="3.5" strokeLinecap="round" markerEnd="url(#nfArr)"/>}
          </svg>
        </div>
        <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"/><span className="text-[11px] font-semibold text-gray-500">출발지</span></div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-400 inline-block"/><span className="text-[11px] font-semibold text-gray-500">도착지</span></div>
          <span className="ml-auto text-[10px] text-gray-300">지역 클릭 → 시/군/구 선택 → 운임 확인</span>
        </div>
      </div>
    </div>
  );
}

// ─── 자사운임표 컴포넌트 ──────────────────────────────────────────────────
function CompanyFareTab() {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl overflow-hidden border border-[#1B2B4B]/10"
        style={{background:"linear-gradient(135deg,#1B2B4B 0%,#243a60 60%,#2a4470 100%)"}}>
        <div className="px-6 py-5 flex items-center justify-between">
          <div>
            <h2 className="text-[20px] font-black text-white leading-tight tracking-tight">자사 운임표 조회</h2>
            <p className="text-[12px] text-white/50 font-medium mt-1">실거래 데이터 기반 · 노선별 운임 히스토리</p>
          </div>
          <div className="flex gap-3">
            <div className="bg-white/10 rounded-xl px-4 py-2.5 text-center">
              <div className="text-[10px] text-white/50 font-semibold">데이터 기준</div>
              <div className="text-[13px] font-black text-white">실거래</div>
            </div>
            <div className="bg-white/10 rounded-xl px-4 py-2.5 text-center">
              <div className="text-[10px] text-white/50 font-semibold">업데이트</div>
              <div className="text-[13px] font-black text-white">실시간</div>
            </div>
          </div>
        </div>
      </div>
      <StandardFare embedded={true} defaultTab="표준운임"/>
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────
export default function FreightRateInquiry(){
  const [activeTab,setActiveTab]=useState("운임조회");
  const [step,setStep]=useState("from");
  const [fromP,setFromP]=useState(null);
  const [fromC,setFromC]=useState(null);
  const [toP,setToP]=useState(null);
  const [toC,setToC]=useState(null);
  const [vehicle,setVehicle]=useState("1ton");
  const [cargoType,setCargoType]=useState("일반");
  const [preference,setPreference]=useState(0);
  const [hover,setHover]=useState(null);
  const [cityStep,setCityStep]=useState(null);
  const [freightMode,setFreightMode]=useState("독차");
  const [mixWeightKg,setMixWeightKg]=useState("");
  const [mixCbm,setMixCbm]=useState("");

  useEffect(()=>{
    if(cargoType==="냉장"&&(vehicle==="bike"||vehicle==="damas"))setVehicle("1ton");
  },[cargoType]);

  const result=useMemo(()=>{
    if(!fromC||!toC)return null;
    if(freightMode==="혼적"){
      const wkg=parseFloat(mixWeightKg)||0;
      const cbm=parseFloat(mixCbm)||0;
      if(wkg===0&&cbm===0)return null;
      return{mode:"혼적",...calcMixedRate([fromC.la,fromC.lo],[toC.la,toC.lo],cargoType,wkg,cbm)};
    }
    return{mode:"독차",...calcRate([fromC.la,fromC.lo],[toC.la,toC.lo],vehicle,cargoType)};
  },[fromC,toC,vehicle,cargoType,freightMode,mixWeightKg,mixCbm]);

  const reset=useCallback(()=>{
    setStep("from");setFromP(null);setFromC(null);setToP(null);setToC(null);setCityStep(null);
    setMixWeightKg("");setMixCbm("");
  },[]);

  const handleProvinceClick=(prov)=>{
    if(step==="from"){setFromP(prov);setCityStep("from");}
    else if(step==="to"){setToP(prov);setCityStep("to");}
  };

  const handleCitySelect=(city)=>{
    if(cityStep==="from"){setFromC(city);setStep("to");setCityStep(null);}
    else if(cityStep==="to"){setToC(city);setStep("result");setCityStep(null);}
  };

  const provinces=Object.keys(PROVINCE_PATHS);
  const SMALL=["서울","인천","세종","대전","대구","광주","울산","부산","제주"];

  // 화살표 제어점 계산 — 뱃지 하단 위치(ly-11)를 연결점으로 사용
  const arrowFrom=fromP?PROVINCE_LABEL_POS[fromP]:null;
  const arrowTo=toP?PROVINCE_LABEL_POS[toP]:null;
  let arrowPath=null;
  if(arrowFrom&&arrowTo&&step==="result"){
    const fx=arrowFrom[0], fy=arrowFrom[1]-11;
    const tx=arrowTo[0],   ty=arrowTo[1]-11;
    const mx=(fx+tx)/2;
    const my=(fy+ty)/2-50;
    arrowPath=`M ${fx},${fy} Q ${mx},${my} ${tx},${ty}`;
  }

  return(
    <div className="w-full">
      {/* 탭 네비게이션 */}
      <div className="flex items-center gap-1 mb-5 border-b border-gray-200">
        {["운임조회","차량제원","전국운임조회","자사운임표"].map(tab=>(
          <button key={tab} onClick={()=>setActiveTab(tab)}
            className={`px-5 py-2.5 text-[14px] font-extrabold transition border-b-2 -mb-px ${activeTab===tab?"border-[#1B2B4B] text-[#1B2B4B]":"border-transparent text-gray-400 hover:text-gray-600"}`}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab==="차량제원"&&<PalletSimulator/>}
      {activeTab==="전국운임조회"&&<NationalFareTab/>}
      {activeTab==="자사운임표"&&<CompanyFareTab/>}

      {activeTab==="운임조회"&&<>
      <div className="flex items-center gap-4 mb-5 flex-wrap">
        <div>
          <h2 className="text-[20px] font-black text-[#1B2B4B] leading-tight">전국운임 조회</h2>
          <p className="text-[12px] text-gray-400 font-medium mt-0.5">
            {freightMode==="독차"?"지역 클릭 → 시/군/구 선택 → 5초 내 운임 확인":"중량·CBM 입력 후 혼적 운임 조회"}
          </p>
        </div>
        {/* 독차 / 혼적 토글 */}
        <div className="flex rounded-xl border-2 border-gray-100 overflow-hidden shadow-sm">
          {["독차","혼적"].map(m=>(
            <button key={m} onClick={()=>{setFreightMode(m);setStep("from");setFromP(null);setFromC(null);setToP(null);setToC(null);setCityStep(null);}}
              className={`px-5 py-2 text-[13px] font-extrabold transition ${freightMode===m?"bg-[#1B2B4B] text-white":"bg-white text-gray-400 hover:bg-gray-50"}`}>
              {m==="독차"?"독차":"혼적(합짐)"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-5" style={{height:"calc(100vh - 180px)", minHeight:"580px"}}>
        {/* ───────────── 왼쪽 패널 (40%) ───────────── */}
        <div className="flex-[4] min-w-0 flex flex-col gap-3 overflow-y-auto pr-1">

          {/* 경로 카드 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="text-[11px] font-bold text-[#1B2B4B]/40 mb-4 tracking-widest uppercase">경로 설정</div>
            <div className="flex flex-col gap-3">
              <div
                className={`flex items-center gap-4 p-4 rounded-xl cursor-pointer border-2 transition ${
                  step==="from"||cityStep==="from"?"border-[#1B2B4B] bg-[#1B2B4B]/5"
                  :fromC?"border-blue-400 bg-blue-50/60":"border-gray-100 bg-gray-50 hover:border-gray-300"}`}
                onClick={()=>{setStep("from");setCityStep(null);setFromP(null);setFromC(null);setToC(null);setToP(null);}}
              >
                <div className="w-9 h-9 rounded-full bg-[#1B2B4B] flex items-center justify-center text-white text-[12px] font-extrabold flex-shrink-0">출</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-gray-400 font-semibold mb-0.5">출발지</div>
                  {fromC?<div className="text-[15px] font-extrabold text-[#1B2B4B] truncate">{fromP} {fromC.n}</div>
                  :fromP&&cityStep==="from"?<div className="text-[13px] text-[#1B2B4B] font-semibold">{fromP} — 시/군/구 선택 중</div>
                  :<div className="text-[13px] text-gray-400">지도에서 도/시를 클릭하세요</div>}
                </div>
                {fromC&&<button className="text-gray-300 hover:text-red-400 text-[20px] leading-none transition" onClick={e=>{e.stopPropagation();reset();}}>×</button>}
              </div>

              <div className="flex items-center gap-2 px-4">
                <div className="flex-1 h-px bg-gray-100"/>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                <div className="flex-1 h-px bg-gray-100"/>
              </div>

              <div
                className={`flex items-center gap-4 p-4 rounded-xl cursor-pointer border-2 transition ${
                  step==="to"||cityStep==="to"?"border-orange-400 bg-orange-50/60"
                  :toC?"border-orange-300 bg-orange-50/60":"border-gray-100 bg-gray-50 hover:border-gray-300"}`}
                onClick={()=>{if(fromC){setStep("to");setCityStep(null);setToP(null);setToC(null);}}}
              >
                <div className="w-9 h-9 rounded-full bg-orange-400 flex items-center justify-center text-white text-[12px] font-extrabold flex-shrink-0">하</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-gray-400 font-semibold mb-0.5">도착지</div>
                  {toC?<div className="text-[15px] font-extrabold text-[#1B2B4B] truncate">{toP} {toC.n}</div>
                  :toP&&cityStep==="to"?<div className="text-[13px] text-orange-500 font-semibold">{toP} — 시/군/구 선택 중</div>
                  :<div className="text-[13px] text-gray-400">{fromC?"지도에서 도/시를 클릭하세요":"출발지 먼저 선택"}</div>}
                </div>
                {toC&&<button className="text-gray-300 hover:text-red-400 text-[20px] leading-none transition" onClick={e=>{e.stopPropagation();setToP(null);setToC(null);setStep("to");}}>×</button>}
              </div>
            </div>
          </div>

          {/* 독차: 차량 종류 / 혼적: 중량·CBM */}
          {freightMode==="독차"?(
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="text-[11px] font-bold text-[#1B2B4B]/40 mb-3 tracking-widest uppercase">차량 종류</div>
              <VehicleDropdown vehicle={vehicle} onChange={setVehicle} cargoType={cargoType}/>
            </div>
          ):(
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[11px] font-bold text-[#1B2B4B]/40 tracking-widest uppercase">화물 중량 / 부피</div>
                <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">1CBM = 250kg</span>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-[11px] text-gray-400 font-semibold mb-1.5">중량 (kg)</label>
                  <input type="number" min="0" placeholder="예: 500" value={mixWeightKg}
                    onChange={e=>{setMixWeightKg(e.target.value);if(e.target.value)setMixCbm("");}}
                    className="w-full px-4 py-3 border-2 border-gray-100 rounded-xl text-[14px] font-bold text-[#1B2B4B] focus:outline-none focus:border-[#1B2B4B] bg-gray-50"/>
                </div>
                <div className="flex items-end pb-3 text-gray-300 text-[13px] font-medium">또는</div>
                <div className="flex-1">
                  <label className="block text-[11px] text-gray-400 font-semibold mb-1.5">CBM (㎥)</label>
                  <input type="number" min="0" step="0.1" placeholder="예: 2.5" value={mixCbm}
                    onChange={e=>{setMixCbm(e.target.value);if(e.target.value)setMixWeightKg("");}}
                    className="w-full px-4 py-3 border-2 border-gray-100 rounded-xl text-[14px] font-bold text-[#1B2B4B] focus:outline-none focus:border-[#1B2B4B] bg-gray-50"/>
                </div>
              </div>
              {(mixWeightKg||mixCbm)&&(
                <div className="mt-3 text-[12px] text-[#1B2B4B] bg-[#1B2B4B]/5 rounded-xl px-4 py-2.5 font-semibold">
                  적용: <b>{Math.max(parseFloat(mixWeightKg)||0,(parseFloat(mixCbm)||0)*250).toLocaleString()}kg</b>
                  {" · "}단위 <b>{Math.max(1,Math.ceil(Math.max(parseFloat(mixWeightKg)||0,(parseFloat(mixCbm)||0)*250)/100))}개</b>
                </div>
              )}
            </div>
          )}

          {/* 화물 유형 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="text-[11px] font-bold text-[#1B2B4B]/40 mb-3 tracking-widest uppercase">화물 유형</div>
            <div className="flex gap-2">
              {CARGO_TYPES.map(ct=>(
                <button key={ct.id} onClick={()=>setCargoType(ct.id)}
                  className={`flex-1 py-3 rounded-xl text-[13px] font-bold border-2 transition ${
                    cargoType===ct.id?"bg-[#1B2B4B] text-white border-[#1B2B4B] shadow-md":"bg-white text-gray-500 border-gray-100 hover:border-[#1B2B4B]/40 hover:text-[#1B2B4B]"}`}
                >{ct.name}</button>
              ))}
            </div>
          </div>

          {/* 독차 전용: 기사 선호도 */}
          {freightMode==="독차"&&<DriverPreference value={preference} onChange={setPreference}/>}

          {/* 혼적 전용: 안내 */}
          {freightMode==="혼적"&&(
            <div className="bg-[#1B2B4B]/4 rounded-2xl border border-[#1B2B4B]/10 p-4 text-[12px] text-[#1B2B4B]/70 leading-relaxed">
              <div className="font-extrabold text-[#1B2B4B] mb-2 text-[13px]">혼적(합짐) 요율 안내</div>
              <div className="space-y-1">
                <div>• 100km 이하: 기본 28,000원 + 100kg당 3,500원</div>
                <div>• 100~300km: 기본 28,000~58,000원 구간 요율</div>
                <div>• 300km 초과: 기본 78,000원 + 100kg당 12,000원~</div>
              </div>
              <div className="mt-2 text-[11px] text-[#1B2B4B]/40">※ 실제 운임은 업체별 협의에 따라 상이할 수 있습니다</div>
            </div>
          )}

          {/* ── 결과 카드 ── */}
          {result&&step==="result"&&(
            <div className="rounded-2xl overflow-hidden shadow-xl border border-[#1B2B4B]/10"
              style={{background:"linear-gradient(150deg,#0f1e38 0%,#1B2B4B 50%,#243a60 100%)"}}>
              <div className="p-6">
                {/* 상단 배지 */}
                <div className="flex items-center gap-2 mb-4">
                  <span className={`text-[11px] font-extrabold px-3 py-1 rounded-full ${result.mode==="혼적"?"bg-orange-400/90 text-white":"bg-blue-400/90 text-white"}`}>
                    {result.mode==="혼적"?"혼적(합짐)":"독차"}
                  </span>
                  {result.mode==="혼적"&&<span className="text-[11px] text-white/50 font-semibold">{result.tier} · {result.effWeight.toLocaleString()}kg</span>}
                  {result.mode==="독차"&&<span className="text-[11px] text-white/50 font-semibold">{VEHICLE_TYPES.find(v=>v.id===vehicle)?.name}</span>}
                </div>

                {/* 운임 메인 */}
                <div className="mb-4">
                  <div className="text-[12px] text-white/40 font-semibold mb-1 tracking-wide">예상 운임 (VAT 별도)</div>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[32px] font-black text-white leading-none">{fmtMoney(result.min)}</span>
                    <span className="text-white/30 text-[22px] font-light">~</span>
                    <span className="text-[32px] font-black text-white leading-none">{fmtMoney(result.max)}</span>
                  </div>
                </div>

                {/* 평균 운임 바 */}
                <div className="mb-4 bg-white/8 rounded-xl p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[12px] text-white/50 font-semibold">평균 운임</span>
                    <span className="text-[22px] font-black text-yellow-300 leading-none">{fmtMoney(result.avg)}</span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-400 to-yellow-300 rounded-full" style={{width:"55%"}}/>
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-[11px] text-white/30">최저 {fmtMoney(result.min)}</span>
                    <span className="text-[11px] text-white/30">최고 {fmtMoney(result.max)}</span>
                  </div>
                </div>

                {/* 세부 정보 */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {[
                    {label:"거리",value:`약 ${result.distance}km`},
                    {label:"예상시간",value:fmtTime(result.mins)},
                    ...(result.mode==="독차"?[
                      {label:"경유가",value:`${result.fuelCost?.toLocaleString()}원`},
                      {label:"차종",value:VEHICLE_TYPES.find(v=>v.id===vehicle)?.name},
                    ]:[
                      {label:"적재단위",value:`${result.units}개`},
                      {label:"단가",value:`${result.per100kg?.toLocaleString()}원/100kg`},
                    ]),
                  ].map(({label,value})=>(
                    <div key={label} className="bg-white/6 rounded-xl px-3 py-2.5">
                      <div className="text-[10px] text-white/35 font-semibold mb-0.5">{label}</div>
                      <div className="text-[13px] font-bold text-white/85">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button onClick={reset} className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/18 text-white text-[13px] font-bold transition border border-white/10">
                    다시 조회
                  </button>
                  <button
                    onClick={()=>{
                      const route=`${fromP} ${fromC?.n||""} → ${toP} ${toC?.n||""}`;
                      const modeStr=result.mode==="혼적"?`혼적(합짐) · ${result.effWeight?.toLocaleString()}kg`:`독차 · ${VEHICLE_TYPES.find(v=>v.id===vehicle)?.name||""}`;
                      const text=`[운임견적]\n경로: ${route}\n구분: ${modeStr}\n거리: 약 ${result.distance}km · 예상 ${fmtTime(result.mins)}\n운임: ${fmtMoney(result.min)}~${fmtMoney(result.max)} (평균 ${fmtMoney(result.avg)})\n※ VAT 별도 · 광고시세 기준`;
                      navigator.clipboard.writeText(text).catch(()=>{});
                    }}
                    className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/18 text-white/70 text-[13px] font-bold transition border border-white/10"
                  >복사</button>
                </div>
              </div>
            </div>
          )}

          {/* 시군구 선택 패널 */}
          {cityStep&&(
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-extrabold flex-shrink-0 ${cityStep==="from"?"bg-[#1B2B4B]":"bg-orange-400"}`}>
                  {cityStep==="from"?"출":"하"}
                </div>
                <span className="text-[15px] font-extrabold text-[#1B2B4B]">{cityStep==="from"?fromP:toP}</span>
                <button
                  className="ml-auto text-[11px] text-gray-400 hover:text-[#1B2B4B] border border-gray-200 rounded-lg px-3 py-1 font-semibold transition"
                  onClick={()=>{setCityStep(null);if(cityStep==="from")setFromP(null);else setToP(null);}}
                >← 재선택</button>
              </div>
              <div className="text-[12px] text-gray-400 font-semibold mb-3">시·군·구를 선택하세요</div>
              <div className="grid grid-cols-3 gap-1.5 max-h-[220px] overflow-y-auto pr-1">
                {(CITIES[cityStep==="from"?fromP:toP]||[]).map(city=>(
                  <button key={city.n} onClick={()=>handleCitySelect(city)}
                    className="px-2 py-2.5 text-[12px] font-semibold text-gray-600 border border-gray-100 rounded-xl hover:bg-[#1B2B4B] hover:text-white hover:border-[#1B2B4B] transition text-center bg-gray-50"
                  >{city.n}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ───────────── 오른쪽 지도 (60%) ───────────── */}
        <div className="flex-[6] min-w-0 rounded-2xl border border-gray-100 shadow-sm flex flex-col overflow-hidden bg-white">
          {/* 지도 헤더 */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
            {step!=="result"&&(
              <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold shadow-sm ${
                step==="from"?"bg-blue-500 text-white":"bg-orange-400 text-white"}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-white/80"/>
                {step==="from"?"출발 지역을 선택하세요":"도착 지역을 선택하세요"}
              </div>
            )}
            {step==="result"&&fromP&&toP&&(
              <div className="flex items-center gap-2 text-[13px]">
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"/>
                  <span className="font-bold text-blue-600">{fromP} {fromC?.n}</span>
                </div>
                <span className="text-gray-400">→</span>
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-400 inline-block"/>
                  <span className="font-bold text-orange-500">{toP} {toC?.n}</span>
                </div>
              </div>
            )}
            {(fromP||toP)&&<button onClick={reset} className="ml-auto text-[11px] text-gray-500 hover:text-red-500 border border-gray-200 rounded-md px-2 py-1 bg-white/80">초기화</button>}
          </div>

          {/* SVG 지도 — 패딩 없이 패널을 꽉 채움 */}
          <div className="flex-1 min-h-0">
            <svg viewBox="0 0 524 631" className="w-full h-full" preserveAspectRatio="xMidYMid meet" style={{userSelect:"none",display:"block"}}>
              <defs>
                {/* 도/시 광원 오버레이 */}
                <linearGradient id="provLight" x1="15%" y1="5%" x2="85%" y2="95%">
                  <stop offset="0%"   stopColor="white"   stopOpacity="0.5"/>
                  <stop offset="50%"  stopColor="white"   stopOpacity="0.04"/>
                  <stop offset="100%" stopColor="#0a1428" stopOpacity="0.18"/>
                </linearGradient>
                {/* 선택 글로우 */}
                <radialGradient id="selGlow" cx="38%" cy="30%" r="65%">
                  <stop offset="0%"   stopColor="white" stopOpacity="0.5"/>
                  <stop offset="100%" stopColor="white" stopOpacity="0"/>
                </radialGradient>
                {/* 기본 그림자 */}
                <filter id="provShadow" x="-4%" y="-4%" width="108%" height="108%">
                  <feDropShadow dx="0.5" dy="1.5" stdDeviation="1.5" floodColor="#4a6080" floodOpacity="0.20"/>
                </filter>
                {/* 호버 그림자 */}
                <filter id="provHover" x="-8%" y="-8%" width="116%" height="116%">
                  <feDropShadow dx="1" dy="3" stdDeviation="3" floodColor="#1B2B4B" floodOpacity="0.32"/>
                </filter>
                {/* 선택 글로우 필터 */}
                <filter id="provSel" x="-10%" y="-10%" width="120%" height="120%">
                  <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#3b82f6" floodOpacity="0.45"/>
                  <feDropShadow dx="1" dy="3" stdDeviation="2" floodColor="#1B2B4B" floodOpacity="0.25"/>
                </filter>
                {/* 화살표 머리 — 파란색 크게 */}
                <marker id="arrowHead" markerWidth="11" markerHeight="11" refX="6" refY="5.5" orient="auto">
                  <path d="M 0,1 L 10,5.5 L 0,10 Z" fill="#3b82f6"/>
                </marker>
              </defs>

              {/* 배경 — 흰색 (지도 틀에만 색이 보이도록) */}
              <rect width="524" height="631" fill="white"/>

              {/* 레이어 1: 도/시 채색 + 3D 오버레이 */}
              {provinces.map(prov=>{
                const isFrom=prov===fromP;
                const isTo=prov===toP;
                const isHover=prov===hover;
                const isActive=isFrom||isTo;
                let fill=PROVINCE_COLORS[prov]||"#c8d8e8";
                if(isFrom) fill="#3b82f6";
                else if(isTo) fill="#f97316";
                else if(isHover) fill="#9ac0e8"; // 호버 시 지역 자체를 파란색으로
                const filt=isActive?"url(#provSel)":isHover?"url(#provHover)":"url(#provShadow)";
                const sw=isActive?2:isHover?1.5:1;
                const stroke=isActive?"rgba(255,255,255,0.95)":isHover?"#4a8fcc":"rgba(255,255,255,0.8)";
                return(
                  <g key={`fill-${prov}`}>
                    <path d={PROVINCE_PATHS[prov]} fill={fill} stroke={stroke} strokeWidth={sw}
                      filter={filt} style={{cursor:"pointer",transition:"fill 0.15s,stroke 0.15s"}}
                      onMouseEnter={()=>setHover(prov)} onMouseLeave={()=>setHover(null)}
                      onClick={()=>handleProvinceClick(prov)}/>
                    <path d={PROVINCE_PATHS[prov]} fill={isActive?"url(#selGlow)":"url(#provLight)"}
                      stroke="none" style={{pointerEvents:"none"}}/>
                  </g>
                );
              })}

              {/* 레이어 2: 지역 텍스트 라벨 (비활성만) */}
              {provinces.map(prov=>{
                if(prov===fromP||prov===toP) return null;
                const isSmall=SMALL.includes(prov);
                const isHovL=prov===hover;
                const [lx,ly]=PROVINCE_LABEL_POS[prov]||[0,0];
                return(
                  <text key={`label-${prov}`}
                    x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
                    fontSize={isSmall?11:14} fontWeight={isHovL?"800":"700"}
                    fill={isHovL?"#1a5fa8":"#1B2B4B"}
                    style={{pointerEvents:"none",transition:"fill 0.15s"}}>{prov}</text>
                );
              })}

              {/* 플로팅 뱃지 — 항상 맨 위에 렌더링 */}
              {[fromP&&{prov:fromP,label:"출",color:"#3b82f6",border:"#2563eb"},
                toP&&{prov:toP,label:"하",color:"#f97316",border:"#ea580c"}]
                .filter(Boolean)
                .map(({prov,label,color,border})=>{
                  const pos=PROVINCE_LABEL_POS[prov];
                  if(!pos) return null;
                  const [bx,by]=pos;
                  const isSmall=SMALL.includes(prov);
                  const stemY=by-(isSmall?28:34);
                  return(
                    <g key={label} style={{pointerEvents:"none"}}>
                      {/* 연결 점 */}
                      <circle cx={bx} cy={by} r={5} fill={color} fillOpacity="0.85"/>
                      {/* 줄기 */}
                      <line x1={bx} y1={by-6} x2={bx} y2={stemY+22}
                        stroke={color} strokeWidth="2" strokeOpacity="0.6"/>
                      {/* 원형 뱃지 */}
                      <circle cx={bx} cy={stemY} r={20}
                        fill={color} stroke="white" strokeWidth="2.5"
                        filter="url(#provSel)"/>
                      <text x={bx} y={stemY}
                        textAnchor="middle" dominantBaseline="middle"
                        fontSize="14" fontWeight="900" fill="white">{label}</text>
                      {/* 지역명 */}
                      <rect x={bx-22} y={stemY+23} width="44" height="16" rx="8"
                        fill="white" fillOpacity="0.92" stroke={border} strokeWidth="1"/>
                      <text x={bx} y={stemY+31}
                        textAnchor="middle" dominantBaseline="middle"
                        fontSize="10" fontWeight="800" fill={border}>{prov}</text>
                    </g>
                  );
                })
              }

              {/* 레이어 4: 화살표 — 최상위 (뱃지 위에 렌더링) */}
              {arrowPath&&(
                <path d={arrowPath} fill="none" stroke="#3b82f6" strokeWidth="4"
                  strokeLinecap="round" strokeLinejoin="round"
                  markerEnd="url(#arrowHead)"/>
              )}

              {/* 호버 툴팁 */}
              {hover&&!fromP&&!toP&&(()=>{
                const[hx,hy]=PROVINCE_LABEL_POS[hover]||[0,0];
                return(
                  <g>
                    <rect x={hx-30} y={hy+17} width="60" height="18" rx="9"
                      fill="#1B2B4B" fillOpacity="0.88"/>
                    <text x={hx} y={hy+26} textAnchor="middle" dominantBaseline="middle"
                      fontSize="10" fill="white" style={{pointerEvents:"none"}}>
                      클릭 선택
                    </text>
                  </g>
                );
              })()}
            </svg>
          </div>

          {/* 범례 */}
          <div className="px-4 pb-3 border-t border-gray-100/80 flex items-center gap-4 pt-2 bg-white/30">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-blue-500"/>
              <span className="text-[10px] text-gray-500">출발지</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-orange-400"/>
              <span className="text-[10px] text-gray-500">도착지</span>
            </div>
            <div className="ml-auto text-[10px] text-gray-400">도/시 클릭 → 시/군/구 선택</div>
          </div>
        </div>
      </div>

      <div className="mt-2 text-[10px] text-gray-400 text-center">
        실거래 기반 참고 운임입니다. 실제 운임은 차량 상태·시간대·계절 등에 따라 달라질 수 있습니다.
      </div>
      </>}
    </div>
  );
}
