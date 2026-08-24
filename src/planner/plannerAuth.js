// src/planner/plannerAuth.js
// ⭐ KP-Planner 전용 계정 시스템 — 배차프로그램의 users 컬렉션과는 완전히 별도인
// plannerAccounts 컬렉션을 쓴다. Firebase Auth(로그인 자체)는 같은 프로젝트를
// 공유하지만, "회사"가 아니라 "가족(그룹) 코드"로 데이터를 나눈다.
import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { plannerAuth as auth, plannerDb as db } from "./plannerFirebase";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, collection, query, where, limit, getDocs, onSnapshot } from "firebase/firestore";

export const PLANNER_ACCOUNTS = "plannerAccounts";

// ⭐ 관리자 겸 개발자 계정 — KP-Planner에 아직 회원가입한 적이 없어도(plannerAccounts
// 문서가 없어도) "이 계정은 KP-Planner 계정이 아닙니다" 화면 없이 무조건 들어가져야
// 한다는 요구사항. 처음 로그인하는 순간 plannerAccounts 프로필을 자동으로 만들어준다.
export const TOTAL_MASTER_EMAIL = "tjddnqkf@naver.com";

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

// ⭐ Firebase 에러 코드를 화면에 그대로 노출하지 않고("Firebase: Error
// (auth/email-already-in-use).") 명확한 한글 사유로 바꿔서 보여준다.
function koreanAuthError(err) {
  const code = err?.code || "";
  const map = {
    "auth/invalid-email": "이메일 형식이 올바르지 않습니다.",
    "auth/weak-password": "비밀번호가 너무 약합니다. 6자 이상으로 입력해 주세요.",
    "auth/wrong-password": "비밀번호가 올바르지 않습니다.",
    "auth/invalid-credential": "이메일 또는 비밀번호가 올바르지 않습니다.",
    "auth/invalid-login-credentials": "이메일 또는 비밀번호가 올바르지 않습니다.",
    "auth/user-not-found": "등록되지 않은 이메일입니다.",
    "auth/user-disabled": "사용이 제한된 계정입니다.",
    "auth/too-many-requests": "너무 여러 번 시도했습니다. 잠시 후 다시 시도해 주세요.",
    "auth/network-request-failed": "네트워크 연결을 확인해 주세요.",
  };
  return map[code] || "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
}

// ⭐ 배차프로그램 등 이 Firebase 프로젝트 어딘가에 이미 등록된 이메일이어도
// KP-Planner는 "완전히 새로운 프로그램"이라 상관없이 가입되어야 한다는 요구사항 —
// Firebase Auth는 같은 이메일로 계정을 두 개 만들 수 없으므로(auth/email-already-
// in-use), 새로 만드는 대신 "같은 이메일/비밀번호로 로그인"해서 같은 계정에
// plannerAccounts 프로필만 새로 붙이는 방식으로 처리한다.
async function getOrCreateAuthUser(email, password) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    return cred.user;
  } catch (err) {
    if (err?.code === "auth/email-already-in-use") {
      try {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        return cred.user;
      } catch {
        throw new Error("이미 사용 중인 이메일입니다. 비밀번호가 다르다면, 그 계정의 비밀번호를 입력해 주세요.");
      }
    }
    throw new Error(koreanAuthError(err));
  }
}

async function assertNoExistingPlannerProfile(uid) {
  const snap = await getDoc(doc(db, PLANNER_ACCOUNTS, uid));
  if (snap.exists()) throw new Error("이미 KP-Planner에 가입되어 있는 계정입니다. 로그인해 주세요.");
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
        const ref = doc(db, PLANNER_ACCOUNTS, user.uid);
        let snap = await getDoc(ref);
        if (!snap.exists() && user.email === TOTAL_MASTER_EMAIL) {
          const autoProfile = {
            email: user.email,
            name: "관리자",
            groupId: randomGroupCode(),
            groupName: "관리자",
            role: "owner",
            createdAt: serverTimestamp(),
          };
          await setDoc(ref, autoProfile);
          snap = await getDoc(ref);
        }
        setState({ loading: false, user, account: snap.exists() ? { uid: user.uid, ...snap.data() } : null });
      } catch {
        setState({ loading: false, user, account: null });
      }
    });
    return () => unsub();
  }, []);

  return state;
}

export async function plannerLogin(email, password) {
  try {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  } catch (err) {
    throw new Error(koreanAuthError(err));
  }
}

export async function plannerLogout() {
  await signOut(auth);
}

