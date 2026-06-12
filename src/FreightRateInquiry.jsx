import React, { useState, useMemo, useCallback } from "react";

// ─── 한국 지도 SVG 경로 데이터 (viewBox="0 0 360 445") ─────────────────
const PROVINCE_PATHS = {
  경기: "M104,98 L198,91 L203,180 L163,190 L104,160Z",
  서울: "M123,124 L154,119 L158,148 L125,152Z",
  인천: "M80,120 L123,115 L125,152 L112,163 L80,148Z",
  강원: "M203,91 L322,48 L328,182 L250,191 L203,180Z",
  충북: "M203,180 L250,175 L255,248 L212,256 L174,238 L163,190Z",
  충남: "M80,148 L130,144 L163,160 L165,192 L158,215 L134,222 L106,222 L80,210 L70,185 L72,162Z",
  세종: "M163,190 L178,187 L183,200 L172,208 L162,205Z",
  대전: "M158,205 L177,202 L183,215 L174,224 L156,224 L150,212Z",
  경북: "M250,175 L328,162 L334,205 L318,248 L290,268 L262,270 L235,255 L218,232 L220,196 L235,182 Z",
  대구: "M244,228 L272,223 L278,245 L270,263 L244,262Z",
  전북: "M106,222 L162,217 L185,230 L190,258 L178,272 L152,278 L122,276 L102,260 L100,238Z",
  광주: "M120,292 L148,288 L154,303 L145,315 L122,316 L112,302Z",
  전남: "M96,262 L148,258 L180,268 L188,300 L178,332 L152,348 L118,355 L90,340 L74,316 L73,290 L84,268Z",
  경남: "M218,255 L260,253 L286,268 L292,300 L276,325 L250,336 L218,336 L192,322 L185,295 L190,268Z",
  울산: "M290,240 L320,238 L330,256 L322,278 L302,282 L286,268Z",
  부산: "M264,322 L290,318 L302,334 L296,352 L272,358 L258,347 L255,330Z",
  제주: "M138,390 L192,382 L210,396 L206,418 L184,428 L152,428 L130,414 L128,398Z",
};

const PROVINCE_LABEL_POS = {
  경기: [152, 128],
  서울: [140, 136],
  인천: [97, 137],
  강원: [248, 122],
  충북: [210, 218],
  충남: [116, 184],
  세종: [172, 198],
  대전: [164, 214],
  경북: [272, 215],
  대구: [259, 244],
  전북: [146, 250],
  광주: [133, 302],
  전남: [128, 308],
  경남: [240, 295],
  울산: [306, 258],
  부산: [276, 338],
  제주: [168, 406],
};

const PROVINCE_COLORS = {
  경기: "#dce9f5", 인천: "#d4e4f0", 서울: "#c8dff0",
  강원: "#ddeedd", 충북: "#f0eacc", 충남: "#eedccc",
  세종: "#e8e0c8", 대전: "#e4dcc4", 경북: "#f0ddd0",
  대구: "#e8d4c8", 전북: "#d4ecdc", 광주: "#cce4d4",
  전남: "#c8e4d8", 경남: "#dce8d8", 울산: "#d8dce8",
  부산: "#ccd0e0", 제주: "#f0e8c0",
};

// ─── 시도별 중심 좌표 ──────────────────────────────────────────────────
const PROVINCE_COORDS = {
  서울: [37.5665, 126.9780], 인천: [37.4563, 126.7052], 경기: [37.4138, 127.5183],
  강원: [37.8228, 128.1555], 충북: [36.6357, 127.4914], 충남: [36.6588, 126.6728],
  세종: [36.4800, 127.2890], 대전: [36.3504, 127.3845], 경북: [36.4919, 128.8889],
  대구: [35.8714, 128.6014], 전북: [35.8202, 127.1089], 광주: [35.1595, 126.8526],
  전남: [34.8679, 126.9910], 경남: [35.4606, 128.2132], 울산: [35.5384, 129.3114],
  부산: [35.1796, 129.0756], 제주: [33.4890, 126.4983],
};

