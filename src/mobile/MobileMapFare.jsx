import React, { useState, useMemo } from "react";
import southKorea from "@svg-maps/south-korea";

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
  서울:[152,127], 인천:[100,140], 경기:[182,168],
  강원:[298,100], 충북:[248,212], 충남:[120,258],
  세종:[178,256], 대전:[194,277], 경북:[368,252],
  대구:[298,338], 전북:[163,345], 광주:[140,408],
  전남:[118,452], 경남:[282,400], 울산:[364,368],
  부산:[344,404], 제주:[112,611],
};

const PROVINCE_COLORS = {
  경기:"#c4d8d0", 서울:"#b8cce0", 인천:"#b8cce0",
  강원:"#b8ccd8", 충북:"#d4cce4", 충남:"#c4d8c4",
  세종:"#c8d4c8", 대전:"#c4ccd8", 경북:"#e4d0c0",
  대구:"#dcc0b4", 전북:"#e0e0c0", 광주:"#c0d8bc",
  전남:"#c4d8c0", 경남:"#c0d0e4", 울산:"#bccce0",
  부산:"#b8c8e0", 제주:"#e4e0b4",
};

const PROVINCE_COORDS = {
  서울:[37.5665,126.978], 인천:[37.4563,126.705], 경기:[37.4138,127.518],
  강원:[37.822,128.155], 충북:[36.636,127.491], 충남:[36.659,126.673],
  세종:[36.480,127.289], 대전:[36.350,127.384], 경북:[36.492,128.889],
  대구:[35.871,128.601], 전북:[35.820,127.109], 광주:[35.160,126.853],
  전남:[34.868,126.991], 경남:[35.461,128.213], 울산:[35.538,129.311],
  부산:[35.180,129.076], 제주:[33.489,126.498],
};

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

const VEHICLE_TYPES = [
  {id:"1ton",    name:"1톤",    base:20000, perKm:690,  min:50000},
  {id:"1.4ton",  name:"1.4톤",  base:24000, perKm:780,  min:60000},
  {id:"2.5ton",  name:"2.5톤",  base:32000, perKm:980,  min:80000},
  {id:"3.5ton",  name:"3.5톤",  base:38000, perKm:1100, min:100000},
  {id:"3.5tonW", name:"3.5톤(광폭)", base:42000, perKm:1200, min:110000},
  {id:"5ton",    name:"5톤",    base:48000, perKm:1280, min:120000},
  {id:"5tonP",   name:"5톤+",   base:52000, perKm:1380, min:130000},
  {id:"5tonAx",  name:"5톤+축", base:56000, perKm:1480, min:140000},
  {id:"11ton",   name:"11톤",   base:68000, perKm:1680, min:180000},
  {id:"18ton",   name:"18톤",   base:86000, perKm:2100, min:240000},
  {id:"25ton",   name:"25톤",   base:108000,perKm:2380, min:300000},
  {id:"trailer", name:"추레라", base:125000,perKm:2600, min:350000},
  {id:"lowbed",  name:"로베드", base:135000,perKm:2800, min:380000},
];

