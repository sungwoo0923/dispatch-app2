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
  bike:0, damas:15000, "1ton":20000, "1.4ton":22000,
  "2.5ton":25000, "3.5ton":25000, "3.5tonW":28000,
  "5ton":28000, "5tonP":30000, "5tonAx":30000,
  "11ton":30000, "18ton":30000, "25ton":30000,
  trailer:35000, lowbed:40000,
};

const SURCHARGE_LIFTGATE = {
  bike:0, damas:0, "1ton":8000, "1.4ton":10000,
  "2.5ton":12000, "3.5ton":15000, "3.5tonW":15000,
  "5ton":18000, "5tonP":20000, "5tonAx":20000,
  "11ton":25000, "18ton":28000, "25ton":30000,
  trailer:0, lowbed:0,
};

const SURCHARGE_VIA = {
  bike:10000, damas:12000, "1ton":15000, "1.4ton":18000,
  "2.5ton":20000, "3.5ton":25000, "3.5tonW":25000,
  "5ton":28000, "5tonP":30000, "5tonAx":30000,
  "11ton":35000, "18ton":40000, "25ton":45000,
  trailer:50000, lowbed:50000,
};

const _provFromAddr = (addr) => {
  for (const [full, short] of Object.entries(SIDO_MAP)) {
    if (addr.includes(full)) return short;
  }
  for (const short of Object.values(SIDO_MAP)) {
    if (addr.startsWith(short + " ") || addr.startsWith(short + "　")) return short;
  }
  return null;
};

