// ======================= src/driverCopyText.js =======================
// 📋 2026-11-18 기사복사 문구 — PC(배차현황 기사복사)와 모바일이 같은 글을 만들도록 한 곳으로 모음(사용자 요청).
//  예전엔 모바일이 따로 만든 문구(안내문 · 시간 표기 · 톤수 kg 표기 · 문구 설정 미적용)라 PC와 달랐다.
//  아래 본문은 PC 배차현황 기사복사(DispatchApp.jsx PART 5 copyMessage)의 오더 한 건 처리 그대로다.
//   mode: "basic"(차량번호 · 기사 · 연락처) · "fare"(운임 포함) · "driver"(기사 전달용) · "full"(전체 상세)
//   ctx: { driverNote(전달사항 고친 값) · noticeBlock(상/하차지 기사전달 주의사항) · uploadUrlOf(r) · company }
import { buildCopyText, getCopyTpl } from "./copyTemplates";
import { rotationNotice } from "./rotation";
import { mgrName } from "./mgrPlaceholder";

// kg/g으로 입력해도 항상 톤 단위 문자열로 통일 (예: "100kg" → "0.1톤") — DispatchApp.jsx toTonUnit 과 같다
export const toTonUnit = (v = "") => {
  const str = String(v ?? "").trim();
  if (!str) return "";
  const m = str.match(/^([\d.]+)\s*(kg|g|톤|ton|t)?$/i);
  if (!m) return str;
  const num = parseFloat(m[1]);
  if (isNaN(num)) return str;
  const unit = (m[2] || "톤").toLowerCase();
  let tons;
  if (unit === "kg") tons = num / 1000;
  else if (unit === "g") tons = num / 1000000;
  else tons = num;
  let formatted = tons.toFixed(3).replace(/\.?0+$/, "");
  if (formatted === "" || formatted === "-") formatted = "0";
  return `${formatted}톤`;
};
export const getYoil = (dateStr) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"][date.getDay()];
};
export const formatPhone = (phone) => {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
  if (digits.length === 10) return digits.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  return digits;
};
const formatPhone2 = formatPhone;
// 📞 담당자 라인
export const buildContactLine = (name0, phone) => {
  const name = mgrName(name0); // 고정노선 자리 채움 "담당자"는 빈 값
  if (!name && !phone) return "";
  const cleanName = String(name || "").trim();
  const cleanPhone = String(phone || "").trim();
  if (cleanPhone) return `담당자 : ${cleanName} (${formatPhone(cleanPhone)})`;
  return `담당자 : ${cleanName}`;
};
// 📋 기사복사 문구 치환 값(copyTemplates.js의 COPY_VARS)
export function copyVarsOf(r, { 업로드링크 = "", cold = false, plate = "", name = "", phone = "", fare = 0, payLabel = "", company = "" }) {
  return {
    업로드링크,
    온도안내: cold ? "*냉장(0~10도유지),냉동(-18도이하)*" : "*관련 서류 업로드 필수*",
    결제안내: r.지급방식 === "착불" ? "*착불건입니다*" : r.지급방식 === "선불" ? "*선불건입니다*" : "*결제일 링크 참고하세요*",
    서류안내: cold ? "※ 거래명세서/타코메타 기록지 함께 촬영업로드" : "※ 거래명세서 서류 업로드",
    차량번호: plate, 기사명: name, 연락처: phone, 운임: Number(fare || 0).toLocaleString(), 지급구분: payLabel, 지급방식: r.지급방식 || "",
    상차지: r.상차지명 || "", 하차지: r.하차지명 || "", 상차일: r.상차일 || "",
    // ⭐ 2026-11-03 여러 사업자 — 오더의 청구 사업자가 있으면 그 사업자 이름
    회사명: String(r.청구사업자 || "").trim() || (localStorage.getItem("loginCompany") || company || localStorage.getItem("userCompany") || "").trim(),
  };
}

