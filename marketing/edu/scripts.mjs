// marketing/edu/scripts.mjs — 안전교육 영상 대본 v2(2026-11-24)
//  장면 종류: cover(표지) · chapter(장 표지) · points(그림 + 요점) · dodont(바른 예 · 잘못된 예) · steps(순서) · law(법 · 기준) · check(체크리스트) · end(마무리)
//  · say = 읽는 말 = 자막(한 줄에 들어가게 짧게) · pt = 그 말과 함께 나오는 요점(짧게)
//  · img = images/<이름>.jpg (gen-images.mjs 가 IMAGES 프롬프트로 만든다 — 글자 없는 3D 그림)
//  · 숫자 · 법 조항은 확실한 것만(도로교통법 제39조 제4항 적재물 추락 방지 의무)
export const STYLE = "Clean modern 3D isometric illustration, soft studio lighting, muted navy blue (#1B2B4B), slate grey and warm beige palette, off-white seamless background, high detail, professional corporate safety-training style, Korean logistics context. Absolutely no text, no letters, no numbers, no logos, no watermark.";

export const IMAGES = {
  // ── 적재 · 결박
  l_cover: "A Korean 5-ton cargo truck with a flatbed fully loaded with cardboard boxes on wooden pallets, firmly secured with navy ratchet straps and corner protectors, three-quarter front view, hero shot.",
  l_brake: "A flatbed truck braking hard on a highway, unsecured cardboard boxes sliding forward and one box falling onto the road behind, motion lines, a car behind braking. Dramatic but not gory.",
  l_curve: "A box truck on a curved road leaning slightly outward, cargo inside shifting to one side, shown with a transparent cutaway of the cargo box.",
  l_law: "A clean desk with an open law book, a gavel and a miniature truck model with strapped cargo, calm professional mood.",
  l_inspect: "A truck driver in a navy work jacket and reflective vest inspecting the flatbed floor and the side rope hooks of a truck with a flashlight, morning light.",
  l_gear: "Flat lay of cargo securing equipment neatly arranged: navy ratchet straps, a steel chain with a load binder, a cargo net, rubber anti-slip mats, plastic corner protectors, wooden chocks.",
  l_center: "Cutaway side view of a truck cargo bed showing heavy pallets placed low in the middle and lighter boxes on top, balanced load, a subtle center-of-gravity marker sphere.",
  l_front: "Pallets loaded tight against the front headboard of a flatbed truck, no gaps between pallets, gaps filled with an inflatable dunnage airbag and wooden blocks.",
  l_strap_good: "Close-up of a ratchet strap tightened over a stack of boxes with a plastic corner protector at the edge, strap flat without twists, ratchet handle closed and locked.",
  l_strap_bad: "Close-up of a loose, twisted, frayed cargo strap rubbing directly on a sharp box edge without a corner protector, the strap is visibly torn.",
  l_ratchet: "Hands wearing work gloves operating a navy ratchet buckle on a cargo strap attached to a truck side hook, close-up, detailed mechanism.",
  l_count: "Top-down isometric view of a long flatbed truck with many evenly spaced ratchet straps across the entire length of the load.",
  l_coil: "A steel coil on a flatbed truck resting in a cradle with wooden chocks, secured with heavy chains crossing through the eye of the coil.",
  l_pipe: "Long steel pipes loaded on a flatbed truck, bundled and secured with multiple chains, front headboard protecting the cab.",
  l_machine: "A small construction machine (mini excavator) on a low-bed trailer secured with four chains at each corner, chocks under the tracks.",
  l_drum: "Industrial drums and plastic rolls on a pallet, wrapped with stretch film and secured with straps on a truck bed.",
  l_bad_high: "A truck overloaded with boxes stacked far too high, leaning, a single loose strap, wrong example, slightly dramatic.",
  l_tarp: "A wing body truck with both side wings fully closed and latched, and a flatbed truck with a tarp cover tightly tied down, side by side.",
  l_walk: "A truck driver walking around a loaded truck doing a final visual check, looking at the straps, dotted circular path around the truck on the ground.",
  l_rest: "A truck parked at a Korean highway rest area, the driver re-tightening a cargo strap, evening light.",
  l_drive: "A truck driving smoothly on a highway at a safe distance from other vehicles, calm traffic, sunny day.",
  l_emergency: "A truck stopped on the highway shoulder with hazard lights on and a red warning triangle placed far behind it, the driver standing safely behind the guardrail making a phone call.",
  l_end: "A neatly loaded and strapped truck leaving a logistics warehouse at sunrise, optimistic mood.",
  // ── 상 · 하차장
  d_cover: "A modern Korean logistics warehouse loading dock with several trucks backed up to dock doors, forklifts working, workers in reflective vests and helmets, wide hero shot.",
  d_danger: "Busy loading dock area with a forklift, pedestrians and a reversing truck in the same space, subtle red hazard zones on the floor.",
  d_enter: "A truck slowly entering a logistics yard following floor arrows and a speed limit sign without text, a site guide with a light baton signaling.",
  d_ppe: "Safety gear flat lay: white safety helmet, reflective vest, safety shoes, work gloves, arranged neatly.",
  d_reverse: "A truck reversing toward a dock door with a spotter standing safely to the side giving hand signals, rear camera view inset.",
  d_blind: "Top-down view of a truck showing its blind spots highlighted as soft red zones behind and beside the vehicle.",
  d_secure: "Close-up of a wheel chock placed under the rear wheel of a truck at a loading dock, parking brake engaged, keys removed from the ignition shown inset.",
  d_forklift: "A forklift carrying a pallet with a highlighted circular working radius on the floor, a pedestrian waiting safely outside the line.",
  d_eye: "A truck driver and a forklift operator making eye contact and exchanging a thumbs-up signal before moving.",
  d_fork_back: "A forklift reversing with a pedestrian behind it in the blind spot, warning style, wrong example.",
  d_under: "A person standing under raised forklift forks with a pallet, wrong and dangerous example, highlighted with a red tint.",
  d_wing: "A wing body truck with wings opening upward, a worker keeping hands away at a safe distance.",
  d_liftgate: "A truck rear lift gate platform with a pallet jack, worker standing beside the platform not on its edge.",
  d_climb: "A driver climbing down from a truck cargo bed using three points of contact (two hands on the handle, one foot on the step), correct posture.",
  d_jump: "A driver jumping down from a truck cargo bed, wrong example, risk of ankle injury.",
  d_lift: "A worker lifting a box correctly by bending the knees with a straight back, and a second ghosted figure bending at the waist as the wrong way.",
  d_wet: "A rainy loading dock with puddles and a slippery ramp, worker walking carefully with anti-slip shoes.",
  d_leave: "A driver doing a final walk-around at the dock, removing the wheel chock, closing the rear doors before departure.",
  d_report: "A dock supervisor and a driver talking, the supervisor writing on a tablet, near-miss report mood, calm.",
  d_end: "A clean and orderly loading dock at dusk with trucks lined up and workers in vests giving a thumbs up.",
};

