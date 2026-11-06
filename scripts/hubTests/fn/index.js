// ⭐ 2026-11-06 로지스웹 허브 에뮬레이터 시험 전용 함수 묶음(배포 안 함)
//  functions/hubTriggers.js(실제 배포되는 허브 트리거)를 그대로 불러, 프로그램 전체 함수(index.js — 구글시트 · 외부 API 등) 없이 시험한다.
//  푸시는 에뮬레이터에 FCM이 없으므로 보낼 토큰만 기록한다(실제 발송은 functions/index.js sendPushAndCleanup).
//  준비: cd scripts/hubTests/fn && npm install --no-package-lock (firebase-functions 6 — 에뮬레이터 13과 맞는 판, firebase.hubtest.json 의 functions.source)
const functions = require("firebase-functions/v1");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");

initializeApp();
const db = getFirestore();
const pushLog = [];
function userTokens(u) {
  if (!u) return [];
  const out = new Set(Array.isArray(u.fcmTokensOut) ? u.fcmTokensOut : []);
  return [...new Set([u.fcmToken, ...(Array.isArray(u.fcmTokens) ? u.fcmTokens : [])].filter((t) => typeof t === "string" && t && !out.has(t)))];
}
async function sendPushAndCleanup(tokens, message, label) {
  pushLog.push({ tokens, title: message?.notification?.title, label });
  console.log(`[PUSH-TEST] ${label} → ${tokens.join(",")} :: ${message?.notification?.title || ""} / ${message?.data?.url || ""}`);
  return { successCount: tokens.length, failureCount: 0, responses: [] };
}

Object.assign(exports, require("../../../functions/hubTriggers").register({ functions, db, FieldValue, sendPushAndCleanup, userTokens, getStorage }));