// "새 가족 만들기" — 원하는 가족 코드를 직접 정할 수 있다(기본값은 무작위 추천
// 코드). 배우자/가족을 초대할 때 이 코드를 알려주면 된다.
// ⭐ role은 항상 "member"다 — "관리자 겸 개발자" 계정(tjddnqkf@naver.com) 말고는
// 누구도 최고관리자 메뉴가 보이면 안 된다는 요구사항이라, 가족을 새로 만든
// 사람이라고 해서 owner가 되지 않는다(예전엔 여기서 owner를 줬던 게 "새로 가입한
// 계정에 관리자 메뉴가 보인다" 버그의 원인이었다).
export async function signupCreateGroup({ email, password, name, gender, groupCode, groupName }) {
  const code = normalizeGroupCode(groupCode || randomGroupCode());
  if (code.length < 4) throw new Error("가족 코드는 4자 이상으로 만들어 주세요.");
  if (await groupCodeTaken(code)) throw new Error("이미 사용 중인 가족 코드입니다. 다른 코드를 입력해 주세요.");

  const user = await getOrCreateAuthUser(email, password);
  await assertNoExistingPlannerProfile(user.uid);
  await setDoc(doc(db, PLANNER_ACCOUNTS, user.uid), {
    email: email.trim(),
    name: name.trim(),
    gender: gender || "female",
    groupId: code,
    groupName: groupName?.trim() || "우리 가족",
    role: "member",
    createdAt: serverTimestamp(),
  });
  return { uid: user.uid, groupId: code };
}

// "코드로 참여하기" — 배우자 등 기존 가족 코드를 받은 사람이 같은 그룹에 합류한다.
export async function signupJoinGroup({ email, password, name, gender, groupCode }) {
  const code = normalizeGroupCode(groupCode);
  if (!code) throw new Error("가족 코드를 입력해 주세요.");
  if (!(await groupCodeTaken(code))) throw new Error("존재하지 않는 가족 코드입니다. 코드를 다시 확인해 주세요.");

  const user = await getOrCreateAuthUser(email, password);
  await assertNoExistingPlannerProfile(user.uid);
  await setDoc(doc(db, PLANNER_ACCOUNTS, user.uid), {
    email: email.trim(),
    name: name.trim(),
    gender: gender || "female",
    groupId: code,
    role: "member",
    createdAt: serverTimestamp(),
  });
  return { uid: user.uid, groupId: code };
}

// ⭐ 최고관리자(owner) 전용 관리자 메뉴에서 쓰는 헬퍼들.
export function useGroupMembers(groupId) {
  const [members, setMembers] = useState([]);
  useEffect(() => {
    if (!groupId) { setMembers([]); return; }
    const q = query(collection(db, PLANNER_ACCOUNTS), where("groupId", "==", groupId));
    const unsub = onSnapshot(q, (snap) => {
      setMembers(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [groupId]);
  return members;
}

export async function updateMyProfile(uid, patch) {
  await updateDoc(doc(db, PLANNER_ACCOUNTS, uid), patch);
}

// ⭐ 최고관리자 전용 "가입자 관리" 화면에서 쓴다 — 전체 plannerAccounts를 그룹 구분
//없이 다 구독한다. PlannerAdminPanel(owner에게만 렌더링됨) 밖에서는 쓰지 않는다.
export function useAllPlannerAccounts() {
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, PLANNER_ACCOUNTS), (snap) => {
      setAccounts(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
    }, () => {});
    return () => unsub();
  }, []);
  return accounts;
}

// 최고관리자가 특정 가입자를 강제로 탈퇴 처리한다(프로필만 제거 — 로그인 계정
// 자체는 배차프로그램 등과 공유되므로 건드리지 않는다).
export async function adminRemovePlannerProfile(uid) {
  await deleteDoc(doc(db, PLANNER_ACCOUNTS, uid));
}

// ⭐ 회원 탈퇴(내정보에서 스스로) — plannerAccounts 프로필만 지운다. Firebase Auth
// 로그인 자체(이메일/비밀번호)는 배차프로그램 등과 같은 프로젝트를 공유하는
// 계정이라 여기서 지우면 다른 프로그램 로그인까지 없어질 수 있어 건드리지 않는다.
// 프로필만 없어지면 이 가족/이 프로그램에서는 완전히 탈퇴한 상태가 된다(다시
// 쓰려면 재가입).
export async function leavePlannerAccount() {
  const user = auth.currentUser;
  if (!user) return;
  await deleteDoc(doc(db, PLANNER_ACCOUNTS, user.uid));
  await signOut(auth);
}
