// 지도 타일(OpenStreetMap)이 이 컴퓨터에서 막혀 있어서, 캡처할 때만
// 통계청(KOSTAT) 행정경계 GeoJSON으로 타일을 그려서 대신 넣어준다.
import { readFileSync } from "node:fs";
const G = new URL("./geo/", import.meta.url).pathname;
const muni = readFileSync(G + "skorea_municipalities_geo_simple.json", "utf8");
const prov = readFileSync(G + "skorea_provinces_geo_simple.json", "utf8");

const RENDER = `
const muni = ${muni}, prov = ${prov};
const cv = document.createElement("canvas"); cv.width = cv.height = 512; const c = cv.getContext("2d");
function px(lon, lat, z) { const n = 256 * 2 ** z; const x = (lon + 180) / 360 * n; const s = Math.sin(lat * Math.PI / 180); const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n; return [x, y]; }
function path(geom, z, ox, oy) {
  c.beginPath();
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys) for (const ring of poly) ring.forEach(([lo, la], i) => { const [x, y] = px(lo, la, z); const X = (x - ox) * 2, Y = (y - oy) * 2; i ? c.lineTo(X, Y) : c.moveTo(X, Y); });
}
window.__tile = (z, x, y) => {
  const ox = x * 256, oy = y * 256;
  c.fillStyle = "#D6E2EF"; c.fillRect(0, 0, 512, 512);
  for (const f of muni.features) { path(f.geometry, z, ox, oy); c.fillStyle = "#F5F7FA"; c.fill("evenodd"); c.strokeStyle = "#DCE2EB"; c.lineWidth = 1.2; c.stroke(); }
  for (const f of prov.features) { path(f.geometry, z, ox, oy); c.strokeStyle = "#B7C3D4"; c.lineWidth = z >= 9 ? 3 : 2; c.stroke(); }
  if (z >= 8) {
    c.font = (z >= 10 ? "600 22px" : "600 18px") + " Pretendard, sans-serif"; c.fillStyle = "#8A97AC"; c.textAlign = "center";
    for (const f of muni.features) {
      const g = f.geometry; const ring = (g.type === "Polygon" ? g.coordinates[0] : g.coordinates[0][0]);
      let sx = 0, sy = 0; ring.forEach(([lo, la]) => { sx += lo; sy += la; }); const [X, Y] = px(sx / ring.length, sy / ring.length, z);
      const cx = (X - ox) * 2, cy = (Y - oy) * 2; if (cx > -40 && cx < 552 && cy > -20 && cy < 532) c.fillText(f.properties.name, cx, cy);
    }
  }
  return cv.toDataURL("image/png").split(",")[1];
};`;

export async function installTiles(ctx) {
  const helper = await ctx.browser().newPage();
  await helper.setContent("<html><body></body></html>");
  await helper.addScriptTag({ content: RENDER });
  await ctx.route(/tile\.openstreetmap\.org\/(\d+)\/(\d+)\/(\d+)\.png/, async (route) => {
    const [, z, x, y] = route.request().url().match(/\/(\d+)\/(\d+)\/(\d+)\.png/);
    const b64 = await helper.evaluate(([z, x, y]) => window.__tile(z, x, y), [+z, +x, +y]);
    await route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from(b64, "base64") });
  });
}
