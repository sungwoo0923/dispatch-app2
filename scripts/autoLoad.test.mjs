// 자동 상차완료 판정 단위 테스트 — node scripts/autoLoad.test.mjs
import { shouldAutoLoad, isLoadedCore, isLiveVisit, MIN_STAY_MS, REAPPROVE_HOLD_MS } from "../src/autoLoadCore.js";

let pass = 0, fail = 0;
const t = (name, got, want) => { if (got === want) pass++; else { fail++; console.log("  ✗", name, "→", got, "(기대", want + ")"); } };
const now = Date.parse("2026-11-10T10:00:00+09:00");
const base = { 상차지주소: "경기 김포시 고촌읍 1", 하차지주소: "인천 서구 2", 기사확인상태: "수락" };
const visited = (extra = {}) => ({ ...base, 상차지도착주소: base.상차지주소, 상차지도착근거: "현재위치", 상차지도착일시: now - 10 * 60e3, ...extra });

// 반경 안 / 밖
t("방문 기록 없음 → 자동 상차 안 함", shouldAutoLoad({ order: base, distKm: 10, now }), false);
t("실제 방문 후 아직 상차지 반경 안(0.5km) → 안 함", shouldAutoLoad({ order: visited(), distKm: 0.5, now }), false);
t("실제 방문 후 2km(아직 근처) → 안 함", shouldAutoLoad({ order: visited(), distKm: 2, now }), false);
t("실제 방문 후 3km 넘게 출발 → 자동 상차", shouldAutoLoad({ order: visited(), distKm: 4, now }), true);
t("위치 모름 → 안 함", shouldAutoLoad({ order: visited(), distKm: null, now }), false);
t("이미 상차완료 → 다시 안 함", shouldAutoLoad({ order: visited({ 상차완료일시: now - 1000 }), distKm: 4, now }), false);

// 지나간 GPS 흔적만 있는 방문(제보된 버그)
t("GPS 흔적으로만 '다녀옴' + 멀리 있음 → 자동 상차 안 함", shouldAutoLoad({ order: visited({ 상차지도착근거: "GPS기록" }), distKm: 20, now }), false);
t("근거 없는 예전 기록 → 안 함", shouldAutoLoad({ order: visited({ 상차지도착근거: undefined }), distKm: 20, now }), false);
t("GPS 흔적 방문은 표시상 상차 아님", isLoadedCore(visited({ 상차지도착근거: "GPS기록" }), 20), false);

// 머문 시간
t("방문 직후(1분) 3km 밖 → 안 함(GPS 튐)", shouldAutoLoad({ order: visited({ 상차지도착일시: now - 60e3 }), distKm: 4, now }), false);
t("방문 3분 뒤 → 자동 상차", shouldAutoLoad({ order: visited({ 상차지도착일시: now - MIN_STAY_MS }), distKm: 4, now }), true);

// 재승인·오더 수정
t("확인 안 한 오더 수정 있음 → 안 함", shouldAutoLoad({ order: visited(), distKm: 4, now, pendingChange: true }), false);
t("재승인 직후(30초) → 안 함", shouldAutoLoad({ order: visited({ 수정확인일시: now - 30e3 }), distKm: 4, now }), false);
t("재승인 2분 뒤 + 실제 방문 + 출발 → 자동 상차", shouldAutoLoad({ order: visited({ 수정확인일시: now - REAPPROVE_HOLD_MS }), distKm: 4, now }), true);
t("하차지만 바꿔 재승인 + 방문 기록 없음 → 안 함", shouldAutoLoad({ order: { ...base, 하차지주소: "인천 중구 9", 수정확인일시: now - 5 * 60e3 }, distKm: 4, now }), false);

// 상차지 좌표(주소) 변경
t("상차지 주소가 바뀌면 예전 방문 무효", isLiveVisit(visited({ 상차지주소: "서울 강서구 3" })), false);
t("상차지 바뀐 뒤 → 자동 상차 안 함", shouldAutoLoad({ order: visited({ 상차지주소: "서울 강서구 3" }), distKm: 4, now }), false);
t("주소 띄어쓰기·괄호만 다르면 같은 곳", isLiveVisit(visited({ 상차지도착주소: "경기 김포시  고촌읍 1 (창고)" })), true);

console.log(`자동 상차 판정 단위 테스트: 통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