export function buildDriverCopyText(r, mode, ctx = {}) {
  if (!r) return "";
  const userCompany = ctx.company || "";
  const uploadUrlOf = (o) => { try { return ctx.uploadUrlOf ? ctx.uploadUrlOf(o) || "" : ""; } catch { return ""; } };
        const plate = r.차량번호 || "";
        const name = r.이름 || "";
        const phone = formatPhone2(r.전화번호 || "");
        const yoil = getYoil(r.상차일 || "");

        const fare = Number(String(r.청구운임 || "0").replace(/[^\d]/g, ""));
        const pay = r.지급방식 || "";
        const payLabel =
          pay === "계산서"
            ? "부가세별도"
            : pay === "선불" || pay === "착불"
              ? pay
              : "";

        // =====================
        // 기본 / 운임 모드
        // =====================
        if (mode === "basic") {
          return `${plate} ${name} ${phone}`;
        }

        if (mode === "fare") {
          return `${plate} ${name} ${phone}
${fare.toLocaleString()}원 ${payLabel} 배차되었습니다.`;
        }
        // =====================
        // 🚚 기사 전달용 (DRIVER)
        // =====================
        if (mode === "driver") {

// ❄️ 냉장/냉동 차량 안내
const COLD_NOTICE = `★★★필독★★★

• 전체보기 또는 모두보기 누르시면
맨 아래에 상/하차 정보가 있습니다.
(안내문 꼭 읽어주세요)
↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓

냉장(0~10도 유지), 냉동(-18도 이하)

1. 인수증 및 거래명세서, 타코미터 기록지까지 꼭 한 장씩 찍어서 보내주세요. 
미공유 시 운임 지급이 지연될 수 있습니다.

2. 상/하차 후 상하차 사진도 꼭 찍어서 공유 주시거나 보관하시면
문제 발생 시 도움 될 수 있습니다.
상/하차지 이슈 발생 시 반드시 사전 연락 바랍니다.
(사진 전송 후 전화는 안 주셔도 됩니다)

3. 운임결제는 24시콜 기준 계산서 발행 후 익일 결제입니다.
금요일 계산서 발행인 경우 익주 월요일에 결제됩니다.
(공휴일도 동일하게 적용됩니다)`;

// 🚚 일반 차량용 (🔥 동일 포맷으로 통일)
const NORMAL_NOTICE = `★★★필독★★★

• 전체보기 또는 모두보기 누르시면
맨 아래에 상/하차 정보가 있습니다.
(안내문 꼭 읽어주세요)
↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓

1. 인수증(파렛전표) 또는 거래명세서는 반드시 서명 후 문자 전송 바랍니다. 
하차지에 전달하는 경우 사진 먼저 촬영 후 업체에 전달해 주시면 됩니다.

2. 상/하차 사진 찍어서 보관 또는 공유주시면 문제 발생 시 도움 될 수 있습니다. 
사진은 꼭 찍어 두세요.
상·하차 이슈 발생 시 반드시 사전 연락 바랍니다.

3. 운임결제는 24시콜 기준 계산서 발행 후 익일 결제입니다. 
금요일 계산서 발행인 경우 익주 월요일에 결제됩니다. 
(공휴일도 동일하게 적용됩니다)`;

// 🔥 반찬단지 전용 안내문
const BANCHAN_NOTICE = `
* 배송기사님 출입 시 유의사항

1. 슬리퍼, 크록스, 샌들 등.. 
절대 금지/안전화 착용
(안전 상 이유로 회송 
조치 할 수 있습니다.)

2. 상차지 입차 시 지게차 기사님께
하차지명으로 꼭 말씀하셔야합니다.
주소가 많아 주소로는 모릅니다.
(부재 시 도크 쪽 사무실 방문)

3. 대기시에 임원 주차장 사용불가합니다.
(사무동 옆 주차라인 사용 X)
도크쪽 주차하시면 되며, 자리 없어도
일반 승용차 라인에 절대 주차 금지입니다.
`;

          const vehicleType = String(r.차량종류 || "").trim();

          const isColdVehicle =
            vehicleType.includes("냉장") || vehicleType.includes("냉동");

          const yoil = getYoil(r.상차일 || "");
          const dateText = `${r.상차일 || ""} ${yoil}`;
          // ==========================
          // 🔥 익일 / 지정 하차 판별 (FULL MODE와 동일)
          // ==========================
          let dateNotice = "";
          let dropTimeText = r.하차시간 || "즉시";

          if (r.상차일 && r.하차일) {
            const s = new Date(r.상차일);
            const e = new Date(r.하차일);

            const s0 = new Date(s.getFullYear(), s.getMonth(), s.getDate());
            const e0 = new Date(e.getFullYear(), e.getMonth(), e.getDate());

            const diffDays = Math.round(
              (e0 - s0) / (1000 * 60 * 60 * 24)
            );

            const sm = s.getMonth() + 1;
            const sd = s.getDate();
            const em = e.getMonth() + 1;
            const ed = e.getDate();

            if (diffDays === 1) {
              dateNotice = `익일 하차 건 (상차: ${sm}/${sd} → 하차: ${em}/${ed})\n\n`;
              dropTimeText = `${em}/${ed} ${dropTimeText}`;
            } else if (diffDays >= 2) {
              dateNotice = `지정일 하차 건 (상차: ${sm}/${sd} → 하차: ${em}/${ed})\n\n`;
              dropTimeText = `${em}/${ed} ${dropTimeText}`;
            }
          }
          const driverNote =
            ctx.driverNote ??
            r.전달사항 ??
            "";

          const driverNoteText = driverNote.trim()
            ? `\n\n◆ 전달사항\n${driverNote.trim()}`
            : "";

          // 업로드 링크는 오더별 토큰을 함께 담는다 — 기사님이 업로드를 완료(등록)하면
          // 이 토큰은 잠기고, 이후 "기사전달용" 복사를 다시 하면 새 토큰이 발급되어
          // 예전 링크(구 토큰)로는 더 이상 접속할 수 없게 된다.
          const uploadUrl = getCopyTpl("driver").includeUpload ? uploadUrlOf(r) : "";

const noticeBlock = String(ctx.noticeBlock || "").trim(); // 화면마다 찾는 곳이 달라 밖에서 받는다(PC: 거래처 목록 · 모바일: 서버 조회)

// 경유지 파싱
const _ss5d=(v)=>{if(Array.isArray(v)&&v.length>0)return v;if(typeof v==="string"&&v.trim().startsWith("[")){try{const p=JSON.parse(v);if(Array.isArray(p))return p;}catch{}}if(v&&typeof v==="object"&&!Array.isArray(v)){const ks=Object.keys(v);if(ks.length&&ks.every(k=>/^\d+$/.test(k)))return ks.sort((a,b)=>Number(a)-Number(b)).map(k=>v[k]);if(v.업체명)return[v];}return[];};
const _ct5d=(s)=>{const raw=s.화물내용||"";if(/파레트|파렛트|박스|통/.test(raw))return /\d/.test(raw)?raw:"";const qty=raw||s.화물수량||"";const tp=s.화물타입||"";if(!qty||qty==="없음")return"";return tp&&tp!=="없음"?`${qty}${tp}`:qty;};
const _tt5d=(s)=>{const raw=s.차량톤수||"";if(/톤|kg/.test(raw))return /\d/.test(raw)?toTonUnit(raw):"";const val=s.톤수값||raw||"";const tp=s.톤수타입||"";if(!val||val==="없음")return"";return toTonUnit(tp&&tp!=="없음"?`${val}${tp}`:val);};
const _pkg5d=(str)=>{const s=String(str||"").trim().replace(/,/g,"");if(!s)return 0;const kg=s.match(/([\d.]+)\s*kg/i);if(kg)return parseFloat(kg[1]);const ton=s.match(/([\d.]+)\s*톤/);return ton?parseFloat(ton[1])*1000:0;};
const _fkg5d=(kg)=>{if(!kg)return"";const t=kg/1000;return t.toFixed(3).replace(/\.?0+$/,"")+"톤";};
const _sc5d=(main,stops)=>{const mainStr=String(main||"").trim();if(!mainStr||mainStr==="없음")return mainStr;const UNITS=["파레트","파렛트","박스","통","바구니"];const NORM={"파렛트":"파레트"};const getT=(s)=>{for(const u of UNITS){if(String(s).endsWith(u))return NORM[u]||u;}return null;};const getN=(s)=>{const m=String(s).match(/^([\d,.]+)/);return m?parseFloat(m[1].replace(/,/g,"")):null;};const stopC=stops.map(_ct5d).filter(Boolean);if(!stopC.length)return mainStr;const allC=[mainStr,...stopC];const byU={};const unk=[];for(const c of allC){const t=getT(c);if(t){const n=getN(c);if(n!=null){byU[t]=(byU[t]||0)+n;}else if(!unk.includes(c))unk.push(c);}else if(!unk.includes(c))unk.push(c);}return[...Object.entries(byU).map(([u,n])=>`${n}${u}`),...unk].join("+");};

const _pStops5d=_ss5d(r.경유상차목록||r.경유지_상차).filter(s=>s?.업체명?.trim());
const _dStops5d=_ss5d(r.경유하차목록||r.경유지_하차).filter(s=>s?.업체명?.trim());
const _totKg5d=_pkg5d(r.차량톤수)+_dStops5d.reduce((a,s)=>a+_pkg5d(_tt5d(s)),0)+_pStops5d.reduce((a,s)=>a+_pkg5d(_tt5d(s)),0);
const _totTon5d=_fkg5d(_totKg5d)||r.차량톤수||"-";
const _totCargo5d=_sc5d(r.화물내용,[..._pStops5d,..._dStops5d])||r.화물내용||"";
const _pHas5d=_pStops5d.length>0;
const _dHas5d=_dStops5d.length>0;
const _pNum5d=_pHas5d?`1.`:"";
const _dNum5d=_dHas5d?`${_dStops5d.length+1}.`:"";
const _pStopsText5d=_pHas5d?_pStops5d.map((s,i)=>{const cargo=_ct5d(s);const ton=_tt5d(s);return`${i+2}.상차경유지 : ${s.업체명||"-"}\n${s.주소||""}${s.담당자?`\n담당자 : ${s.담당자}${s.담당자번호?` (${formatPhone(s.담당자번호)})`:""}`:``}${s.상차시간?`\n상차시간 : ${s.상차시간}`:""}${cargo?`\n화물내용 : ${cargo}`:""}${ton?`\n화물톤수 : ${ton}`:""}${s.방법?`\n상차방법 : ${s.방법}`:``}`;}).join("\n\n"):"";
const _dStopsText5d=_dHas5d?_dStops5d.map((s,i)=>{const cargo=_ct5d(s);const ton=_tt5d(s);return`${i+1}.하차경유지 : ${s.업체명||"-"}\n${s.주소||""}${s.담당자?`\n담당자 : ${s.담당자}${s.담당자번호?` (${formatPhone(s.담당자번호)})`:""}`:``}${s.하차시간?`\n하차시간 : ${s.하차시간}`:""}${cargo?`\n화물내용 : ${cargo}`:""}${ton?`\n화물톤수 : ${ton}`:""}${s.방법?`\n하차방법 : ${s.방법}`:``}`;}).join("\n\n"):"";
const _mainPCargo5d=_pHas5d&&r.화물내용?`\n화물내용 : ${r.화물내용}`:"";
const _mainPTon5d=_pHas5d&&r.차량톤수?`\n화물톤수 : ${toTonUnit(r.차량톤수)}`:"";
const _mainDCargo5d=_pHas5d?(_totCargo5d?`\n화물내용 : ${_totCargo5d}`:""): (_dHas5d&&r.화물내용?`\n화물내용 : ${r.화물내용}`:"");
const _mainDTon5d=_pHas5d?(_totTon5d?`\n화물톤수 : ${_totTon5d}`:""):(_dHas5d&&r.차량톤수?`\n화물톤수 : ${toTonUnit(r.차량톤수)}`:"");

// 🔗 상차/하차 경유지 수가 같으면 연속 경유(체인) 건 — N번째 상차/하차를 한 쌍으로
// 묶어서 보여준다. (상세 설명은 driver 모드 쪽 isChainD 주석 참고)
const isChain5d = _pHas5d && _dHas5d && _pStops5d.length === _dStops5d.length;
const _dayDiff5d = (a, b) => {
  if (!a || !b) return 0;
  const s = new Date(a), e = new Date(b);
  return Math.round((new Date(e.getFullYear(), e.getMonth(), e.getDate()) - new Date(s.getFullYear(), s.getMonth(), s.getDate())) / (1000 * 60 * 60 * 24));
};
const _md5d = (dstr) => { const d = new Date(dstr); return `${d.getMonth() + 1}/${d.getDate()}`; };

const _fanOutBlock5d = `${_pNum5d}상차 : ${r.상차지명||"-"} / ${r.상차시간||"즉시"}${r.상차시간기준?` (${r.상차시간기준})`:""}
${r.상차지주소||""}${(()=>{const line=buildContactLine(r.상차지담당자,r.상차지담당자번호);return line?`\n${line}`:""})()}${_mainPCargo5d}${_mainPTon5d}
상차방법 : ${r.상차방법||"-"}${_pStopsText5d ? "\n\n" + _pStopsText5d : ""}

${_dStopsText5d ? _dStopsText5d+"\n\n" : ""}${_dNum5d}하차 : ${r.하차지명||"-"} / ${dropTimeText}${r.하차시간기준?` (${r.하차시간기준})`:""}
${r.하차지주소||""}${(()=>{const line=buildContactLine(r.하차지담당자,r.하차지담당자번호);return line?`\n${line}`:""})()}${_mainDCargo5d}${_mainDTon5d}
하차방법 : ${r.하차방법||"-"}`;

const _chainBlock5d = isChain5d ? (() => {
  const pChain5d = [
    { name: r.상차지명, addr: r.상차지주소, cName: r.상차지담당자, cPhone: r.상차지담당자번호, cargo: r.화물내용, ton: r.차량톤수 ? toTonUnit(r.차량톤수) : "", method: r.상차방법, date: r.상차일, time: r.상차시간 || "즉시", suffix: r.상차시간기준 },
    ..._pStops5d.map(s => ({ name: s.업체명, addr: s.주소, cName: s.담당자, cPhone: s.담당자번호, cargo: _ct5d(s), ton: _tt5d(s), method: s.방법, date: s.상차일, time: s.상차시간 || "즉시", suffix: "" })),
  ];
  const dChain5d = [
    { name: r.하차지명, addr: r.하차지주소, cName: r.하차지담당자, cPhone: r.하차지담당자번호, cargo: r.화물내용, ton: r.차량톤수 ? toTonUnit(r.차량톤수) : "", method: r.하차방법, date: r.하차일, time: r.하차시간 || "즉시", suffix: r.하차시간기준 },
    ..._dStops5d.map(s => ({ name: s.업체명, addr: s.주소, cName: s.담당자, cPhone: s.담당자번호, cargo: _ct5d(s), ton: _tt5d(s), method: s.방법, date: s.하차일, time: s.하차시간 || "즉시", suffix: "" })),
  ];
  const n5d = pChain5d.length;
  const renderLeg5d = (e, num, kind, timeOverride) => {
    const contact = buildContactLine(e.cName, e.cPhone);
    const t = timeOverride ?? e.time;
    return `${num}${kind} : ${e.name || "-"} / ${t}${e.suffix ? ` (${e.suffix})` : ""}
${e.addr || ""}${contact ? `\n${contact}` : ""}${e.cargo ? `\n화물내용 : ${e.cargo}` : ""}${e.ton ? `\n화물톤수 : ${e.ton}` : ""}
${kind}방법 : ${e.method || "-"}`;
  };
  const legTexts5d = [];
  for (let i = 1; i <= n5d; i++) {
    const p5d = pChain5d[i - 1], d5d = dChain5d[i - 1];
    const dTime5d = i === 1 ? dropTimeText : (() => {
      const diff5d = _dayDiff5d(p5d.date, d5d.date);
      return diff5d >= 1 ? `${_md5d(d5d.date)} ${d5d.time}` : d5d.time;
    })();
    legTexts5d.push(`${renderLeg5d(p5d, `${i}.`, "상차")}\n\n${renderLeg5d(d5d, `${i}.`, "하차", dTime5d)}`);
  }
  let out5d = legTexts5d[0];
  for (let i = 1; i < n5d; i++) {
    const diff5d = _dayDiff5d(pChain5d[i - 1].date, dChain5d[i].date);
    const sep5d = diff5d === 1
      ? `익일 하차 건 (상차: ${_md5d(pChain5d[i - 1].date)} → 하차: ${_md5d(dChain5d[i].date)})`
      : diff5d >= 2
        ? `지정일 하차 건 (상차: ${_md5d(pChain5d[i - 1].date)} → 하차: ${_md5d(dChain5d[i].date)})`
        : "";
    out5d += sep5d ? `\n\n${sep5d}\n\n${legTexts5d[i]}` : `\n\n${legTexts5d[i]}`;
  }
  return out5d;
})() : "";

const coreBlock5d = isChain5d ? _chainBlock5d : _fanOutBlock5d;

const _ctCold5d = /(냉장|냉동)/i.test(r.차량종류||"-");
const _ctBody5d = `${isChain5d ? "" : dateNotice}${dateText}${r.운행유형==="왕복"?"\n[왕복운행]":""}${rotationNotice(r)}

${coreBlock5d}

화물 : ${_totTon5d}${_totCargo5d?` / ${_totCargo5d}`:""} ${r.차량종류||"-"}
결제방법 : ${r.지급방식 === "계산서" ? `계산서(${r.배차방식 === "24시" ? "24시발행" : (localStorage.getItem("loginCompany") || userCompany || localStorage.getItem("userCompany") || "").trim() || "-"})` : (r.지급방식||"-")}${driverNoteText}${noticeBlock?`\n\n${noticeBlock}`:""}`;
return buildCopyText("driver", {
  body: _ctBody5d,
  vars: copyVarsOf(r, { 업로드링크: uploadUrl, cold: _ctCold5d, plate, name, phone, fare, payLabel, company: userCompany }),
  // 회사가 문구를 안 바꿨으면 기본 문구(copyTemplates.js COPY_DEFAULTS — 실시간배차현황 기준)를 쓴다
});
        }

        // =====================
        // 전체 상세 (기사복사)
        // =====================
        const pickupTime = r.상차시간?.trim() || "즉시";
        const dropTimeRaw = r.하차시간?.trim() || "즉시";

        let dateNotice = "";
        let dropTimeText = dropTimeRaw;

        if (r.상차일 && r.하차일) {
          const s = new Date(r.상차일);
          const e = new Date(r.하차일);

          const s0 = new Date(s.getFullYear(), s.getMonth(), s.getDate());
          const e0 = new Date(e.getFullYear(), e.getMonth(), e.getDate());

          const diffDays = Math.round(
            (e0 - s0) / (1000 * 60 * 60 * 24)
          );

          const sm = s.getMonth() + 1;
          const sd = s.getDate();
          const em = e.getMonth() + 1;
          const ed = e.getDate();

          if (diffDays === 1) {
            dateNotice = `익일 하차 건 (상차: ${sm}/${sd} → 하차: ${em}/${ed})\n\n`;
            dropTimeText = `${em}/${ed} ${dropTimeRaw}`;
          } else if (diffDays >= 2) {
            dateNotice = `지정일 하차 건 (상차: ${sm}/${sd} → 하차: ${em}/${ed})\n\n`;
            dropTimeText = `${em}/${ed} ${dropTimeRaw}`;
          }
        }

const _ss5f=(v)=>{if(Array.isArray(v)&&v.length>0)return v;if(typeof v==="string"&&v.trim().startsWith("[")){try{const p=JSON.parse(v);if(Array.isArray(p))return p;}catch{}}if(v&&typeof v==="object"&&!Array.isArray(v)){const ks=Object.keys(v);if(ks.length&&ks.every(k=>/^\d+$/.test(k)))return ks.sort((a,b)=>Number(a)-Number(b)).map(k=>v[k]);if(v.업체명)return[v];}return[];};
const _ct5f=(s)=>{const raw=s.화물내용||"";if(/파레트|파렛트|박스|통/.test(raw))return /\d/.test(raw)?raw:"";const qty=raw||s.화물수량||"";const tp=s.화물타입||"";if(!qty||qty==="없음")return"";return tp&&tp!=="없음"?`${qty}${tp}`:qty;};
const _tt5f=(s)=>{const raw=s.차량톤수||"";if(/톤|kg/.test(raw))return /\d/.test(raw)?toTonUnit(raw):"";const val=s.톤수값||raw||"";const tp=s.톤수타입||"";if(!val||val==="없음")return"";return toTonUnit(tp&&tp!=="없음"?`${val}${tp}`:val);};
const _pkg5f=(str)=>{const s=String(str||"").trim().replace(/,/g,"");if(!s)return 0;const kg=s.match(/([\d.]+)\s*kg/i);if(kg)return parseFloat(kg[1]);const ton=s.match(/([\d.]+)\s*톤/);return ton?parseFloat(ton[1])*1000:0;};
const _fkg5f=(kg)=>{if(!kg)return"";const t=kg/1000;return t.toFixed(3).replace(/\.?0+$/,"")+"톤";};
const _sc5f=(main,stops)=>{const mainStr=String(main||"").trim();if(!mainStr||mainStr==="없음")return mainStr;const UNITS=["파레트","파렛트","박스","통","바구니"];const NORM={"파렛트":"파레트"};const getT=(s)=>{for(const u of UNITS){if(String(s).endsWith(u))return NORM[u]||u;}return null;};const getN=(s)=>{const m=String(s).match(/^([\d,.]+)/);return m?parseFloat(m[1].replace(/,/g,"")):null;};const stopC=stops.map(_ct5f).filter(Boolean);if(!stopC.length)return mainStr;const allC=[mainStr,...stopC];const byU={};const unk=[];for(const c of allC){const t=getT(c);if(t){const n=getN(c);if(n!=null){byU[t]=(byU[t]||0)+n;}else if(!unk.includes(c))unk.push(c);}else if(!unk.includes(c))unk.push(c);}return[...Object.entries(byU).map(([u,n])=>`${n}${u}`),...unk].join("+");};

const _pStops5f=_ss5f(r.경유상차목록||r.경유지_상차).filter(s=>s?.업체명?.trim());
const _dStops5f=_ss5f(r.경유하차목록||r.경유지_하차).filter(s=>s?.업체명?.trim());
const _totKg5f=_pkg5f(r.차량톤수)+_dStops5f.reduce((a,s)=>a+_pkg5f(_tt5f(s)),0)+_pStops5f.reduce((a,s)=>a+_pkg5f(_tt5f(s)),0);
const _totTon5f=_fkg5f(_totKg5f)||r.차량톤수||"-";
const _totCargo5f=_sc5f(r.화물내용,[..._pStops5f,..._dStops5f])||r.화물내용||"";
const _pHas5f=_pStops5f.length>0;
const _dHas5f=_dStops5f.length>0;
const _pNum5f=_pHas5f?`1.`:"";
const _dNum5f=_dHas5f?`${_dStops5f.length+1}.`:"";
const _pCon5f=buildContactLine(r.상차지담당자,r.상차지담당자번호);
const _dCon5f=buildContactLine(r.하차지담당자,r.하차지담당자번호);
const _pStopsText5f=_pHas5f?_pStops5f.map((s,i)=>{const cargo=_ct5f(s);const ton=_tt5f(s);return`${i+2}.상차경유지 : ${s.업체명||"-"}\n${s.주소||""}${s.담당자?`\n담당자 : ${s.담당자}${s.담당자번호?` (${formatPhone(s.담당자번호)})`:""}`:``}${s.상차시간?`\n상차시간 : ${s.상차시간}`:""}${cargo?`\n화물내용 : ${cargo}`:""}${ton?`\n화물톤수 : ${ton}`:""}${s.방법?`\n상차방법 : ${s.방법}`:``}`;}).join("\n\n"):"";
const _dStopsText5f=_dHas5f?_dStops5f.map((s,i)=>{const cargo=_ct5f(s);const ton=_tt5f(s);return`${i+1}.하차경유지 : ${s.업체명||"-"}\n${s.주소||""}${s.담당자?`\n담당자 : ${s.담당자}${s.담당자번호?` (${formatPhone(s.담당자번호)})`:""}`:``}${s.하차시간?`\n하차시간 : ${s.하차시간}`:""}${cargo?`\n화물내용 : ${cargo}`:""}${ton?`\n화물톤수 : ${ton}`:""}${s.방법?`\n하차방법 : ${s.방법}`:``}`;}).join("\n\n"):"";
const _mainPCargo5f=_pHas5f&&r.화물내용?`\n화물내용 : ${r.화물내용}`:"";
const _mainPTon5f=_pHas5f&&r.차량톤수?`\n화물톤수 : ${toTonUnit(r.차량톤수)}`:"";
const _mainDCargo5f=_pHas5f?(_totCargo5f?`\n화물내용 : ${_totCargo5f}`:""): (_dHas5f&&r.화물내용?`\n화물내용 : ${r.화물내용}`:"");
const _mainDTon5f=_pHas5f?(_totTon5f?`\n화물톤수 : ${_totTon5f}`:""):(_dHas5f&&r.차량톤수?`\n화물톤수 : ${toTonUnit(r.차량톤수)}`:"");

// 🔗 상차/하차 경유지 수가 같으면 연속 경유(체인) 건 — N번째 상차/하차를 한 쌍으로
// 묶어서 보여준다. (상세 설명은 driver 모드 쪽 isChainD 주석 참고)
const isChain5f = _pHas5f && _dHas5f && _pStops5f.length === _dStops5f.length;
const _dayDiff5f = (a, b) => {
  if (!a || !b) return 0;
  const s = new Date(a), e = new Date(b);
  return Math.round((new Date(e.getFullYear(), e.getMonth(), e.getDate()) - new Date(s.getFullYear(), s.getMonth(), s.getDate())) / (1000 * 60 * 60 * 24));
};
const _md5f = (dstr) => { const d = new Date(dstr); return `${d.getMonth() + 1}/${d.getDate()}`; };

const _fanOutBlock5f = `${_pNum5f}상차지 : ${r.상차지명||"-"}
${r.상차지주소||"-"}${_pCon5f?`\n${_pCon5f}`:""}${_mainPCargo5f}${_mainPTon5f}
상차시간 : ${pickupTime}${r.상차시간기준?` (${r.상차시간기준})`:""}
상차방법 : ${r.상차방법||"-"}${_pStopsText5f ? "\n\n" + _pStopsText5f : ""}

${_dStopsText5f ? _dStopsText5f+"\n\n" : ""}${_dNum5f}하차지 : ${r.하차지명||"-"}
${r.하차지주소||"-"}${_dCon5f?`\n${_dCon5f}`:""}${_mainDCargo5f}${_mainDTon5f}
하차시간 : ${dropTimeText}${r.하차시간기준?` (${r.하차시간기준})`:""}
하차방법 : ${r.하차방법||"-"}`;

const _chainBlock5f = isChain5f ? (() => {
  const pChain5f = [
    { name: r.상차지명, addr: r.상차지주소, cName: r.상차지담당자, cPhone: r.상차지담당자번호, cargo: r.화물내용, ton: r.차량톤수 ? toTonUnit(r.차량톤수) : "", method: r.상차방법, date: r.상차일, time: pickupTime, suffix: r.상차시간기준 },
    ..._pStops5f.map(s => ({ name: s.업체명, addr: s.주소, cName: s.담당자, cPhone: s.담당자번호, cargo: _ct5f(s), ton: _tt5f(s), method: s.방법, date: s.상차일, time: s.상차시간 || "즉시", suffix: "" })),
  ];
  const dChain5f = [
    { name: r.하차지명, addr: r.하차지주소, cName: r.하차지담당자, cPhone: r.하차지담당자번호, cargo: r.화물내용, ton: r.차량톤수 ? toTonUnit(r.차량톤수) : "", method: r.하차방법, date: r.하차일, time: dropTimeRaw, suffix: r.하차시간기준 },
    ..._dStops5f.map(s => ({ name: s.업체명, addr: s.주소, cName: s.담당자, cPhone: s.담당자번호, cargo: _ct5f(s), ton: _tt5f(s), method: s.방법, date: s.하차일, time: s.하차시간 || "즉시", suffix: "" })),
  ];
  const n5f = pChain5f.length;
  const renderLeg5f = (e, num, kind, timeOverride) => {
    const contact = buildContactLine(e.cName, e.cPhone);
    const t = timeOverride ?? e.time;
    return `${num}${kind}지 : ${e.name || "-"}
${e.addr || "-"}${contact ? `\n${contact}` : ""}${e.cargo ? `\n화물내용 : ${e.cargo}` : ""}${e.ton ? `\n화물톤수 : ${e.ton}` : ""}
${kind}시간 : ${t}${e.suffix ? ` (${e.suffix})` : ""}
${kind}방법 : ${e.method || "-"}`;
  };
  const legTexts5f = [];
  for (let i = 1; i <= n5f; i++) {
    const p5f = pChain5f[i - 1], d5f = dChain5f[i - 1];
    const dTime5f = i === 1 ? dropTimeText : (() => {
      const diff5f = _dayDiff5f(p5f.date, d5f.date);
      return diff5f >= 1 ? `${_md5f(d5f.date)} ${d5f.time}` : d5f.time;
    })();
    legTexts5f.push(`${renderLeg5f(p5f, `${i}.`, "상차")}\n\n${renderLeg5f(d5f, `${i}.`, "하차", dTime5f)}`);
  }
  let out5f = legTexts5f[0];
  for (let i = 1; i < n5f; i++) {
    const diff5f = _dayDiff5f(pChain5f[i - 1].date, dChain5f[i].date);
    const sep5f = diff5f === 1
      ? `익일 하차 건 (상차: ${_md5f(pChain5f[i - 1].date)} → 하차: ${_md5f(dChain5f[i].date)})`
      : diff5f >= 2
        ? `지정일 하차 건 (상차: ${_md5f(pChain5f[i - 1].date)} → 하차: ${_md5f(dChain5f[i].date)})`
        : "";
    out5f += sep5f ? `\n\n${sep5f}\n\n${legTexts5f[i]}` : `\n\n${legTexts5f[i]}`;
  }
  return out5f;
})() : "";

const coreBlock5f = isChain5f ? _chainBlock5f : _fanOutBlock5f;

        return buildCopyText("full", {
          body: `${isChain5f ? "" : dateNotice}${r.상차일||""} ${yoil}${r.운행유형==="왕복"?"\n[왕복운행]":""}${rotationNotice(r)}

${coreBlock5f}

중량 : ${_totTon5f}${_totCargo5f?` / ${_totCargo5f}`:""} ${r.차량종류||""}
결제방법 : ${r.지급방식||"-"}`,
          vars: copyVarsOf(r, { 업로드링크: getCopyTpl("full").includeUpload ? uploadUrlOf(r) : "", cold: /(냉장|냉동)/i.test(r.차량종류 || "-"), plate, name, phone, fare, payLabel, company: userCompany }),
        });
}
