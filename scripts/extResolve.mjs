// 테스트용 모듈 찾기 도우미 — src는 Vite처럼 확장자 없이 가져온다("./attendanceUtils"). node에서는 .js / .jsx를 붙여 다시 찾는다.
//  사용: import { register } from "node:module"; register("./extResolve.mjs", import.meta.url);
export async function resolve(spec, ctx, next) {
  try {
    return await next(spec, ctx);
  } catch (e) {
    if (/^\.{1,2}\//.test(spec) && !/\.[cm]?jsx?$/.test(spec)) return next(`${spec}.js`, ctx);
    throw e;
  }
}
