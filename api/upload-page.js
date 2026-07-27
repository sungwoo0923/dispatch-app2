export default async function handler(req, res) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host;
  const fullUrl = `${proto}://${host}${req.url}`;
  const imageUrl = `${proto}://${host}/icons/sflow-icon.png`;

  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 6000);
    const response = await fetch(`${proto}://${host}/index.html`, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!response.ok) throw new Error("index.html fetch failed");
    let html = await response.text();

    const ogTags = `
    <meta property="og:title" content="인수증 업로드" />
    <meta property="og:description" content="화물 인수증 사진을 업로드해 주세요." />
    <meta property="og:url" content="${fullUrl}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="인수증 업로드" />
    <meta name="twitter:description" content="화물 인수증 사진을 업로드해 주세요." />
    <meta name="twitter:image" content="${imageUrl}" />`;

    if (html.includes("<title>")) {
      html = html.replace(/<title>.*?<\/title>/, `<title>인수증 업로드</title>${ogTags}`);
    } else {
      html = html.replace("</head>", `${ogTags}\n  </head>`);
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(html);
  } catch {
    // 실패 시에도 업로드 기능은 반드시 동작해야 하므로 index.html로 안전하게 폴백
    try {
      const fallback = await fetch(`${proto}://${host}/index.html`);
      const html = await fallback.text();
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(html);
    } catch {
      res.setHeader("Location", `/index.html${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`);
      return res.status(302).end();
    }
  }
}
