// src/planner/plannerAuth.js
// ⭐ KP-Planner 전용 계정 시스템 — 배차프로그램의 users 컬렉션과는 완전히 별도인
// plannerAccounts 컬렉션을 쓴다. Firebase Auth(로그인 자체)는 같은 프로젝트를
// 공유하지만, "회사"가 아니라 "가족(그룹) 코드"로 데이터를 나눈다.
import { useEffect, useState } from "react";
import {
  onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, deleteUser,
  setPersistence, browserLocalPersistence, browserSessionPersistence,
} from "firebase/auth";
import { plannerAuth as auth, plannerDb as db } from "./plannerFirebase";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, collection, query, where, limit, getDocs, onSnapshot } from "firebase/firestore";

export const PLANNER_ACCOUNTS = "plannerAccounts";

// ⭐ 관리자 겸 개발자 계정 — KP-Planner에 아직 회원가입한 적이 없어도(plannerAccounts
// 문서가 없어도) "이 계정은 KP-Planner 계정이 아닙니다" 화면 없이 무조건 들어가져야
// 한다는 요구사항. 처음 로그인하는 순간 plannerAccounts 프로필을 자동으로 만들어준다.
export const TOTAL_MASTER_EMAIL = "tjddnqkf@naver.com";

// ⭐ 이 Firebase 프로젝트는 배차프로그램과 Auth를 공유한다 — 배차프로그램에 이미
// 가입된 이메일로 KP-Planner에 가입하려 하면 "이미 사용 중인 이메일" 오류가 나서
// (그 프로그램의 비밀번호를 모르니) 가입 자체가 막혀버렸다. "배차프로그램에 가입한
// 적 있어도 KP-Planner는 완전히 상관없이 가입되어야 한다"는 요구사항에 따라, 실제
// Firebase Auth 계정은 입력한 이메일 뒤에 "+kpplanner"를 붙여 별도로 만든다(예:
// sw@naver.com → sw+kpplanner@naver.com — 형식은 유효한 이메일이라 Firebase가
// 그대로 받아들이지만, 실제 발송되는 메일함과는 무관하고 배차프로그램 계정과도
// 완전히 다른 별개의 Auth 유저다). 화면에 보이는/저장되는 email 필드는 사용자가
// 입력한 원래 이메일 그대로다 — 이 변환은 Firebase Auth 호출에서만 쓰인다.
const PLANNER_EMAIL_TAG = "+kpplanner";
function toPlannerAuthEmail(email) {
  const trimmed = String(email || "").trim().toLowerCase();
  const at = trimmed.indexOf("@");
  if (at < 0) return trimmed;
  if (trimmed.slice(0, at).endsWith(PLANNER_EMAIL_TAG)) return trimmed; // 이미 변환된 값이면 그대로
  return `${trimmed.slice(0, at)}${PLANNER_EMAIL_TAG}${trimmed.slice(at)}`;
}
const TOTAL_MASTER_AUTH_EMAIL = toPlannerAuthEmail(TOTAL_MASTER_EMAIL);

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

// ⭐ 코드로 참여할 때, 이미 그 가족에 있는 다른 구성원 문서에서 가족 이름을
// 그대로 가져와 같이 저장한다 — 이게 없으면 초대받은 사람 문서에는 groupName이
// 비어 있어서, 초대한 사람 화면에는 설정한 이름이 보이는데 받은 사람 화면
// 상단엔 기본값("우리 가족")만 보이는 불일치가 생긴다. exists 여부도 같이
// 반환해서 groupCodeTaken을 또 호출하지 않아도 되게 한다.
async function findExistingGroup(code) {
  const q = query(collection(db, PLANNER_ACCOUNTS), where("groupId", "==", code), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return { exists: false, groupName: "" };
  return { exists: true, groupName: snap.docs[0].data()?.groupName || "" };
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

// ⭐ toPlannerAuthEmail로 네임스페이스를 씌우기 때문에, 이 함수에서 만나는
// "이미 사용 중"은 배차프로그램 계정과의 충돌이 아니라 진짜로 이 이메일로
// KP-Planner에 먼저 가입한 적이 있는 경우다 — 그때는 같은 비밀번호면 로그인,
// 다르면 안내한다.
async function getOrCreateAuthUser(email, password) {
  const authEmail = toPlannerAuthEmail(email);
  try {
    const cred = await createUserWithEmailAndPassword(auth, authEmail, password);
    return cred.user;
  } catch (err) {
    if (err?.code === "auth/email-already-in-use") {
      try {
        const cred = await signInWithEmailAndPassword(auth, authEmail, password);
        return cred.user;
      } catch {
        throw new Error("이미 이 이메일로 KP-Planner에 가입되어 있어요. 비밀번호가 다르다면, 가입할 때 쓴 비밀번호를 입력해 주세요.");
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
        if (!snap.exists() && (user.email === TOTAL_MASTER_AUTH_EMAIL || user.email === TOTAL_MASTER_EMAIL)) {
          const autoProfile = {
            email: TOTAL_MASTER_EMAIL,
            name: "관리자",
            groupId: randomGroupCode(),
            groupName: "관리자",
            role: "owner",
            createdAt: serverTimestamp(),
          };
          await setDoc(ref, autoProfile);
          snap = await getDoc(ref);
        }
        let account = snap.exists() ? { uid: user.uid, ...snap.data() } : null;
        // ⭐ "코드로 참여하기"에 groupName을 안 채워주던 예전 버그로 이미 만들어진
        // 계정 대비 — 내 문서에 groupName이 비어 있으면 같은 가족의 다른 구성원
        // 문서에서 가져와 보정해준다(다음부턴 다시 안 겪게 내 문서에도 저장).
        if (account && !account.groupName && account.groupId) {
          const { groupName: peerGroupName } = await findExistingGroup(account.groupId);
          if (peerGroupName) {
            account = { ...account, groupName: peerGroupName };
            updateDoc(ref, { groupName: peerGroupName }).catch(() => {});
          }
        }
        setState({ loading: false, user, account });
      } catch {
        setState({ loading: false, user, account: null });
      }
    });
    return () => unsub();
  }, []);

  return state;
}

