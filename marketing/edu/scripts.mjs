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
  l_end: "A neatly loaded and strapped truck leaving a modern steel-and-concrete logistics warehouse at sunrise, optimistic mood. Modern industrial architecture only, flat roofs, no traditional or Asian roofs.",
  // ── 상 · 하차장
  d_cover: "A modern Korean logistics warehouse loading dock with several trucks backed up to dock doors, forklifts working, workers in reflective vests and helmets, wide hero shot.",
  d_danger: "Busy loading dock area with a forklift, pedestrians and a reversing truck in the same space, subtle red hazard zones on the floor.",
  d_enter: "A truck slowly entering a logistics yard following floor arrows and a speed limit sign without text, a site guide with a light baton signaling.",
  d_ppe: "Safety gear flat lay: white safety helmet, reflective vest, safety shoes, work gloves, arranged neatly.",
  d_reverse: "A box truck reversing toward a modern concrete-and-steel logistics warehouse dock door, a spotter in a reflective vest standing safely to the side giving hand signals. Modern industrial architecture only, flat roofs, no traditional or Asian roofs, no booths.",
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
  d_leave: "A driver at a modern steel logistics warehouse loading dock removing a wheel chock from the rear wheel of a box truck before departure, rear doors closed. Modern industrial architecture only, flat roofs, no traditional or Asian roofs.",
  d_report: "A dock supervisor and a driver talking, the supervisor writing on a tablet, near-miss report mood, calm.",
  d_end: "A clean and orderly loading dock at dusk with trucks lined up and workers in vests giving a thumbs up.",
  // ── 직원(사무실) 산업안전보건
  s_cover: "A bright modern Korean logistics company office with desks, monitors and employees working safely, a window showing trucks in a yard outside, hero shot.",
  s_law: "A clean meeting room table with a safety handbook, a hard hat and a small office building model, calm professional mood.",
  s_hazard: "An office floor with subtle hazard highlights: a cable across the walkway, an open lower drawer, a wet floor near a water dispenser, boxes blocking a corridor.",
  s_trip: "A tidy office corridor with cables organized under covers, clear walkway, and boxes stored on shelves instead of the floor.",
  s_drawer: "Close-up of an office cabinet with drawers closed and heavy files on the bottom shelf, a step stool next to a tall shelf.",
  s_power: "A tidy office power strip with individual switches and only two plugs, cables neatly bundled under a desk, correct example.",
  s_power_bad: "An overloaded power strip daisy-chained with many plugs and a space heater plugged in, cables tangled, slightly scorched outlet, wrong example.",
  s_heater: "An office at the end of the day with an employee switching off a space heater and a power strip before leaving, evening light through the window.",
  s_exit: "A clear emergency exit door with a green running-man style sign shape (no text) and an unobstructed corridor, fire extinguisher on the wall.",
  s_fire: "Employees evacuating calmly down an office staircase, covering mouth and nose with a wet towel, crouching low, light smoke near the ceiling.",
  s_assembly: "Office employees gathered at an outdoor assembly point in front of the building, a manager counting people with a tablet.",
  s_ext: "A red fire extinguisher shown in four simple steps: pulling the safety pin, aiming the nozzle, squeezing the handle, sweeping side to side, clean diagram style.",
  s_posture: "An employee sitting with correct posture at an ergonomic desk: monitor at eye level, feet flat, back supported, wrists straight.",
  s_stretch: "An employee standing next to the desk doing a neck and shoulder stretch during a short break, plant and window in the background.",
  s_lift: "An office worker lifting a heavy box of paper correctly by bending the knees with a straight back, a hand truck nearby.",
  s_drive: "A company car parked in front of the office, an employee fastening the seat belt before a business trip, phone placed in a holder.",
  s_firstaid: "An office first-aid kit and an AED defibrillator on the wall, an employee calling for help on the phone, calm.",
  s_report: "An employee talking with a manager in the office, reporting a small near-miss, the manager noting it on a laptop, supportive mood.",
  s_end: "A safe and tidy logistics office at sunset with employees leaving, lights being turned off, optimistic mood.",
  // ── 직장 내 성희롱 예방 · 괴롭힘 예방(사람 표정은 차분하게, 노골적인 장면 없이)
  h_cover: "A calm, respectful modern Korean logistics office team meeting, diverse colleagues of different genders and ages listening attentively, warm atmosphere, hero shot.",
  h_law: "A clean office desk with an open labor law book, a small balance scale and a pen, calm professional mood.",
  h_words: "Two office colleagues at a desk, one making an uncomfortable personal remark while the other leans away with a troubled expression, subtle soft red tint on the speaker, non-explicit.",
  h_touch: "An office scene where one colleague puts a hand on another's shoulder without consent and the other person stiffens and steps away, subtle red tint, non-explicit, tasteful.",
  h_dinner: "A team dinner at a Korean restaurant table where one person is being pressured to sit next to a manager and pour drinks, looking uncomfortable, subtle red tint, non-explicit.",
  h_message: "A smartphone screen glowing with many late-night chat messages from a superior, an employee in bed looking stressed, no readable text.",
  h_customer: "A delivery driver in a navy uniform standing calmly beside a hand cart at a customer's loading dock, a customer staff member standing too close and leaning in with a personal remark, the driver leaning back with a polite but uncomfortable expression. Calm, no aggression, no physical fight, non-explicit, subtle soft red tint around the customer.",
  h_bystander: "A colleague stepping in calmly to help a coworker who looks uncomfortable, offering support, office setting.",
  h_report: "An employee speaking privately with an HR manager in a small meeting room with a closed door, confidential and supportive mood.",
  h_process: "A clean isometric flow of an office reporting process: a person, a closed meeting room, a document folder, a shield, arranged left to right, no text.",
  h_protect: "An employee being moved to a different desk area away from another person, a manager supporting, protective atmosphere.",
  h_respect: "Colleagues giving each other a respectful professional handshake and nod in a bright office, positive mood.",
  b_cover: "A modern Korean logistics office where colleagues collaborate respectfully around a table with a laptop, hero shot, calm mood.",
  b_yell: "A manager loudly scolding an employee in front of the whole team in an open office, the employee looking down, others looking away, subtle red tint.",
  b_exclude: "Office colleagues having lunch together while one employee sits alone at a desk, clearly left out, subtle red tint.",
  b_work: "An employee overwhelmed by a huge pile of documents dumped on the desk late at night while others leave, subtle red tint.",
  b_errand: "A manager making a junior employee carry personal shopping bags and run personal errands, subtle red tint, non-violent.",
  b_driver: "A dispatcher at a desk shouting into a phone headset at a truck driver, the driver in the truck cab looking stressed, split scene, subtle red tint.",
  b_good: "A manager giving calm, constructive feedback to an employee one-on-one in a small meeting room, both seated, respectful body language.",
  b_report: "An employee writing a report on a laptop with a closed door meeting room and an HR manager waiting supportively, confidential mood.",
  b_care: "A small team checking in on a colleague with coffee, supportive and caring office culture.",
  b_end: "A bright modern logistics office at the end of the day, colleagues saying goodbye with smiles, optimistic mood.",
  // ── 장애인 인식개선 · 개인정보 보호
  a_cover: "An inclusive modern Korean logistics office where a colleague using a wheelchair works at an accessible desk alongside teammates, warm respectful atmosphere, hero shot.",
  a_types: "A row of diverse office workers including a person using a wheelchair, a person with a white cane, a person wearing a hearing aid, and others with no visible disability, all smiling, clean isometric style.",
  a_ask: "An office worker kindly asking a colleague in a wheelchair whether they would like help, before touching anything, the wheelchair user responding with a smile.",
  a_guide: "An office worker guiding a visually impaired colleague by letting the colleague hold their elbow, walking half a step ahead in a corridor.",
  a_talk: "An office worker talking face to face with a deaf colleague, speaking clearly with visible lips and using a notepad and a tablet to write messages.",
  a_space: "An accessible office with a ramp, wide corridors, an accessible restroom sign shape without text, and a height-adjustable desk.",
  a_wrong: "An office worker grabbing and pushing someone's wheelchair without asking, the wheelchair user looking surprised, subtle red tint.",
  a_team: "A diverse team including colleagues with disabilities celebrating a successful project together in a meeting room.",
  p_cover: "A logistics office worker locking a laptop screen and putting documents into a locked cabinet, with a subtle shield motif, hero shot.",
  p_data: "Flat isometric icons arranged neatly: an ID card, a smartphone, a truck license plate, a bank card and a house, connected to a central shield, no text.",
  p_chat: "A smartphone showing a group chat with blurred unreadable messages containing photos of ID cards and documents, subtle red tint, wrong example.",
  p_lock: "An office desk with a locked screen on the monitor, a strong padlock icon floating above, sticky note absent, clean desk.",
  p_print: "An office worker shredding printed documents in a paper shredder next to a printer, careful handling of papers.",
  p_mail: "An office worker double-checking the recipient on an email before sending, a confirmation pop-up shape on the screen without text.",
  p_usb: "A USB stick and an external hard drive locked in a drawer, next to a laptop with an encryption padlock symbol, no text.",
  p_leak: "An office worker urgently reporting to a manager after noticing a misdirected email, the manager calmly taking notes, serious but calm mood.",
  p_end: "A clean, secure logistics office at dusk with locked cabinets and screens turned off, calm mood.",
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
        { say: "벨트가 찢어지거나 낡은 곳, 기름에 젖은 곳은 없는지 봅니다.", pt: "벨트 찢김 · 낡음 · 오염" },
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
      { type: "dodont", head: "벨트는 이렇게 걸어요", good: { img: "l_strap_good", label: "보호대 대고 · 꼬임 없이 · 잠금" }, bad: { img: "l_strap_bad", label: "모서리에 바로 · 꼬이고 낡은 벨트" }, lines: [
        { say: "벨트는 꼬이지 않게 펴서, 짐 위를 눌러 주도록 겁니다." },
        { say: "모서리에는 반드시 보호대를 대서 벨트가 끊어지지 않게 합니다." },
        { say: "낡거나 꼬인 벨트는 힘을 제대로 받지 못합니다." },
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
        { say: "짐이 앞쪽으로 쏠려 운전석을 덮치지 않도록, 앞쪽 격벽을 확인합니다.", pt: "앞쪽 격벽 확인" },
      ] },
      { type: "points", head: "장비 · 기계", img: "l_machine", lines: [
        { say: "장비는 각 모서리를 체인으로 따로따로 묶습니다.", pt: "각 모서리 따로 체인 결박" },
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
        { say: "달리다 보면 벨트가 느슨해집니다. 처음 들르는 휴게소에서 다시 조여 주세요." },
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
        { say: "라쳇을 잠그고, 덮개와 문을 잠근 뒤, 처음 들르는 휴게소에서 다시 확인합니다." },
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
  staff_safety: {
    title: "사무실 산업안전보건",
    code: "EDU-S01",
    slides: [
      { type: "cover", img: "s_cover", sub: "사무실에서 다치지 않고 일하는 법", lines: [
        { say: "사무실 산업안전보건 교육을 시작하겠습니다." },
        { say: "사무실도 넘어짐, 화재, 근골격계 질환 같은 사고가 생기는 일터입니다." },
        { say: "오늘은 사무실에서 꼭 지켜야 할 안전 수칙을 알아보겠습니다." },
      ] },
      { type: "law", head: "왜 교육을 받을까요", img: "s_law", quote: "사업주는 소속 근로자에게 고용노동부령으로 정하는 바에 따라 정기적으로 안전보건교육을 하여야 한다.", src: "산업안전보건법 제29조", lines: [
        { say: "산업안전보건법은 회사가 직원에게 정기적으로 안전보건교육을 하도록 정하고 있습니다." },
        { say: "교육은 나를 지키는 방법이자, 동료를 지키는 약속입니다." },
      ] },
      { type: "chapter", no: 1, title: "넘어짐 · 부딪힘", sub: "사무실 사고 1순위", img: "s_hazard", lines: [
        { say: "사무실에서 가장 흔한 사고는 넘어지고 부딪히는 사고입니다." },
      ] },
      { type: "dodont", head: "통로는 비워 두기", good: { img: "s_trip", label: "전선 정리 · 통로 비우기" }, bad: { img: "s_hazard", label: "통로 전선 · 열린 서랍 · 젖은 바닥" }, lines: [
        { say: "통로에 전선이나 상자를 두지 않습니다." },
        { say: "젖은 바닥은 바로 닦고, 열린 서랍은 꼭 닫아 둡니다." },
      ] },
      { type: "points", head: "높은 곳 · 무거운 물건", img: "s_drawer", lines: [
        { say: "무거운 서류는 아래 칸에, 가벼운 물건은 위 칸에 둡니다.", pt: "무거운 것은 아래 칸" },
        { say: "높은 곳은 의자 말고 받침대나 사다리를 씁니다.", pt: "의자 말고 받침대 · 사다리" },
        { say: "서랍은 한 번에 하나만 열어, 캐비닛이 넘어지지 않게 합니다.", pt: "서랍은 한 번에 하나만" },
      ] },
      { type: "chapter", no: 2, title: "전기 · 화재 예방", sub: "불은 작은 습관에서", img: "s_power", lines: [
        { say: "다음은 전기와 화재 예방입니다." },
      ] },
      { type: "dodont", head: "멀티탭 바르게 쓰기", good: { img: "s_power", label: "개별 스위치 · 여유 있게" }, bad: { img: "s_power_bad", label: "문어발 · 난방기 함께 꽂기" }, lines: [
        { say: "멀티탭에 여러 기기를 겹쳐 꽂지 않습니다." },
        { say: "난방기처럼 전기를 많이 쓰는 기기는 벽 콘센트에 따로 꽂습니다." },
      ] },
      { type: "points", head: "퇴근 전 전원 끄기", img: "s_heater", lines: [
        { say: "퇴근할 때는 난방기, 전열기, 커피포트 전원을 끕니다.", pt: "난방기 · 전열기 전원 끄기" },
        { say: "뜨거워지거나 타는 냄새가 나는 전선은 바로 알립니다.", pt: "뜨거운 전선 · 타는 냄새 → 알리기" },
        { say: "비상구와 소화기 앞에는 물건을 두지 않습니다.", pt: "비상구 · 소화기 앞 비우기" },
      ] },
      { type: "chapter", no: 3, title: "화재 대피", sub: "불이 나면 이렇게", img: "s_fire", lines: [
        { say: "불이 났을 때 어떻게 대피하는지 알아보겠습니다." },
      ] },
      { type: "steps", head: "불이 나면", steps: [["signal", "알리기", "불이야 · 비상벨"], ["walk", "계단으로", "엘리베이터 금지"], ["slow", "낮은 자세", "젖은 수건으로 입 · 코"], ["flag", "집결지", "인원 확인 · 119"]], lines: [
        { say: "먼저 크게 불이야 외치고, 비상벨을 누릅니다." },
        { say: "엘리베이터는 타지 말고, 계단으로 대피합니다." },
        { say: "연기가 있으면 젖은 수건으로 입과 코를 막고, 낮은 자세로 이동합니다." },
        { say: "밖으로 나오면 집결 장소에서 인원을 확인하고, 119에 신고합니다." },
      ] },
      { type: "points", head: "소화기 쓰는 법", img: "s_ext", lines: [
        { say: "안전핀을 뽑습니다.", pt: "안전핀 뽑기" },
        { say: "노즐을 불 쪽으로 향하게 잡습니다.", pt: "노즐을 불 쪽으로" },
        { say: "손잡이를 힘껏 움켜쥡니다.", pt: "손잡이 움켜쥐기" },
        { say: "빗자루로 쓸듯이 불의 아래쪽을 좌우로 뿌립니다.", pt: "불 아래쪽을 쓸듯이" },
      ] },
      { type: "points", head: "대피 장소 확인", img: "s_assembly", lines: [
        { say: "평소에 비상구 위치와 집결 장소를 미리 알아 둡니다.", pt: "비상구 · 집결 장소 미리 알기" },
        { say: "작은 불이 아니면 끄려고 하지 말고 바로 대피합니다.", pt: "큰 불은 끄지 말고 대피" },
      ] },
      { type: "chapter", no: 4, title: "바른 자세 · 근골격계", sub: "오래 앉아 일할 때", img: "s_posture", lines: [
        { say: "오래 앉아 일하는 사무직은 목과 허리, 손목을 조심해야 합니다." },
      ] },
      { type: "points", head: "바르게 앉기", img: "s_posture", lines: [
        { say: "모니터는 눈높이에, 화면과는 팔 길이 정도 거리를 둡니다.", pt: "모니터는 눈높이 · 팔 길이 거리" },
        { say: "등은 의자에 붙이고, 발은 바닥에 편하게 댑니다.", pt: "등은 의자에 · 발은 바닥에" },
        { say: "키보드와 마우스를 쓸 때 손목이 꺾이지 않게 합니다.", pt: "손목은 곧게" },
      ] },
      { type: "points", head: "틈틈이 쉬기", img: "s_stretch", lines: [
        { say: "한 시간에 한 번은 일어나서 목과 어깨를 풀어 줍니다.", pt: "1시간마다 일어나 스트레칭" },
        { say: "먼 곳을 보며 눈도 쉬게 해 줍니다.", pt: "먼 곳 보며 눈 쉬기" },
        { say: "통증이 계속되면 참지 말고 회사에 알립니다.", pt: "통증이 계속되면 알리기" },
      ] },
      { type: "points", head: "무거운 짐 옮기기", img: "s_lift", lines: [
        { say: "무거운 상자는 무릎을 굽히고 허리를 펴서 듭니다.", pt: "무릎 굽히고 허리 펴기" },
        { say: "많거나 무거우면 대차를 쓰거나 동료와 함께 옮깁니다.", pt: "대차 · 동료와 함께" },
      ] },
      { type: "chapter", no: 5, title: "외근 · 업무 운전", sub: "회사 차를 탈 때", img: "s_drive", lines: [
        { say: "외근이나 업무로 운전할 때의 안전입니다." },
      ] },
      { type: "points", head: "업무 운전 안전", img: "s_drive", lines: [
        { say: "출발 전에 안전띠를 매고, 휴대폰은 거치대에 둡니다.", pt: "안전띠 · 휴대폰 거치대" },
        { say: "운전 중에는 전화나 메신저를 손에 들지 않습니다.", pt: "운전 중 휴대폰 금지" },
        { say: "피곤하면 무리하지 말고 쉬었다 갑니다.", pt: "피곤하면 쉬었다 가기" },
      ] },
      { type: "chapter", no: 6, title: "응급 상황 · 신고", sub: "다쳤거나 아플 때", img: "s_firstaid", lines: [
        { say: "마지막으로 응급 상황과 신고입니다." },
      ] },
      { type: "points", head: "응급 상황", img: "s_firstaid", lines: [
        { say: "구급함과 자동심장충격기 위치를 미리 알아 둡니다.", pt: "구급함 · 자동심장충격기 위치" },
        { say: "사람이 쓰러지면 119에 신고하고 주변에 도움을 요청합니다.", pt: "쓰러지면 119 · 도움 요청" },
      ] },
      { type: "points", head: "아찔했던 일도 알리기", img: "s_report", lines: [
        { say: "다친 일은 작더라도 회사에 알려 기록을 남깁니다.", pt: "다친 일은 꼭 알리기" },
        { say: "다칠 뻔한 일도 알려 주면 같은 사고를 막을 수 있습니다.", pt: "다칠 뻔한 일도 알리기" },
      ] },
      { type: "check", head: "오늘의 체크리스트", items: ["통로 · 비상구 비우기", "멀티탭 겹쳐 꽂지 않기", "퇴근 전 전원 끄기", "불나면 계단 · 낮은 자세", "모니터 눈높이 · 1시간마다 쉬기", "업무 운전 중 휴대폰 금지", "다칠 뻔한 일도 알리기"], lines: [
        { say: "오늘 배운 내용을 체크리스트로 정리하겠습니다." },
        { say: "통로와 비상구를 비우고, 멀티탭은 겹쳐 꽂지 않습니다." },
        { say: "퇴근 전에는 전원을 끄고, 불이 나면 계단으로 낮게 대피합니다." },
        { say: "바르게 앉고 틈틈이 쉬며, 다칠 뻔한 일도 꼭 알립니다." },
      ] },
      { type: "end", img: "s_end", lines: [
        { say: "끝까지 시청해 주셔서 감사합니다." },
        { say: "오늘도 안전한 하루 보내세요. 이어서 이수 서명을 해 주세요." },
      ] },
    ],
  },
  staff_sh: {
    title: "직장 내 성희롱 예방",
    code: "EDU-S02",
    slides: [
      { type: "cover", img: "h_cover", sub: "서로 존중하는 일터를 위한 법정 의무교육", lines: [
        { say: "직장 내 성희롱 예방교육을 시작하겠습니다." },
        { say: "성희롱은 피해자에게 큰 상처를 남기고, 함께 일하는 모두의 일터를 무너뜨립니다." },
        { say: "오늘은 무엇이 성희롱인지, 생겼을 때 어떻게 해야 하는지 알아보겠습니다." },
      ] },
      { type: "law", head: "회사가 해마다 하는 교육", img: "h_law", quote: "사업주는 직장 내 성희롱을 예방하고 근로자가 안전한 근로환경에서 일할 수 있는 여건을 조성하기 위하여 직장 내 성희롱의 예방을 위한 교육을 매년 실시하여야 한다.", src: "남녀고용평등법 제13조", lines: [
        { say: "남녀고용평등법은 회사가 해마다 성희롱 예방교육을 하도록 정하고 있습니다." },
        { say: "대표와 임원을 포함해, 모든 직원이 교육 대상입니다." },
      ] },
      { type: "chapter", no: 1, title: "성희롱이란", sub: "법이 정한 뜻", img: "h_words", lines: [
        { say: "먼저 법이 말하는 직장 내 성희롱이 무엇인지 알아보겠습니다." },
      ] },
      { type: "points", head: "직장 내 성희롱의 뜻", img: "h_words", lines: [
        { say: "직장에서의 지위를 이용하거나 업무와 관련해 일어난 일입니다.", pt: "지위를 이용하거나 업무와 관련해서" },
        { say: "성적인 말이나 행동으로 성적 굴욕감이나 혐오감을 느끼게 하는 것입니다.", pt: "성적인 말 · 행동으로 굴욕감 · 혐오감" },
        { say: "성적 요구를 거절했다는 이유로 불이익을 주는 것도 포함됩니다.", pt: "거절했다고 불이익 주기도 포함" },
        { say: "판단 기준은 행위자의 의도가 아니라, 상대방이 어떻게 느꼈는지입니다.", pt: "기준은 의도가 아니라 상대가 느낀 것" },
      ] },
      { type: "steps", head: "성희롱의 유형", steps: [["talk", "말", "외모 평가 · 음담패설"], ["hand", "행동", "원치 않는 신체 접촉"], ["eye", "시각", "음란한 사진 · 영상"], ["phone", "온라인", "메신저 · 문자"]], lines: [
        { say: "외모를 평가하거나 성적인 농담을 하는 말도 성희롱입니다." },
        { say: "원하지 않는 신체 접촉은 짧고 가벼워도 성희롱입니다." },
        { say: "음란한 사진이나 영상을 보여 주거나 붙여 두는 것도 해당됩니다." },
        { say: "메신저나 문자로 보내는 성적인 말도 똑같이 성희롱입니다." },
      ] },
      { type: "chapter", no: 2, title: "이런 것도 성희롱", sub: "일상에서 흔한 예", img: "h_dinner", lines: [
        { say: "일상에서 흔히 볼 수 있는 예를 보겠습니다." },
      ] },
      { type: "points", head: "회식 자리에서", img: "h_dinner", lines: [
        { say: "상사 옆자리에 앉으라고 하거나 술을 따르라고 강요하는 것.", pt: "옆자리 · 술 따르기 강요" },
        { say: "취했다는 이유로 몸을 만지거나 기대는 것도 성희롱입니다.", pt: "취했다는 핑계로 신체 접촉" },
      ] },
      { type: "points", head: "메신저 · 퇴근 후 연락", img: "h_message", lines: [
        { say: "업무와 상관없이 밤늦게 사적인 연락을 반복하는 것.", pt: "밤늦은 사적인 연락 반복" },
        { say: "외모나 사생활을 묻는 메시지도 상대가 불쾌하면 문제가 됩니다.", pt: "외모 · 사생활 캐묻기" },
      ] },
      { type: "points", head: "고객 · 거래처에서 생길 때", img: "h_customer", lines: [
        { say: "화주나 거래처 직원 같은 고객에게 성희롱을 당할 수도 있습니다.", pt: "고객 · 거래처에 의한 성희롱" },
        { say: "이때 회사는 근무 장소를 바꾸는 등 피해 직원을 보호해야 합니다.", pt: "회사는 피해 직원을 보호해야 해요" },
        { say: "기사님과 현장 직원도 혼자 참지 말고 회사에 알려 주세요.", pt: "혼자 참지 말고 회사에 알리기" },
      ] },
      { type: "chapter", no: 3, title: "생겼을 때", sub: "피해자 · 목격자가 할 일", img: "h_report", lines: [
        { say: "성희롱이 생겼을 때 어떻게 해야 하는지 알아보겠습니다." },
      ] },
      { type: "steps", head: "피해를 입었다면", steps: [["hand", "거부 표현", "싫다고 분명히"], ["pledge", "기록하기", "날짜 · 장소 · 내용"], ["user", "알리기", "인사 담당 · 대표"], ["phone", "외부 상담", "고용노동부 1350"]], lines: [
        { say: "가능하다면 싫다는 뜻을 분명하게 표현합니다." },
        { say: "언제, 어디서, 무슨 일이 있었는지 기록하고 메시지는 보관합니다." },
        { say: "회사 인사 담당자나 대표에게 알립니다." },
        { say: "회사에 말하기 어렵다면 고용노동부 1350으로 상담할 수 있습니다." },
      ] },
      { type: "points", head: "목격했다면", img: "h_bystander", lines: [
        { say: "모른 척하지 말고, 피해자 곁에서 도움을 줍니다.", pt: "모른 척하지 않기" },
        { say: "피해자가 원하면 함께 신고하거나 증인이 되어 줍니다.", pt: "원하면 함께 신고 · 증언" },
        { say: "피해 사실을 다른 사람에게 함부로 옮기지 않습니다.", pt: "소문 내지 않기" },
      ] },
      { type: "chapter", no: 4, title: "회사의 조치", sub: "법이 정한 처리 절차", img: "h_process", lines: [
        { say: "신고가 들어오면 회사는 법에 따라 이렇게 조치합니다." },
      ] },
      { type: "steps", head: "회사의 처리 절차", steps: [["search", "조사", "지체 없이 사실 확인"], ["shield", "보호", "근무 장소 변경 · 휴가"], ["pledge", "징계", "가해자 징계 · 근무 변경"], ["lock", "비밀 유지", "불이익 금지"]], lines: [
        { say: "회사는 신고를 받으면 지체 없이 사실을 조사합니다." },
        { say: "조사 중에도 피해자가 원하면 근무 장소를 바꾸거나 휴가를 줍니다." },
        { say: "사실로 확인되면 가해자를 징계하고 근무 장소를 바꾸는 등 조치합니다." },
        { say: "신고했다는 이유로 불이익을 주는 것은 법으로 금지되어 있고, 조사 내용은 비밀로 지켜집니다." },
      ] },
      { type: "check", head: "오늘의 체크리스트", items: ["기준은 상대방이 느낀 것", "말 · 행동 · 메신저 모두 해당", "회식 강요 · 신체 접촉 금지", "고객에 의한 피해도 알리기", "피해 · 목격 시 기록하고 알리기", "신고자 불이익 금지 · 비밀 유지"], lines: [
        { say: "오늘 배운 내용을 정리하겠습니다." },
        { say: "성희롱의 기준은 상대방이 느낀 것이고, 말과 행동, 메신저 모두 해당됩니다." },
        { say: "피해를 입거나 목격하면 기록하고 알리세요. 신고자는 법으로 보호받습니다." },
      ] },
      { type: "end", img: "h_respect", lines: [
        { say: "서로 존중하는 일터를 함께 만들어 주세요." },
        { say: "끝까지 시청해 주셔서 감사합니다. 이어서 이수 서명을 해 주세요." },
      ] },
    ],
  },
  staff_bully: {
    title: "직장 내 괴롭힘 예방",
    code: "EDU-S03",
    slides: [
      { type: "cover", img: "b_cover", sub: "말 한마디가 일터를 바꿉니다", lines: [
        { say: "직장 내 괴롭힘 예방교육을 시작하겠습니다." },
        { say: "괴롭힘은 피해자의 몸과 마음을 다치게 하고, 팀 전체의 일할 힘을 빼앗습니다." },
        { say: "오늘은 무엇이 괴롭힘인지, 어떻게 막고 대응하는지 알아보겠습니다." },
      ] },
      { type: "law", head: "법으로 금지된 행위", img: "h_law", quote: "사용자 또는 근로자는 직장에서의 지위 또는 관계 등의 우위를 이용하여 업무상 적정범위를 넘어 다른 근로자에게 신체적·정신적 고통을 주거나 근무환경을 악화시키는 행위를 하여서는 아니 된다.", src: "근로기준법 제76조의2", lines: [
        { say: "근로기준법은 직장 내 괴롭힘을 금지하고 있습니다." },
        { say: "지위나 관계의 우위를 이용해, 업무상 적정 범위를 넘어 고통을 주는 행위입니다." },
      ] },
      { type: "chapter", no: 1, title: "괴롭힘의 세 가지 조건", sub: "이 세 가지를 봐요", img: "b_yell", lines: [
        { say: "괴롭힘인지 판단할 때는 세 가지를 봅니다." },
      ] },
      { type: "steps", head: "괴롭힘 판단 기준", steps: [["user", "우위 이용", "직급 · 경력 · 다수"], ["alert", "적정 범위 넘음", "업무와 무관 · 과도"], ["shield", "고통 · 환경 악화", "몸과 마음의 피해"]], lines: [
        { say: "첫째, 직급이나 경력, 다수라는 관계의 우위를 이용했는지 봅니다." },
        { say: "둘째, 업무와 관련 없거나 정도가 지나쳐 적정 범위를 넘었는지 봅니다." },
        { say: "셋째, 상대에게 고통을 주거나 근무 환경을 나쁘게 만들었는지 봅니다." },
      ] },
      { type: "chapter", no: 2, title: "이런 것이 괴롭힘", sub: "흔한 예", img: "b_exclude", lines: [
        { say: "괴롭힘에 해당하는 흔한 예를 보겠습니다." },
      ] },
      { type: "points", head: "폭언 · 공개적인 망신", img: "b_yell", lines: [
        { say: "여러 사람 앞에서 소리치거나 모욕하는 것.", pt: "사람들 앞에서 소리치기 · 모욕" },
        { say: "욕설이나 외모, 학력을 비하하는 말도 해당됩니다.", pt: "욕설 · 외모 · 학력 비하" },
      ] },
      { type: "points", head: "따돌림 · 무시", img: "b_exclude", lines: [
        { say: "일부러 대화나 회의, 식사에서 빼놓는 것.", pt: "일부러 빼놓기" },
        { say: "업무에 필요한 정보를 주지 않는 것도 괴롭힘이 될 수 있습니다.", pt: "필요한 정보 주지 않기" },
      ] },
      { type: "points", head: "과도한 업무 · 사적인 심부름", img: "b_work", lines: [
        { say: "한 사람에게만 감당하기 어려운 일을 몰아주는 것.", pt: "한 사람에게 일 몰아주기" },
        { say: "업무와 상관없는 개인 심부름을 시키는 것도 해당됩니다.", pt: "개인 심부름 시키기" },
      ] },
      { type: "points", head: "배차 · 운송 현장에서", img: "b_driver", lines: [
        { say: "전화로 기사님께 욕설을 하거나 무리한 운행을 강요하는 것.", pt: "기사님께 욕설 · 무리한 운행 강요" },
        { say: "특정 기사에게만 불리한 배차를 반복하는 것도 문제가 됩니다.", pt: "특정 기사에게 불리한 배차 반복" },
      ] },
      { type: "dodont", head: "지적과 괴롭힘의 차이", good: { img: "b_good", label: "따로 · 차분하게 · 업무 개선 중심" }, bad: { img: "b_yell", label: "공개적으로 · 인격 모욕" }, lines: [
        { say: "업무상 필요한 지적은 괴롭힘이 아닙니다." },
        { say: "다만 따로, 차분하게, 업무를 고치는 데 집중해서 말해야 합니다." },
        { say: "사람들 앞에서 인격을 깎아내리면 지적이 아니라 괴롭힘이 됩니다." },
      ] },
      { type: "chapter", no: 3, title: "생겼을 때", sub: "신고와 회사의 조치", img: "b_report", lines: [
        { say: "괴롭힘이 생겼을 때 어떻게 하는지 알아보겠습니다." },
      ] },
      { type: "steps", head: "피해 · 목격했다면", steps: [["pledge", "기록", "날짜 · 내용 · 증거"], ["user", "신고", "누구나 회사에"], ["phone", "외부 상담", "고용노동부 1350"]], lines: [
        { say: "언제, 무슨 일이 있었는지 기록하고 메시지나 녹음을 보관합니다." },
        { say: "피해자뿐 아니라 목격한 사람 누구나 회사에 신고할 수 있습니다." },
        { say: "회사에 말하기 어렵다면 고용노동부 1350으로 상담할 수 있습니다." },
      ] },
      { type: "steps", head: "회사의 조치", steps: [["search", "조사", "지체 없이"], ["shield", "보호", "근무 장소 변경 · 휴가"], ["pledge", "징계", "가해자 조치"], ["lock", "보호", "불이익 금지 · 비밀"]], lines: [
        { say: "회사는 신고를 받으면 지체 없이 조사합니다." },
        { say: "피해자가 원하면 근무 장소를 바꾸거나 휴가를 주는 등 보호합니다." },
        { say: "사실로 확인되면 가해자를 징계하는 등 필요한 조치를 합니다." },
        { say: "신고했다는 이유로 불이익을 주면 안 되고, 조사 내용은 비밀로 지킵니다." },
      ] },
      { type: "points", head: "서로를 챙기는 문화", img: "b_care", lines: [
        { say: "힘들어 보이는 동료에게 먼저 말을 걸어 주세요.", pt: "먼저 안부 묻기" },
        { say: "농담이라도 상대가 불편해하면 바로 멈춥니다.", pt: "불편해하면 바로 멈추기" },
      ] },
      { type: "check", head: "오늘의 체크리스트", items: ["우위 · 적정 범위 · 고통 세 가지", "폭언 · 따돌림 · 몰아주기 금지", "개인 심부름 금지", "기사님께도 존중하는 말", "지적은 따로 · 차분하게", "누구나 신고 · 불이익 금지"], lines: [
        { say: "오늘 배운 내용을 정리하겠습니다." },
        { say: "우위를 이용해 적정 범위를 넘어 고통을 주면 괴롭힘입니다." },
        { say: "지적은 따로 차분하게 하고, 기사님께도 존중하는 말을 씁니다." },
      ] },
      { type: "end", img: "b_end", lines: [
        { say: "존중하는 말 한마디가 좋은 일터를 만듭니다." },
        { say: "끝까지 시청해 주셔서 감사합니다. 이어서 이수 서명을 해 주세요." },
      ] },
    ],
  },
  staff_disab: {
    title: "장애인 인식개선",
    code: "EDU-S04",
    slides: [
      { type: "cover", img: "a_cover", sub: "편견 없이 함께 일하는 일터를 위한 법정 의무교육", lines: [
        { say: "장애인 인식개선 교육을 시작하겠습니다." },
        { say: "장애는 그 사람의 일부일 뿐, 그 사람 전부가 아닙니다." },
        { say: "오늘은 장애에 대한 바른 이해와, 함께 일할 때의 예절을 알아보겠습니다." },
      ] },
      { type: "law", head: "회사가 해마다 하는 교육", img: "a_team", quote: "사업주는 장애인에 대한 직장 내 편견을 제거함으로써 장애인 근로자의 안정적인 근무여건을 조성하고 장애인 근로자 채용이 확대될 수 있도록 장애인 인식개선 교육을 실시하여야 한다.", src: "장애인고용촉진법 제5조의2", lines: [
        { say: "장애인고용촉진법은 회사가 장애인 인식개선 교육을 하도록 정하고 있습니다." },
        { say: "직장 안의 편견을 없애고, 누구나 안정적으로 일할 수 있게 하려는 것입니다." },
      ] },
      { type: "chapter", no: 1, title: "장애 바로 알기", sub: "장애는 다양해요", img: "a_types", lines: [
        { say: "먼저 장애를 바르게 이해해 보겠습니다." },
      ] },
      { type: "points", head: "보이지 않는 장애도 있어요", img: "a_types", lines: [
        { say: "장애는 크게 신체적 장애와 정신적 장애로 나뉩니다.", pt: "신체적 장애 · 정신적 장애" },
        { say: "장애인의 대부분은 태어날 때가 아니라 살면서 사고나 질병으로 장애를 갖게 됩니다.", pt: "대부분 사고 · 질병으로 생겨요" },
        { say: "청각이나 내부 기관 장애처럼 겉으로 보이지 않는 장애도 많습니다.", pt: "보이지 않는 장애도 많아요" },
      ] },
      { type: "points", head: "바른 말 쓰기", img: "a_team", lines: [
        { say: "장애인을 부를 때는 장애인, 장애가 없는 사람은 비장애인이라고 합니다.", pt: "장애인 · 비장애인" },
        { say: "정상인, 불구 같은 말은 차별적인 표현이니 쓰지 않습니다.", pt: "정상인 · 불구 → 쓰지 않기" },
      ] },
      { type: "chapter", no: 2, title: "함께 일하는 예절", sub: "먼저 묻고, 존중하기", img: "a_ask", lines: [
        { say: "장애가 있는 동료와 함께 일할 때의 예절입니다." },
      ] },
      { type: "dodont", head: "도움은 먼저 물어보고", good: { img: "a_ask", label: "도와드릴까요? 먼저 묻기" }, bad: { img: "a_wrong", label: "묻지 않고 휠체어 밀기" }, lines: [
        { say: "도움이 필요해 보여도 먼저 도와드릴까요 하고 물어봅니다." },
        { say: "휠체어나 지팡이 같은 보조기기는 그 사람 몸의 일부처럼 존중하고 함부로 만지지 않습니다." },
      ] },
      { type: "points", head: "시각장애가 있는 동료와", img: "a_guide", lines: [
        { say: "길을 안내할 때는 내 팔꿈치를 잡게 하고 반 걸음 앞에서 걷습니다.", pt: "팔꿈치 잡게 하고 반 걸음 앞" },
        { say: "여기, 저기 대신 오른쪽으로 세 걸음처럼 구체적으로 말합니다.", pt: "방향 · 거리를 구체적으로" },
      ] },
      { type: "points", head: "청각장애가 있는 동료와", img: "a_talk", lines: [
        { say: "얼굴을 마주 보고 입 모양이 보이게 천천히 말합니다.", pt: "마주 보고 천천히 말하기" },
        { say: "필요하면 글로 쓰거나 메신저를 함께 씁니다.", pt: "글 · 메신저 함께 쓰기" },
      ] },
      { type: "chapter", no: 3, title: "차별 없는 일터", sub: "정당한 편의와 평등", img: "a_space", lines: [
        { say: "마지막으로 차별 없는 일터를 만드는 방법입니다." },
      ] },
      { type: "points", head: "정당한 편의 제공", img: "a_space", lines: [
        { say: "경사로, 높이 조절 책상처럼 일하는 데 필요한 편의를 함께 마련합니다.", pt: "경사로 · 높이 조절 책상" },
        { say: "채용과 승진, 업무 배치에서 장애를 이유로 차별하지 않습니다.", pt: "채용 · 승진 · 배치 차별 금지" },
        { say: "장애인차별금지법은 장애를 이유로 한 차별을 금지하고 있습니다.", pt: "장애인차별금지법" },
      ] },
      { type: "check", head: "오늘의 체크리스트", items: ["장애는 다양하고 보이지 않을 수도", "장애인 · 비장애인 바른 말", "도움은 먼저 묻기", "보조기기 함부로 만지지 않기", "구체적으로 · 마주 보고 말하기", "채용 · 승진 · 배치 차별 금지"], lines: [
        { say: "오늘 배운 내용을 정리하겠습니다." },
        { say: "바른 말을 쓰고, 도움은 먼저 묻고, 보조기기는 존중합니다." },
        { say: "장애를 이유로 차별하지 않는 일터를 함께 만듭니다." },
      ] },
      { type: "end", img: "a_team", lines: [
        { say: "다름을 존중하는 일터가 모두에게 좋은 일터입니다." },
        { say: "끝까지 시청해 주셔서 감사합니다. 이어서 이수 서명을 해 주세요." },
      ] },
    ],
  },
  staff_privacy: {
    title: "개인정보 보호",
    code: "EDU-S05",
    slides: [
      { type: "cover", img: "p_cover", sub: "기사 · 화주 정보를 안전하게 다루는 법", lines: [
        { say: "개인정보 보호교육을 시작하겠습니다." },
        { say: "물류 회사는 기사님과 화주, 받는 분의 개인정보를 매일 다룹니다." },
        { say: "오늘은 개인정보를 안전하게 다루는 방법을 알아보겠습니다." },
      ] },
      { type: "law", head: "정기적으로 받는 교육", img: "p_lock", quote: "개인정보처리자는 개인정보의 적정한 취급을 보장하기 위하여 개인정보취급자에게 정기적으로 필요한 교육을 실시하여야 한다.", src: "개인정보 보호법 제28조", lines: [
        { say: "개인정보 보호법은 개인정보를 다루는 직원에게 정기적으로 교육을 하도록 정하고 있습니다." },
      ] },
      { type: "chapter", no: 1, title: "우리가 다루는 개인정보", sub: "생각보다 많아요", img: "p_data", lines: [
        { say: "먼저 우리가 다루는 개인정보가 무엇인지 보겠습니다." },
      ] },
      { type: "steps", head: "물류 회사의 개인정보", steps: [["user", "기사님", "이름 · 전화 · 차량번호"], ["lock", "계좌 · 신분증", "정산 · 서류"], ["phone", "화주 담당자", "이름 · 연락처"], ["flag", "받는 분", "주소 · 연락처"]], lines: [
        { say: "기사님의 이름과 전화번호, 차량번호는 개인정보입니다." },
        { say: "정산 계좌와 신분증, 사업자 서류는 특히 조심해서 다룹니다." },
        { say: "화주 담당자의 이름과 연락처도 개인정보입니다." },
        { say: "배송 받는 분의 주소와 연락처도 마찬가지입니다." },
      ] },
      { type: "chapter", no: 2, title: "다루는 원칙", sub: "필요한 만큼, 정한 목적에만", img: "p_lock", lines: [
        { say: "개인정보를 다루는 기본 원칙입니다." },
      ] },
      { type: "points", head: "필요한 만큼만, 목적에만", img: "p_data", lines: [
        { say: "업무에 꼭 필요한 정보만 받고, 정한 목적에만 씁니다.", pt: "필요한 만큼만 · 정한 목적에만" },
        { say: "주민등록번호는 법에 근거가 있을 때만 다룰 수 있습니다.", pt: "주민번호는 법 근거 있을 때만" },
        { say: "다른 회사에 넘길 때는 정보 주인의 동의나 법적 근거가 있어야 합니다.", pt: "다른 회사 제공은 동의 · 근거" },
      ] },
      { type: "dodont", head: "단체 대화방 조심", good: { img: "p_lock", label: "필요한 사람에게만 · 프로그램 안에서" }, bad: { img: "p_chat", label: "단톡방에 신분증 · 계좌 사진" }, lines: [
        { say: "기사님 신분증이나 계좌 사진을 단체 대화방에 올리지 않습니다." },
        { say: "필요한 사람에게만, 회사 프로그램 안에서 주고받습니다." },
      ] },
      { type: "chapter", no: 3, title: "안전하게 보관하기", sub: "화면 · 출력물 · 파일", img: "p_print", lines: [
        { say: "개인정보를 안전하게 보관하는 방법입니다." },
      ] },
      { type: "points", head: "화면과 계정", img: "p_lock", lines: [
        { say: "자리를 비울 때는 화면을 잠급니다.", pt: "자리 비우면 화면 잠금" },
        { say: "비밀번호는 다른 사람과 나누지 않고, 메모지에 붙여 두지 않습니다.", pt: "비밀번호 공유 · 메모 금지" },
      ] },
      { type: "points", head: "출력물 · 파일", img: "p_print", lines: [
        { say: "개인정보가 담긴 출력물은 다 쓰면 파쇄합니다.", pt: "출력물은 파쇄" },
        { say: "메일을 보내기 전에 받는 사람과 첨부 파일을 한 번 더 확인합니다.", pt: "보내기 전 받는 사람 · 첨부 확인" },
        { say: "개인 저장장치에 회사 개인정보를 옮겨 두지 않습니다.", pt: "개인 저장장치에 옮기지 않기" },
      ] },
      { type: "chapter", no: 4, title: "유출되었다면", sub: "숨기지 말고 바로", img: "p_leak", lines: [
        { say: "개인정보가 새어 나갔다면 이렇게 합니다." },
      ] },
      { type: "steps", head: "유출 대응", steps: [["alert", "바로 보고", "알게 된 즉시"], ["lock", "추가 피해 막기", "삭제 요청 · 차단"], ["user", "회사 조치", "통지 · 신고"]], lines: [
        { say: "잘못 보냈거나 유출을 알게 되면 숨기지 말고 즉시 회사에 보고합니다." },
        { say: "잘못 받은 사람에게 삭제를 요청하는 등 추가 피해를 막습니다." },
        { say: "회사는 법에 따라 정보 주인에게 알리고 필요한 신고를 합니다." },
      ] },
      { type: "check", head: "오늘의 체크리스트", items: ["필요한 만큼 · 정한 목적에만", "주민번호는 법 근거 있을 때만", "단톡방에 신분증 · 계좌 금지", "자리 비우면 화면 잠금", "출력물 파쇄 · 메일 다시 확인", "유출되면 즉시 보고"], lines: [
        { say: "오늘 배운 내용을 정리하겠습니다." },
        { say: "필요한 만큼만 정한 목적에 쓰고, 단체 대화방에 개인정보를 올리지 않습니다." },
        { say: "화면을 잠그고 출력물은 파쇄하며, 유출되면 즉시 보고합니다." },
      ] },
      { type: "end", img: "p_end", lines: [
        { say: "기사님과 고객의 정보를 지키는 것이 회사의 신뢰를 지키는 일입니다." },
        { say: "끝까지 시청해 주셔서 감사합니다. 이어서 이수 서명을 해 주세요." },
      ] },
    ],
  },
};
