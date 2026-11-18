// marketing/shorts/record.mjs — 숏츠 녹화 실행
//   1) 개발 서버: npx vite --port 5173
//   2) node marketing/shorts/record.mjs 01      → marketing/shorts/out/01-카톡오더-한줄등록.mp4
// 대본 · 자막 원문은 marketing/shorts/SCRIPTS.md
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { openStage, record } from "./stage.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "out");
fs.mkdirSync(out, { recursive: true });

// 앱 안 이동 — 위쪽 메뉴의 펼침 항목은 숨어 있어도 바로 누른다
const goMenu = (S, name) => S.frame.evaluate((t) => [...document.querySelectorAll("button,a")].find((e) => e.innerText.trim() === t)?.click(), name);
const inputAfter = (S, label) => S.frame.locator(`xpath=//*[normalize-space(text())="${label}"]/following::input[1]`).first();

const SHORTS = {
  // ─────────────── 01. 카톡 오더 한 줄 → 오더 등록 · 마진 · 배차판 · 기사 수락 ───────────────
  "01": {
    file: "01-카톡오더-한줄등록.mp4",
    async run(S) {
      const LINE = "내일 평택항→인천공항 5톤윙 10파레트 독차 35만";
      await S.toasts(false);
      // 0~3.5초 — 후킹: 화주 카톡
      await S.caption("배차실 아침 8시 42분", "카톡 오더, 아직도<br><b>칸칸이 옮겨 치세요?</b>");
      await S.chat("화주 · 바로마켓 이천센터 김대리", "내일 평택항 → 인천공항<br>5톤 윙 10파레트 독차<br>35만 가능할까요?", "오전 8:42");
      await S.wait(3600);

      // STEP 1 — 빠른 등록에 한 줄 그대로
      await S.chat("", "");
      await goMenu(S, "오더등록");
      await S.wait(900);
      await S.toasts(false);
      const bar = S.frame.locator('input[placeholder*="평택→이천"]').first();
      const br = await S.rect(bar);
      const barY = br.y;
      await S.cam({ x: 40, y: barY - 20, w: 600, h: 90 });
      await S.caption("STEP 1 · 빠른 등록", "오더 문자<br><b>한 줄 그대로 붙여넣기</b>");
      await S.sub("상차일 · 상하차지 · 톤수 · 차종 · 화물 · 운임<br><b>알아서 칸마다 나눠 담아요</b>");
      await S.wait(900);
      await S.click(bar);
      await bar.pressSequentially(LINE, { delay: 55 });
      await S.cursorHide();
      await S.wait(400);
      // 해석된 칩 — 오른쪽으로 카메라 이동
      await S.cam({ x: 280, y: barY - 20, w: 790, h: 90 });
      await S.wait(1000);
      await S.hl({ x: 284, y: barY + 2, w: 760, h: br.height - 4 });
      await S.wait(2000);
      await S.hl(null);

      // STEP 2 — 지난 노선 찾기 → 엔터
      await S.cam({ x: 45, y: barY + 30, w: 700, h: 150 });
      await S.caption("STEP 2 · 지난 노선 자동 매칭", "자주 뛰는 노선은<br><b>거래처 · 상하차지까지 한 번에</b>");
      await S.sub("엔터 한 번이면 <b>오더 입력 끝</b>");
      await S.wait(1200);
      await S.hl({ x: 50, y: barY + 66, w: 1030, h: 60 });
      await S.wait(1600);
      await S.hl(null);
      await bar.press("Enter");
      await S.wait(500);
      const fr = await S.rect(S.frame.getByText("ORDER ENTRY").first());
      await S.cam({ x: 55, y: fr.y + 60, w: 690, h: 280 });
      await S.wait(2300);
      await S.cam({ x: 390, y: fr.y + 60, w: 690, h: 280 });
      await S.wait(2000);

      // STEP 3 — 기사운임 → 수수료(마진) 자동
      await S.caption("STEP 3 · 마진 자동 계산", "기사운임만 넣으면<br><b>수수료가 바로 계산</b>");
      await S.sub("청구운임 35만 − 기사운임 30만<br>= <b>수수료 5만 원</b>, 손으로 안 빼도 돼요");
      const drv = inputAfter(S, "기사운임");
      await drv.evaluate((e) => e.scrollIntoView({ block: "center" }));
      await S.wait(300);
      const dr = await S.rect(drv);
      await S.cam({ x: 220, y: dr.y - 60, w: 520, h: 120 });
      await S.wait(1000);
      await S.click(drv);
      await drv.pressSequentially("300000", { delay: 110 });
      await S.cursorHide();
      await S.wait(500);
      const dr2 = await S.rect(drv);
      await S.hl({ x: 228, y: dr2.y - 44, w: 500, h: 92 });
      await S.wait(2400);
      await S.hl(null);

      // STEP 4 — 실시간 배차판 숫자
      await goMenu(S, "실시간배차현황");
      await S.wait(1300);
      await S.toasts(false);
      await S.frame.evaluate(() => window.scrollTo(0, 0));
      await S.caption("STEP 4 · 실시간 배차현황", "오늘 청구 · 기사운임 · 수수료<br><b>배차판에서 한눈에</b>");
      await S.sub("마감 때 엑셀 다시 맞출 필요 없어요");
      const tr = await S.rect(S.frame.getByText(/^청구$/).first()).catch(() => ({ y: 220 }));
      await S.cam({ x: 50, y: tr.y - 30, w: 640, h: 200 });
      await S.wait(1000);
      await S.hl({ x: 52, y: tr.y - 22, w: 628, h: 44 });
      await S.wait(2500);
      await S.hl(null);
      // 미배차 · 긴급 줄
      await S.cam({ x: 50, y: tr.y + 60, w: 760, h: 520 });
      await S.sub("<b>긴급 · 미배차</b>는 빨간 줄로 바로 보여요");
      await S.wait(2200);

      // STEP 5 — 기사 수락 · 거절 알림
      await S.toasts(true);
      await S.caption("STEP 5 · 기사 앱 연동", "기사님 수락 · 거절<br><b>바로 알림으로</b>");
      await S.sub("\"기사님 배차 받으셨어요?\" <b>확인 전화 그만</b>");
      await S.cam({ x: 1080, y: 520, w: 345, h: 310 });
      await S.wait(3600);

      // 엔드카드
      await S.endCard("오더 접수부터<br>배차 · 정산 · 계산서까지<br><b>한 화면에서</b>", "PC · 모바일 · 기사 앱 연동<br>운송사 · 주선사 배차 프로그램", "로지스웹 도입 문의 ▸ 프로필 링크");
      await S.wait(3800);
    },
  },
};

const id = process.argv[2] || "01";
const job = SHORTS[id];
if (!job) { console.error(`없는 번호: ${id} (있는 것: ${Object.keys(SHORTS).join(", ")})`); process.exit(1); }
const S = await openStage();
try {
  const r = await record(S, path.join(out, job.file), job.run);
  console.log(`✔ ${job.file} · ${r.seconds}초 · 프레임 ${r.frames}`);
} finally {
  await S.browser.close();
}