function haversine(la1, lo1, la2, lo2) {
  const R = 6371, d1 = (la2-la1)*Math.PI/180, d2 = (lo2-lo1)*Math.PI/180;
  const a = Math.sin(d1/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(d2/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function calcRate(fromCoord, toCoord, vtId) {
  const [la1,lo1] = fromCoord, [la2,lo2] = toCoord;
  const roadDist = Math.round(haversine(la1,lo1,la2,lo2)*1.35);
  const vt = VEHICLE_TYPES.find(v=>v.id===vtId) || VEHICLE_TYPES[0];
  const base = vt.base + vt.perKm * roadDist;
  const avg = Math.round(Math.max(vt.min, base) / 5000) * 5000;
  const minFare = Math.round(avg * 0.83 / 5000) * 5000;
  const maxFare = Math.round(avg * 1.17 / 5000) * 5000;
  const mins = Math.round(roadDist / 80 * 60);
  return { distance: roadDist, min: minFare, max: maxFare, avg, mins };
}

const fmtMoney = (n) => {
  if (n >= 10000) { const v = n/10000; return v%1===0 ? `${v}만원` : `${v.toFixed(1)}만원`; }
  return `${n.toLocaleString()}원`;
};
const fmtTime = (m) => { const h=Math.floor(m/60); const mm=m%60; return h>0 ? `${h}h ${mm}m` : `${mm}m`; };

// "출발/도착" step badge
function StepBadge({ label, done, active, prov, city, onClear }) {
  return (
    <div className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border-2 transition ${
      active ? "border-[#1B2B4B] bg-[#1B2B4B]/5" : done ? "border-blue-300 bg-blue-50/60" : "border-gray-200 bg-gray-50"
    }`}>
      <div className={`w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0 ${
        active ? "bg-[#1B2B4B] text-white" : done ? "bg-blue-400 text-white" : "bg-gray-200 text-gray-500"
      }`}>{label[0]}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-gray-400 font-semibold">{label}</div>
        {city
          ? <div className="text-[12px] font-bold text-[#1B2B4B] truncate">{prov} {city.n}</div>
          : prov
          ? <div className="text-[11px] text-[#1B2B4B]">{prov} 선택 중</div>
          : <div className="text-[11px] text-gray-400">지도에서 선택</div>
        }
      </div>
      {done && (
        <button onClick={onClear} className="text-gray-300 hover:text-red-400 text-[18px] leading-none">×</button>
      )}
    </div>
  );
}

export default function MobileMapFare() {
  const [step, setStep] = useState("from");
  const [fromP, setFromP] = useState(null);
  const [fromC, setFromC] = useState(null);
  const [toP, setToP] = useState(null);
  const [toC, setToC] = useState(null);
  const [vehicle, setVehicle] = useState("1ton");
  const [zoom, setZoom] = useState(1);
  const [showProvList, setShowProvList] = useState(false);

  const provinces = Object.keys(PROVINCE_PATHS);

  const vbW = 524 / zoom;
  const vbH = 631 / zoom;
  const vbX = (524 - vbW) / 2;
  const vbY = (631 - vbH) / 2;
  const viewBox = `${vbX} ${vbY} ${vbW} ${vbH}`;

  const result = useMemo(() => {
    if (!fromC || !toC) return null;
    return calcRate([fromC.la, fromC.lo], [toC.la, toC.lo], vehicle);
  }, [fromC, toC, vehicle]);

  const reset = () => { setStep("from"); setFromP(null); setFromC(null); setToP(null); setToC(null); };

  const handleProvinceClick = (prov) => {
    if (step === "from") { setFromP(prov); setStep("from-city"); }
    else if (step === "to") { setToP(prov); setStep("to-city"); }
  };

  const handleCitySelect = (city) => {
    if (step === "from-city") { setFromC(city); setStep("to"); }
    else if (step === "to-city") { setToC(city); setStep("result"); }
  };

  const showMap = step === "from" || step === "to";
  const showFromCityList = step === "from-city";
  const showToCityList = step === "to-city";
  const isFromStep = step === "from" || step === "from-city";

  return (
    <div className="px-4 py-4 space-y-3">
      {/* 경로 상태 바 */}
      <div className="flex items-center gap-2">
        <StepBadge
          label="출발"
          done={!!fromC}
          active={step==="from"||step==="from-city"}
          prov={fromP}
          city={fromC}
          onClear={() => { setFromP(null); setFromC(null); setToP(null); setToC(null); setStep("from"); }}
        />
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2" className="flex-shrink-0">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
        <StepBadge
          label="도착"
          done={!!toC}
          active={step==="to"||step==="to-city"}
          prov={toP}
          city={toC}
          onClear={() => { setToP(null); setToC(null); setStep(fromC ? "to" : "from"); }}
        />
        {(fromC || toC) && (
          <button onClick={reset} className="text-[11px] text-gray-400 border border-gray-200 rounded-lg px-2 py-1.5 flex-shrink-0">초기화</button>
        )}
      </div>

      {/* 지도 */}
      {showMap && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className={`px-4 py-2.5 text-[12px] font-bold border-b border-gray-50 flex items-center justify-between ${
            isFromStep ? "bg-blue-50 text-[#1B2B4B]" : "bg-orange-50 text-orange-600"
          }`}>
            <span>{isFromStep ? "출발 도/시를 선택하세요" : "도착 도/시를 선택하세요"}</span>
            {/* 줌 컨트롤 */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setZoom(z => Math.min(3, parseFloat((z * 1.5).toFixed(2))))}
                className="w-7 h-7 rounded-lg bg-white/80 border border-gray-200 text-[#1B2B4B] font-bold text-[14px] flex items-center justify-center shadow-sm"
              >+</button>
              {zoom > 1 && (
                <button
                  onClick={() => setZoom(1)}
                  className="h-7 px-2 rounded-lg bg-white/80 border border-gray-200 text-gray-500 text-[10px] font-bold flex items-center shadow-sm"
                >원래</button>
              )}
              <button
                onClick={() => setZoom(z => Math.max(1, parseFloat((z / 1.5).toFixed(2))))}
                disabled={zoom <= 1}
                className="w-7 h-7 rounded-lg bg-white/80 border border-gray-200 text-[#1B2B4B] font-bold text-[16px] flex items-center justify-center shadow-sm disabled:opacity-30"
              >−</button>
            </div>
          </div>
          <svg
            viewBox={viewBox}
            className="w-full"
            style={{ maxHeight: "54vw", touchAction: "none" }}
          >
            {provinces.map(prov => {
              const pos = PROVINCE_LABEL_POS[prov];
              const isFrom = fromP === prov && (step === "from-city" || step === "to" || step === "result");
              const isTo = toP === prov && (step === "to-city" || step === "result");
              const isActive = (step === "from" && fromP === prov) || (step === "to" && toP === prov);
              const fill = isFrom ? "#1B2B4B" : isTo ? "#f97316" : isActive ? "#3d5a8a" : PROVINCE_COLORS[prov] || "#d0d8e0";
              const textFill = (isFrom || isTo || isActive) ? "white" : "#1B2B4B";
              const labelSize = zoom >= 2 ? "11" : zoom >= 1.5 ? "10" : "9";
              return (
                <g key={prov} onClick={() => handleProvinceClick(prov)} style={{ cursor: "pointer" }}>
                  <path d={PROVINCE_PATHS[prov]} fill={fill} stroke="white" strokeWidth="1.5" style={{ transition: "fill .15s" }} />
                  {pos && (
                    <text
                      x={pos[0]} y={pos[1]}
                      textAnchor="middle"
                      fontSize={labelSize}
                      fontWeight="700"
                      fill={textFill}
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >{prov}</text>
                  )}
                </g>
              );
            })}
          </svg>
          {/* 지역 목록 토글 */}
          <div className="border-t border-gray-100 px-4 py-2">
            <button
              onClick={() => setShowProvList(p => !p)}
              className="w-full text-[12px] text-gray-500 font-semibold flex items-center justify-between"
            >
              <span>지역 목록으로 선택</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: showProvList ? "rotate(180deg)" : "none", transition: "transform .2s" }}>
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>
            {showProvList && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {provinces.map(prov => {
                  const isFrom = fromP === prov && (step === "from-city" || step === "to" || step === "result");
                  const isTo = toP === prov && (step === "to-city" || step === "result");
                  return (
                    <button
                      key={prov}
                      onClick={() => handleProvinceClick(prov)}
                      className={`px-3 py-1.5 rounded-full text-[12px] font-bold border transition ${
                        isFrom ? "bg-[#1B2B4B] text-white border-[#1B2B4B]"
                        : isTo ? "bg-orange-400 text-white border-orange-400"
                        : "bg-white text-[#1B2B4B] border-[#1B2B4B]/30 hover:bg-[#1B2B4B]/5"
                      }`}
                    >{prov}</button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 시군구 선택 (출발) */}
      {showFromCityList && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-7 h-7 rounded-full bg-[#1B2B4B] flex items-center justify-center text-white text-[11px] font-bold">출</div>
            <span className="text-[15px] font-bold text-[#1B2B4B]">{fromP}</span>
            <button
              onClick={() => { setFromP(null); setStep("from"); }}
              className="ml-auto text-[11px] text-gray-400 border border-gray-200 rounded-lg px-3 py-1 font-semibold"
            >← 재선택</button>
          </div>
          <div className="text-[12px] text-gray-400 mb-3">시·군·구를 선택하세요</div>
          <div className="grid grid-cols-3 gap-1.5 max-h-[260px] overflow-y-auto pr-1">
            {(CITIES[fromP] || []).map(city => (
              <button
                key={city.n}
                onClick={() => handleCitySelect(city)}
                className="px-2 py-2.5 text-[12px] font-semibold text-gray-600 border border-gray-100 rounded-xl hover:bg-[#1B2B4B] hover:text-white hover:border-[#1B2B4B] transition text-center bg-gray-50"
              >{city.n}</button>
            ))}
          </div>
        </div>
      )}

      {/* 시군구 선택 (도착) */}
      {showToCityList && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-7 h-7 rounded-full bg-orange-400 flex items-center justify-center text-white text-[11px] font-bold">하</div>
            <span className="text-[15px] font-bold text-[#1B2B4B]">{toP}</span>
            <button
              onClick={() => { setToP(null); setStep("to"); }}
              className="ml-auto text-[11px] text-gray-400 border border-gray-200 rounded-lg px-3 py-1 font-semibold"
            >← 재선택</button>
          </div>
          <div className="text-[12px] text-gray-400 mb-3">시·군·구를 선택하세요</div>
          <div className="grid grid-cols-3 gap-1.5 max-h-[260px] overflow-y-auto pr-1">
            {(CITIES[toP] || []).map(city => (
              <button
                key={city.n}
                onClick={() => handleCitySelect(city)}
                className="px-2 py-2.5 text-[12px] font-semibold text-gray-600 border border-gray-100 rounded-xl hover:bg-[#1B2B4B] hover:text-white hover:border-[#1B2B4B] transition text-center bg-gray-50"
              >{city.n}</button>
            ))}
          </div>
        </div>
      )}

      {/* 차량 종류 + 결과 */}
      {step === "result" && fromC && toC && (
        <>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="text-[11px] font-bold text-gray-400 mb-2 uppercase tracking-wide">차량 종류</div>
            <select
              className="w-full px-3 py-2.5 text-[14px] rounded-xl border border-gray-200 bg-white"
              value={vehicle}
              onChange={e => setVehicle(e.target.value)}
            >
              {VEHICLE_TYPES.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>

          {result && (
            <div className="rounded-2xl overflow-hidden shadow-xl"
              style={{ background: "linear-gradient(150deg,#0f1e38 0%,#1B2B4B 50%,#243a60 100%)" }}>
              <div className="p-5">
                <div className="text-[12px] text-white/40 font-semibold mb-0.5">
                  {fromP} {fromC.n} → {toP} {toC.n}
                </div>
                <div className="text-[11px] text-white/30 mb-4">
                  {VEHICLE_TYPES.find(v=>v.id===vehicle)?.name} · 약 {result.distance}km · {fmtTime(result.mins)}
                </div>

                <div className="text-[11px] text-white/40 font-semibold mb-1">예상 운임 (VAT 별도)</div>
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-[26px] font-black text-white leading-none">{fmtMoney(result.min)}</span>
                  <span className="text-white/30 text-[18px]">~</span>
                  <span className="text-[26px] font-black text-white leading-none">{fmtMoney(result.max)}</span>
                </div>

                <div className="bg-white/8 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
                  <span className="text-[12px] text-white/50 font-semibold">평균 운임</span>
                  <span className="text-[20px] font-black text-yellow-300 leading-none">{fmtMoney(result.avg)}</span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => { setToP(null); setToC(null); setStep("to"); }}
                    className="flex-1 py-3 rounded-xl bg-white/10 hover:bg-white/18 text-white text-[13px] font-bold transition border border-white/10"
                  >도착지 변경</button>
                  <button
                    onClick={() => {
                      const text = `[운임견적]\n경로: ${fromP} ${fromC.n} → ${toP} ${toC.n}\n차종: ${VEHICLE_TYPES.find(v=>v.id===vehicle)?.name}\n거리: 약 ${result.distance}km · ${fmtTime(result.mins)}\n운임: ${fmtMoney(result.min)}~${fmtMoney(result.max)} (평균 ${fmtMoney(result.avg)})\n※ VAT 별도 · 직선거리 기준 환산`;
                      navigator.clipboard.writeText(text).catch(() => {});
                    }}
                    className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/18 text-white/70 text-[13px] font-bold transition border border-white/10"
                  >복사</button>
                  <button
                    onClick={reset}
                    className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/18 text-white/70 text-[13px] font-bold transition border border-white/10"
                  >초기화</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div className="text-[11px] text-gray-400 text-center pb-2">
        직선거리 ×1.35 도로 환산 기준 · 실제 운임과 차이 있을 수 있습니다
      </div>
    </div>
  );
}
