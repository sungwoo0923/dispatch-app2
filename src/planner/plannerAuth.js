// src/planner/plannerAuth.js
// ⭐ KP-Planner 전용 계정 시스템 — 배차프로그램의 users 컬렉션과는 완전히 별도인
// plannerAccounts 컬렉션을 쓴다. Firebase Auth(로그인 자체)는 같은 프로젝트를
// 공유하지만, "회사"가 아니라 "가족(그룹) 코드"로 데이터를 나눈다.
import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, limit, getDocs } from "firebase/firestore";

export const PLANNER_ACCOUNTS = "plannerAccounts";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 0/O, 1/I처럼 헷갈리는 문자는 뺐다

export function randomGroupCode() {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

export function normalizeGroupCode(code) {
  return String(code || "").trim().toUpperCase();
}

async function groupCodeTaken(code) {
  const q = query(collection(db, PLANNER_ACCOUNTS), where("groupId", "==", code), limit(1));
  const snap = await getDocs(q);
  return !snap.empty;
}

// 로그인 상태 + plannerAccounts 문서를 함께 구독한다.
export function usePlannerAccount() {
  const [state, setState] = useState({ loading: true, user: null, account: null });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ loading: false, user: null, account: null });
        return;
      }
      try {
        const snap = await getDoc(doc(db, PLANNER_ACCOUNTS, user.uid));
        setState({ loading: false, user, account: snap.exists() ? snap.data() : null });
      } catch {
        setState({ loading: false, user, account: null });
      }
    });
    return () => unsub();
  }, []);

  return state;
}

export async function plannerLogin(email, password) {
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function plannerLogout() {
  await signOut(auth);
}

// "새 가족 만들기" — 이 계정이 그룹의 owner가 되고, 원하는 코드를 직접 정할 수
// 있다(기본값은 무작위 추천 코드). 스포이스/가족을 초대할 때 이 코드를 알려주면 된다.
export async function signupCreateGroup({ email, password, name, groupCode, groupName }) {
  const code = normalizeGroupCode(groupCode || randomGroupCode());
  if (code.length < 4) throw new Error("가족 코드는 4자 이상으로 만들어 주세요.");
  if (await groupCodeTaken(code)) throw new Error("이미 사용 중인 가족 코드입니다. 다른 코드를 입력해 주세요.");

  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await setDoc(doc(db, PLANNER_ACCOUNTS, cred.user.uid), {
    email: email.trim(),
    name: name.trim(),
    groupId: code,
    groupName: groupName?.trim() || "우리 가족",
    role: "owner",
    createdAt: serverTimestamp(),
  });
  return { uid: cred.user.uid, groupId: code };
}

// "코드로 참여하기" — 배우자 등 기존 가족 코드를 받은 사람이 같은 그룹에 합류한다.
export async function signupJoinGroup({ email, password, name, groupCode }) {
  const code = normalizeGroupCode(groupCode);
  if (!code) throw new Error("가족 코드를 입력해 주세요.");
  if (!(await groupCodeTaken(code))) throw new Error("존재하지 않는 가족 코드입니다. 코드를 다시 확인해 주세요.");

  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await setDoc(doc(db, PLANNER_ACCOUNTS, cred.user.uid), {
    email: email.trim(),
    name: name.trim(),
    groupId: code,
    role: "member",
    createdAt: serverTimestamp(),
  });
  return { uid: cred.user.uid, groupId: code };
}
