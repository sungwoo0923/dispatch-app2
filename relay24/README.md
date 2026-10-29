# 24시콜 고정 IP 중계 서버 (relay24)

## 왜 필요한가
24시콜 API는 **허용 IP 1개**에서 온 요청만 받습니다.
그런데 우리 프로그램의 서버(Vercel)는 호출할 때마다 **다른 IP**로 나갑니다.
→ 24시콜에 IP를 등록해도 "-13 허용된 IP가 아닙니다"가 계속 납니다.
(Vercel 고정 IP 상품은 월 $100이고 IP가 2개라 24시콜에 맞지 않습니다.)

그래서 고정 IP를 가진 작은 서버 하나를 중간에 둡니다.

```
프로그램(브라우저) → Vercel /api/send24 (매핑·암호화) → 중계 서버(고정 IP) → 24시콜
```

## 준비물
- AWS Lightsail 서울 리전 인스턴스 1개 (Linux, 가장 작은 사양 · 월 약 $5) + **고정 IP(Static IP)** 연결
  - 고정 IP는 인스턴스에 붙어 있으면 무료입니다.
- 다른 고정 IP 서버(사무실 서버, 다른 클라우드)가 있으면 그걸 써도 됩니다. Node 18 이상만 있으면 됩니다.

## 설치 (Lightsail 기준, 약 10분)
1. Lightsail › 인스턴스 생성 › 서울(ap-northeast-2) › Linux/Unix › **OS 전용 · Ubuntu 22.04** › 가장 작은 플랜.
2. 네트워킹 탭 › **고정 IP 생성** › 방금 만든 인스턴스에 연결. → 이 IP를 메모합니다.
3. 네트워킹 탭 › IPv4 방화벽 › 규칙 추가 › 사용자 지정 TCP **8024**.
4. 인스턴스 › "SSH를 사용하여 연결" 버튼으로 터미널을 열고 아래를 순서대로 붙여 넣습니다.

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs
```
```bash
sudo mkdir -p /opt/relay24 && sudo curl -fsSL -o /opt/relay24/server.js https://raw.githubusercontent.com/sungwoo0923/dispatch-app2/main/relay24/server.js
```
(저장소가 비공개라 위 주소가 안 열리면, 이 폴더의 server.js 내용을 `sudo nano /opt/relay24/server.js` 로 붙여 넣으세요.)

5. 서비스 등록 — `비밀값`은 아무 긴 랜덤 문자열(예: 40자)로 직접 정하고, `인증키`는 24시콜 마이페이지의 인증키를 넣습니다.

```bash
sudo tee /etc/systemd/system/relay24.service > /dev/null <<'EOF'
[Unit]
Description=24call relay
After=network.target
[Service]
Environment=RELAY_SECRET=여기에_비밀값
Environment=CALL24_API_KEY=여기에_24시콜_인증키
Environment=CALL24_BASE=https://api.15887924.com:18099
Environment=PORT=8024
ExecStart=/usr/bin/node /opt/relay24/server.js
Restart=always
[Install]
WantedBy=multi-user.target
EOF
```
```bash
sudo systemctl daemon-reload && sudo systemctl enable --now relay24 && curl -s localhost:8024/health
```
마지막 줄 결과에 `"ok":true` 와 `"ip":"고정IP"` 가 보이면 성공입니다.

## 연결
1. **24시콜 마이페이지 › 허용 IP(운영)** 에 Lightsail 고정 IP를 등록합니다. (테스트 서버를 쓸 땐 허용 IP(테스트)에도)
2. **Vercel › 프로젝트 › Settings › Environment Variables** 에 두 개 추가 후 Redeploy:
   - `CALL24_RELAY_URL` = `http://고정IP:8024`
   - `CALL24_RELAY_SECRET` = 5번에서 정한 비밀값 (똑같이)
3. 프로그램 › 배차관리 › 24시전송 창 › **연결 진단** → "24시콜 연결 정상", 경로 "고정 IP 중계 서버" 가 나오면 끝.

## 보안
- 중계 서버는 Vercel과 같은 비밀값으로 서명된 요청만 받고, 60초가 지난 요청은 거부합니다.
- 오더 내용은 Vercel에서 이미 24시콜 암호화키로 암호화되어 지나갑니다.
- 24시콜 인증키는 중계 서버에만 두면 됩니다.