// ─── 시군구 데이터 ─────────────────────────────────────────────────────
const CITIES = {
  서울: [
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
  인천: [
    {n:"강화군",la:37.742,lo:126.487},{n:"계양구",la:37.537,lo:126.738},{n:"남동구",la:37.447,lo:126.731},
    {n:"동구",la:37.474,lo:126.643},{n:"미추홀구",la:37.454,lo:126.651},{n:"부평구",la:37.508,lo:126.723},
    {n:"서구",la:37.546,lo:126.676},{n:"연수구",la:37.410,lo:126.678},{n:"옹진군",la:37.468,lo:126.214},
    {n:"중구",la:37.473,lo:126.622},
  ],
  경기: [
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
  강원: [
    {n:"강릉시",la:37.751,lo:128.876},{n:"고성군",la:38.380,lo:128.468},{n:"동해시",la:37.525,lo:129.114},
    {n:"삼척시",la:37.450,lo:129.165},{n:"속초시",la:38.207,lo:128.592},{n:"양구군",la:38.106,lo:127.989},
    {n:"양양군",la:38.080,lo:128.619},{n:"영월군",la:37.184,lo:128.462},{n:"원주시",la:37.342,lo:127.920},
    {n:"인제군",la:38.069,lo:128.171},{n:"정선군",la:37.380,lo:128.660},{n:"철원군",la:38.146,lo:127.314},
    {n:"춘천시",la:37.882,lo:127.730},{n:"태백시",la:37.174,lo:128.986},{n:"평창군",la:37.370,lo:128.392},
    {n:"홍천군",la:37.697,lo:127.889},{n:"화천군",la:38.107,lo:127.708},{n:"횡성군",la:37.492,lo:127.985},
  ],
  충북: [
    {n:"괴산군",la:36.815,lo:127.787},{n:"단양군",la:36.985,lo:128.365},{n:"보은군",la:36.490,lo:127.729},
    {n:"영동군",la:36.175,lo:127.779},{n:"옥천군",la:36.306,lo:127.572},{n:"음성군",la:36.940,lo:127.690},
    {n:"제천시",la:37.133,lo:128.191},{n:"증평군",la:36.786,lo:127.583},{n:"진천군",la:36.856,lo:127.436},
    {n:"청주시",la:36.642,lo:127.490},{n:"충주시",la:36.991,lo:127.926},
  ],
  충남: [
    {n:"계룡시",la:36.275,lo:127.249},{n:"공주시",la:36.447,lo:127.119},{n:"금산군",la:36.109,lo:127.488},
    {n:"논산시",la:36.187,lo:127.099},{n:"당진시",la:36.890,lo:126.628},{n:"보령시",la:36.333,lo:126.613},
    {n:"부여군",la:36.275,lo:126.910},{n:"서산시",la:36.785,lo:126.450},{n:"서천군",la:36.079,lo:126.691},
    {n:"아산시",la:36.790,lo:127.002},{n:"예산군",la:36.680,lo:126.849},{n:"천안시",la:36.808,lo:127.114},
    {n:"청양군",la:36.459,lo:126.801},{n:"태안군",la:36.745,lo:126.298},{n:"홍성군",la:36.601,lo:126.661},
  ],
  세종: [{n:"세종시",la:36.480,lo:127.289}],
  대전: [
    {n:"대덕구",la:36.387,lo:127.415},{n:"동구",la:36.312,lo:127.455},{n:"서구",la:36.355,lo:127.384},
    {n:"유성구",la:36.362,lo:127.356},{n:"중구",la:36.325,lo:127.421},
  ],
  경북: [
    {n:"경산시",la:35.825,lo:128.741},{n:"경주시",la:35.856,lo:129.225},{n:"고령군",la:35.727,lo:128.263},
    {n:"구미시",la:36.119,lo:128.344},{n:"군위군",la:36.240,lo:128.570},{n:"김천시",la:36.140,lo:128.113},
    {n:"문경시",la:36.586,lo:128.186},{n:"봉화군",la:36.893,lo:128.732},{n:"상주시",la:36.410,lo:128.160},
    {n:"성주군",la:35.919,lo:128.283},{n:"안동시",la:36.568,lo:128.729},{n:"영덕군",la:36.415,lo:129.365},
    {n:"영양군",la:36.667,lo:129.113},{n:"영주시",la:36.806,lo:128.624},{n:"영천시",la:35.973,lo:128.938},
    {n:"예천군",la:36.658,lo:128.452},{n:"울릉군",la:37.481,lo:130.905},{n:"울진군",la:36.993,lo:129.400},
    {n:"의성군",la:36.352,lo:128.697},{n:"청도군",la:35.647,lo:128.737},{n:"청송군",la:36.436,lo:129.057},
    {n:"칠곡군",la:35.994,lo:128.401},{n:"포항시",la:36.019,lo:129.343},
  ],
  대구: [
    {n:"군위군",la:36.240,lo:128.570},{n:"남구",la:35.846,lo:128.597},{n:"달성군",la:35.775,lo:128.432},
    {n:"달서구",la:35.830,lo:128.532},{n:"동구",la:35.887,lo:128.635},{n:"북구",la:35.885,lo:128.583},
    {n:"서구",la:35.872,lo:128.559},{n:"수성구",la:35.858,lo:128.631},{n:"중구",la:35.869,lo:128.607},
  ],
  전북: [
    {n:"고창군",la:35.436,lo:126.702},{n:"군산시",la:35.967,lo:126.737},{n:"김제시",la:35.803,lo:126.881},
    {n:"남원시",la:35.416,lo:127.390},{n:"무주군",la:35.906,lo:127.661},{n:"부안군",la:35.731,lo:126.733},
    {n:"순창군",la:35.374,lo:127.138},{n:"완주군",la:35.905,lo:127.162},{n:"익산시",la:35.948,lo:126.954},
    {n:"임실군",la:35.617,lo:127.289},{n:"장수군",la:35.647,lo:127.522},{n:"전주시",la:35.822,lo:127.148},
    {n:"정읍시",la:35.570,lo:126.856},{n:"진안군",la:35.791,lo:127.425},
  ],
  광주: [
    {n:"광산구",la:35.140,lo:126.794},{n:"남구",la:35.133,lo:126.903},{n:"동구",la:35.146,lo:126.923},
    {n:"북구",la:35.174,lo:126.912},{n:"서구",la:35.152,lo:126.890},
  ],
  전남: [
    {n:"강진군",la:34.642,lo:126.767},{n:"고흥군",la:34.611,lo:127.276},{n:"곡성군",la:35.282,lo:127.292},
    {n:"광양시",la:34.941,lo:127.696},{n:"구례군",la:35.202,lo:127.463},{n:"나주시",la:35.016,lo:126.711},
    {n:"담양군",la:35.321,lo:126.988},{n:"목포시",la:34.812,lo:126.392},{n:"무안군",la:34.991,lo:126.481},
    {n:"보성군",la:34.772,lo:127.080},{n:"순천시",la:34.950,lo:127.487},{n:"신안군",la:34.830,lo:126.107},
    {n:"여수시",la:34.760,lo:127.662},{n:"영광군",la:35.277,lo:126.512},{n:"영암군",la:34.800,lo:126.696},
    {n:"완도군",la:34.310,lo:126.755},{n:"장성군",la:35.302,lo:126.785},{n:"장흥군",la:34.682,lo:126.907},
    {n:"진도군",la:34.487,lo:126.263},{n:"함평군",la:35.066,lo:126.517},{n:"해남군",la:34.574,lo:126.599},
    {n:"화순군",la:35.064,lo:126.987},
  ],
  경남: [
    {n:"거제시",la:34.880,lo:128.622},{n:"거창군",la:35.687,lo:127.909},{n:"고성군",la:34.974,lo:128.323},
    {n:"김해시",la:35.234,lo:128.881},{n:"남해군",la:34.837,lo:127.892},{n:"밀양시",la:35.503,lo:128.746},
    {n:"사천시",la:35.004,lo:128.064},{n:"산청군",la:35.415,lo:127.874},{n:"양산시",la:35.335,lo:129.034},
    {n:"의령군",la:35.322,lo:128.261},{n:"진주시",la:35.180,lo:128.107},{n:"창녕군",la:35.544,lo:128.492},
    {n:"창원시",la:35.228,lo:128.682},{n:"통영시",la:34.854,lo:128.433},{n:"하동군",la:35.068,lo:127.752},
    {n:"함안군",la:35.273,lo:128.409},{n:"함양군",la:35.520,lo:127.725},{n:"합천군",la:35.566,lo:128.166},
  ],
  울산: [
    {n:"남구",la:35.540,lo:129.332},{n:"동구",la:35.505,lo:129.416},{n:"북구",la:35.582,lo:129.361},
    {n:"울주군",la:35.520,lo:129.242},{n:"중구",la:35.570,lo:129.332},
  ],
  부산: [
    {n:"강서구",la:35.212,lo:128.981},{n:"금정구",la:35.243,lo:129.093},{n:"기장군",la:35.244,lo:129.222},
    {n:"남구",la:35.136,lo:129.084},{n:"동구",la:35.179,lo:129.044},{n:"동래구",la:35.199,lo:129.086},
    {n:"부산진구",la:35.163,lo:129.053},{n:"북구",la:35.197,lo:128.991},{n:"사상구",la:35.151,lo:128.984},
    {n:"사하구",la:35.100,lo:128.974},{n:"서구",la:35.098,lo:129.024},{n:"수영구",la:35.144,lo:129.115},
    {n:"연제구",la:35.176,lo:129.080},{n:"영도구",la:35.091,lo:129.068},{n:"중구",la:35.105,lo:129.032},
    {n:"해운대구",la:35.163,lo:129.163},
  ],
  제주: [{n:"서귀포시",la:33.253,lo:126.560},{n:"제주시",la:33.499,lo:126.531}],
};

// ─── 차량 종류 및 요율 ─────────────────────────────────────────────────
const VEHICLE_TYPES = [
  {id:"damas", name:"다마스/라보", base:15000, perKm:440, min:30000, desc:"소형"},
  {id:"1ton",  name:"1톤",        base:20000, perKm:690, min:50000, desc:""},
  {id:"2.5ton",name:"2.5톤",      base:32000, perKm:980, min:80000, desc:""},
  {id:"5ton",  name:"5톤",        base:48000, perKm:1280,min:120000,desc:""},
  {id:"11ton", name:"11톤",       base:68000, perKm:1680,min:180000,desc:""},
  {id:"18ton", name:"18톤",       base:86000, perKm:2100,min:240000,desc:""},
  {id:"25ton", name:"25톤",       base:108000,perKm:2380,min:300000,desc:""},
];

// ─── 운임 유형 ─────────────────────────────────────────────────────────
const CARGO_TYPES = [
  {id:"일반", name:"일반"},
  {id:"냉장", name:"냉장/냉동", surcharge: 0.12},
  {id:"위험물", name:"위험물", surcharge: 0.20},
];

// ─── Haversine 거리 계산 ────────────────────────────────────────────────
function haversine(la1, lo1, la2, lo2) {
  const R = 6371;
  const d1 = (la2 - la1) * Math.PI / 180;
  const d2 = (lo2 - lo1) * Math.PI / 180;
  const a = Math.sin(d1/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(d2/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ─── 운임 계산 ────────────────────────────────────────────────────────
function calcRate(fromCoords, toCoords, vtId, ctId) {
  const [la1, lo1] = fromCoords;
  const [la2, lo2] = toCoords;
  const straightDist = haversine(la1, lo1, la2, lo2);
  const roadDist = Math.round(straightDist * 1.35);
  const vt = VEHICLE_TYPES.find(v => v.id === vtId) || VEHICLE_TYPES[1];
  const ct = CARGO_TYPES.find(c => c.id === ctId) || CARGO_TYPES[0];
  const base = vt.base + vt.perKm * roadDist;
  const surchargedBase = Math.max(vt.min, base) * (1 + (ct.surcharge || 0));
  const avg = Math.round(surchargedBase / 5000) * 5000;
  const minFare = Math.round(avg * 0.83 / 5000) * 5000;
  const maxFare = Math.round(avg * 1.17 / 5000) * 5000;
  return { distance: roadDist, min: minFare, max: maxFare, avg };
}

// ─── 유틸 ─────────────────────────────────────────────────────────────
const fmt = (n) => (n >= 10000 ? `${(n/10000).toFixed(1).replace(/\.0$/,"")}만원` : `${n.toLocaleString()}원`);

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────
export default function FreightRateInquiry() {
  const [step, setStep] = useState("from"); // from | to | result
  const [fromP, setFromP] = useState(null);  // 출발 도/시
  const [fromC, setFromC] = useState(null);  // 출발 시/군/구
  const [toP, setToP]     = useState(null);  // 도착 도/시
  const [toC, setToC]     = useState(null);  // 도착 시/군/구
  const [vehicle, setVehicle] = useState("1ton");
  const [cargoType, setCargoType] = useState("일반");
  const [hover, setHover]  = useState(null);
  const [cityStep, setCityStep] = useState(null); // null | 'from' | 'to'

  const result = useMemo(() => {
    if (!fromC || !toC) return null;
    const fc = fromC ? [fromC.la, fromC.lo] : PROVINCE_COORDS[fromP];
    const tc = toC ? [toC.la, toC.lo] : PROVINCE_COORDS[toP];
    if (!fc || !tc) return null;
    return calcRate(fc, tc, vehicle, cargoType);
  }, [fromC, toC, vehicle, cargoType]);

  const reset = useCallback(() => {
    setStep("from"); setFromP(null); setFromC(null);
    setToP(null); setToC(null); setCityStep(null);
  }, []);

  const handleProvinceClick = (prov) => {
    if (step === "from") {
      setFromP(prov);
      setCityStep("from");
    } else if (step === "to") {
      setToP(prov);
      setCityStep("to");
    }
  };

  const handleCitySelect = (city) => {
    if (cityStep === "from") {
      setFromC(city);
      setStep("to");
      setCityStep(null);
    } else if (cityStep === "to") {
      setToC(city);
      setStep("result");
      setCityStep(null);
    }
  };

  const provinces = Object.keys(PROVINCE_PATHS);
  const activeProv = step === "from" ? fromP : toP;

  return (
    <div className="w-full">
      <h2 className="text-[18px] font-bold text-[#1B2B4B] mb-4">전국운임 조회</h2>

      <div className="flex gap-4 min-h-[600px]">
        {/* ───────────────── 왼쪽 패널 ───────────────── */}
        <div className="w-[420px] flex-shrink-0 flex flex-col gap-3">

          {/* 출발지/도착지 카드 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="text-[12px] font-bold text-gray-400 mb-3 tracking-wide">경로 설정</div>
            <div className="flex flex-col gap-2">
              {/* 출발지 */}
              <div
                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border-2 transition ${
                  step === "from" || cityStep === "from"
                    ? "border-[#1B2B4B] bg-[#1B2B4B]/5"
                    : fromC ? "border-blue-200 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                }`}
                onClick={() => { setStep("from"); setCityStep(null); setFromP(null); setFromC(null); setToC(null); setToP(null); }}
              >
                <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">출</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-gray-400 font-medium">출발지</div>
                  {fromC ? (
                    <div className="text-[14px] font-bold text-[#1B2B4B] truncate">{fromP} {fromC.n}</div>
                  ) : fromP && cityStep === "from" ? (
                    <div className="text-[13px] text-blue-600 font-medium">{fromP} — 시/군/구 선택 중</div>
                  ) : (
                    <div className="text-[13px] text-gray-400">지도에서 도/시를 클릭하세요</div>
                  )}
                </div>
                {fromC && <button className="text-gray-400 hover:text-red-400 text-[16px] leading-none" onClick={e=>{e.stopPropagation();reset();}}>×</button>}
              </div>

              <div className="flex items-center gap-2 px-3">
                <div className="flex-1 h-px bg-gray-200"/>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                  <path d="M12 5v14M5 12l7 7 7-7"/>
                </svg>
                <div className="flex-1 h-px bg-gray-200"/>
              </div>

              {/* 도착지 */}
              <div
                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border-2 transition ${
                  step === "to" || cityStep === "to"
                    ? "border-orange-400 bg-orange-50"
                    : toC ? "border-orange-200 bg-orange-50" : "border-gray-200 hover:border-gray-300"
                }`}
                onClick={() => { if (fromC) { setStep("to"); setCityStep(null); setToP(null); setToC(null); } }}
              >
                <div className="w-7 h-7 rounded-full bg-orange-400 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">도</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-gray-400 font-medium">도착지</div>
                  {toC ? (
                    <div className="text-[14px] font-bold text-[#1B2B4B] truncate">{toP} {toC.n}</div>
                  ) : toP && cityStep === "to" ? (
                    <div className="text-[13px] text-orange-500 font-medium">{toP} — 시/군/구 선택 중</div>
                  ) : (
                    <div className="text-[13px] text-gray-400">{fromC ? "지도에서 도/시를 클릭하세요" : "출발지 먼저 선택"}</div>
                  )}
                </div>
                {toC && <button className="text-gray-400 hover:text-red-400 text-[16px] leading-none" onClick={e=>{e.stopPropagation();setToP(null);setToC(null);setStep("to");}}>×</button>}
              </div>
            </div>
          </div>

          {/* 차량 종류 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="text-[12px] font-bold text-gray-400 mb-3 tracking-wide">차량 종류</div>
            <div className="flex flex-wrap gap-2">
              {VEHICLE_TYPES.map(vt => (
                <button
                  key={vt.id}
                  onClick={() => setVehicle(vt.id)}
                  className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold border transition ${
                    vehicle === vt.id
                      ? "bg-[#1B2B4B] text-white border-[#1B2B4B]"
                      : "bg-white text-gray-700 border-gray-300 hover:border-[#1B2B4B] hover:text-[#1B2B4B]"
                  }`}
                >{vt.name}</button>
              ))}
            </div>
          </div>

          {/* 화물 유형 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="text-[12px] font-bold text-gray-400 mb-3 tracking-wide">화물 유형</div>
            <div className="flex gap-2">
              {CARGO_TYPES.map(ct => (
                <button
                  key={ct.id}
                  onClick={() => setCargoType(ct.id)}
                  className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold border transition ${
                    cargoType === ct.id
                      ? "bg-[#1B2B4B] text-white border-[#1B2B4B]"
                      : "bg-white text-gray-700 border-gray-300 hover:border-[#1B2B4B]"
                  }`}
                >{ct.name}</button>
              ))}
            </div>
          </div>

          {/* 결과 */}
          {result && step === "result" && (
            <div className="bg-[#1B2B4B] rounded-xl p-5 text-white shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[13px] text-white/70">예상 운임</div>
                <div className="text-[11px] text-white/50">VAT 별도 · 참고용 시세</div>
              </div>

              <div className="mb-4">
                <div className="text-[12px] text-white/60 mb-1">운임 범위</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[28px] font-extrabold">{fmt(result.min)}</span>
                  <span className="text-white/60 text-[18px]">~</span>
                  <span className="text-[28px] font-extrabold">{fmt(result.max)}</span>
                </div>
              </div>

              <div className="bg-white/10 rounded-lg p-3 mb-4">
                <div className="text-[11px] text-white/60 mb-1">평균 운임</div>
                <div className="text-[22px] font-extrabold text-blue-300">{fmt(result.avg)}</div>
              </div>

              {/* 프로그레스 바 */}
              <div className="mb-4">
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-blue-400 to-blue-200 rounded-full" style={{width:"60%"}}/>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-white/50">최저 {fmt(result.min)}</span>
                  <span className="text-[10px] text-white/50">최고 {fmt(result.max)}</span>
                </div>
              </div>

              <div className="flex items-center gap-4 text-[11px] text-white/60 border-t border-white/10 pt-3">
                <span>거리 약 {result.distance}km</span>
                <span>차종 {VEHICLE_TYPES.find(v=>v.id===vehicle)?.name}</span>
                {cargoType !== "일반" && <span>{cargoType} 할증 포함</span>}
              </div>

              <button
                onClick={reset}
                className="mt-4 w-full py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[13px] font-semibold transition"
              >
                다시 조회
              </button>
            </div>
          )}

          {/* 시/군/구 선택 패널 */}
          {cityStep && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold ${cityStep === "from" ? "bg-blue-500" : "bg-orange-400"}`}>
                  {cityStep === "from" ? "출" : "도"}
                </div>
                <span className="text-[13px] font-bold text-[#1B2B4B]">{cityStep === "from" ? fromP : toP}</span>
                <button
                  className="ml-auto text-[11px] text-gray-500 hover:text-[#1B2B4B] border border-gray-300 rounded-md px-2 py-0.5"
                  onClick={() => { setCityStep(null); setFromP(cityStep === "from" ? null : fromP); setToP(cityStep === "to" ? null : toP); }}
                >
                  ← 도(道) 다시 선택
                </button>
              </div>
              <div className="text-[12px] text-gray-500 mb-3">시·군·구를 선택하세요</div>
              <div className="grid grid-cols-3 gap-1.5 max-h-[240px] overflow-y-auto pr-1">
                {(CITIES[cityStep === "from" ? fromP : toP] || []).map(city => (
                  <button
                    key={city.n}
                    onClick={() => handleCitySelect(city)}
                    className="px-2 py-2 text-[12px] font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-[#1B2B4B] hover:text-white hover:border-[#1B2B4B] transition text-left"
                  >
                    {city.n}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ───────────────── 오른쪽 지도 패널 ───────────────── */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col">
          {/* 지도 헤더 */}
          <div className="px-4 pt-4 pb-2 border-b border-gray-100 flex items-center gap-3">
            <div className="flex items-center gap-2">
              {step !== "result" && (
                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold ${
                  step === "from" ? "bg-blue-500 text-white" : "bg-orange-400 text-white"
                }`}>
                  <span className="w-2 h-2 rounded-full bg-white/80 inline-block"/>
                  {step === "from" ? "출발지를 선택하세요" : "도착지를 선택하세요"}
                </div>
              )}
              {step === "result" && fromP && toP && (
                <div className="text-[13px] text-gray-600">
                  <span className="font-bold text-blue-600">{fromP} {fromC?.n}</span>
                  <span className="mx-2 text-gray-400">→</span>
                  <span className="font-bold text-orange-500">{toP} {toC?.n}</span>
                </div>
              )}
            </div>
            {(fromP || toP) && (
              <button onClick={reset} className="ml-auto text-[11px] text-gray-500 hover:text-red-500 border border-gray-200 rounded-md px-2 py-1">초기화</button>
            )}
          </div>

          {/* SVG 지도 */}
          <div className="flex-1 flex items-center justify-center p-4">
            <svg
              viewBox="0 0 360 445"
              className="w-full max-w-[420px]"
              style={{ userSelect: "none" }}
            >
              {/* 배경 */}
              <rect width="360" height="445" fill="transparent"/>

              {/* 도/시 폴리곤 */}
              {provinces.map(prov => {
                const isFrom   = prov === fromP;
                const isTo     = prov === toP;
                const isHover  = prov === hover;
                const isActive = isFrom || isTo;
                const [lx, ly] = PROVINCE_LABEL_POS[prov] || [0, 0];
                const isSmall  = ["서울","인천","세종","대전","대구","광주","울산","부산"].includes(prov);

                let fill = PROVINCE_COLORS[prov] || "#e8edf2";
                if (isFrom) fill = "#2563eb";
                else if (isTo) fill = "#f97316";
                else if (isHover) fill = "#c7d8ef";

                return (
                  <g key={prov}>
                    <path
                      d={PROVINCE_PATHS[prov]}
                      fill={fill}
                      stroke={isActive ? "white" : "#c0cdd8"}
                      strokeWidth={isActive ? 2 : 0.8}
                      style={{ cursor: "pointer", transition: "fill 0.15s" }}
                      onMouseEnter={() => setHover(prov)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => handleProvinceClick(prov)}
                    />
                    <text
                      x={lx}
                      y={ly}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={isSmall ? 8.5 : 11}
                      fontWeight={isActive ? "bold" : "600"}
                      fill={isActive ? "white" : "#374151"}
                      style={{ pointerEvents: "none", letterSpacing: "-0.3px" }}
                    >
                      {prov}
                    </text>
                    {/* 출/도 배지 */}
                    {(isFrom || isTo) && (
                      <>
                        <circle cx={lx} cy={ly - (isSmall ? 10 : 13)} r={8} fill="white" fillOpacity={0.9}/>
                        <text
                          x={lx}
                          y={ly - (isSmall ? 10 : 13)}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize={9}
                          fontWeight="bold"
                          fill={isFrom ? "#2563eb" : "#f97316"}
                          style={{ pointerEvents: "none" }}
                        >
                          {isFrom ? "출" : "도"}
                        </text>
                      </>
                    )}
                  </g>
                );
              })}

              {/* 호버 툴팁 */}
              {hover && !fromP && !toP && (
                <g>
                  <rect
                    x={(PROVINCE_LABEL_POS[hover]?.[0] || 0) - 22}
                    y={(PROVINCE_LABEL_POS[hover]?.[1] || 0) + 14}
                    width={44} height={16} rx={4}
                    fill="#1B2B4B" fillOpacity={0.85}
                  />
                  <text
                    x={PROVINCE_LABEL_POS[hover]?.[0] || 0}
                    y={(PROVINCE_LABEL_POS[hover]?.[1] || 0) + 22}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={9}
                    fill="white"
                    style={{ pointerEvents: "none" }}
                  >
                    클릭 선택
                  </text>
                </g>
              )}
            </svg>
          </div>

          {/* 범례 */}
          <div className="px-4 pb-3 border-t border-gray-100 flex items-center gap-4 pt-2">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-blue-500"/>
              <span className="text-[11px] text-gray-500">출발지</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-orange-400"/>
              <span className="text-[11px] text-gray-500">도착지</span>
            </div>
            <div className="ml-auto text-[11px] text-gray-400">도/시를 클릭하면 시/군/구 목록이 표시됩니다</div>
          </div>
        </div>
      </div>

      {/* 안내 문구 */}
      <div className="mt-3 text-[11px] text-gray-400 text-center">
        실거래 기반 참고 운임입니다. 실제 운임은 차량 상태, 시간대, 계절 등에 따라 달라질 수 있습니다.
      </div>
    </div>
  );
}