// ⭐ 네임스페이스(+kpplanner) 도입 "이전"에 만들어진 계정(원래 이메일 그대로 Auth
// 계정이 생성된 경우)도 계속 로그인할 수 있도록, 네임스페이스 이메일로 먼저
// 시도하고 실패하면 원래 이메일로 한 번 더 시도한다.
// keepSignedIn=false면 브라우저를 닫으면 로그인이 풀리는 세션 전용 유지로 바꾼다
// (기본은 true — 브라우저를 다시 열어도 로그인이 유지되는 "자동로그인").
export async function plannerLogin(email, password, keepSignedIn = true) {
  const trimmed = String(email || "").trim();
  try {
    await setPersistence(auth, keepSignedIn ? browserLocalPersistence : browserSessionPersistence);
  } catch {
    // 일부 환경(프라이빗 브라우징 등)에서 persistence 설정이 막힐 수 있다 — 로그인 자체는 계속 진행
  }
  try {
    await signInWithEmailAndPassword(auth, toPlannerAuthEmail(trimmed), password);
  } catch (err) {
    try {
      await signInWithEmailAndPassword(auth, trimmed, password);
    } catch {
      throw new Error(koreanAuthError(err));
    }
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
export async function signupCreateGroup({ email, password, name, gender, groupCode, groupName, birthday }) {
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
    birthday: birthday || "",
    createdAt: serverTimestamp(),
  });
  return { uid: user.uid, groupId: code };
}

// "코드로 참여하기" — 배우자 등 기존 가족 코드를 받은 사람이 같은 그룹에 합류한다.
export async function signupJoinGroup({ email, password, name, gender, groupCode, birthday }) {
  const code = normalizeGroupCode(groupCode);
  if (!code) throw new Error("가족 코드를 입력해 주세요.");
  const { exists, groupName: existingGroupName } = await findExistingGroup(code);
  if (!exists) throw new Error("존재하지 않는 가족 코드입니다. 코드를 다시 확인해 주세요.");

  const user = await getOrCreateAuthUser(email, password);
  await assertNoExistingPlannerProfile(user.uid);
  await setDoc(doc(db, PLANNER_ACCOUNTS, user.uid), {
    email: email.trim(),
    name: name.trim(),
    gender: gender || "female",
    groupId: code,
    groupName: existingGroupName || "우리 가족",
    birthday: birthday || "",
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

// ⭐ 가족 이름은 사람마다 각자 문서에 흩어져 저장돼 있어서(초대받은 사람은 원래
// 이 필드가 비어 있었다) 초대자/받은 사람 누구나 바꿀 수 있게 하려면 그룹의 모든
// 구성원 문서에 한꺼번에 반영해야 서로 다른 값이 보이지 않는다.
export async function updateGroupName(groupId, groupName) {
  const q = query(collection(db, PLANNER_ACCOUNTS), where("groupId", "==", groupId));
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map((d) => updateDoc(d.ref, { groupName })));
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

// ⭐ 회원 탈퇴(내정보에서 스스로) — plannerAccounts 프로필을 지우고, 로그인
// 계정(Firebase Auth)도 함께 삭제한다. toPlannerAuthEmail로 이메일을 네임스페이스
// 처리해두었기 때문에(sw@naver.com → sw+kpplanner@naver.com) 이 Auth 계정은
// 배차프로그램 등 다른 프로그램과 완전히 별개라 안전하게 지울 수 있다. 최근
// 로그인이 아니어서 삭제가 거부되면(auth/requires-recent-login) 프로필만 지우고
// 로그아웃한다 — 남은 로그인 정보는 다시 로그인 후 재시도하면 지워진다.
export async function leavePlannerAccount() {
  const user = auth.currentUser;
  if (!user) return;
  await deleteDoc(doc(db, PLANNER_ACCOUNTS, user.uid));
  try {
    await deleteUser(user);
  } catch {
    await signOut(auth);
  }
}
