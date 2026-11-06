// ======================= src/orderMarketShare.js =======================
// ⭐ 2026-11-06 오더 등록의 [저장 + 허브 등록] — 저장한 오더를 오더마켓(운송사 간 오더 거래소)에도 올린다.
//  오더마켓 사이트(cafe-site)와 같은 구조(cafe-site/src/cafeApi.js 맨 위 설명)로 쓴다:
//   · cafeOrders/{id}            공개 본문 — 상·하차는 시/구까지만, 연락처·정확한 주소 없음
//   · cafeOrders/{id}/private/detail  상·하차지명·주소·현장 담당자 — 매칭된 운송사에게만 공개
//   · cafeOrders/{id}/private/settle  우리 회사만 보는 정산 메모(청구 운임 · 제시 운임 · 수수료)
//  다른 운송사가 [이 오더 잡기] → 우리가 수락하면 그 운송사 프로그램에 오더가 생기고,
//  그쪽 배차/운송 진행이 우리 원래 오더(posterOrderId)에 반영된다(functions/orderMarket.js).
import { collection, doc, writeBatch, updateDoc, serverTimestamp } from "firebase/firestore";

const SIDO_ALIAS = {
  서울특별시: "서울", 서울시: "서울", 부산광역시: "부산", 부산시: "부산", 대구광역시: "대구", 대구시: "대구",
  인천광역시: "인천", 인천시: "인천", 광주광역시: "광주", 광주시: "광주", 대전광역시: "대전", 대전시: "대전",
  울산광역시: "울산", 울산시: "울산", 세종특별자치시: "세종", 세종시: "세종", 경기도: "경기", 강원도: "강원",
  강원특별자치도: "강원", 충청북도: "충북", 충청남도: "충남", 전라북도: "전북", 전북특별자치도: "전북",
  전라남도: "전남", 경상북도: "경북", 경상남도: "경남", 제주특별자치도: "제주", 제주도: "제주",
};
const SIDO = ["서울", "경기", "인천", "강원", "충북", "충남", "대전", "세종", "전북", "전남", "광주", "경북", "경남", "대구", "울산", "부산", "제주"];
// (cafe-site/src/cafeConstants.js toRegion 과 같은 규칙)
export function toRegion(addr) {
  const t = String(addr || "").trim().split(/\s+/).filter(Boolean);
  const sido = SIDO_ALIAS[t[0]] || (SIDO.includes(t[0]) ? t[0] : "");
  if (!sido) return { sido: "", sigungu: "" };
  let sigungu = t[1] || "";
  if (sido === "세종") sigungu = "";
  else if (/시$/.test(sigungu) && /구$/.test(t[2] || "")) sigungu = `${sigungu} ${t[2]}`;
  if (!/(시|군|구)$/.test(sigungu)) sigungu = "";
  return { sido, sigungu };
}
const num = (v) => Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0;
const tonNum = (v) => { const m = String(v || "").match(/([\d.]+)\s*(kg|톤|t)?/i); if (!m) return 0; const n = parseFloat(m[1]); return /kg/i.test(m[2] || "") ? n / 1000 : n; };

// rec: 저장한 오더 · savedIds: 저장된 오더 번호들(첫 번째를 원래 오더로 연결) · profile: users/{uid} 문서
export async function shareToOrderMarket(db, { rec, savedIds = [], uid, profile = {}, posterName = "" }) {
  const ids = (savedIds || []).flat(3).filter((x) => typeof x === "string" && x);
  const up = toRegion(rec.상차지주소);
  const dn = toRegion(rec.하차지주소);
  const billing = num(rec.청구운임);
  // 다른 운송사에 제시하는 운임 = 기사운임(우리가 차에 주려던 금액)이 있으면 그것, 없으면 청구운임
  const offer = num(rec.기사운임) || billing;
  const ref = doc(collection(db, "cafeOrders"));
  const b = writeBatch(db);
  b.set(ref, {
    v: 2,
    source: "company",
    companyName: rec.companyName || profile.companyName || "",
    posterUid: uid || "",
    posterName: posterName || profile.name || "",
    posterNickname: rec.companyName || profile.companyName || "",
    posterOrderId: ids[0] || "",
    posterOrderIds: ids,
    상차시도: up.sido, 상차시군구: up.sigungu, 하차시도: dn.sido, 하차시군구: dn.sigungu,
    상차일: rec.상차일 || "", 상차시간: rec.상차시간 || "", 하차일: rec.하차일 || "", 하차시간: rec.하차시간 || "",
    화물내용: rec.화물내용 || "", 차량톤수: rec.차량톤수 || "", 톤수값: tonNum(rec.차량톤수), 차량종류: rec.차량종류 || "",
    지급방식: rec.지급방식 || "", 상차방법: rec.상차방법 || "", 하차방법: rec.하차방법 || "",
    운임: offer ? `${offer.toLocaleString()}원` : "협의", 운임값: offer, 협의: !offer,
    혼적: !!rec.혼적, 운행유형: rec.운행유형 || "편도", 긴급: !!rec.긴급,
    경유여부: (rec.경유상차목록?.length > 0 || rec.경유하차목록?.length > 0),
    status: "open",
    requesterUids: [],
    takerUid: null, takerCompany: null, takerName: null,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  b.set(doc(db, "cafeOrders", ref.id, "private", "detail"), {
    상차지명: rec.상차지명 || "", 상차지주소: rec.상차지주소 || "",
    하차지명: rec.하차지명 || "", 하차지주소: rec.하차지주소 || "",
    상차지담당자: rec.상차지담당자 || "", 상차지담당자번호: rec.상차지담당자번호 || "",
    하차지담당자: rec.하차지담당자 || "", 하차지담당자번호: rec.하차지담당자번호 || "",
    메모: rec.메모 || "",
    posterPhone: profile.phone || "", posterName: posterName || profile.name || "", posterCompany: rec.companyName || "",
  });
  b.set(doc(db, "cafeOrders", ref.id, "private", "settle"), {
    청구운임: billing, 제시운임: offer, 수수료: billing && offer ? billing - offer : 0, 거래처명: rec.거래처명 || "",
    updatedAt: serverTimestamp(),
  });
  await b.commit();
  // 우리 원래 오더에도 "오더마켓에 올림" 표시(배차현황에서 어떤 오더가 마켓에 나가 있는지 알 수 있게)
  await Promise.all(ids.map((id) => updateDoc(doc(db, "orders", id), { 오더마켓Id: ref.id, 오더마켓상태: "모집중" }).catch(() => {})));
  return ref.id;
}
