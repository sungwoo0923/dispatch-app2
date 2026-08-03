# KP-Flow 홈페이지 (별도 사이트)

배차관리 프로그램(dispatch-app2)과는 완전히 분리된, 로그인 없이 검색엔진을 통해
유입되는 방문자를 위한 소개용 정적 홈페이지입니다. 빌드 과정이 없는 순수
HTML/CSS/JS라 어디에든 그대로 올릴 수 있습니다.

- 도입 문의 폼은 배차관리 프로그램과 **같은 Firebase 프로젝트**의
  `landingInquiries` 컬렉션에 저장되며, 관리자메뉴 → "도입 문의" 탭에서 확인합니다.
- 로그인 버튼은 실제 프로그램 주소(`https://dispatch-app2.vercel.app/login`)로
  새 탭에서 연결됩니다. 나중에 프로그램 자체에 별도 도메인을 연결하면 이 링크만
  바꿔주면 됩니다.

## 새 Vercel 프로젝트로 배포하기 (기존 프로그램과 완전히 분리)

1. https://vercel.com 에서 "Add New… → Project" 클릭
2. 이 GitHub 저장소(dispatch-app2)를 선택하되, **Root Directory를 `landing-site`로 지정**
3. Framework Preset은 "Other"(정적 사이트)로 선택 — 빌드 명령 없음, Output Directory는 비워두거나 `.`
4. Deploy 클릭 → 새로운 별도 주소(예: `kpflow-home.vercel.app`)가 생성됩니다.
5. 구매한 도메인이 있으면 Vercel 프로젝트 Settings → Domains 에서 그 새 프로젝트에
   연결하세요. **배차관리 프로그램이 붙어있는 프로젝트/도메인과는 반드시 다른
   프로젝트**로 만들어야 완전히 분리됩니다.

## 다른 방법 (Vercel CLI)

```
cd landing-site
npx vercel --prod
```

프롬프트에서 새 프로젝트로 생성하면 됩니다(기존 dispatch-app2 프로젝트와 연결하지
않도록 주의).
