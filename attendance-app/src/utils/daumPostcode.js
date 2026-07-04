// Daum(카카오) 우편번호 서비스 — 무료, API 키 없이 스크립트만 불러오면 바로 쓸 수 있는
// 주소 검색 팝업. 센터/근무지 등록 시 위도경도 대신 주소를 검색해 선택할 수 있게 한다.
let loadingPromise = null;

function loadScript() {
  if (window.daum?.Postcode) return Promise.resolve();
  if (loadingPromise) return loadingPromise;
  loadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return loadingPromise;
}

// Resolves with { address, zonecode } once the user picks a result, or null
// if they close the popup without selecting one.
export function openAddressSearch() {
  return loadScript().then(
    () =>
      new Promise((resolve) => {
        new window.daum.Postcode({
          oncomplete: (data) => resolve({ address: data.roadAddress || data.address, zonecode: data.zonecode }),
          onclose: (state) => {
            if (state === "FORCE_CLOSE") resolve(null);
          },
        }).open();
      })
  );
}