const searchTmapPOI = async (keyword, setter) => {
  if (!keyword || keyword.trim().length < 2) { setter([]); return; }
  try {
    const kw = keyword.trim();
    const headers = { Accept: "application/json" };
    const [saData, poiData] = await Promise.all([
      fetch(`https://apis.openapi.sk.com/tmap/searchAddress?version=1&format=json&queryVersion=1&fullAddrOnOff=Y&searchKeyword=${encodeURIComponent(kw)}&countPerPage=20&appKey=${TMAP_KEY}`, { headers }).then(r => r.json()).catch(() => null),
      fetch(`https://apis.openapi.sk.com/tmap/pois?version=1&format=json&searchKeyword=${encodeURIComponent(kw)}&count=15&appKey=${TMAP_KEY}`, { headers }).then(r => r.json()).catch(() => null),
    ]);

    const seen = new Set();
    const results = [];

    // 1. searchAddress 결과 (주소 레벨)
    const saRaw = saData?.searchAddressInfo?.addressInfo;
    const saArr = Array.isArray(saRaw) ? saRaw : (saRaw ? [saRaw] : []);
    for (const it of saArr) {
      if (results.length >= 10) break;
      const full = it.fullAddress || it.fullAddressRoad || "";
      if (!full || seen.has(full)) continue;
      const prov = _provFromAddr(full);
      if (!prov) continue;
      const newAddrList = it?.newAddressList?.newAddress;
      const newAddr = Array.isArray(newAddrList) ? newAddrList[0] : newAddrList;
      const la = parseFloat(newAddr?.centerLat || it.lat || it.newLat || 0);
      const lo = parseFloat(newAddr?.centerLon || it.lon || it.newLon || 0);
      if (!la || !lo) continue;
      seen.add(full);
      results.push({ name: full, prov, addr: full, full, la, lo });
    }

    // 2. POI 결과
    const poiRaw = poiData?.searchPoiInfo?.pois?.poi;
    const pois = Array.isArray(poiRaw) ? poiRaw : (poiRaw ? [poiRaw] : []);
    for (const p of pois) {
      if (results.length >= 12) break;
      const upper = p.upperAddrName || "";
      const mid = p.middleAddrName || "";
      const low = p.lowerAddrName || "";
      const full = [upper, mid, low].filter(Boolean).join(" ");
      if (!full || seen.has(full)) continue;
      const prov = SIDO_MAP[upper] || _provFromAddr(full);
      if (!prov) continue;
      const la = parseFloat(p.frontLat || p.noorLat || 0);
      const lo = parseFloat(p.frontLon || p.noorLon || 0);
      if (!la || !lo) continue;
      seen.add(full);
      results.push({ name: p.name || full, prov, addr: [mid, low].filter(Boolean).join(" "), full, la, lo });
    }

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

// ─── 전국운임조회 탭 ───────────────────────────────────────────────────────
function NationalFareTab() {
  const [vehicle,setVehicle]=useState("1ton");
  const [cargoType,setCargoType]=useState("일반");
  const [freightMode,setFreightMode]=useState("독차");
  const [step,setStep]=useState("from");
  const [fromP,setFromP]=useState(null);
  const [fromC,setFromC]=useState(null);
  const [toP,setToP]=useState(null);
  const [toC,setToC]=useState(null);
  const [hover,setHover]=useState(null);
  const [cityStep,setCityStep]=useState(null);
  const [fromSearch,setFromSearch]=useState("");
  const [fromResults,setFromResults]=useState([]);
  const [toSearch,setToSearch]=useState("");
  const [toResults,setToResults]=useState([]);
  const [manualWork,setManualWork]=useState(false);
  const [roundTrip,setRoundTrip]=useState(false);
  const [weatherSurcharge,setWeatherSurcharge]=useState(false);
  const [liftgate,setLiftgate]=useState(false);
  const [mixWeightKg,setMixWeightKg]=useState("");
  const [mixCbm,setMixCbm]=useState("");
  const [dispatchData,setDispatchData]=useState([]);
  const [vias,setVias]=useState([]);
  const [viaResults,setViaResults]=useState([]);
  const [subCityStep,setSubCityStep]=useState(null);
  const [subCity,setSubCity]=useState(null);
  const [subDistricts,setSubDistricts]=useState([]);
  const [subDistrictLoading,setSubDistrictLoading]=useState(false);
  const fromRef=useRef(null);
  const toRef=useRef(null);
  const viaTimers=useRef({});
  const fromSelectedRef=useRef(false);
  const toSelectedRef=useRef(false);
  const provinces=Object.keys(PROVINCE_PATHS);
  const SMALL=["서울","인천","세종","대전","대구","광주","울산","부산","제주"];

  useEffect(()=>{
    let c1=[],c2=[];
    const merge=()=>{const m=new Map();[...c1,...c2].forEach(r=>m.set(r._id,r));setDispatchData([...m.values()]);};
    const mapDoc=d=>({_id:d.id,...d.data()});
    const u1=onSnapshot(collection(db,"dispatch"),s=>{c1=s.docs.map(mapDoc);merge();});
    const u2=onSnapshot(collection(db,"orders"),s=>{c2=s.docs.map(mapDoc);merge();});
    return()=>{u1();u2();};
  },[]);
  useEffect(()=>{
    if(fromSelectedRef.current){fromSelectedRef.current=false;return;}
    if(!fromSearch.trim()||fromSearch.length<2){setFromResults([]);return;}
    const t=setTimeout(()=>searchTmapPOI(fromSearch,setFromResults),400);
    return()=>clearTimeout(t);
  },[fromSearch]);
  useEffect(()=>{
    if(toSelectedRef.current){toSelectedRef.current=false;return;}
    if(!toSearch.trim()||toSearch.length<2){setToResults([]);return;}
    const t=setTimeout(()=>searchTmapPOI(toSearch,setToResults),400);
    return()=>clearTimeout(t);
  },[toSearch]);
  useEffect(()=>{
    const fn=(e)=>{
      if(fromRef.current&&!fromRef.current.contains(e.target))setFromResults([]);
      if(toRef.current&&!toRef.current.contains(e.target))setToResults([]);
    };
    document.addEventListener("mousedown",fn);
    return()=>document.removeEventListener("mousedown",fn);
  },[]);
  useEffect(()=>{if(cargoType==="냉장"&&(vehicle==="bike"||vehicle==="damas"))setVehicle("1ton");},[cargoType]);

  const result=useMemo(()=>{
    if(!fromC||!toC)return null;
    const activeVias=vias.filter(v=>v.coord);
    const allPts=[fromC,...activeVias.map(v=>v.coord),toC];
    const totalStraight=allPts.length<2?0:allPts.reduce((acc,p,i)=>{
      if(i===0)return 0;
      return acc+haversine(allPts[i-1].la,allPts[i-1].lo,p.la,p.lo);
    },0);
    const viaRoadDist=activeVias.length>0?Math.round(totalStraight*1.35):null;
    let base;
    if(freightMode==="혼적"){
      const wkg=parseFloat(mixWeightKg)||0,cbm=parseFloat(mixCbm)||0;
      if(!wkg&&!cbm)return null;
      if(viaRoadDist){
        const ct=CARGO_TYPES.find(c=>c.id===cargoType)||CARGO_TYPES[0];
        const effWeight=Math.max(wkg,(cbm||0)*250);
        const tier=MIXED_TIERS.find(r=>viaRoadDist<=r.maxKm)||MIXED_TIERS[MIXED_TIERS.length-1];
        const units=Math.max(1,Math.ceil(effWeight/100));
        const raw=tier.base+tier.per100kg*(units-1);
        const avg=Math.round(raw*(1+(ct.surcharge||0))/1000)*1000;
        base={mode:"혼적",distance:viaRoadDist,min:Math.round(avg*0.85/1000)*1000,max:Math.round(avg*1.15/1000)*1000,avg,mins:Math.round(viaRoadDist/80*60),effWeight,units,tier:tier.label,per100kg:tier.per100kg};
      }else{
        base={mode:"혼적",...calcMixedRate([fromC.la,fromC.lo],[toC.la,toC.lo],cargoType,wkg,cbm)};
      }
    }else{
      if(viaRoadDist){
        const vt=VEHICLE_TYPES.find(v=>v.id===vehicle)||VEHICLE_TYPES[1];
        const ct=CARGO_TYPES.find(c=>c.id===cargoType)||CARGO_TYPES[0];
        const bFare=vt.base+vt.perKm*viaRoadDist;
        const surchargedBase=Math.max(vt.min,bFare)*(1+(ct.surcharge||0));
        const avg=Math.round(surchargedBase/5000)*5000;
        base={mode:"독차",distance:viaRoadDist,min:Math.round(avg*0.83/5000)*5000,max:Math.round(avg*1.17/5000)*5000,avg,fuelCost:Math.round(vt.L100km/100*viaRoadDist*1650),mins:Math.round(viaRoadDist/80*60)};
      }else{
        base={mode:"독차",...calcRate([fromC.la,fromC.lo],[toC.la,toC.lo],vehicle,cargoType)};
      }
    }
    const mul=roundTrip?1.8:1;
    const wMul=weatherSurcharge?1.15:1;
    const mfee=(manualWork&&freightMode==="독차")?(SURCHARGE_MANUAL[vehicle]||0):0;
    const liftFee=(liftgate&&freightMode==="독차")?(SURCHARGE_LIFTGATE[vehicle]||0):0;
    const viaFee=freightMode==="독차"?activeVias.length*(SURCHARGE_VIA[vehicle]||20000):activeVias.length*20000;
    return{...base,min:Math.round((base.min*mul*wMul+mfee+liftFee+viaFee)/1000)*1000,max:Math.round((base.max*mul*wMul+mfee+liftFee+viaFee)/1000)*1000,avg:Math.round((base.avg*mul*wMul+mfee+liftFee+viaFee)/1000)*1000,manualFee:mfee,liftFee,viaFee,isRound:roundTrip,isWeather:weatherSurcharge,viaCount:activeVias.length};
  },[fromC,toC,vehicle,cargoType,freightMode,mixWeightKg,mixCbm,manualWork,roundTrip,weatherSurcharge,liftgate,vias]);

  const refData=useMemo(()=>{
    if(!fromP||!toP||!dispatchData.length||step!=="result")return null;
    const filtered=dispatchData.filter(r=>{
      const pu=String(r.상차지명||""),dr=String(r.하차지명||"");
      return pu.includes(fromP)&&dr.includes(toP)&&Number(r.청구운임||0)>0;
    });
    if(!filtered.length)return null;
    const charges=filtered.map(r=>Number(r.청구운임||0)).filter(v=>v>0);
    const drivers=filtered.map(r=>Number(r.기사운임||0)).filter(v=>v>0);
    const stat=arr=>arr.length?{avg:Math.round(arr.reduce((a,b)=>a+b)/arr.length),min:Math.min(...arr),max:Math.max(...arr)}:null;
    return{count:filtered.length,charge:stat(charges),driver:stat(drivers)};
  },[fromP,toP,dispatchData,step]);

  const reset=useCallback(()=>{
    setStep("from");setFromP(null);setFromC(null);setToP(null);setToC(null);setCityStep(null);
    setFromSearch("");setToSearch("");setFromResults([]);setToResults([]);setMixWeightKg("");setMixCbm("");
    setVias([]);setViaResults([]);
  },[]);

  const _hasUnfilledVia = (vs) => vs.some(v => !v.coord);

  const fetchSubDistricts=async(prov,cityObj)=>{
    setSubDistrictLoading(true);
    setSubDistricts([]);
    try{
      const cityN=cityObj.n;
      const isGun=cityN.endsWith("군");
      const queries=isGun
        ?[`${prov} ${cityN} 면사무소`,`${prov} ${cityN} 읍사무소`]
        :[`${prov} ${cityN} 행정복지센터`,`${prov} ${cityN} 주민센터`];
      const allPois=await Promise.all(
        queries.map(q=>
          fetch(`https://apis.openapi.sk.com/tmap/pois?version=1&format=json&searchKeyword=${encodeURIComponent(q)}&count=200&centerLat=${cityObj.la}&centerLon=${cityObj.lo}&appKey=${TMAP_KEY}`)
            .then(r=>r.json())
            .then(d=>{const poi=d?.searchPoiInfo?.pois?.poi;if(!poi)return[];return Array.isArray(poi)?poi:[poi];})
            .catch(()=>[])
        )
      ).then(arrs=>arrs.flat());
      const seen=new Set();
      const results=[];
      for(const p of allPois){
        const low=p.lowAddrName||"";
        if(!low||seen.has(low))continue;
        const mid=p.middleAddrName||"";
        if(!cityN.endsWith("시")){
          const midNorm=mid.replace(/시$|구$|군$/,"");
          const cityNorm=cityN.replace(/시$|구$|군$/,"");
          if(!midNorm.includes(cityNorm)&&!mid.includes(cityN))continue;
        }
        seen.add(low);
        results.push({n:low,la:parseFloat(p.frontLat||p.noorLat||p.centerLat||0),lo:parseFloat(p.frontLon||p.noorLon||p.centerLon||0)});
      }
      results.sort((a,b)=>a.n.localeCompare(b.n,"ko"));
      setSubDistricts(results);
    }finally{setSubDistrictLoading(false);}
  };

  const onProvClick=(prov)=>{
    if(step==="from"){setFromP(prov);setCityStep("from");}
    else if(step==="to"){setToP(prov);setCityStep("to");}
  };
  const onCitySelect=(city)=>{
    // Show 3rd level sub-district selection
    setSubCity(city);
    setSubCityStep(cityStep);
    setCityStep(null);
    const prov=cityStep==="from"?fromP:toP;
    fetchSubDistricts(prov,city);
  };

  const onSubDistrictSelect=(sd)=>{
    const cityObj={n:`${subCity.n} ${sd.n}`,la:sd.la,lo:sd.lo};
    if(subCityStep==="from"){
      setFromC(cityObj);setFromSearch("");setSubCityStep(null);setSubCity(null);setSubDistricts([]);
      if(toC)setStep("result");
      else if(_hasUnfilledVia(vias))setStep("via");
      else setStep("to");
    }else{
      setToC(cityObj);setToSearch("");setStep("result");setSubCityStep(null);setSubCity(null);setSubDistricts([]);
    }
  };

  const onSelectWholeCity=()=>{
    const city=subCity;
    if(subCityStep==="from"){
      setFromC(city);setFromSearch("");setSubCityStep(null);setSubCity(null);setSubDistricts([]);
      if(toC)setStep("result");
      else if(_hasUnfilledVia(vias))setStep("via");
      else setStep("to");
    }else{
      setToC(city);setToSearch("");setStep("result");setSubCityStep(null);setSubCity(null);setSubDistricts([]);
    }
  };
  const selectFrom=(r)=>{
    fromSelectedRef.current=true;
    setFromP(r.prov);setFromC({n:r.addr||r.name,la:r.la,lo:r.lo});
    setFromSearch(r.full);setFromResults([]);setCityStep(null);
    if(toC) setStep("result");
    else if(_hasUnfilledVia(vias)) setStep("via");
    else setStep("to");
  };
  const selectTo=(r)=>{
    toSelectedRef.current=true;
    setToP(r.prov);setToC({n:r.addr||r.name,la:r.la,lo:r.lo});
    setToSearch(r.full);setToResults([]);setCityStep(null);
    if(fromC)setStep("result");
  };

  const addVia=useCallback(()=>{
    if(vias.length>=3)return;
    setVias(p=>[...p,{search:"",prov:null,coord:null}]);
    setViaResults(p=>[...p,[]]);
  },[vias.length]);

  const removeVia=useCallback((i)=>{
    clearTimeout(viaTimers.current[i]);
    setVias(p=>p.filter((_,j)=>j!==i));
    setViaResults(p=>p.filter((_,j)=>j!==i));
  },[]);

  const updateViaSearch=useCallback((i,val)=>{
    setVias(p=>{const n=[...p];n[i]={...n[i],search:val,prov:null,coord:null};return n;});
    setViaResults(p=>{const n=[...p];n[i]=[];return n;});
    clearTimeout(viaTimers.current[i]);
    if(val&&val.length>=2){
      viaTimers.current[i]=setTimeout(()=>{
        searchTmapPOI(val,res=>{setViaResults(p=>{const n=[...p];n[i]=res;return n;});});
      },400);
    }
  },[]);

  const selectVia=useCallback((i,r)=>{
    const newVias=[...vias];
    newVias[i]={search:r.full,prov:r.prov,coord:{la:r.la,lo:r.lo}};
    setVias(newVias);
    setViaResults(p=>{const n=[...p];n[i]=[];return n;});
    const allFilled=newVias.every(v=>v.coord);
    if(allFilled){if(toC)setStep("result");else setStep("to");}
  },[vias,toC]);

  const aFrom=fromP?PROVINCE_LABEL_POS[fromP]:null;
  const aTo=toP?PROVINCE_LABEL_POS[toP]:null;
  let aPath=null;
  const activeViaProvs=vias.filter(v=>v.prov&&PROVINCE_LABEL_POS[v.prov]);
  if(aFrom&&aTo&&step==="result"){
    const pts=[[aFrom[0],aFrom[1]-11],...activeViaProvs.map(v=>{const p=PROVINCE_LABEL_POS[v.prov];return[p[0],p[1]-11];}),[(aTo[0]),(aTo[1]-11)]];
    aPath=pts.length===2
      ?`M ${pts[0][0]},${pts[0][1]} Q ${(pts[0][0]+pts[1][0])/2},${(pts[0][1]+pts[1][1])/2-50} ${pts[1][0]},${pts[1][1]}`
      :pts.reduce((acc,p,i)=>{if(i===0)return`M ${p[0]},${p[1]}`;const prev=pts[i-1];return acc+` Q ${(prev[0]+p[0])/2},${(prev[1]+p[1])/2-30} ${p[0]},${p[1]}`;},"");
  }
  const vehicles=VEHICLE_TYPES.filter(v=>!(v.smallOnly&&cargoType==="냉장"));

  return(
    <div className="flex gap-5 min-h-0" style={{height:"calc(100vh - 220px)",minHeight:560}}>

      {/* ── 왼쪽 패널 ── */}
      <div className="flex-[4] flex flex-col gap-4 overflow-y-auto pr-1 min-w-0">

        {/* 독차/혼적 토글 */}
        <div className="flex rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {["독차","혼적"].map(m=>(
            <button key={m} onClick={()=>{setFreightMode(m);setMixWeightKg("");setMixCbm("");}}
              className={`flex-1 py-2.5 text-[13px] font-bold transition ${freightMode===m?"bg-[#1B2B4B] text-white":"bg-white text-gray-500 hover:bg-gray-50"}`}>
              {m==="혼적"?"혼적(합짐)":m}
            </button>
          ))}
        </div>

        {/* 상·하차지 */}
        <div>
          <p className="text-[13px] font-extrabold text-[#1B2B4B] mb-2">상·하차지 입력 <span className="text-red-500">*</span></p>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-visible">
            {/* 상차지 */}
            <div ref={fromRef} className="relative border-b border-gray-100">
              <div className={`flex items-center gap-3 px-4 py-3 ${step==="from"||cityStep==="from"?"bg-blue-50/50":""}`}>
                <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0"/>
                <span className="text-[11px] font-bold text-gray-400 w-10 shrink-0">상차지</span>
                {fromC&&!cityStep?(
                  <span className="font-extrabold text-[13px] text-[#1B2B4B] truncate flex-1">{fromP} {fromC.n}</span>
                ):(
                  <input
                    className="flex-1 text-[13px] bg-transparent outline-none text-[#1B2B4B] font-semibold placeholder-gray-300"
                    placeholder="지역명 또는 주소 검색"
                    value={fromSearch}
                    onChange={e=>{setFromSearch(e.target.value);if(!e.target.value){setFromP(null);setFromC(null);}}}
                    onFocus={()=>{setStep("from");}}
                  />
                )}
                {(fromC||fromSearch)&&(
                  <button className="text-gray-300 hover:text-red-400 text-lg leading-none shrink-0" onClick={e=>{e.stopPropagation();setFromP(null);setFromC(null);setFromSearch("");setFromResults([]);setStep("from");}}>×</button>
                )}
              </div>
              {fromResults.length>0&&(
                <div className="absolute left-0 right-0 top-full bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden mt-1">
                  {fromResults.map((r,i)=>(
                    <button key={i} onClick={()=>selectFrom(r)}
                      className="w-full px-4 py-2.5 text-left hover:bg-blue-50 transition border-b border-gray-50 last:border-0">
                      <div className="text-[12px] font-bold text-[#1B2B4B]">{r.name}</div>
                      <div className="text-[11px] text-gray-400">{r.full}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* 경유지 */}
            {vias.map((via,i)=>(
              <div key={i} className="relative border-t border-gray-100">
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-2 h-2 rounded-full bg-gray-400 shrink-0"/>
                  <span className="text-[11px] font-bold text-gray-400 w-10 shrink-0">경유{i+1}</span>
                  {via.coord?(
                    <span className="font-semibold text-[13px] text-[#1B2B4B] truncate flex-1">{via.search}</span>
                  ):(
                    <input
                      className="flex-1 text-[13px] bg-transparent outline-none text-[#1B2B4B] font-semibold placeholder-gray-300"
                      placeholder="경유지 검색"
                      value={via.search}
                      onChange={e=>updateViaSearch(i,e.target.value)}
                      autoFocus
                    />
                  )}
                  <button className="text-gray-300 hover:text-red-400 text-lg leading-none shrink-0" onClick={e=>{e.stopPropagation();removeVia(i);}}>×</button>
                </div>
                {(viaResults[i]||[]).length>0&&(
                  <div className="absolute left-0 right-0 top-full bg-white border border-gray-200 rounded-xl shadow-xl z-[60] overflow-hidden mt-1">
                    {(viaResults[i]||[]).map((r,j)=>(
                      <button key={j} onClick={()=>selectVia(i,r)}
                        className="w-full px-4 py-2.5 text-left hover:bg-gray-50 transition border-b border-gray-50 last:border-0">
                        <div className="text-[12px] font-bold text-[#1B2B4B]">{r.name}</div>
                        <div className="text-[11px] text-gray-400">{r.full}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {/* 하차지 */}
            <div ref={toRef} className="relative border-t border-gray-100">
              <div className={`flex items-center gap-3 px-4 py-3 ${step==="to"||cityStep==="to"?"bg-orange-50/50":""}`}>
                <div className="w-2 h-2 rounded-full bg-orange-400 shrink-0"/>
                <span className="text-[11px] font-bold text-gray-400 w-10 shrink-0">하차지</span>
                {toC&&!cityStep?(
                  <span className="font-extrabold text-[13px] text-[#1B2B4B] truncate flex-1">{toP} {toC.n}</span>
                ):(
                  <input
                    className="flex-1 text-[13px] bg-transparent outline-none text-[#1B2B4B] font-semibold placeholder-gray-300"
                    placeholder="지역명 또는 주소 검색"
                    value={toSearch}
                    onChange={e=>{setToSearch(e.target.value);if(!e.target.value){setToP(null);setToC(null);}}}
                    onFocus={()=>{if(fromC||fromSearch)setStep("to");}}
                    disabled={!fromC&&!fromSearch}
                  />
                )}
                {(toC||toSearch)&&(
                  <button className="text-gray-300 hover:text-red-400 text-lg leading-none shrink-0" onClick={e=>{e.stopPropagation();setToP(null);setToC(null);setToSearch("");setToResults([]);setStep("to");}}>×</button>
                )}
              </div>
              {toResults.length>0&&(
                <div className="absolute left-0 right-0 top-full bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden mt-1">
                  {toResults.map((r,i)=>(
                    <button key={i} onClick={()=>selectTo(r)}
                      className="w-full px-4 py-2.5 text-left hover:bg-orange-50 transition border-b border-gray-50 last:border-0">
                      <div className="text-[12px] font-bold text-[#1B2B4B]">{r.name}</div>
                      <div className="text-[11px] text-gray-400">{r.full}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            {vias.length<3&&(
              <button onClick={addVia} className="text-[11px] font-semibold text-[#1B2B4B]/70 hover:text-[#1B2B4B] border border-dashed border-[#1B2B4B]/30 hover:border-[#1B2B4B]/60 rounded-lg px-2.5 py-1 transition">+ 경유 추가</button>
            )}
            {(fromP||toP||vias.length>0)&&<button onClick={reset} className="text-[11px] text-gray-400 hover:text-red-500 transition">초기화</button>}
          </div>
        </div>

        {/* 독차: 차량 선택 */}
        {freightMode==="독차"&&(
          <div>
            <p className="text-[13px] font-extrabold text-[#1B2B4B] mb-2">차량 선택 <span className="text-red-500">*</span></p>
            <div className="grid grid-cols-5 gap-2">
              {vehicles.map(v=>(
                <button key={v.id} onClick={()=>setVehicle(v.id)}
                  className={`flex flex-col items-center py-3 px-1 rounded-xl border-2 transition ${vehicle===v.id?"bg-[#1B2B4B] border-[#1B2B4B] shadow-lg":"bg-white border-gray-200 hover:border-[#1B2B4B]/50"}`}>
                  <div className="w-full flex justify-center mb-1.5 overflow-hidden" style={{height:30}}>
                    <VehicleIconSvg id={v.id} sel={vehicle===v.id}/>
                  </div>
                  <span className={`text-[11px] font-bold text-center leading-tight ${vehicle===v.id?"text-white":"text-gray-700"}`}>
                    {v.name.replace("(광폭)","(광)").replace("(합짐)","+")}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">차량 선택이 어렵다면 상단 차량제원 탭을 참고하세요.</p>
          </div>
        )}

        {/* 혼적: 중량/CBM */}
        {freightMode==="혼적"&&(
          <div>
            <p className="text-[13px] font-extrabold text-[#1B2B4B] mb-2">화물 중량 / 부피</p>
            <div className="flex gap-3 bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex-1">
                <label className="block text-[11px] font-bold text-gray-400 mb-1.5">중량 (kg)</label>
                <input type="number" min="0" placeholder="예: 500" value={mixWeightKg}
                  onChange={e=>{setMixWeightKg(e.target.value);if(e.target.value)setMixCbm("");}}
                  className="w-full px-3 py-2.5 border-2 border-gray-100 rounded-xl text-[13px] font-bold text-[#1B2B4B] focus:outline-none focus:border-[#1B2B4B]"/>
              </div>
              <div className="flex items-end pb-2.5 text-gray-300 text-[12px]">또는</div>
              <div className="flex-1">
                <label className="block text-[11px] font-bold text-gray-400 mb-1.5">CBM (㎥)</label>
                <input type="number" min="0" step="0.1" placeholder="예: 2.5" value={mixCbm}
                  onChange={e=>{setMixCbm(e.target.value);if(e.target.value)setMixWeightKg("");}}
                  className="w-full px-3 py-2.5 border-2 border-gray-100 rounded-xl text-[13px] font-bold text-[#1B2B4B] focus:outline-none focus:border-[#1B2B4B]"/>
              </div>
            </div>
            <div className="mt-2 text-[11px] text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
              혼적 요율: 100km 이하 기본 28,000원+100kg당 3,500원 · 300km+ 기본 78,000원+100kg당 12,000원
            </div>
          </div>
        )}

        {/* 화물 유형 */}
        <div>
          <p className="text-[13px] font-extrabold text-[#1B2B4B] mb-2">화물 유형</p>
          <div className="flex gap-2">
            {CARGO_TYPES.map(ct=>(
              <button key={ct.id} onClick={()=>setCargoType(ct.id)}
                className={`flex-1 py-2.5 rounded-xl text-[13px] font-bold border-2 transition ${cargoType===ct.id?"bg-[#1B2B4B] text-white border-[#1B2B4B] shadow-md":"bg-white text-gray-500 border-gray-200 hover:border-[#1B2B4B]/40"}`}>
                {ct.name}
              </button>
            ))}
          </div>
        </div>

        {/* 추가 옵션 */}
        {freightMode==="독차"&&(
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-[12px] font-bold text-[#1B2B4B] mb-2.5">추가 옵션</p>
            <div className="flex flex-wrap gap-2">
              {[
                {id:"roundTrip",label:"왕복 운행",sub:"×1.8",active:roundTrip,set:()=>setRoundTrip(p=>!p)},
                {id:"manualWork",label:"수작업(상하차)",sub:SURCHARGE_MANUAL[vehicle]>0?`+${Number((SURCHARGE_MANUAL[vehicle]/10000).toFixed(1))}만원`:null,active:manualWork,set:()=>setManualWork(p=>!p)},
                {id:"weather",label:"기상악화",sub:"+15%",active:weatherSurcharge,set:()=>setWeatherSurcharge(p=>!p)},
                {id:"liftgate",label:"리프트",sub:SURCHARGE_LIFTGATE[vehicle]>0?`+${Number((SURCHARGE_LIFTGATE[vehicle]/10000).toFixed(1))}만원`:null,active:liftgate,set:()=>setLiftgate(p=>!p)},
              ].map(opt=>(
                <button key={opt.id} onClick={opt.set}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-bold border-2 transition ${opt.active?"bg-[#1B2B4B] text-white border-[#1B2B4B]":"bg-white text-gray-500 border-gray-200 hover:border-[#1B2B4B]/40"}`}>
                  {opt.label}
                  {opt.sub&&<span className={`text-[11px] font-semibold ${opt.active?"text-white/70":"text-gray-400"}`}>{opt.sub}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 결과 카드 */}
        {result&&step==="result"&&(
          <div className="rounded-2xl overflow-hidden shadow-xl border border-[#1B2B4B]/10"
            style={{background:"linear-gradient(150deg,#0f1e38 0%,#1B2B4B 50%,#243a60 100%)"}}>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full ${result.mode==="혼적"?"bg-orange-400/90":"bg-blue-400/90"} text-white`}>
                  {result.mode==="혼적"?"혼적(합짐)":"독차"}
                </span>
                {result.isRound&&<span className="text-[10px] font-bold px-2 py-1 rounded-full bg-white/20 text-white">왕복</span>}
                {result.manualFee>0&&<span className="text-[10px] font-bold px-2 py-1 rounded-full bg-white/20 text-white">수작업</span>}
                {result.liftFee>0&&<span className="text-[10px] font-bold px-2 py-1 rounded-full bg-white/20 text-white">리프트</span>}
                {result.isWeather&&<span className="text-[10px] font-bold px-2 py-1 rounded-full bg-white/20 text-white">기상악화+15%</span>}
                {result.viaCount>0&&<span className="text-[10px] font-bold px-2 py-1 rounded-full bg-white/20 text-white">경유{result.viaCount}</span>}
                <span className="text-[10px] text-white/40 font-semibold ml-auto">{result.mode==="독차"?VEHICLE_TYPES.find(v=>v.id===vehicle)?.name:""} {fromP}→{toP}</span>
              </div>
              <div className="mb-3">
                <div className="text-[10px] text-white/40 font-semibold mb-1">예상 운임 (VAT 별도)</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[24px] font-black text-white">{fmtMoney(result.min)}</span>
                  <span className="text-white/30 text-[18px]">~</span>
                  <span className="text-[24px] font-black text-white">{fmtMoney(result.max)}</span>
                </div>
              </div>
              <div className="bg-white/8 rounded-xl p-3 mb-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px] text-white/50 font-semibold">평균 운임</span>
                  <span className="text-[20px] font-black text-yellow-300">{fmtMoney(result.avg)}</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full"><div className="h-full bg-gradient-to-r from-blue-400 to-yellow-300 rounded-full" style={{width:"55%"}}/></div>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {[
                  {l:"거리",v:`약 ${result.distance}km`},
                  {l:"예상시간",v:fmtTime(result.mins)},
                  ...(result.mode==="독차"?[{l:"연료비",v:`${result.fuelCost?.toLocaleString()}원`},{l:"차종",v:VEHICLE_TYPES.find(v=>v.id===vehicle)?.name}]
                    :[{l:"적재단위",v:`${result.units}개`},{l:"구간",v:result.tier}]),
                  ...(result.manualFee>0?[{l:"수작업비",v:`${result.manualFee.toLocaleString()}원`}]:[]),
                  ...(result.liftFee>0?[{l:"리프트",v:`${result.liftFee.toLocaleString()}원`}]:[]),
                  ...(result.isWeather?[{l:"기상악화",v:"+15%"}]:[]),
                  ...(result.isRound?[{l:"왕복적용",v:"×1.8"}]:[]),
                  ...(result.viaCount>0?[{l:"경유지",v:`${result.viaCount}곳 (+${Number((result.viaFee/10000).toFixed(0))}만원)`}]:[]),
                ].map(({l,v})=>(
                  <div key={l} className="bg-white/6 rounded-xl px-3 py-2">
                    <div className="text-[9px] text-white/35 font-semibold">{l}</div>
                    <div className="text-[12px] font-bold text-white/85">{v}</div>
                  </div>
                ))}
              </div>

              {/* 자사 실데이터 참고 운임 */}
              {refData&&(
                <div className="mt-3 border-t border-white/10 pt-3">
                  <div className="text-[10px] text-white/40 font-semibold mb-2">자사 실거래 참고 ({refData.count}건)</div>
                  <div className="grid grid-cols-2 gap-2">
                    {refData.charge&&(
                      <div className="bg-white/6 rounded-xl px-3 py-2">
                        <div className="text-[9px] text-white/35 font-semibold mb-1">청구운임</div>
                        <div className="text-[11px] font-bold text-blue-300">{fmtMoney(refData.charge.avg)} 평균</div>
                        <div className="text-[10px] text-white/40">{fmtMoney(refData.charge.min)}~{fmtMoney(refData.charge.max)}</div>
                      </div>
                    )}
                    {refData.driver&&(
                      <div className="bg-white/6 rounded-xl px-3 py-2">
                        <div className="text-[9px] text-white/35 font-semibold mb-1">기사운임</div>
                        <div className="text-[11px] font-bold text-green-300">{fmtMoney(refData.driver.avg)} 평균</div>
                        <div className="text-[10px] text-white/40">{fmtMoney(refData.driver.min)}~{fmtMoney(refData.driver.max)}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2 mt-3">
                <button onClick={reset} className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/18 text-white text-[12px] font-bold transition">다시 조회</button>
                <button onClick={()=>navigator.clipboard.writeText(`[운임견적]\n경로: ${fromP} ${fromC?.n||""}→${toP} ${toC?.n||""}\n차종: ${VEHICLE_TYPES.find(v=>v.id===vehicle)?.name||""}\n예상운임: ${fmtMoney(result.min)}~${fmtMoney(result.max)} (평균 ${fmtMoney(result.avg)})\n거리: 약${result.distance}km\n※VAT별도·참고시세`).catch(()=>{})}
                  className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/18 text-white/70 text-[12px] font-bold transition">복사</button>
              </div>
            </div>
          </div>
        )}

        {/* 시군구 선택 (지도 클릭 시) */}
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
        {/* 읍/면/동 선택 (3단계) */}
        {subCityStep&&(
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-extrabold shrink-0 ${subCityStep==="from"?"bg-[#1B2B4B]":"bg-orange-400"}`}>
                {subCityStep==="from"?"출":"하"}
              </div>
              <span className="text-[14px] font-extrabold text-[#1B2B4B]">{subCity?.n}</span>
              <span className="text-[11px] text-gray-400 ml-1">세부 지역</span>
              <button className="ml-auto text-[11px] text-gray-400 hover:text-[#1B2B4B] border border-gray-200 rounded-lg px-2.5 py-1"
                onClick={()=>{setSubCityStep(null);setSubCity(null);setSubDistricts([]);setCityStep(subCityStep==="from"?"from":"to");}}>← 재선택</button>
            </div>
            {subDistrictLoading?(
              <div className="text-center py-4 text-[12px] text-gray-400">읍/면/동 로딩 중...</div>
            ):(
              <div className="grid grid-cols-3 gap-1.5 max-h-[240px] overflow-y-auto">
                <button onClick={onSelectWholeCity}
                  className="px-2 py-2 text-[11px] font-extrabold text-[#1B2B4B] border-2 border-[#1B2B4B]/30 rounded-xl hover:bg-[#1B2B4B] hover:text-white hover:border-[#1B2B4B] transition bg-blue-50/50 col-span-1">
                  {subCity?.n} 전체
                </button>
                {subDistricts.map(sd=>(
                  <button key={sd.n} onClick={()=>onSubDistrictSelect(sd)}
                    className="px-2 py-2 text-[11px] font-semibold text-gray-600 border border-gray-100 rounded-xl hover:bg-[#1B2B4B] hover:text-white hover:border-[#1B2B4B] transition bg-gray-50">
                    {sd.n}
                  </button>
                ))}
                {!subDistrictLoading&&subDistricts.length===0&&(
                  <div className="col-span-3 text-center text-[11px] text-gray-400 py-2">세부 지역 정보 없음</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 오른쪽 지도 ── */}
      <div className="flex-[6] min-w-0 rounded-2xl border border-gray-200 shadow-sm flex flex-col overflow-hidden bg-white">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-3 shrink-0">
          {step!=="result"&&(
            <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold ${step==="from"?"bg-[#1B2B4B] text-white":step==="via"?"bg-green-600 text-white":"bg-orange-400 text-white"}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-white/80"/>
              {step==="from"?"출발 지역을 선택하세요":step==="via"?"경유지를 입력하세요":"도착 지역을 선택하세요"}
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
                <stop offset="0%" stopColor="white" stopOpacity="0.5"/>
                <stop offset="50%" stopColor="white" stopOpacity="0.04"/>
                <stop offset="100%" stopColor="#0a1428" stopOpacity="0.18"/>
              </linearGradient>
              <radialGradient id="nfGlow" cx="38%" cy="30%" r="65%">
                <stop offset="0%" stopColor="white" stopOpacity="0.5"/>
                <stop offset="100%" stopColor="white" stopOpacity="0"/>
              </radialGradient>
              <filter id="nfShad" x="-4%" y="-4%" width="108%" height="108%">
                <feDropShadow dx="0.5" dy="1.5" stdDeviation="1.5" floodColor="#4a6080" floodOpacity="0.20"/>
              </filter>
              <filter id="nfHov" x="-8%" y="-8%" width="116%" height="116%">
                <feDropShadow dx="1" dy="3" stdDeviation="3" floodColor="#1B2B4B" floodOpacity="0.32"/>
              </filter>
              <filter id="nfSel" x="-10%" y="-10%" width="120%" height="120%">
                <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#3b82f6" floodOpacity="0.45"/>
                <feDropShadow dx="1" dy="3" stdDeviation="2" floodColor="#1B2B4B" floodOpacity="0.25"/>
              </filter>
              <marker id="nfArr" markerWidth="11" markerHeight="11" refX="6" refY="5.5" orient="auto">
                <path d="M 0,1 L 10,5.5 L 0,10 Z" fill="#3b82f6"/>
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
                    filter={isAct?"url(#nfSel)":isHov?"url(#nfHov)":"url(#nfShad)"}
                    style={{cursor:"pointer",transition:"fill 0.15s,stroke 0.15s"}}
                    onMouseEnter={()=>setHover(prov)} onMouseLeave={()=>setHover(null)}
                    onClick={()=>onProvClick(prov)}/>
                  <path d={PROVINCE_PATHS[prov]} fill={isAct?"url(#nfGlow)":"url(#nfLight)"} stroke="none" style={{pointerEvents:"none"}}/>
                </g>
              );
            })}
            {provinces.map(prov=>{
              if(prov===fromP||prov===toP) return null;
              const isSmall=SMALL.includes(prov),isHovL=prov===hover;
              const[lx,ly]=PROVINCE_LABEL_POS[prov]||[0,0];
              return(
                <text key={`nl-${prov}`} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
                  fontSize={isSmall?11:14} fontWeight={isHovL?"800":"700"}
                  fill={isHovL?"#1a5fa8":"#1B2B4B"} style={{pointerEvents:"none",transition:"fill 0.15s"}}>{prov}</text>
              );
            })}
            {[fromP&&{prov:fromP,label:"출",color:"#3b82f6",border:"#2563eb"},toP&&{prov:toP,label:"하",color:"#f97316",border:"#ea580c"}]
              .filter(Boolean).map(({prov,label,color,border})=>{
                const pos=PROVINCE_LABEL_POS[prov];if(!pos)return null;
                const[bx,by]=pos,stemY=by-(SMALL.includes(prov)?28:34);
                return(
                  <g key={label} style={{pointerEvents:"none"}}>
                    <circle cx={bx} cy={by} r={5} fill={color} fillOpacity="0.85"/>
                    <line x1={bx} y1={by-6} x2={bx} y2={stemY+22} stroke={color} strokeWidth="2" strokeOpacity="0.6"/>
                    <circle cx={bx} cy={stemY} r={20} fill={color} stroke="white" strokeWidth="2.5" filter="url(#nfSel)"/>
                    <text x={bx} y={stemY} textAnchor="middle" dominantBaseline="middle" fontSize="13" fontWeight="900" fill="white">{label}</text>
                    <rect x={bx-22} y={stemY+23} width="44" height="16" rx="8" fill="white" fillOpacity="0.92" stroke={border} strokeWidth="1"/>
                    <text x={bx} y={stemY+31} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="800" fill={border}>{prov}</text>
                  </g>
                );
              })}
            {activeViaProvs.map((via,i)=>{
              const pos=PROVINCE_LABEL_POS[via.prov];if(!pos)return null;
              const[bx,by]=pos,stemY=by-(SMALL.includes(via.prov)?22:28);
              return(
                <g key={`via-${i}`} style={{pointerEvents:"none"}}>
                  <circle cx={bx} cy={stemY} r={14} fill="#6b7280" stroke="white" strokeWidth="2" filter="url(#nfSel)"/>
                  <text x={bx} y={stemY} textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="900" fill="white">경{i+1}</text>
                </g>
              );
            })}
            {aPath&&<path d={aPath} fill="none" stroke="#3b82f6" strokeWidth="3.5" strokeLinecap="round" markerEnd="url(#nfArr)"/>}
          </svg>
        </div>
        <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"/><span className="text-[11px] font-semibold text-gray-500">출발지</span></div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-400 inline-block"/><span className="text-[11px] font-semibold text-gray-500">도착지</span></div>
          <span className="ml-auto text-[10px] text-gray-300">지역 클릭 또는 직접 입력 → 운임 확인</span>
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
  const [activeTab,setActiveTab]=useState("전국운임조회");
  return(
    <div className="w-full">
      <div className="flex items-center gap-1 mb-5 border-b border-gray-200">
        {["전국운임조회","자사운임표","차량제원"].map(tab=>(
          <button key={tab} onClick={()=>setActiveTab(tab)}
            className={`px-5 py-2.5 text-[14px] font-extrabold transition border-b-2 -mb-px ${activeTab===tab?"border-[#1B2B4B] text-[#1B2B4B]":"border-transparent text-gray-400 hover:text-gray-600"}`}>
            {tab}
          </button>
        ))}
      </div>
      {activeTab==="전국운임조회"&&<NationalFareTab/>}
      {activeTab==="자사운임표"&&<CompanyFareTab/>}
      {activeTab==="차량제원"&&<PalletSimulator/>}
    </div>
  );
}