export const COURSES = {
  drv_load: {
    title: "화물 적재 · 결박 안전",
    code: "EDU-D01",
    slides: [
      { type: "cover", img: "l_cover", sub: "짐을 안전하게 싣고 단단히 묶는 법", chapters: ["왜 중요할까요", "출발 전 점검", "적재 원칙", "결박 장비", "결박 방법", "화물별 결박", "잘못된 예", "운행 중 확인", "비상 대응"], lines: [
        { say: "화물 적재와 결박 안전교육을 시작하겠습니다." },
        { say: "떨어진 짐 하나가 뒤차 운전자의 목숨을 위협합니다." },
        { say: "오늘은 싣는 법부터 묶는 법, 운행 중 확인까지 차례로 알아보겠습니다." },
      ] },
      { type: "chapter", no: 1, title: "왜 중요할까요", sub: "짐이 떨어지는 이유", img: "l_brake", lines: [
        { say: "먼저 짐이 왜 떨어지는지부터 알아보겠습니다." },
      ] },
      { type: "points", head: "급제동하면 짐은 앞으로 밀려요", img: "l_brake", lines: [
        { say: "차는 멈춰도, 실린 짐은 달리던 속도 그대로 나아가려 합니다.", pt: "차는 멈춰도 짐은 계속 나아가요" },
        { say: "묶지 않은 짐은 앞쪽 격벽이나 운전석을 덮칠 수 있습니다.", pt: "앞쪽 격벽 · 운전석 충돌 위험" },
        { say: "뒤로 떨어지면 뒤따르던 차가 피할 시간이 없습니다.", pt: "뒤로 떨어지면 2차 사고" },
      ] },
      { type: "points", head: "커브에서는 짐이 바깥으로 쏠려요", img: "l_curve", lines: [
        { say: "커브를 돌 때 짐은 바깥쪽으로 밀려납니다.", pt: "커브 → 바깥쪽으로 밀림" },
        { say: "짐이 한쪽으로 쏠리면 차가 기울고, 심하면 넘어집니다.", pt: "쏠리면 차가 기울고 전복 위험" },
        { say: "그래서 싣는 위치와 묶는 힘이 모두 중요합니다.", pt: "싣는 위치 + 묶는 힘" },
      ] },
      { type: "law", head: "법으로 정한 운전자 의무", img: "l_law", quote: "운전자는 운전 중 실은 화물이 떨어지지 않도록 덮개를 씌우거나 묶는 등 확실하게 고정될 수 있도록 필요한 조치를 해야 한다.", src: "도로교통법 제39조 제4항", lines: [
        { say: "도로교통법은 화물이 떨어지지 않게 고정할 의무를 운전자에게 둡니다." },
        { say: "덮개를 씌우거나 묶어서, 확실하게 고정해야 합니다." },
        { say: "결박은 선택이 아니라 운전자의 의무입니다." },
      ] },
      { type: "chapter", no: 2, title: "출발 전 점검", sub: "싣기 전에 차와 장비부터", img: "l_inspect", lines: [
        { say: "짐을 싣기 전에, 차와 장비부터 점검합니다." },
      ] },
      { type: "points", head: "적재함 상태 확인", img: "l_inspect", lines: [
        { say: "적재함 바닥에 기름이나 물기, 깨진 곳이 없는지 봅니다.", pt: "바닥 기름 · 물기 · 파손 확인" },
        { say: "벨트를 거는 고리와 후크가 휘거나 빠지지 않았는지 확인합니다.", pt: "결박 고리 · 후크 상태" },
        { say: "앞쪽 격벽과 옆판, 뒷문 잠금장치도 함께 봅니다.", pt: "격벽 · 옆판 · 뒷문 잠금" },
      ] },
      { type: "points", head: "결박 장비 점검", img: "l_gear", lines: [
        { say: "벨트가 찢어지거나 해진 곳, 기름에 젖은 곳은 없는지 봅니다.", pt: "벨트 찢김 · 해짐 · 오염" },
        { say: "라쳇이 부드럽게 감기고 확실히 잠기는지 확인합니다.", pt: "라쳇 감김 · 잠김 확인" },
        { say: "체인은 고리가 벌어지거나 녹슨 곳이 없는지 봅니다.", pt: "체인 고리 벌어짐 · 녹" },
        { say: "상한 장비는 아끼지 말고, 바로 새것으로 바꿉니다.", pt: "상한 장비는 바로 교체" },
      ] },
      { type: "chapter", no: 3, title: "적재 원칙", sub: "어디에, 어떻게 실을까", img: "l_center", lines: [
        { say: "다음은 짐을 어디에, 어떻게 싣는지입니다." },
      ] },
      { type: "points", head: "무거운 짐은 아래, 가운데에", img: "l_center", lines: [
        { say: "무거운 짐은 아래쪽, 적재함 가운데에 놓습니다.", pt: "무거운 짐 → 아래 · 가운데" },
        { say: "가벼운 짐은 그 위에 올려 무게중심을 낮춥니다.", pt: "가벼운 짐 → 위 · 무게중심 낮게" },
        { say: "좌우와 앞뒤로 고르게 나눠, 한쪽에 몰리지 않게 합니다.", pt: "좌우 · 앞뒤 고르게" },
      ] },
      { type: "points", head: "앞쪽부터 빈틈 없이", img: "l_front", lines: [
        { say: "짐은 앞쪽 격벽에 붙여서부터 차례로 싣습니다.", pt: "앞쪽 격벽에 밀착" },
        { say: "짐과 짐 사이에 틈이 있으면 달리면서 움직입니다.", pt: "틈이 있으면 짐이 움직여요" },
        { say: "틈은 받침목이나 에어백, 빈 파레트로 채웁니다.", pt: "받침목 · 에어백으로 틈 채우기" },
      ] },
      { type: "dodont", head: "적재 높이 · 무게", good: { img: "l_count", label: "정해진 높이 · 무게 안에서 고르게" }, bad: { img: "l_bad_high", label: "높게 쌓고 끈 하나로 묶기" }, lines: [
        { say: "차량에 정해진 적재 중량과 높이를 넘기지 않습니다." },
        { say: "무게를 넘기면 멈추는 거리가 길어지고 브레이크에 무리가 갑니다." },
        { say: "높게 쌓으면 바람과 커브에 약하고, 터널이나 육교에 부딪힐 수 있습니다." },
      ] },
      { type: "chapter", no: 4, title: "결박 장비", sub: "장비마다 쓰임이 달라요", img: "l_gear", lines: [
        { say: "이제 결박 장비를 하나씩 알아보겠습니다." },
      ] },
      { type: "steps", head: "결박 장비 다섯 가지", steps: [["strap", "라쳇 벨트", "박스 · 파레트"], ["chain", "체인 · 바인더", "철강 · 장비"], ["net", "그물망 · 덮개", "흩어지는 짐"], ["mat", "미끄럼 방지 매트", "바닥 마찰"], ["corner", "모서리 보호대", "벨트 보호"]], lines: [
        { say: "라쳇 벨트는 박스와 파레트 짐에 가장 많이 씁니다." },
        { say: "체인과 바인더는 철강이나 장비처럼 무겁고 단단한 짐에 씁니다." },
        { say: "그물망과 덮개는 작은 짐이 흩어지거나 날리지 않게 막습니다." },
        { say: "미끄럼 방지 매트는 바닥 마찰을 높여 짐이 덜 밀리게 합니다." },
        { say: "모서리 보호대는 날카로운 모서리에서 벨트가 끊어지는 것을 막습니다." },
      ] },
      { type: "chapter", no: 5, title: "결박 방법", sub: "단단하게, 충분하게", img: "l_ratchet", lines: [
        { say: "다음은 실제로 묶는 방법입니다." },
      ] },
      { type: "dodont", head: "벨트는 이렇게 걸어요", good: { img: "l_strap_good", label: "보호대 대고 · 꼬임 없이 · 잠금" }, bad: { img: "l_strap_bad", label: "모서리에 바로 · 꼬이고 해진 벨트" }, lines: [
        { say: "벨트는 꼬이지 않게 펴서, 짐 위를 눌러 주도록 겁니다." },
        { say: "모서리에는 반드시 보호대를 대서 벨트가 끊어지지 않게 합니다." },
        { say: "해지거나 꼬인 벨트는 힘을 제대로 받지 못합니다." },
      ] },
      { type: "points", head: "라쳇은 끝까지 잠그기", img: "l_ratchet", lines: [
        { say: "라쳇을 감아 벨트를 팽팽하게 당긴 뒤, 손잡이를 끝까지 닫아 잠급니다.", pt: "팽팽하게 · 손잡이 끝까지 잠금" },
        { say: "남은 끈은 묶어 정리해서, 달리면서 펄럭이지 않게 합니다.", pt: "남은 끈은 묶어서 정리" },
        { say: "벨트를 건 고리가 제자리에 걸렸는지 다시 확인합니다.", pt: "고리 걸림 다시 확인" },
      ] },
      { type: "points", head: "벨트는 충분한 개수로", img: "l_count", lines: [
        { say: "벨트 한두 개로는 긴 짐 전체를 잡을 수 없습니다.", pt: "한두 개로는 부족해요" },
        { say: "짐의 길이를 따라 고르게, 충분한 개수를 겁니다.", pt: "길이를 따라 고르게" },
        { say: "맨 앞과 맨 뒤 짐에는 꼭 벨트가 걸려 있어야 합니다.", pt: "맨 앞 · 맨 뒤 짐 꼭 결박" },
      ] },
      { type: "chapter", no: 6, title: "화물별 결박", sub: "짐에 맞는 방법으로", img: "l_coil", lines: [
        { say: "짐의 모양에 따라 묶는 방법도 달라집니다." },
      ] },
      { type: "points", head: "철강 코일", img: "l_coil", lines: [
        { say: "코일은 구르지 않게 받침대와 고임목 위에 놓습니다.", pt: "받침대 · 고임목으로 구름 방지" },
        { say: "체인을 코일 구멍으로 통과시켜 앞뒤로 단단히 묶습니다.", pt: "체인을 구멍으로 통과해 결박" },
      ] },
      { type: "points", head: "파이프 · 긴 자재", img: "l_pipe", lines: [
        { say: "긴 자재는 다발로 묶은 뒤, 여러 곳을 나눠 결박합니다.", pt: "다발로 묶고 여러 곳 결박" },
        { say: "앞으로 밀려 운전석을 덮치지 않게 앞쪽 격벽을 확인합니다.", pt: "앞쪽 격벽 확인" },
      ] },
      { type: "points", head: "장비 · 기계", img: "l_machine", lines: [
        { say: "장비는 네 귀퉁이를 체인으로 따로따로 묶습니다.", pt: "네 귀퉁이 따로 체인 결박" },
        { say: "바퀴나 궤도 아래에는 고임목을 대서 움직이지 않게 합니다.", pt: "바퀴 · 궤도에 고임목" },
      ] },
      { type: "points", head: "드럼 · 롤 · 작은 짐", img: "l_drum", lines: [
        { say: "작은 짐은 랩으로 감아 한 덩어리로 만든 뒤 묶습니다.", pt: "랩으로 감아 한 덩어리로" },
        { say: "구르는 짐은 고임목으로 막고, 그물망으로 덮습니다.", pt: "구르는 짐은 고임목 · 그물망" },
      ] },
      { type: "chapter", no: 7, title: "덮개 · 문 잠그기", sub: "출발 직전 마지막 확인", img: "l_tarp", lines: [
        { say: "출발하기 직전, 덮개와 문을 확인합니다." },
      ] },
      { type: "points", head: "덮개와 문은 끝까지", img: "l_tarp", lines: [
        { say: "윙바디는 날개가 끝까지 내려와 잠겼는지 확인합니다.", pt: "윙 날개 끝까지 · 잠금" },
        { say: "탑차는 뒷문 잠금장치를 다시 한 번 눌러 봅니다.", pt: "탑차 뒷문 잠금 다시 확인" },
        { say: "덮개는 바람에 펄럭이지 않게 촘촘히 묶습니다.", pt: "덮개는 펄럭이지 않게" },
      ] },
      { type: "chapter", no: 8, title: "운행 중 확인", sub: "출발 후에도 다시", img: "l_walk", lines: [
        { say: "결박은 출발한 뒤에도 다시 확인해야 합니다." },
      ] },
      { type: "steps", head: "출발부터 도착까지", steps: [["walk", "출발 전", "차 한 바퀴 돌기"], ["rest", "첫 휴게소", "벨트 다시 조이기"], ["road", "운행 중", "급제동 · 급커브 피하기"], ["flag", "도착", "풀기 전 상태 보기"]], lines: [
        { say: "출발 전에는 차를 한 바퀴 돌며 결박 상태를 눈으로 확인합니다." },
        { say: "달리다 보면 벨트가 느슨해집니다. 첫 휴게소에서 다시 조여 주세요." },
        { say: "운행 중에는 급출발, 급제동, 급커브를 피하고 차간 거리를 넉넉히 둡니다." },
        { say: "도착하면 벨트를 풀기 전에 짐이 쏠리지 않았는지 먼저 봅니다." },
      ] },
      { type: "chapter", no: 9, title: "비상 대응", sub: "짐이 움직이거나 떨어졌다면", img: "l_emergency", lines: [
        { say: "마지막으로, 문제가 생겼을 때 어떻게 할지 알아보겠습니다." },
      ] },
      { type: "points", head: "멈추고, 알리고, 피하기", img: "l_emergency", lines: [
        { say: "짐이 움직이는 느낌이 들면 바로 안전한 곳에 세웁니다.", pt: "이상하면 안전한 곳에 바로 정차" },
        { say: "비상등을 켜고, 차 뒤쪽 멀리 삼각대를 세웁니다.", pt: "비상등 · 삼각대" },
        { say: "떨어진 짐을 치우려고 도로에 들어가지 않습니다.", pt: "도로에 들어가지 않기" },
        { say: "가드레일 밖으로 피한 뒤, 경찰과 회사에 바로 알립니다.", pt: "가드레일 밖으로 · 바로 신고" },
      ] },
      { type: "check", head: "오늘의 체크리스트", items: ["적재함 · 장비 점검", "무거운 짐은 아래 · 가운데", "앞쪽부터 빈틈 없이", "보호대 대고 충분히 결박", "라쳇 잠금 · 남은 끈 정리", "덮개 · 문 잠금", "첫 휴게소에서 다시 확인"], lines: [
        { say: "오늘 배운 내용을 체크리스트로 정리하겠습니다." },
        { say: "적재함과 장비를 점검하고, 무거운 짐은 아래 가운데에 싣습니다." },
        { say: "앞쪽부터 빈틈 없이 싣고, 보호대를 대서 충분히 묶습니다." },
        { say: "라쳇을 잠그고, 덮개와 문을 잠근 뒤, 첫 휴게소에서 다시 확인합니다." },
      ] },
      { type: "end", img: "l_end", lines: [
        { say: "끝까지 시청해 주셔서 감사합니다." },
        { say: "오늘도 안전하게 운행하세요. 이어서 이수 서명을 해 주세요." },
      ] },
    ],
  },
  drv_dock: {
    title: "상 · 하차장 안전",
    code: "EDU-D02",
    slides: [
      { type: "cover", img: "d_cover", sub: "끼임 · 부딪힘 · 넘어짐 사고 막기", chapters: ["상하차장의 위험", "도착 · 진입", "후진 · 접안", "차량 고정", "지게차 안전", "끼임 · 추락", "몸 보호", "출차 · 신고"], lines: [
        { say: "상하차장 안전교육을 시작하겠습니다." },
        { say: "상하차장은 차량과 지게차, 사람이 한 곳에서 함께 움직이는 곳입니다." },
        { say: "오늘은 도착부터 출차까지, 꼭 지켜야 할 것들을 알아보겠습니다." },
      ] },
      { type: "chapter", no: 1, title: "상하차장의 위험", sub: "어디서 사고가 날까", img: "d_danger", lines: [
        { say: "먼저 상하차장에서 어떤 사고가 나는지 알아보겠습니다." },
      ] },
      { type: "steps", head: "자주 일어나는 사고", steps: [["truck", "부딪힘", "후진 차량 · 지게차"], ["hand", "끼임", "날개 · 문 · 리프트"], ["fall", "떨어짐", "적재함 · 계단"], ["slip", "넘어짐", "젖은 바닥 · 짐"]], lines: [
        { say: "가장 많은 것은 후진하는 차나 지게차에 부딪히는 사고입니다." },
        { say: "윙 날개와 문, 리프트 사이에 손이나 몸이 끼이기도 합니다." },
        { say: "적재함에서 내려오다 떨어지는 사고도 자주 일어납니다." },
        { say: "젖은 바닥이나 흩어진 짐에 걸려 넘어지기도 합니다." },
      ] },
      { type: "chapter", no: 2, title: "도착 · 진입", sub: "천천히, 안내에 따라", img: "d_enter", lines: [
        { say: "작업장에 도착하면 이렇게 들어갑니다." },
      ] },
      { type: "points", head: "천천히 들어가기", img: "d_enter", lines: [
        { say: "작업장 안에서는 사람이 걷는 속도로 천천히 움직입니다.", pt: "사람 걷는 속도로 천천히" },
        { say: "바닥 표시와 현장 안내자의 신호를 따릅니다.", pt: "바닥 표시 · 안내자 신호 따르기" },
        { say: "보행 통로와 지게차 통로를 막고 서 있지 않습니다.", pt: "통로를 막지 않기" },
      ] },
      { type: "points", head: "보호구 착용", img: "d_ppe", lines: [
        { say: "차에서 내리기 전에, 현장이 정한 보호구를 착용합니다.", pt: "내리기 전에 보호구 착용" },
        { say: "안전모, 안전화, 형광 조끼, 그리고 장갑을 갖춥니다.", pt: "안전모 · 안전화 · 조끼 · 장갑" },
        { say: "형광 조끼는 지게차 운전자가 나를 볼 수 있게 해 줍니다.", pt: "조끼 = 내가 보이게" },
      ] },
      { type: "chapter", no: 3, title: "후진 · 접안", sub: "보이지 않는 곳을 조심", img: "d_reverse", lines: [
        { say: "다음은 가장 위험한 순간, 후진과 접안입니다." },
      ] },
      { type: "points", head: "트럭의 사각지대", img: "d_blind", lines: [
        { say: "트럭 뒤쪽과 옆쪽에는 거울로 보이지 않는 곳이 넓게 있습니다.", pt: "뒤 · 옆은 거울로 안 보여요" },
        { say: "후방카메라도 사람을 다 보여 주지 못할 때가 있습니다.", pt: "카메라도 다 못 봐요" },
      ] },
      { type: "dodont", head: "후진할 때", good: { img: "d_reverse", label: "유도자 신호 · 옆에서 안전하게" }, bad: { img: "d_fork_back", label: "뒤에 사람 · 확인 없이 후진" }, lines: [
        { say: "후진할 때는 유도자를 두고 신호에 따라 움직입니다." },
        { say: "유도자가 없으면, 직접 내려서 뒤에 사람이 없는지 봅니다." },
        { say: "유도자가 보이지 않으면 바로 멈춥니다." },
      ] },
      { type: "chapter", no: 4, title: "차량 고정", sub: "차가 움직이지 않게", img: "d_secure", lines: [
        { say: "차를 댄 뒤에는 차가 움직이지 않게 고정합니다." },
      ] },
      { type: "steps", head: "접안 후 고정 순서", steps: [["engine", "시동 끄기", "열쇠 빼기"], ["brake", "주차 브레이크", "끝까지 채우기"], ["chock", "고임목", "뒷바퀴에 받치기"], ["signal", "작업 신호", "준비 완료 알리기"]], lines: [
        { say: "먼저 시동을 끄고, 열쇠를 뺍니다." },
        { say: "주차 브레이크를 끝까지 채웁니다." },
        { say: "경사가 있거나 현장 기준이 있으면 뒷바퀴에 고임목을 받칩니다." },
        { say: "그다음 작업 준비가 끝났다고 현장에 알립니다." },
      ] },
      { type: "chapter", no: 5, title: "지게차 안전", sub: "작업 반경에 들어가지 않기", img: "d_forklift", lines: [
        { say: "상하차장에서 가장 조심해야 할 장비, 지게차입니다." },
      ] },
      { type: "points", head: "작업 반경 밖에서", img: "d_forklift", lines: [
        { say: "지게차가 움직이는 범위 안으로 들어가지 않습니다.", pt: "작업 반경 안으로 들어가지 않기" },
        { say: "짐을 실은 지게차는 앞이 잘 보이지 않습니다.", pt: "짐 실으면 앞이 안 보여요" },
        { say: "지게차가 후진할 때 운전자는 뒤를 거의 보지 못합니다.", pt: "후진할 때 뒤는 거의 못 봐요" },
      ] },
      { type: "points", head: "눈 맞추고 신호하기", img: "d_eye", lines: [
        { say: "지게차 근처를 지나야 하면 먼저 운전자와 눈을 맞춥니다.", pt: "먼저 눈 맞추기" },
        { say: "운전자가 멈추고 신호를 줄 때까지 기다립니다.", pt: "멈춤 신호 받고 움직이기" },
      ] },
      { type: "dodont", head: "포크 아래는 절대 금지", good: { img: "d_forklift", label: "작업 반경 밖에서 기다리기" }, bad: { img: "d_under", label: "들린 포크 · 짐 아래 서 있기" }, lines: [
        { say: "들어 올린 포크와 짐 아래에는 절대 서 있지 않습니다." },
        { say: "짐이 떨어지면 피할 시간이 없습니다." },
      ] },
      { type: "chapter", no: 6, title: "끼임 · 추락", sub: "날개 · 문 · 적재함", img: "d_wing", lines: [
        { say: "다음은 끼임과 추락 사고를 막는 방법입니다." },
      ] },
      { type: "points", head: "윙 날개 · 리프트", img: "d_wing", lines: [
        { say: "윙 날개를 여닫을 때는 날개 아래와 옆에 사람이 없는지 봅니다.", pt: "날개 아래 · 옆 사람 확인" },
        { say: "움직이는 날개와 문에는 손을 대지 않습니다.", pt: "움직일 때 손 떼기" },
        { say: "리프트 위에서는 가장자리에 서지 않고 가운데에 섭니다.", pt: "리프트 가장자리 피하기" },
      ] },
      { type: "dodont", head: "적재함에서 내려올 때", good: { img: "d_climb", label: "손잡이 · 발판 · 세 곳 지지" }, bad: { img: "d_jump", label: "뛰어내리기" }, lines: [
        { say: "적재함에서 내려올 때는 뛰어내리지 않습니다." },
        { say: "두 손과 한 발, 세 곳을 항상 붙이고 천천히 내려옵니다." },
      ] },
      { type: "chapter", no: 7, title: "몸 보호", sub: "허리 · 미끄럼", img: "d_lift", lines: [
        { say: "짐을 손으로 옮길 때는 몸을 보호해야 합니다." },
      ] },
      { type: "points", head: "바르게 들기", img: "d_lift", lines: [
        { say: "무릎을 굽히고 허리를 펴서, 다리 힘으로 듭니다.", pt: "무릎 굽히고 허리 펴기" },
        { say: "짐은 몸에 붙여서 들고, 들고 있는 채로 허리를 비틀지 않습니다.", pt: "몸에 붙이고 비틀지 않기" },
        { say: "무거운 짐은 혼자 들지 말고 장비나 동료의 도움을 받습니다.", pt: "무거우면 장비 · 동료 도움" },
      ] },
      { type: "points", head: "비 · 눈 오는 날", img: "d_wet", lines: [
        { say: "비나 눈이 오면 경사로와 적재함 바닥이 미끄럽습니다.", pt: "경사로 · 적재함 미끄러움" },
        { say: "걸음을 줄이고, 미끄럼 방지 신발을 신습니다.", pt: "보폭 줄이기 · 미끄럼 방지 신발" },
      ] },
      { type: "chapter", no: 8, title: "출차 · 신고", sub: "떠나기 전 마지막 확인", img: "d_leave", lines: [
        { say: "마지막으로 출차와 사고 신고입니다." },
      ] },
      { type: "steps", head: "출차 전 확인", steps: [["walk", "한 바퀴", "사람 · 장비 없나"], ["chock", "고임목", "빼서 정리"], ["door", "문 · 날개", "닫고 잠금"], ["slow", "출발", "천천히"]], lines: [
        { say: "출차 전에는 차 주변을 한 바퀴 돌며 사람과 장비가 없는지 봅니다." },
        { say: "고임목을 빼서 정리합니다." },
        { say: "문과 날개를 닫고 잠갔는지 확인합니다." },
        { say: "그리고 작업장을 벗어날 때까지 천천히 움직입니다." },
      ] },
      { type: "points", head: "위험하면 멈추고 알리기", img: "d_report", lines: [
        { say: "위험한 상황을 보면 바로 작업을 멈춥니다.", pt: "위험하면 바로 멈추기" },
        { say: "다친 사람이 있으면 119에 먼저 신고합니다.", pt: "다친 사람 → 119 먼저" },
        { say: "작은 사고나 아찔했던 일도 현장과 회사에 알려 주세요.", pt: "아찔했던 일도 알리기" },
      ] },
      { type: "check", head: "오늘의 체크리스트", items: ["작업장 안은 천천히", "내리기 전 보호구 착용", "후진은 유도자 · 직접 확인", "시동 끄고 · 브레이크 · 고임목", "지게차 반경 · 포크 아래 피하기", "세 곳 지지로 내려오기", "출차 전 한 바퀴 확인"], lines: [
        { say: "오늘 배운 내용을 체크리스트로 정리하겠습니다." },
        { say: "천천히 들어가고, 보호구를 착용하고, 후진은 직접 확인합니다." },
        { say: "차를 고정하고, 지게차 반경과 포크 아래를 피합니다." },
        { say: "세 곳을 지지해서 내려오고, 출차 전에는 한 바퀴 돌아 확인합니다." },
      ] },
      { type: "end", img: "d_end", lines: [
        { say: "끝까지 시청해 주셔서 감사합니다." },
        { say: "오늘도 안전한 작업 되세요. 이어서 이수 서명을 해 주세요." },
      ] },
    ],
  },
};
