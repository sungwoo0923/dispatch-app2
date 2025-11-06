// ===================== DispatchApp.jsx (PART 1/8) — START =====================
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";

import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/* -------------------------------------------------
   발행사(우리 회사) 고정 정보
--------------------------------------------------*/
const COMPANY = {
  name: "(주)돌캐",
  bizNo: "329-81-00967",
  addr: "인천 서구 청마로19번길 21 4층 402호",
  ceo: "고현정",
  bizType: "운수업",
  bizItem: "화물운송주선",
  tel: "1533-2525",
  fax: "032-569-8881",
  bank: "기업은행 955-040276-04-018",
  email: "r15332525@run25.co.kr",
  sealImage: "/seal.png",
};

/* -------------------------------------------------
   공통 상수 (차량종류, 결제/배차 방식)
--------------------------------------------------*/
const VEHICLE_TYPES = ["라보","다마스","오토바이","윙바디","탑","카고","냉장윙","냉동윙","냉장탑","냉동탑"];
const PAY_TYPES = ["계산서","착불","선불","계좌이체"];
const DISPATCH_TYPES = ["24시","인성","직접배차","24시(외부업체)"];

const cellBase = "border px-2 py-1 text-center whitespace-nowrap align-middle min-w-[100px]";
const headBase = "border px-2 py-2 whitespace-nowrap bg-gray-100";
const inputBase = "border p-1 rounded w-36 text-center";

const todayStr = () => new Date().toISOString().slice(0, 10);
const tomorrowStr = () => { const d = new Date(); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10); };

/* -------------------------------------------------
   안전 로컬 저장
--------------------------------------------------*/
const safeLoad = (k, f) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : f; } catch { return f; } };
const safeSave = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

/* -------------------------------------------------
   거래처 정규화
--------------------------------------------------*/
function normalizeClient(row){
  if(!row) return null;
  if(typeof row==="string") return { 거래처명:row, 사업자번호:"", 사업자명:"", 메모:"" };
  return {
    거래처명: row.거래처명 || row.name || row.상호 || row.회사명 || row.title || "",
    사업자번호: row.사업자번호 || row.사업자등록증 || row.사업자등록번호 || "",
    사업자명: row.사업자명 || row.대표자 || row.대표자명 || row.ceo || "",
    메모: row.메모 || row.memo || "",
    대표자: row.대표자 || row.사업자명 || "",
    업태: row.업태 || "",
    종목: row.종목 || "",
    주소: row.주소 || "",
    담당자: row.담당자 || "",
    연락처: row.연락처 || "",
  };
}
function normalizeClients(arr){
  if(!Array.isArray(arr)) return [];
  const mapped = arr.map(normalizeClient).filter(Boolean).map(c=>({
    거래처명:c.거래처명||"", 사업자번호:c.사업자번호||"", 대표자:c.대표자||c.사업자명||"",
    업태:c.업태||"", 종목:c.종목||"", 주소:c.주소||"", 담당자:c.담당자||"", 연락처:c.연락처||"", 메모:c.메모||""
  }));
  const map = new Map(); mapped.forEach(c=>map.set(c.거래처명,c));
  return Array.from(map.values());
}

/* -------------------------------------------------
   Firebase
--------------------------------------------------*/
import { auth } from "./firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { db } from "./firebase";
import {
  doc, getDoc, setDoc, serverTimestamp, collection, getDocs,
  onSnapshot, deleteDoc
} from "firebase/firestore";

/* -------------------------------------------------
   Firestore 사용자 등록/승인 확인
--------------------------------------------------*/
const registerUserInFirestore = async (user) => {
  if (!user) return false;
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid, email: user.email, name: user.displayName || "이름없음",
      role: "user", approved: false, createdAt: serverTimestamp(), lastLogin: serverTimestamp(),
    });
    alert("회원가입 완료! 관리자 승인 후 로그인 가능합니다.");
    await signOut(auth);
    window.location.reload();
    return false;
  } else {
    const data = snap.data();
    if (!data.approved) {
      alert("관리자 승인 대기 중입니다. 승인 후 로그인 가능합니다.");
      await signOut(auth);
      window.location.reload();
      return false;
    }
    await setDoc(ref, { lastLogin: serverTimestamp() }, { merge: true });
    return true;
  }
};

/* -------------------------------------------------
   Firestore 실시간 동기화 훅
   - dispatch, drivers, clients 3개 컬렉션
   - 비어있고 localStorage에 있으면 1회 마이그레이션
--------------------------------------------------*/
const COLL = {
  dispatch: "dispatch",
  drivers: "drivers",
  clients: "clients",
};

function useRealtimeCollections(user){
  const [dispatchData, setDispatchData] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [clients, setClients] = useState([]);

  // 마이그레이션: Firestore 비었고 localStorage 존재 시 1회 업로드
  const migrateIfNeeded = async () => {
    if (!user) return;
    const [dSnap, drSnap, cSnap] = await Promise.all([
      getDocs(collection(db, COLL.dispatch)),
      getDocs(collection(db, COLL.drivers)),
      getDocs(collection(db, COLL.clients)),
    ]);
    const lD = safeLoad("dispatchData", []);
    const lR = safeLoad("drivers", []);
    const lC = safeLoad("clients", []);

    const tasks = [];
    if (dSnap.empty && Array.isArray(lD) && lD.length){
      lD.forEach(r=>{
        const _id = r._id || crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
        tasks.push(setDoc(doc(db, COLL.dispatch, _id), { ...r, _id }));
      });
    }
    if (drSnap.empty && Array.isArray(lR) && lR.length){
      lR.forEach(r=>{
        const id = r.차량번호 || crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
        tasks.push(setDoc(doc(db, COLL.drivers, id), { ...r, id }));
      });
    }
    if (cSnap.empty && Array.isArray(lC) && lC.length){
      normalizeClients(lC).forEach(c=>{
        const id = c.거래처명 || crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
        tasks.push(setDoc(doc(db, COLL.clients, id), { ...c, id }));
      });
    }
    if (tasks.length) await Promise.all(tasks);
  };

  useEffect(()=>{
    if(!user) { setDispatchData([]); setDrivers([]); setClients([]); return; }
    migrateIfNeeded();

    const unsubs = [];
    unsubs.push(onSnapshot(collection(db, COLL.dispatch), (snap)=>{
      const arr = snap.docs.map(d=>d.data());
      setDispatchData(arr.sort((a,b)=>String(a.등록일||"").localeCompare(String(b.등록일||""))));
      safeSave("dispatchData", arr);
    }));
    unsubs.push(onSnapshot(collection(db, COLL.drivers), (snap)=>{
      const arr = snap.docs.map(d=>d.data());
      setDrivers(arr);
      safeSave("drivers", arr);
    }));
    unsubs.push(onSnapshot(collection(db, COLL.clients), (snap)=>{
      const arr = snap.docs.map(d=>d.data());
      setClients(normalizeClients(arr));
      safeSave("clients", arr);
    }));

    return ()=>unsubs.forEach(u=>u&&u());
  }, [user]);

  /* ---------- 공통 저장 유틸 ---------- */
  const addDispatch = async (record)=>{
    const _id = record._id || crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    await setDoc(doc(db, COLL.dispatch, _id), { ...record, _id });
  };
  const patchDispatch = async (_id, patch)=>{
    if(!_id) return;
    await setDoc(doc(db, COLL.dispatch, _id), patch, { merge: true });
  };
  const removeDispatch = async (_id)=>{
    if(!_id) return;
    await deleteDoc(doc(db, COLL.dispatch, _id));
  };

  const upsertDriver = async (driver)=>{
    const id = driver.차량번호 || driver.id || crypto?.randomUUID?.();
    await setDoc(doc(db, COLL.drivers, id), { ...driver, id }, { merge: true });
  };
  const removeDriver = async (id)=> deleteDoc(doc(db, COLL.drivers, id));

  const upsertClient = async (client)=>{
    const id = client.거래처명 || client.id || crypto?.randomUUID?.();
    await setDoc(doc(db, COLL.clients, id), { ...client, id }, { merge: true });
  };
  const removeClient = async (id)=> deleteDoc(doc(db, COLL.clients, id));

  return {
    dispatchData, drivers, clients,
    addDispatch, patchDispatch, removeDispatch,
    upsertDriver, removeDriver,
    upsertClient, removeClient,
  };
}

/* -------------------------------------------------
   뱃지
--------------------------------------------------*/
const StatusBadge = ({ s }) => (
  <span className={`px-2 py-1 rounded text-xs ${
    s === "배차완료" ? "bg-green-100 text-green-700"
    : s === "취소" ? "bg-red-100 text-red-700"
    : "bg-yellow-100 text-yellow-700"
  }`}>{s || ""}</span>
);
// ▼▼▼ 4/8에서 재사용하는 공통 함수 2개(없으면 추가) ▼▼▼
export const toInt = (v) => {
  const n = parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10);
  return isNaN(n) ? 0 : n;
};
export const fmtWon = (n) => `${Number(n || 0).toLocaleString()}원`;

// (VEHICLE_TYPES, PAY_TYPES, DISPATCH_TYPES, headBase, cellBase, inputBase,
//  COMPANY, todayStr 등은 1/8 범위에서 선언되어 있으니 그대로 사용)
export {
  COMPANY, VEHICLE_TYPES, PAY_TYPES, DISPATCH_TYPES,
  headBase, cellBase, inputBase, todayStr
};
// ===================== DispatchApp.jsx (PART 1/8) — END =====================
// ===================== DispatchApp.jsx (PART 2/8) — START =====================
export default function DispatchApp(){
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  // 로그인 상태
  useEffect(()=>{
    const unsub = auth.onAuthStateChanged(async (u)=>{
      if(u){
        const ok = await registerUserInFirestore(u);
        if(ok) setUser(u);
      }else setUser(null);
    });
    return ()=>unsub();
  },[]);

  // Firestore 실시간 훅
  const {
    dispatchData, drivers, clients,
    addDispatch, patchDispatch, removeDispatch,
    upsertDriver, removeDriver,
    upsertClient, removeClient,
  } = useRealtimeCollections(user);

  // 로그아웃
  const logout = async ()=>{
    await signOut(auth);
    alert("로그아웃되었습니다.");
    navigate("/login");
  };

  const timeOptions = useMemo(()=>Array.from({length:24*6},(_,i)=>`${String(Math.floor(i/6)).padStart(2,"0")}:${String((i%6)*10).padStart(2,"0")}`),[]);
  const tonOptions = useMemo(()=>Array.from({length:25},(_,i)=>`${i+1}톤`),[]);

  const [menu, setMenu] = useState("배차관리");

  if(!user) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <h1 className="text-xl mb-4 font-bold">회사 배차 시스템</h1>
      <form
        onSubmit={async (e)=>{
          e.preventDefault();
          const email = e.target.email.value;
          const password = e.target.password.value;
          try{
            const result = await signInWithEmailAndPassword(auth, email, password);
            const ok = await registerUserInFirestore(result.user);
            if(!ok) return;
            alert("로그인 성공!");
            navigate("/app");
          }catch(err){
            if(err.code==="auth/user-not-found"){
              if(confirm("등록된 사용자가 없습니다. 회원가입하시겠습니까?")){
                const newUser = await createUserWithEmailAndPassword(auth, email, password);
                await registerUserInFirestore(newUser.user);
              }
            }else{
              alert("로그인 실패: " + err.message);
            }
          }
        }}
        className="flex flex-col gap-3 w-64"
      >
        <input name="email" type="email" placeholder="이메일" className="border p-2 rounded" required />
        <input name="password" type="password" placeholder="비밀번호" className="border p-2 rounded" required />
        <button type="submit" className="bg-blue-600 text-white py-2 rounded">로그인</button>
        <button type="button" onClick={()=>navigate("/signup")} className="text-blue-600 text-sm hover:underline mt-2">회원가입 하러가기</button>
      </form>
    </div>
  );

  return (
    <>
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">배차 프로그램</h1>
        <div className="flex items-center gap-3">
          <span className="text-gray-700 text-sm">{user?.email}</span>
          <button onClick={logout} className="bg-gray-300 px-3 py-1 rounded text-sm">로그아웃</button>
        </div>
      </header>

      <nav className="flex gap-2 mb-3">
        {["배차관리","실시간배차현황","배차현황","미배차현황","기사관리","거래처관리","매출관리","거래처정산","지급관리","관리자메뉴"].map((m)=>(
          <button key={m} onClick={()=>setMenu(m)} className={`px-3 py-2 rounded ${menu===m?"bg-blue-600 text-white":"bg-white border"}`}>{m}</button>
        ))}
      </nav>

      <main className="bg-white rounded shadow p-4">
        {menu==="배차관리" && (
          <DispatchManagement
            dispatchData={dispatchData}
            timeOptions={timeOptions}
            tonOptions={tonOptions}
            drivers={drivers}
            clients={clients}
            addDispatch={addDispatch}
            upsertDriver={upsertDriver}
            upsertClient={upsertClient}
          />
        )}
        {menu==="실시간배차현황" && (
          <RealtimeStatus
            dispatchData={dispatchData}
            timeOptions={timeOptions}
            tonOptions={tonOptions}
            drivers={drivers}
            patchDispatch={patchDispatch}
            removeDispatch={removeDispatch}
            upsertDriver={upsertDriver}
          />
        )}
        {menu==="배차현황" && (
          <DispatchStatus
            dispatchData={dispatchData}
            timeOptions={timeOptions}
            tonOptions={tonOptions}
            drivers={drivers}
            patchDispatch={patchDispatch}
            removeDispatch={removeDispatch}
            upsertDriver={upsertDriver}
          />
        )}
        {menu==="미배차현황" && (
          <UnassignedStatus dispatchData={dispatchData} />
        )}
        {menu==="기사관리" && (
          <DriverManagement drivers={drivers} upsertDriver={upsertDriver} removeDriver={removeDriver} />
        )}
        {menu==="거래처관리" && (
          <ClientManagement clients={clients} upsertClient={upsertClient} removeClient={removeClient} />
        )}
        {menu==="매출관리" && (
          <Settlement dispatchData={dispatchData} />
        )}
        {menu==="거래처정산" && (
          <ClientSettlement dispatchData={dispatchData} clients={clients} setClients={(next)=>next.forEach(upsertClient)} />
        )}
        {menu==="지급관리" && (
          <PaymentManagement dispatchData={dispatchData} patchDispatch={patchDispatch} />
          )}
        {menu==="관리자메뉴" && <AdminMenu />}
      </main>
    </>
  );
}

/* -------------------------------------------------
   관리자 메뉴 (users 컬렉션)
--------------------------------------------------*/
function AdminMenu(){
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(()=>{
    const load = async ()=>{
      try{
        const snap = await getDocs(collection(db, "users"));
        const list = snap.docs.map(d=>({ id:d.id, ...d.data() }));
        setUsers(list);
        safeSave("users", list);
      }catch(err){
        console.error("⚠ Firestore 오류:", err);
        alert("사용자 목록 로드 실패");
      }
    };
    load();
  },[]);

  const filtered = useMemo(()=>{
    const q = search.trim().toLowerCase();
    if(!q) return users;
    return users.filter(u=>Object.values(u).some(v=>String(v||"").toLowerCase().includes(q)));
  },[users,search]);

  const toggleApprove = async (u)=>{
    const newStatus = !u.approved;
    if(!confirm(`${u.email}을 ${newStatus?"승인":"미승인"} 처리?`)) return;
    await setDoc(doc(db,"users",u.id), { approved:newStatus }, { merge:true });
    setUsers(prev=>prev.map(x=>x.id===u.id?{...x, approved:newStatus}:x));
  };
  const toggleRole = async (u)=>{
    const newRole = u.role==="admin"?"user":"admin";
    if(!confirm(`${u.email} 권한을 ${newRole}로 변경?`)) return;
    await setDoc(doc(db,"users",u.id), { role:newRole }, { merge:true });
    setUsers(prev=>prev.map(x=>x.id===u.id?{...x, role:newRole}:x));
  };

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">관리자 메뉴</h2>
      <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="사용자 검색" className="border p-2 rounded w-80 mb-3" />
      <table className="w-full text-sm border">
        <thead>
          <tr>
            <th className={headBase}>이메일</th>
            <th className={headBase}>권한</th>
            <th className={headBase}>승인여부</th>
            <th className={headBase}>최근 로그인</th>
            <th className={headBase}>관리</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length===0 ? (
            <tr><td colSpan={5} className="text-center py-4 text-gray-500">등록된 사용자가 없습니다.</td></tr>
          ) : filtered.map(u=>(
            <tr key={u.id} className="odd:bg-white even:bg-gray-50">
              <td className={cellBase}>{u.email}</td>
              <td className={cellBase}><span className={`${u.role==="admin"?"text-blue-600 font-semibold":"text-gray-700"}`}>{u.role}</span></td>
              <td className={cellBase}>
                <span className={`px-2 py-1 rounded text-xs ${u.approved?"bg-green-100 text-green-700":"bg-yellow-100 text-yellow-700"}`}>{u.approved?"승인":"대기중"}</span>
              </td>
              <td className={cellBase}>{u.lastLogin ? new Date(u.lastLogin.seconds*1000).toLocaleString() : "-"}</td>
              <td className={cellBase}>
                <div className="flex gap-2 justify-center">
                  <button onClick={()=>toggleApprove(u)} className="bg-blue-500 text-white px-2 py-1 rounded text-xs">{u.approved?"승인해제":"승인"}</button>
                  <button onClick={()=>toggleRole(u)} className="bg-gray-500 text-white px-2 py-1 rounded text-xs">권한변경</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
// ===================== DispatchApp.jsx (PART 2/8) — END =====================
// ===================== DispatchApp.jsx (PART 3/8) — START =====================
function DispatchManagement({
  dispatchData, drivers, clients, timeOptions, tonOptions,
  addDispatch, upsertDriver, upsertClient,
}){

  /* ✅ 날짜 자동 변환 (엑셀 숫자 날짜 + / . 공백 → YYYY-MM-DD 로 통일) */
  const fixDate = (v) => {
    if (!v) return "";
    if (typeof v === "number") {
      const base = new Date(1899, 11, 30);
      return new Date(base.getTime() + v * 86400000).toISOString().slice(0, 10);
    }
    const str = String(v).trim()
      .replace(/[./]/g, "-")
      .replace(/\s+/g, "-")
      .slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(str) ? str : "";
  };

  const emptyForm = {
    _id: crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    순번:"", 등록일: todayStr(), 거래처명:"", 상차지명:"", 하차지명:"",
    화물내용:"", 차량종류:"", 차량톤수:"", 차량번호:"", 이름:"", 전화번호:"",
    상차방법:"", 하차방법:"", 상차일:"", 상차시간:"", 하차일:"", 하차시간:"",
    청구운임:"", 기사운임:"", 수수료:"", 지급방식:"", 배차방식:"", 메모:"",
    배차상태:"배차중",
  };
  const [form, setForm] = useState(()=>({ ...emptyForm, ...safeLoad("dispatchForm", {}) }));
  useEffect(()=>safeSave("dispatchForm", form), [form]);

  // 배차관리 전용 기사등록 모달
  const [showModalDM, setShowModalDM] = useState(false);
  const [pendingCarNoDM, setPendingCarNoDM] = useState("");

  // 🔵 대용량 업로드 상태
  const [bulkRows, setBulkRows] = useState([]);      // 정규화/검증 완료된 행들
  const [rawPreview, setRawPreview] = useState([]);  // 미리보기 원본
  const [showBulk, setShowBulk] = useState(false);
  const [bulkStats, setBulkStats] = useState(null);  // {ok, fail, skipped}
  const [isImporting, setIsImporting] = useState(false);

  // ✅ 거래처 콤보박스용 상태
  const [clientQuery, setClientQuery] = useState("");
  const [isClientOpen, setIsClientOpen] = useState(false);
  const [clientActive, setClientActive] = useState(0);
  const comboRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!comboRef.current) return;
      if (!comboRef.current.contains(e.target)) setIsClientOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const normInc = (s="") => String(s).toLowerCase().replace(/\s+/g, "");
  const clientOptions = (clients||[]).map(normalizeClient);
  const filteredClients = useMemo(() => {
    const q = normInc(clientQuery);
    if (!q) return clientOptions;
    return clientOptions.filter(c => normInc(c.거래처명).includes(q));
  }, [clientQuery, clientOptions]);

  // 청구/기사운임 → 수수료 자동
  const onChange = (name, value)=>{
    if(name==="청구운임" || name==="기사운임"){
      setForm(prev=>{
        const next = { ...prev, [name]: value };
        const fare = parseInt(next.청구운임||0)||0;
        const driver = parseInt(next.기사운임||0)||0;
        next.수수료 = String(fare - driver);
        return next;
      });
      return;
    }
    setForm(p=>({ ...p, [name]: value }));
  };

  const addClientQuick = ()=>{
    const 거래처명 = prompt("신규 거래처명:"); if(!거래처명) return;
    const 사업자번호 = prompt("사업자번호(선택):") || "";
    const 대표자 = prompt("대표자(선택):") || "";
    const 메모 = prompt("메모(선택):") || "";
    const c = normalizeClient({ 거래처명, 사업자번호, 대표자, 메모 });
    upsertClient(c);
    setForm(p=>({ ...p, 거래처명, 상차지명: 거래처명 }));
    setClientQuery(거래처명);
  };

  const nextSeq = ()=>{
    const max = Math.max(0, ...(dispatchData||[]).map(r=>Number(r.순번)||0));
    return max + 1;
  };

  // 차량번호 Enter 시 자동매칭/신규등록
  const handleCarNoEnter = (value)=>{
    const v = (value||"").trim().replace(/\s+/g,"");
    if(!v){
      setForm((p)=>({ ...p, 차량번호:"", 이름:"", 전화번호:"", 배차상태:"배차중" }));
      return;
    }
    const found = (drivers||[]).find(x=>(x.차량번호||"").replace(/\s+/g,"")===v);
    if(found){
      setForm(p=>({ ...p, 차량번호:found.차량번호, 이름:found.이름||"", 전화번호:found.전화번호||"", 배차상태:"배차완료" }));
    }else{
      setPendingCarNoDM(v);
      setShowModalDM(true);
    }
  };

  const handleSubmit = async(e)=>{
    e.preventDefault();
    if(!form.거래처명) return alert("거래처명을 입력하세요.");

    const status = form.차량번호 && form.이름 && form.전화번호 ? "배차완료" : "배차중";
    const newRecord = { ...form, 배차상태: status, 순번: nextSeq() };
    await addDispatch(newRecord);

    const reset = { ...emptyForm, _id: crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, 등록일: todayStr() };
    setForm(reset);
    setClientQuery(""); setIsClientOpen(false); setClientActive(0);
    safeSave("dispatchForm", reset);
    alert("등록되었습니다.");
  };

  /* ----------------------------------------------------------------
     🔵 대용량 업로드: 유틸
  ---------------------------------------------------------------- */
  const ALIAS = {
    거래처명: ["거래처명","거래처","업체","업체명","상호","회사","회사명","client"],
    상차지명: ["상차지명","상차지","상차지점","상차지/출발지","출발지","상차지(출발지)"],
    하차지명: ["하차지명","하차지","도착지","하차지(도착지)"],
    화물내용: ["화물내용","품목","품명","화물명","상품","item"],
    차량종류: ["차량종류","차종","차량타입","vehicleType"],
    차량톤수: ["차량톤수","톤수","톤","ton"],
    차량번호: ["차량번호","차번","차량","차량No","carNo","차량번호(필수x)"],
    이름:   ["기사명","기사","이름","성명","driverName"],
    전화번호:["전화번호","연락처","휴대폰","휴대전화","driverPhone","핸드폰"],
    상차방법:["상차방법","상차","상차방식"],
    하차방법:["하차방법","하차","하차방식"],
    상차일: ["상차일","상차일자","픽업일","상차날짜","출발일"],
    상차시간:["상차시간","픽업시간","출발시간","상차시각"],
    하차일: ["하차일","하차일자","납품일","도착일","도착날짜"],
    하차시간:["하차시간","납품시간","도착시간","하차시각"],
    청구운임:["청구운임","청구","운임","청구금액","매출","총청구"],
    기사운임:["기사운임","기사","운반비","기사요금","지급금액","기사님요금"],
    지급방식:["지급방식","결제방식","지급","결제"],
    배차방식:["배차방식","배차","배차유형"],
    메모:   ["메모","비고","특이사항","notes"],
  };

  const aliasPick = (row, key) => {
    for(const k of ALIAS[key] || [key]){
      if(k in row && row[k] !== undefined && row[k] !== null) return row[k];
      const norm = (s)=>String(s).replace(/\s+|\(|\)|\/|\\/g,"").toLowerCase();
      const hit = Object.keys(row).find(h=>norm(h)===norm(k));
      if(hit) return row[hit];
    }
    return row[key];
  };

  const toNum = (v)=> {
    if(v===undefined || v===null || v==="") return 0;
    const n = parseInt(String(v).replace(/[^\d-]/g,""),10);
    return isNaN(n)?0:n;
  };

  const normOne = (row) => {
    const r = {
      _id: crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      순번: "", 등록일: todayStr(),
      거래처명: aliasPick(row,"거래처명") || "",
      상차지명: aliasPick(row,"상차지명") || "",
      하차지명: aliasPick(row,"하차지명") || "",
      화물내용: aliasPick(row,"화물내용") || "",
      차량종류: aliasPick(row,"차량종류") || "",
      차량톤수: aliasPick(row,"차량톤수") || "",
      차량번호: (aliasPick(row,"차량번호")||"").toString().replace(/\s+/g,""),
      이름: aliasPick(row,"이름") || "",
      전화번호: aliasPick(row,"전화번호") || "",
      상차방법: aliasPick(row,"상차방법") || "",
      하차방법: aliasPick(row,"하차방법") || "",
      상차일: fixDate(aliasPick(row,"상차일")),
      상차시간: aliasPick(row,"상차시간") || "",
      하차일: fixDate(aliasPick(row,"하차일")),
      하차시간: aliasPick(row,"하차시간") || "",
      청구운임: toNum(aliasPick(row,"청구운임")),
      기사운임: toNum(aliasPick(row,"기사운임")),
      지급방식: aliasPick(row,"지급방식") || "",
      배차방식: aliasPick(row,"배차방식") || "",
      메모: aliasPick(row,"메모") || "",
      배차상태: "배차중",
    };
    r.수수료 = r.청구운임 - r.기사운임;

    // 차량번호 매칭 시 기사정보 자동주입
    if(r.차량번호){
      const f = (drivers||[]).find(d=>(d.차량번호||"").replace(/\s+/g,"")===r.차량번호);
      if(f){ r.이름 = r.이름 || f.이름 || ""; r.전화번호 = r.전화번호 || f.전화번호 || ""; r.배차상태 = "배차완료"; }
    }
    return r;
  };

  const validateRow = (r) => {
    const err = [];
    if(!r.거래처명) err.push("거래처명 누락");
    if(!r.상차일) err.push("상차일 누락");
    if(r.상차일 && !/^\d{4}-\d{2}-\d{2}$/.test(r.상차일)) err.push("상차일 형식(YYYY-MM-DD) 오류");
    if(r.하차일 && !/^\d{4}-\d{2}-\d{2}$/.test(r.하차일)) err.push("하차일 형식(YYYY-MM-DD) 오류");
    return err;
  };

  const handleBulkFile = (e)=>{
    const file = e.target.files?.[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = (evt)=>{
      try{
        const wb = XLSX.read(evt.target.result, { type:"array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { defval:"" });
        const normalized = json.map(normOne);
        const withCheck = normalized.map(r=>({ r, errors: validateRow(r) }));
        setRawPreview(withCheck);
        setBulkRows(withCheck.filter(x=>x.errors.length===0).map(x=>x.r));
        setShowBulk(true);
        setBulkStats(null);
      }catch(err){
        console.error(err);
        alert("엑셀 파싱 중 오류가 발생했습니다.");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const downloadBulkTemplate = ()=>{
    const cols = [
      "거래처명","상차지명","하차지명","화물내용",
      "차량종류","차량톤수","차량번호","기사명/이름","전화번호",
      "상차일(YYYY-MM-DD)","상차시간(HH:MM)","하차일(YYYY-MM-DD)","하차시간(HH:MM)",
      "청구운임","기사운임","지급방식","배차방식","메모"
    ];
    const sample = [{
      거래처명:"반찬단지", 상차지명:"인천물류", 하차지명:"리앤뉴",
      화물내용:"식자재", 차량종류:"라보", 차량톤수:"1톤",
      차량번호:"12가3456", "기사명/이름":"김기사", 전화번호:"010-1234-5678",
      "상차일(YYYY-MM-DD)": todayStr(), "상차시간(HH:MM)":"09:00",
      "하차일(YYYY-MM-DD)": todayStr(), "하차시간(HH:MM)":"11:00",
      청구운임:120000, 기사운임:90000, 지급방식:"계좌이체", 배차방식:"직접배차", 메모:"비고 예시"
    }];
    const ws = XLSX.utils.json_to_sheet(sample, { header: cols });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "배차업로드양식");
    XLSX.writeFile(wb, "배차_대용량업로드_양식.xlsx");
  };

  const importBulk = async ()=>{
    if(!bulkRows.length) return alert("가져올 유효한 데이터가 없습니다.");
    if(!confirm(`${bulkRows.length}건을 등록할까요?`)) return;
    setIsImporting(true);
    try{
      let ok=0, fail=0, skipped=0;
      let seqBase = Math.max(0, ...(dispatchData||[]).map(r=>Number(r.순번)||0));
      for(const r of bulkRows){
        try{
          const status = (r.차량번호 && (r.이름||r.전화번호)) ? "배차완료" : "배차중";
          const rec = { ...r, 순번: ++seqBase, 배차상태: status };
          await addDispatch(rec);
          ok++;
        }catch{
          fail++;
        }
      }
      setBulkStats({ ok, fail, skipped });
      alert(`완료: ${ok}건 / 실패: ${fail}건`);
      setShowBulk(false);
      setRawPreview([]); setBulkRows([]);
    }finally{
      setIsImporting(false);
    }
  };

  // ✅ 거래처 선택 시 공통 처리 (거래처명 + 상차지명 자동 채움)
  const applyClientSelect = (name) => {
    setForm(prev => ({ ...prev, 거래처명: name, 상차지명: name }));
    setClientQuery(name);
    setIsClientOpen(false);
    setClientActive(0);
  };

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">배차관리</h2>

      {/* 🔵 대용량 업로드 박스 */}
      <div className="bg-blue-50/60 p-3 rounded-xl border border-blue-200 mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-blue-800">대용량 업로드</span>
        <label className="px-3 py-1 rounded bg-blue-600 text-white cursor-pointer text-sm">
          📁 엑셀 선택
          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleBulkFile} className="hidden" />
        </label>
        <button type="button" onClick={downloadBulkTemplate} className="px-3 py-1 rounded border text-sm">📝 양식 다운로드</button>
        {rawPreview.length>0 && (
          <button type="button" onClick={()=>setShowBulk(true)} className="px-3 py-1 rounded bg-emerald-600 text-white text-sm">
            미리보기 ({rawPreview.length}건)
          </button>
        )}
      </div>

      <div className="bg-gray-50 p-6 rounded-xl shadow-sm border border-gray-200"></div>

      {/* 입력 폼 */}
      <form onSubmit={handleSubmit} className="grid grid-cols-6 gap-3">
        {/* 거래처 (검색형 콤보박스) */}
        <div className="col-span-2 flex gap-2 items-start">
          <div className="relative w-full" ref={comboRef}>
            <input
              className="border p-2 rounded w-full"
              placeholder="거래처 검색 또는 선택 (예: 반 입력)"
              value={clientQuery}
              onFocus={()=> setIsClientOpen(true)}
              onChange={(e)=>{
                const v = e.target.value;
                setClientQuery(v);
                onChange("거래처명", v); // 타이핑 중엔 거래처명만 동기화
                setIsClientOpen(true);
                setClientActive(0);
              }}
              onKeyDown={(e)=>{
                if(!isClientOpen && (e.key==="ArrowDown" || e.key==="Enter")) { setIsClientOpen(true); return; }
                if(!filteredClients.length) return;
                if(e.key==="ArrowDown"){ e.preventDefault(); setClientActive(i => Math.min(i+1, filteredClients.length-1)); }
                else if(e.key==="ArrowUp"){ e.preventDefault(); setClientActive(i => Math.max(i-1, 0)); }
                else if(e.key==="Enter"){
                  e.preventDefault();
                  const pick = filteredClients[clientActive];
                  if(pick) applyClientSelect(pick.거래처명);
                } else if(e.key==="Escape"){
                  setIsClientOpen(false);
                }
              }}
            />
            {isClientOpen && (
              <div className="absolute left-0 right-0 mt-1 max-h-52 overflow-auto bg-white border rounded shadow-lg z-50">
                {filteredClients.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-500">검색 결과 없음</div>
                ) : (
                  filteredClients.map((c, idx)=>(
                    <div
                      key={c.거래처명}
                      className={`px-3 py-2 text-sm cursor-pointer ${idx===clientActive ? "bg-blue-50" : "hover:bg-gray-50"}`}
                      onMouseEnter={()=>setClientActive(idx)}
                      onMouseDown={(e)=>{ e.preventDefault(); applyClientSelect(c.거래처명); }}
                    >
                      {c.거래처명}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <button type="button" onClick={addClientQuick} className="px-3 h-[40px] rounded bg-green-600 text-white">신규</button>
        </div>

        <input className="border p-2 rounded" placeholder="상차지명" value={form.상차지명} onChange={(e)=>onChange("상차지명", e.target.value)} />
        <input className="border p-2 rounded" placeholder="하차지명" value={form.하차지명} onChange={(e)=>onChange("하차지명", e.target.value)} />
        <input className="border p-2 rounded" placeholder="화물내용" value={form.화물내용} onChange={(e)=>onChange("화물내용", e.target.value)} />

        <select className="border p-2 rounded" value={form.차량종류} onChange={(e)=>onChange("차량종류", e.target.value)}>
          <option value="">차량종류 ▾</option>
          {VEHICLE_TYPES.map(v=><option key={v} value={v}>{v}</option>)}
        </select>
        <select className="border p-2 rounded" value={form.차량톤수} onChange={(e)=>onChange("차량톤수", e.target.value)}>
          <option value="">톤수 ▾</option>
          {(Array.isArray(tonOptions)?tonOptions:[]).map(t=><option key={t} value={t}>{t}</option>)}
        </select>

        <input className="border p-2 rounded" placeholder="청구운임" value={form.청구운임} onChange={(e)=>onChange("청구운임", e.target.value)} />
        <input className="border p-2 rounded" placeholder="기사운임" value={form.기사운임} onChange={(e)=>onChange("기사운임", e.target.value)} />
        <input className="border p-2 rounded bg-gray-100" placeholder="수수료" value={form.수수료} readOnly />

        {/* 차량번호/기사 */}
        <input className="border p-2 rounded" placeholder="차량번호" value={form.차량번호}
          onChange={(e)=>setForm({...form, 차량번호:e.target.value})}
          onKeyDown={(e)=>{ if(e.key==="Enter"){ e.preventDefault(); handleCarNoEnter(e.currentTarget.value); } }}
          onBlur={(e)=>{ const v=e.currentTarget.value.trim(); if(!v){ setForm(p=>({ ...p, 차량번호:"", 이름:"", 전화번호:"", 배차상태:"배차중" })); } }}
        />
        <input className="border p-2 rounded bg-gray-100" placeholder="기사이름" value={form.이름} readOnly />
        <input className="border p-2 rounded bg-gray-100" placeholder="핸드폰번호" value={form.전화번호} readOnly />

        {/* 상차/하차 날짜시간 + 방법/지급/배차 */}
        <div className="flex gap-2 items-center">
          <input type="date" className="border p-2 rounded" value={form.상차일} onChange={(e)=>onChange("상차일", e.target.value)} />
          <div className="flex gap-1">
            <button type="button" onClick={()=>onChange("상차일", todayStr())} className="px-2 py-1 bg-gray-200 rounded text-xs">당일상차</button>
            <button type="button" onClick={()=>onChange("상차일", tomorrowStr())} className="px-2 py-1 bg-gray-200 rounded text-xs">내일상차</button>
          </div>
        </div>
        <select className="border p-2 rounded" value={form.상차시간} onChange={(e)=>onChange("상차시간", e.target.value)}>
          <option value="">상차시간 ▾</option>
          {(Array.isArray(timeOptions)?timeOptions:[]).map(t=><option key={t} value={t}>{t}</option>)}
        </select>

        <div className="flex gap-2 items-center">
          <input type="date" className="border p-2 rounded" value={form.하차일} onChange={(e)=>onChange("하차일", e.target.value)} />
          <div className="flex gap-1">
            <button type="button" onClick={()=>onChange("하차일", todayStr())} className="px-2 py-1 bg-gray-200 rounded text-xs">당일하차</button>
            <button type="button" onClick={()=>onChange("하차일", tomorrowStr())} className="px-2 py-1 bg-gray-200 rounded text-xs">내일하차</button>
          </div>
        </div>
        <select className="border p-2 rounded" value={form.하차시간} onChange={(e)=>onChange("하차시간", e.target.value)}>
          <option value="">하차시간 ▾</option>
          {(Array.isArray(timeOptions)?timeOptions:[]).map(t=><option key={t} value={t}>{t}</option>)}
        </select>

        <select className="border p-2 rounded" value={form.상차방법} onChange={(e)=>onChange("상차방법", e.target.value)}>
          <option value="">상차방법 ▾</option>
          {["지게차","수작업","직접수작업","수도움"].map(v=><option key={v} value={v}>{v}</option>)}
        </select>
        <select className="border p-2 rounded" value={form.하차방법} onChange={(e)=>onChange("하차방법", e.target.value)}>
          <option value="">하차방법 ▾</option>
          {["지게차","수작업","직접수작업","수도움"].map(v=><option key={v} value={v}>{v}</option>)}
        </select>

        <select className="border p-2 rounded" value={form.지급방식} onChange={(e)=>onChange("지급방식", e.target.value)}>
          <option value="">지급방식 ▾</option>
          {PAY_TYPES.map(v=><option key={v} value={v}>{v}</option>)}
        </select>
        <select className="border p-2 rounded" value={form.배차방식} onChange={(e)=>onChange("배차방식", e.target.value)}>
          <option value="">배차방식 ▾</option>
          {DISPATCH_TYPES.map(v=><option key={v} value={v}>{v}</option>)}
        </select>

        <textarea className="border p-2 rounded col-span-6 h-20" placeholder="메모" value={form.메모} onChange={(e)=>onChange("메모", e.target.value)} />
        <div className="col-span-6 flex justify-end mt-4">
          <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded text-sm hover:bg-blue-700 transition-all">저장</button>
        </div>
      </form>

      <hr className="my-6 border-t-2 border-gray-300" />
      <div className="text-sm text-gray-700 mb-2 font-semibold">▼ 실시간 배차현황 (배차관리 내 전체 기능)</div>

      {/* ✅ 배차관리 화면에 실시간배차현황 “전체 기능” 내장 */}
      <RealtimeStatusEmbed
        dispatchData={dispatchData}
        drivers={drivers}
        timeOptions={timeOptions}
        tonOptions={tonOptions}
        upsertDriver={upsertDriver}
      />

      {/* 배차관리 전용 신규기사 등록 모달 */}
      {showModalDM && (
        <RegisterDriverModalDM
          carNo={pendingCarNoDM}
          onClose={()=>setShowModalDM(false)}
          onSubmit={async(newDriver)=>{
            await upsertDriver(newDriver);
            setForm(p=>({ ...p, 차량번호:newDriver.차량번호, 이름:newDriver.이름, 전화번호:newDriver.전화번호, 배차상태:"배차완료" }));
            setShowModalDM(false);
            alert("신규 기사 등록 완료!");
          }}
        />
      )}

      {/* 🔵 대용량 업로드 미리보기 모달 */}
      {showBulk && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-2xl shadow-2xl w-[960px] max-h-[85vh] overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-bold">대용량 업로드 미리보기</h3>
              <button className="text-gray-500" onClick={()=>setShowBulk(false)}>✕</button>
            </div>
            <div className="p-5 overflow-auto">
              <div className="mb-3 text-sm">
                <span className="mr-3">총 {rawPreview.length}건</span>
                <span className="mr-3 text-emerald-700">유효 {rawPreview.filter(x=>x.errors.length===0).length}건</span>
                <span className="text-rose-600">오류 {rawPreview.filter(x=>x.errors.length>0).length}건</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[900px] text-sm border">
                  <thead>
                    <tr>
                      {["상차일","거래처명","상차지명","하차지명","차량번호","이름","전화번호","청구운임","기사운임","배차상태","오류"].map(h=>
                        <th key={h} className={headBase}>{h}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rawPreview.map((x,i)=>{
                      const r=x.r, bad=x.errors.length>0;
                      return (
                        <tr key={i} className={bad?"bg-rose-50":"odd:bg-white even:bg-gray-50"}>
                          <td className={cellBase}>{r.상차일||"-"}</td>
                          <td className={cellBase}>{r.거래처명||"-"}</td>
                          <td className={cellBase}>{r.상차지명||"-"}</td>
                          <td className={cellBase}>{r.하차지명||"-"}</td>
                          <td className={cellBase}>{r.차량번호||"-"}</td>
                          <td className={cellBase}>{r.이름||"-"}</td>
                          <td className={cellBase}>{r.전화번호||"-"}</td>
                          <td className={cellBase}>{(r.청구운임||0).toLocaleString()}</td>
                          <td className={cellBase}>{(r.기사운임||0).toLocaleString()}</td>
                          <td className={cellBase}><StatusBadge s={r.배차상태} /></td>
                          <td className={cellBase}>
                            {bad ? <span className="text-rose-600 text-xs">{x.errors.join(", ")}</span> : <span className="text-emerald-700 text-xs">OK</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="px-5 py-4 border-t flex items-center justify-end gap-2">
              <button className="px-3 py-2 rounded border" onClick={()=>setShowBulk(false)}>닫기</button>
              <button disabled={isImporting || bulkRows.length===0}
                      onClick={importBulk}
                      className={`px-4 py-2 rounded text-white ${isImporting?"bg-gray-400":"bg-blue-600 hover:bg-blue-700"}`}>
                {isImporting ? "등록 중..." : `등록 (${bulkRows.length}건)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------
   ✅ 배차관리 내장용 실시간배차현황 (오늘 상차일만)
--------------------------------------------------*/
function RealtimeStatusEmbed({ dispatchData, drivers, timeOptions, tonOptions, upsertDriver }){
  const [q,setQ]=useState("");
  const [editIdx,setEditIdx]=useState(null);
  const [edited,setEdited]=useState({});
  const [filterType,setFilterType]=useState("전체");
  const [filterValue,setFilterValue]=useState("");
  const [startDate,setStartDate]=useState("");
  const [endDate,setEndDate]=useState("");

  // Firestore 직접 반영 (PART 1의 import/CONST 사용)
  const patchDispatchDirect = async (id, patch)=>{
    if(!id) return;
    await setDoc(doc(db, COLL.dispatch, id), patch, { merge:true });
  };
  const removeDispatchDirect = async (id)=>{
    if(!id) return;
    await deleteDoc(doc(db, COLL.dispatch, id));
  };

  // ✅ 오늘 상차일만 선필터 (배차관리 화면 요구사항)
  const filtered = useMemo(()=>{
    let data = [...(dispatchData||[])].filter(r => (r.상차일 || "") === todayStr());

    // 이하 추가 필터는 "오늘 데이터" 범위 안에서만 적용
    if(startDate && endDate){
      data = data.filter(r => (r.상차일||"") >= startDate && (r.상차일||"") <= endDate);
    }
    if(filterType!=="전체" && filterValue){
      data = data.filter(r => String(r[filterType]||"").includes(filterValue));
    }
    if(q.trim()){
      const lower = q.toLowerCase();
      data = data.filter(r => Object.values(r).some(v => String(v||"").toLowerCase().includes(lower)));
    }
    return data.sort((a,b)=>(a.상차일||"").localeCompare(b.상차일||"") || (a.상차시간||"").localeCompare(b.상차시간||""));
  },[dispatchData,q,filterType,filterValue,startDate,endDate]);

  // ✅ 상단 KPI
  const toInt=(v)=>{ const n=parseInt(String(v||"0").replace(/[^\d-]/g,""),10); return isNaN(n)?0:n; };
  const kpi = useMemo(()=>{
    const cnt = filtered.length;
    const sale = filtered.reduce((a,r)=>a+toInt(r.청구운임),0);
    const driver = filtered.reduce((a,r)=>a+toInt(r.기사운임),0);
    const fee = sale - driver;
    return { cnt, sale, driver, fee };
  },[filtered]);

  const remove = async(row)=>{ if(!confirm("삭제하시겠습니까?")) return; await removeDispatchDirect(row._id); alert("삭제되었습니다."); };

  const handleCarNoInput = async (row, raw)=>{
    const trimmed=(raw||"").replace(/\s+/g,"");
    if(!trimmed){ await patchDispatchDirect(row._id, { 차량번호:"", 이름:"", 전화번호:"", 배차상태:"배차중" }); return; }
    const found=(drivers||[]).find(d=>(d.차량번호||"").replace(/\s+/g,"")===trimmed);
    if(found){
      await patchDispatchDirect(row._id, { 차량번호:found.차량번호, 이름:found.이름||"", 전화번호:found.전화번호||"", 배차상태:"배차완료" });
    }else{
      const 이름 = prompt("신규 기사 이름:");
      const 전화번호 = prompt("전화번호:");
      if(이름){
        await upsertDriver({ 이름, 차량번호: trimmed, 전화번호 });
        await patchDispatchDirect(row._id, { 차량번호: trimmed, 이름, 전화번호, 배차상태:"배차완료" });
        alert("신규 기사 등록 완료!");
      }
    }
  };

  // 🔧 edited 누적 도우미 (청구/기사 수정 시 수수료 동시 반영)
  const updateEdited = (row, key, value) => {
    setEdited(prev=>{
      const cur = { ...(prev[row._id]||{}) , [key]: value };
      const baseFare  = (key==="청구운임") ? toInt(value) : toInt(cur.청구운임 ?? row.청구운임);
      const baseDrive = (key==="기사운임") ? toInt(value) : toInt(cur.기사운임 ?? row.기사운임);
      if(key==="청구운임" || key==="기사운임"){
        cur.수수료 = baseFare - baseDrive;
      }
      return { ...prev, [row._id]: cur };
    });
  };

  const applyAllChanges = async ()=>{
    const ids=Object.keys(edited);
    for(const id of ids){
      const patch = { ...edited[id] };
      if(("청구운임" in patch) || ("기사운임" in patch)){
        const orig = (filtered.find(r=>r._id===id)) || {};
        const finalFare  = toInt(patch.청구운임 ?? orig.청구운임);
        const finalDrive = toInt(patch.기사운임 ?? orig.기사운임);
        patch.수수료 = finalFare - finalDrive;
      }
      await patchDispatchDirect(id, patch);
    }
    setEditIdx(null); setEdited({}); alert("저장되었습니다!");
  };

  const headers = [
    "순번","등록일","상차일","상차시간","하차일","하차시간",
    "거래처명","상차지명","하차지명","차량종류","차량톤수","차량번호","이름","전화번호",
    "배차상태", "청구운임","기사운임","수수료", "지급방식","배차방식","메모","수정","삭제"
  ];

  const renderInput = (row,key,def,type="text")=>(
    <input className={inputBase} defaultValue={def||""} type={type}
      onBlur={(e)=>updateEdited(row, key, e.target.value)} />
  );
  const renderSelect = (row,key,value,options)=>(
    <select className={inputBase} defaultValue={value||""}
      onBlur={(e)=>updateEdited(row, key, e.target.value)}>
      <option value="">선택 ▾</option>
      {options.map(v=><option key={v} value={v}>{v}</option>)}
    </select>
  );

  return (
    <div className="space-y-3">
      {/* KPI 요약 */}
      <div className="flex flex-wrap gap-2 text-xs md:text-sm">
        <span className="px-2 py-1 rounded bg-gray-100">총 오더 <b>{kpi.cnt.toLocaleString()}</b>건</span>
        <span className="px-2 py-1 rounded bg-blue-50 text-blue-700">총 청구 <b>{kpi.sale.toLocaleString()}</b>원</span>
        <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700">총 기사 <b>{kpi.driver.toLocaleString()}</b>원</span>
        <span className="px-2 py-1 rounded bg-indigo-50 text-indigo-700">총 수수료 <b>{kpi.fee.toLocaleString()}</b>원</span>
      </div>

      {/* 제어영역 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <select className="border p-1 rounded text-sm" value={filterType} onChange={(e)=>{setFilterType(e.target.value); setFilterValue("");}}>
            <option value="전체">필터 없음</option>
            <option value="거래처명">거래처명</option>
            <option value="상차지명">상차지명</option>
            <option value="차량번호">차량번호</option>
            <option value="차량종류">차량종류</option>
            <option value="배차상태">배차상태</option>
            <option value="지급방식">지급방식</option>
            <option value="배차방식">배차방식</option>
          </select>
          {filterType!=="전체" && <input className="border p-1 rounded text-sm" placeholder={`${filterType} 검색`} value={filterValue} onChange={(e)=>setFilterValue(e.target.value)} />}
          <div className="flex items-center gap-1 text-sm">
            <input type="date" className="border p-1 rounded" value={startDate} onChange={(e)=>setStartDate(e.target.value)} />
            <span>~</span>
            <input type="date" className="border p-1 rounded" value={endDate} onChange={(e)=>setEndDate(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={()=>{ setQ(""); setStartDate(""); setEndDate(""); setFilterType("전체"); setFilterValue(""); }} className="bg-gray-200 px-3 py-1 rounded">초기화</button>
          <button onClick={applyAllChanges} className="bg-blue-600 text-white px-3 py-1 rounded">저장</button>
        </div>
      </div>

      <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="검색..." className="border p-2 rounded w-80" />

      <div className="overflow-x-auto">
        <table className="min-w-[1500px] text-sm border mt-2">
          <thead><tr>{headers.map(h=><th key={h} className={headBase}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.map((r,idx)=>{
              const editable = editIdx===idx;
              const fare = toInt(r.청구운임);
              const drv  = toInt(r.기사운임);
              const fee  = fare - drv;
              return (
                <tr key={r._id||idx} className="odd:bg-white even:bg-gray-50">
                  <td className={cellBase}>{idx+1}</td>
                  <td className={cellBase}>{r.등록일}</td>
                  <td className={cellBase}>{editable?renderInput(r,"상차일",r.상차일,"date"):r.상차일}</td>
                  <td className={cellBase}>{editable?renderSelect(r,"상차시간",r.상차시간,timeOptions):r.상차시간}</td>
                  <td className={cellBase}>{editable?renderInput(r,"하차일",r.하차일,"date"):r.하차일}</td>
                  <td className={cellBase}>{editable?renderSelect(r,"하차시간",r.하차시간,timeOptions):r.하차시간}</td>
                  <td className={cellBase}>{editable?renderInput(r,"거래처명",r.거래처명):r.거래처명}</td>
                  <td className={cellBase}>{editable?renderInput(r,"상차지명",r.상차지명):r.상차지명}</td>
                  <td className={cellBase}>{editable?renderInput(r,"하차지명",r.하차지명):r.하차지명}</td>
                  <td className={cellBase}>{editable?renderSelect(r,"차량종류",r.차량종류,VEHICLE_TYPES):r.차량종류}</td>
                  <td className={cellBase}>{editable?renderSelect(r,"차량톤수",r.차량톤수,tonOptions):r.차량톤수}</td>
                  <td className={cellBase}>
                    <input className={inputBase} defaultValue={r.차량번호}
                      onKeyDown={(e)=>{ if(e.key==="Enter"){ e.preventDefault(); handleCarNoInput(r, e.currentTarget.value); } }} />
                  </td>
                  <td className={cellBase}>{r.이름}</td>
                  <td className={cellBase}>{r.전화번호}</td>

                  <td className={cellBase}><StatusBadge s={r.배차상태} /></td>
                  <td className={cellBase}>{editable?renderInput(r,"청구운임",r.청구운임,"number"):fare.toLocaleString()}</td>
                  <td className={cellBase}>{editable?renderInput(r,"기사운임",r.기사운임,"number"):drv.toLocaleString()}</td>
                  <td className={cellBase}>{fee.toLocaleString()}</td>

                  <td className={cellBase}>{editable?renderSelect(r,"지급방식",r.지급방식,PAY_TYPES):r.지급방식}</td>
                  <td className={cellBase}>{editable?renderSelect(r,"배차방식",r.배차방식,DISPATCH_TYPES):r.배차방식}</td>
                  <td className={cellBase}>
                    {editable?(
                      <textarea className={`${inputBase} h-12`} defaultValue={r.메모}
                        onBlur={(e)=>updateEdited(r,"메모",e.target.value)} />
                    ) : r.메모}
                  </td>
                  <td className={cellBase}>
                    {editable ? (
                      <button onClick={()=>setEditIdx(null)} className="bg-gray-300 px-2 py-1 rounded">완료</button>
                    ) : (
                      <button onClick={()=>setEditIdx(idx)} className="bg-gray-300 px-2 py-1 rounded">수정</button>
                    )}
                  </td>
                  <td className={cellBase}><button onClick={()=>remove(r)} className="bg-red-500 text-white px-2 py-1 rounded">삭제</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 인라인 모달(기존 그대로)
function RegisterDriverModalDM({ carNo, onClose, onSubmit }){
  const [name,setName]=useState(""); const [phone,setPhone]=useState("");
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-2xl shadow-2xl w-96 p-6">
        <h3 className="text-xl font-bold mb-2 text-center text-gray-800">신규 기사 등록</h3>
        <p className="text-center text-gray-500 text-sm mb-4">차량번호 <span className="font-semibold text-blue-600">{carNo}</span> 의 기사 정보를 입력해주세요.</p>
        <div className="space-y-3">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
            <input type="text" placeholder="예: 김기사" value={name} onChange={(e)=>setName(e.target.value)} className="border w-full p-2 rounded-lg" />
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
            <input type="text" placeholder="010-1234-5678" value={phone} onChange={(e)=>setPhone(e.target.value)} className="border w-full p-2 rounded-lg" />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700">취소</button>
          <button type="button" onClick={()=>{ if(!name.trim()) return alert("이름을 입력하세요."); onSubmit({ 이름:name.trim(), 차량번호:carNo, 전화번호:phone.trim() }); }} className="px-4 py-2 rounded-lg bg-blue-600 text-white">등록</button>
        </div>
      </div>
    </div>
  );
}
// ===================== DispatchApp.jsx (PART 3/8) — END =====================

// ===================== DispatchApp.jsx (PART 4/8) — START =====================
function RealtimeStatus({
  dispatchData, drivers, timeOptions, tonOptions,
  patchDispatch, removeDispatch, upsertDriver
}){
  const today = todayStr();
  const [q,setQ]=useState("");
  const [editIdx,setEditIdx]=useState(null);
  const [edited,setEdited]=useState({});
  const [filterType,setFilterType]=useState("전체");
  const [filterValue,setFilterValue]=useState("");
  const [startDate,setStartDate]=useState("");
  const [endDate,setEndDate]=useState("");

  // 신규기사등록 모달
  const [showModalRS,setShowModalRS]=useState(false);
  const [pendingCarNo,setPendingCarNo]=useState("");
  const [modalRow,setModalRow]=useState(null);

  // ✅ PDF 캡처용 레이아웃 ref
  const pdfRef = useRef(null);

  // ✅ 금액 유틸
  const toInt = (v) => {
    const n = parseInt(String(v ?? "0").replace(/[^\d-]/g,""),10);
    return isNaN(n) ? 0 : n;
  };
  const fmtWon = (n) => `${Number(n||0).toLocaleString()}원`;
  const profitRate = (sale, driver) => {
    const s = toInt(sale), d = toInt(driver);
    if (s === 0) return "0%";
    return `${Math.round(((s - d) / s) * 100)}%`;
  };

  // ✅ 리스트 필터링 (⭐ KPI보다 먼저 정의되어야 함)
  const filtered = useMemo(()=>{
    let data = [...(dispatchData || [])];

    // 기본: 오늘 기준
    if(!startDate && !endDate){
      data = data.filter(r => (r.상차일 || "") === today);
    }

    // 날짜 필터
    if(startDate && endDate){
      data = data.filter(r =>
        (r.상차일 || "") >= startDate &&
        (r.상차일 || "") <= endDate
      );
    }

    // 단일 필터
    if(filterType !== "전체" && filterValue){
      data = data.filter(r =>
        String(r[filterType] || "").includes(filterValue)
      );
    }

    // 검색
    if(q.trim()){
      const lower = q.toLowerCase();
      data = data.filter(r =>
        Object.values(r).some(v =>
          String(v || "").toLowerCase().includes(lower)
        )
      );
    }

    return data.sort((a,b)=>(a.상차시간||"").localeCompare(b.상차시간||""));
  },[dispatchData,q,filterType,filterValue,startDate,endDate,today]);

  // ✅ KPI 요약 계산
  const kpi = useMemo(()=>{
    const sale = filtered.reduce((a,r)=>a+toInt(r.청구운임),0);
    const driver = filtered.reduce((a,r)=>a+toInt(r.기사운임),0);
    const fee = sale - driver;
    return { cnt: filtered.length, sale, driver, fee };
  },[filtered]);

  // ✅ 차량번호 입력 시 기사 자동매칭 + 신규등록 모달 처리
  const handleCarNoInput = (row, raw)=>{
    const trimmed = (raw || "").replace(/\s+/g,"");
    if(!trimmed){
      patchDispatch(row._id, { 차량번호:"", 이름:"", 전화번호:"", 배차상태:"배차중" });
      return;
    }
    const found = (drivers||[]).find(d=>(d.차량번호||"").replace(/\s+/g,"")===trimmed);
    if(found){
      patchDispatch(row._id, {
        차량번호:found.차량번호,
        이름:found.이름||"",
        전화번호:found.전화번호||"",
        배차상태:"배차완료"
      });
    }else{
      setPendingCarNo(trimmed);
      setModalRow(row);
      setShowModalRS(true);
    }
  };

  // ✅ 변경사항 일괄 저장 (원본값 합쳐서 수수료 자동 계산)
  const applyAllChanges = async ()=>{
    const ids = Object.keys(edited);
    for(const id of ids){
      const patch = { ...edited[id] };
      const orig = (dispatchData || []).find(r => r._id === id) || {};
      const sale   = toInt(patch.청구운임 ?? orig.청구운임);
      const driver = toInt(patch.기사운임 ?? orig.기사운임);
      patch.수수료 = sale - driver;
      await patchDispatch(id, patch);
    }
    setEditIdx(null);
    setEdited({});
    alert("저장되었습니다!");
  };

  // ✅ 엑셀 다운로드 (화면에 보이는 filtered 기준)
  const downloadExcel = ()=>{
    if(!(filtered||[]).length) return alert("다운로드할 데이터가 없습니다.");
    const rows = filtered.map((r, i) => {
      const sale = toInt(r.청구운임);
      const drv  = toInt(r.기사운임);
      const fee  = sale - drv;
      return {
        순번: i+1,
        날짜: r.상차일 || "",
        거래처: r.거래처명 || "",
        품목: r.화물내용 || "",
        차량번호: r.차량번호 || "",
        기사명: r.이름 || "",
        연락처: r.전화번호 || "",
        청구금액: sale,
        기사운임: drv,
        수수료: fee,
        매익율: sale ? Math.round((fee/sale)*100) + "%" : "0%",
        배차방식: r.배차방식 || "",
        지급방식: r.지급방식 || "",
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows, {
      header: ["순번","날짜","거래처","품목","차량번호","기사명","연락처","청구금액","기사운임","수수료","매익율","배차방식","지급방식"],
    });
    // 숫자 세 자리 콤마는 엑셀 포맷으로 표시되므로 값은 숫자로 유지
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "배차일지");
    const titleDate = (startDate && endDate) ? `${startDate}~${endDate}` : today;
    XLSX.writeFile(wb, `RUN25_배차일지_${titleDate}.xlsx`);
  };

  // ✅ PDF 다운로드 (요청 양식: 상단 제목 + 결재란 + 표)
  const downloadPDF = async ()=>{
    if(!pdfRef.current) return;
    // 잠깐 보이게 해서 캡처 (화면 밖 위치라 사용자에겐 보이지 않음)
    const node = pdfRef.current;
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#FFFFFF" });
    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF("l", "mm", "a4"); // 가로 A4
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // 이미지 비율에 맞춰 한 페이지에 맞추기
    const imgW = pageWidth - 10; // 여백
    const imgH = (canvas.height * imgW) / canvas.width;

    let y = 5;
    if (imgH <= pageHeight - 10) {
      pdf.addImage(imgData, "PNG", 5, y, imgW, imgH);
    } else {
      // 긴 경우 페이지 나눔
      let position = 0;
      const pxPerMm = canvas.width / pageWidth;
      const pageCanvasHeightPx = (pageHeight - 10) * pxPerMm;

      while (position < canvas.height) {
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = Math.min(pageCanvasHeightPx, canvas.height - position);
        const sctx = slice.getContext("2d");
        sctx.drawImage(canvas, 0, position, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
        const sliceImg = slice.toDataURL("image/png");

        pdf.addImage(sliceImg, "PNG", 5, 5, imgW, (slice.height * imgW) / slice.width);
        position += pageCanvasHeightPx;
        if (position < canvas.height) pdf.addPage();
      }
    }

    const titleDate = (startDate && endDate) ? `${startDate}~${endDate}` : today;
    pdf.save(`RUN25_배차일지_${titleDate}.pdf`);
  };

  // ✅ 테이블 헤더 (배차상태 옆에 금액3개)
  const headers = [
    "순번","등록일","상차일","상차시간","하차일","하차시간",
    "거래처명","상차지명","하차지명",
    "차량종류","차량톤수","차량번호","이름","전화번호",
    "배차상태",
    "청구운임","기사운임","수수료",
    "지급방식","배차방식",
    "메모","수정","삭제"
  ];

  const renderInput = (row,key,def,type="text")=>(
    <input
      className={inputBase}
      defaultValue={def||""}
      type={type}
      onBlur={(e)=>setEdited(p=>({
        ...p,
        [row._id]:{ ...(p[row._id]||{}), [key]:e.target.value }
      }))}
    />
  );

  const renderSelect = (row,key,value,options)=>(
    <select
      className={inputBase}
      defaultValue={value||""}
      onBlur={(e)=>setEdited(p=>({
        ...p,
        [row._id]:{ ...(p[row._id]||{}), [key]:e.target.value }
      }))}
    >
      <option value="">선택 ▾</option>
      {options.map(v=><option key={v} value={v}>{v}</option>)}
    </select>
  );

  // 🔖 제목 날짜
  const titleDate = (startDate && endDate) ? `${startDate} ~ ${endDate}` : today;

  return (
    <div>
      {/* ✅ KPI */}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h2 className="text-lg font-bold">실시간 배차현황</h2>
        <div className="flex flex-wrap gap-2 text-xs md:text-sm">
          <span className="px-2 py-1 rounded bg-gray-100">총 오더 <b>{kpi.cnt.toLocaleString()}</b>건</span>
          <span className="px-2 py-1 rounded bg-blue-50 text-blue-700">총 청구 <b>{fmtWon(kpi.sale)}</b></span>
          <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700">총 기사 <b>{fmtWon(kpi.driver)}</b></span>
          <span className="px-2 py-1 rounded bg-indigo-50 text-indigo-700">총 수수료 <b>{fmtWon(kpi.fee)}</b></span>
        </div>
      </div>

      {/* ✅ 검색/필터/저장/다운로드 */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <select className="border p-1 rounded text-sm" value={filterType} onChange={(e)=>{setFilterType(e.target.value); setFilterValue("");}}>
          <option value="전체">필터 없음</option>
          <option value="거래처명">거래처명</option>
          <option value="상차지명">상차지명</option>
          <option value="차량번호">차량번호</option>
          <option value="차량종류">차량종류</option>
          <option value="배차상태">배차상태</option>
          <option value="지급방식">지급방식</option>
          <option value="배차방식">배차방식</option>
        </select>
        {filterType!=="전체" && (
          <input className="border p-1 rounded text-sm" placeholder={`${filterType} 검색`} value={filterValue} onChange={(e)=>setFilterValue(e.target.value)} />
        )}
        <div className="flex items-center gap-1 text-sm">
          <input type="date" className="border p-1 rounded" value={startDate} onChange={(e)=>setStartDate(e.target.value)} />
          <span>~</span>
          <input type="date" className="border p-1 rounded" value={endDate} onChange={(e)=>setEndDate(e.target.value)} />
        </div>
        <button
          onClick={()=>{ setQ(""); setStartDate(""); setEndDate(""); setFilterType("전체"); setFilterValue(""); }}
          className="bg-gray-200 px-3 py-1 rounded"
        >초기화</button>
        <button onClick={applyAllChanges} className="bg-blue-600 text-white px-3 py-1 rounded">저장</button>

        {/* 👉 다운로드 버튼들 */}
        <div className="ml-auto flex gap-2">
          <button onClick={downloadExcel} className="bg-emerald-600 text-white px-3 py-1 rounded">📥 엑셀</button>
          <button onClick={downloadPDF} className="bg-slate-700 text-white px-3 py-1 rounded">📄 PDF</button>
        </div>
      </div>

      {/* ✅ 검색창 */}
      <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="검색..." className="border p-2 rounded w-80 mb-3" />

      {/* ✅ 테이블 */}
      <div className="overflow-x-auto">
        <table className="min-w-[1400px] text-sm border">
          <thead><tr>{headers.map(h=><th key={h} className={headBase}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.map((r,idx)=>{
              const editable = editIdx===idx;
              return (
                <tr key={r._id || idx} className="odd:bg-white even:bg-gray-50">
                  <td className={cellBase}>{idx+1}</td>
                  <td className={cellBase}>{r.등록일}</td>
                  <td className={cellBase}>{editable?renderInput(r,"상차일",r.상차일,"date"):r.상차일}</td>
                  <td className={cellBase}>{editable?renderSelect(r,"상차시간",r.상차시간,timeOptions):r.상차시간}</td>
                  <td className={cellBase}>{editable?renderInput(r,"하차일",r.하차일,"date"):r.하차일}</td>
                  <td className={cellBase}>{editable?renderSelect(r,"하차시간",r.하차시간,timeOptions):r.하차시간}</td>
                  <td className={cellBase}>{editable?renderInput(r,"거래처명",r.거래처명):r.거래처명}</td>
                  <td className={cellBase}>{editable?renderInput(r,"상차지명",r.상차지명):r.상차지명}</td>
                  <td className={cellBase}>{editable?renderInput(r,"하차지명",r.하차지명):r.하차지명}</td>
                  <td className={cellBase}>{editable?renderSelect(r,"차량종류",r.차량종류,VEHICLE_TYPES):r.차량종류}</td>
                  <td className={cellBase}>{editable?renderSelect(r,"차량톤수",r.차량톤수,tonOptions):r.차량톤수}</td>

                  {/* ✅ 차량번호 / 기사 자동매칭 */}
                  <td className={cellBase}>
                    <input
                      className={inputBase}
                      defaultValue={r.차량번호}
                      onKeyDown={(e)=>{ if(e.key==="Enter"){ e.preventDefault(); handleCarNoInput(r, e.currentTarget.value); } }}
                    />
                  </td>
                  <td className={cellBase}>{r.이름}</td>
                  <td className={cellBase}>{r.전화번호}</td>

                  <td className={cellBase}><StatusBadge s={r.배차상태} /></td>

                  {/* ✅ 금액 3개 (자동계산 + 콤마 + 원) */}
                  <td className={cellBase}>{editable?renderInput(r,"청구운임",r.청구운임,"number"):fmtWon(r.청구운임)}</td>
                  <td className={cellBase}>{editable?renderInput(r,"기사운임",r.기사운임,"number"):fmtWon(r.기사운임)}</td>
                  <td className={cellBase}>{fmtWon(toInt(r.청구운임) - toInt(r.기사운임))}</td>

                  <td className={cellBase}>{editable?renderSelect(r,"지급방식",r.지급방식,PAY_TYPES):r.지급방식}</td>
                  <td className={cellBase}>{editable?renderSelect(r,"배차방식",r.배차방식,DISPATCH_TYPES):r.배차방식}</td>

                  <td className={cellBase}>
                    {editable?(
                      <textarea
                        className={`${inputBase} h-12`}
                        defaultValue={r.메모}
                        onBlur={(e)=>setEdited(p=>({ ...p, [r._id]:{ ...(p[r._id]||{}), 메모:e.target.value } }))}
                      />
                    ) : r.메모}
                  </td>

                  <td className={cellBase}>
                    {editable
                      ? <button onClick={()=>setEditIdx(null)} className="bg-gray-300 px-2 py-1 rounded">완료</button>
                      : <button onClick={()=>setEditIdx(idx)} className="bg-gray-300 px-2 py-1 rounded">수정</button>
                    }
                  </td>

                  <td className={cellBase}>
                    <button
                      onClick={()=>{ if(confirm("삭제하시겠습니까?")) removeDispatch(r._id); }}
                      className="bg-red-500 text-white px-2 py-1 rounded"
                    >삭제</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ✅ 신규 기사등록 모달 */}
      {showModalRS && (
        <RegisterDriverModalRS
          carNo={pendingCarNo}
          onClose={()=>setShowModalRS(false)}
          onSubmit={async(newDriver)=>{
            await upsertDriver(newDriver);
            await patchDispatch(modalRow._id, {
              차량번호:newDriver.차량번호,
              이름:newDriver.이름,
              전화번호:newDriver.전화번호,
              배차상태:"배차완료"
            });
            setShowModalRS(false);
            alert("신규 기사 등록 완료!");
          }}
        />
      )}

      {/* 🖨️ PDF 캡처용 숨김 레이아웃 (요청 양식) */}
      <div
        ref={pdfRef}
        style={{ position:"fixed", left:"-10000px", top:0, width:"1123px", background:"#ffffff", padding:"16px" }}
        className="text-[12px]"
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-2">
          <div className="text-[28px] font-extrabold">RUN25 배차일지 <span className="text-[16px] font-semibold">({titleDate})</span></div>
          {/* 결재란 */}
          <div className="grid grid-cols-4 border">
            <div className="border px-3 py-1 font-semibold text-center">결재</div>
            {["팀장","임원","대표"].map(t=>(
              <div key={t} className="border w-[90px] h-[70px] flex flex-col">
                <div className="border-b text-center font-semibold py-1">{t}</div>
                <div className="flex-1" />
              </div>
            ))}
          </div>
        </div>

        {/* 요약 뱃지 */}
        <div className="flex gap-3 mb-2">
          <div className="px-2 py-1 rounded bg-gray-100">총 오더 <b>{kpi.cnt.toLocaleString()}</b>건</div>
          <div className="px-2 py-1 rounded bg-blue-50 text-blue-700">총 청구 <b>{kpi.sale.toLocaleString()}</b>원</div>
          <div className="px-2 py-1 rounded bg-emerald-50 text-emerald-700">총 기사 <b>{kpi.driver.toLocaleString()}</b>원</div>
          <div className="px-2 py-1 rounded bg-indigo-50 text-indigo-700">총 수수료 <b>{(kpi.sale-kpi.driver).toLocaleString()}</b>원</div>
        </div>

        {/* 표 (요청 컬럼) */}
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr>
              {["No.","날짜","거래처","품목","차량번호","기사명","연락처","청구금액","기사님요금","수수료","매익율","배차방식","지급방식"].map(h=>(
                <th key={h} className="border px-2 py-1 bg-gray-100">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r,i)=>{
              const sale = toInt(r.청구운임), drv = toInt(r.기사운임);
              return (
                <tr key={r._id || i} className={i%2? "bg-gray-50" : ""}>
                  <td className="border px-2 py-1 text-center">{i+1}</td>
                  <td className="border px-2 py-1 text-center">{r.상차일 || ""}</td>
                  <td className="border px-2 py-1">{r.거래처명 || ""}</td>
                  <td className="border px-2 py-1">{r.화물내용 || ""}</td>
                  <td className="border px-2 py-1 text-center">{r.차량번호 || ""}</td>
                  <td className="border px-2 py-1 text-center">{r.이름 || ""}</td>
                  <td className="border px-2 py-1 text-center">{r.전화번호 || ""}</td>
                  <td className="border px-2 py-1 text-right">{sale.toLocaleString()}</td>
                  <td className="border px-2 py-1 text-right">{drv.toLocaleString()}</td>
                  <td className="border px-2 py-1 text-right">{(sale-drv).toLocaleString()}</td>
                  <td className="border px-2 py-1 text-center">{profitRate(sale, drv)}</td>
                  <td className="border px-2 py-1 text-center">{r.배차방식 || ""}</td>
                  <td className="border px-2 py-1 text-center">{r.지급방식 || ""}</td>
                </tr>
              );
            })}
            {/* 합계 */}
            <tr className="bg-gray-100 font-semibold">
              <td className="border px-2 py-1 text-center" colSpan={7}>계</td>
              <td className="border px-2 py-1 text-right">{kpi.sale.toLocaleString()}</td>
              <td className="border px-2 py-1 text-right">{kpi.driver.toLocaleString()}</td>
              <td className="border px-2 py-1 text-right">{(kpi.sale-kpi.driver).toLocaleString()}</td>
              <td className="border px-2 py-1 text-center">
                {kpi.sale ? Math.round(((kpi.sale-kpi.driver)/kpi.sale)*100) + "%" : "0%"}
              </td>
              <td className="border px-2 py-1" colSpan={2}></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 인라인 모달 (실시간배차현황 전용)
function RegisterDriverModalRS({ carNo, onClose, onSubmit }){
  const [name,setName]=useState(""); const [phone,setPhone]=useState("");
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-2xl shadow-2xl w-96 p-6">
        <h3 className="text-xl font-bold mb-2 text-center text-gray-800">신규 기사 등록</h3>
        <p className="text-center text-gray-500 text-sm mb-4">
          차량번호 <span className="font-semibold text-blue-600">{carNo}</span> 의 기사 정보를 입력해주세요.
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
            <input type="text" placeholder="예: 김기사" value={name} onChange={(e)=>setName(e.target.value)} className="border w-full p-2 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
            <input type="text" placeholder="010-1234-5678" value={phone} onChange={(e)=>setPhone(e.target.value)} className="border w-full p-2 rounded-lg" />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700">취소</button>
          <button
            type="button"
            onClick={()=>{ if(!name.trim()) return alert("이름을 입력하세요."); onSubmit({ 이름:name.trim(), 차량번호:carNo, 전화번호:phone.trim() }); }}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white"
          >등록</button>
        </div>
      </div>
    </div>
  );
}
// ===================== DispatchApp.jsx (PART 4/8) — END =====================


// ===================== DispatchApp.jsx (PART 5/8) — START =====================

function DispatchStatus({
  dispatchData, drivers, timeOptions, tonOptions,
  patchDispatch, removeDispatch, upsertDriver
}){
  const [q,setQ]=useState(""); 
  const [editIdx,setEditIdx]=useState(null);
  const [edited,setEdited]=useState({});
  const [filterType,setFilterType]=useState("전체");
  const [filterValue,setFilterValue]=useState(""); 
  const [startDate,setStartDate]=useState(""); 
  const [endDate,setEndDate]=useState("");

  // ✅ 선택/일괄삭제
  const [selected, setSelected] = useState(new Set());
  const toggleAll = (rows)=>{
    const allIds = rows.map(r=>r._id);
    const allSelected = allIds.every(id=>selected.has(id));
    setSelected(allSelected ? new Set() : new Set(allIds));
  };
  const toggleOne = (id)=>{
    setSelected(prev=>{
      const n=new Set(prev);
      n.has(id)?n.delete(id):n.add(id);
      return n;
    });
  };

  // ✅ 숫자 처리
  const toInt = (v) => {
    const n = parseInt(String(v ?? "0").replace(/[^\d-]/g,""),10);
    return isNaN(n) ? 0 : n;
  };

  // ✅ 필터링 (applyAllChanges 위에!)
  const filtered = useMemo(()=>{
    let data=[...(dispatchData||[])];
    if(startDate && endDate) data=data.filter(r=>(r.상차일||"")>=startDate && (r.상차일||"")<=endDate);
    if(filterType!=="전체" && filterValue) data=data.filter(r=>String(r[filterType]||"").includes(filterValue));
    if(q.trim()){
      const lower=q.toLowerCase();
      data=data.filter(r=>Object.values(r).some(v=>String(v||"").toLowerCase().includes(lower)));
    }
    return data;
  },[dispatchData,q,filterType,filterValue,startDate,endDate]);

  // ✅ KPI 요약
  const kpi = useMemo(()=>{
    const cnt = filtered.length;
    const sale = filtered.reduce((a,r)=>a+toInt(r.청구운임),0);
    const driver = filtered.reduce((a,r)=>a+toInt(r.기사운임),0);
    const fee = sale - driver;
    return { cnt, sale, driver, fee };
  },[filtered]);
  // ✅ 차량번호 입력 시 자동 기사 등록 처리
  const handleCarNoInput=(row, raw)=>{
    const trimmed=(raw||"").replace(/\s+/g,"");
    if(!trimmed){
      patchDispatch(row._id, { 차량번호:"", 이름:"", 전화번호:"", 배차상태:"배차중" });
      return;
    }
    const found=(drivers||[]).find(d=>(d.차량번호||"").replace(/\s+/g,"")===trimmed);
    if(found){
      patchDispatch(row._id, { 차량번호:found.차량번호, 이름:found.이름||"", 전화번호:found.전화번호||"", 배차상태:"배차완료" });
    }else{
      const 이름 = prompt("신규 기사 이름:");
      const 전화번호 = prompt("전화번호:");
      if(이름){
        upsertDriver({ 이름, 차량번호: trimmed, 전화번호 });
        patchDispatch(row._id, { 차량번호: trimmed, 이름, 전화번호, 배차상태:"배차완료" });
        alert("신규 기사 등록 완료!");
      }
    }
  };

  // ✅ 수정 저장 (수수료 자동계산)
  const applyAllChanges = async ()=>{
    const ids=Object.keys(edited);
    for(const id of ids){
      const patch = { ...edited[id] };
      if(("청구운임" in patch) || ("기사운임" in patch)){
        const orig = (filtered.find(r=>r._id===id)) || {};
        const fare  = toInt(patch.청구운임 ?? orig.청구운임);
        const drv   = toInt(patch.기사운임 ?? orig.기사운임);
        patch.수수료 = fare - drv;
      }
      await patchDispatch(id, patch);
    }
    setEditIdx(null); 
    setEdited({}); 
    alert("저장되었습니다!");
  };

  // ✅ 다중 삭제 기능
  const removeSelected = async ()=>{
    if(selected.size === 0) return alert("삭제할 항목이 없습니다.");
    if(!confirm(`${selected.size}건 삭제할까요?`)) return;
    for(const id of selected){
      const row = filtered.find(r=>r._id===id);
      if(row) await removeDispatch(row);
    }
    setSelected(new Set());
    alert("삭제 완료!");
  };

  // ✅ 테이블 헤더
  const headers = [
    "선택","순번","등록일","상차일","상차시간","하차일","하차시간",
    "거래처명","상차지명","하차지명","차량종류","차량톤수","차량번호","이름","전화번호",
    "배차상태","청구운임","기사운임","수수료","지급방식","배차방식","메모","수정","삭제"
  ];
  return (
    <div>
      {/* 상단 컨트롤 영역 (1/3에서 렌더됨) */}

      {/* 검색창 */}
      <input
        value={q}
        onChange={(e)=>setQ(e.target.value)}
        placeholder="검색..."
        className="border p-2 rounded w-80 mb-3"
      />

      {/* 표 */}
      <div className="overflow-x-auto">
        <table className="min-w-[1600px] text-sm border">
          <thead>
            <tr>{headers.map(h=>(
              <th key={h} className={headBase}>{h}</th>
            ))}</tr>
          </thead>

          <tbody>
            {filtered.map((r,idx)=>{
              const editable = editIdx===idx;
              const checked  = selected.has(r._id);

              const fare   = toInt(r.청구운임);
              const driver = toInt(r.기사운임);
              const fee    = fare - driver;

              return (
                <tr key={r._id} className="odd:bg-white even:bg-gray-50">
                  {/* 선택 */}
                  <td className={cellBase}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={()=>toggleOne(r._id)}
                    />
                  </td>

                  {/* 기본 정보 */}
                  <td className={cellBase}>{idx+1}</td>
                  <td className={cellBase}>{r.등록일}</td>
                  <td className={cellBase}>
                    {editable ? renderInput(r,"상차일",r.상차일,"date") : r.상차일}
                  </td>
                  <td className={cellBase}>
                    {editable ? renderSelect(r,"상차시간",r.상차시간,timeOptions) : r.상차시간}
                  </td>
                  <td className={cellBase}>
                    {editable ? renderInput(r,"하차일",r.하차일,"date") : r.하차일}
                  </td>
                  <td className={cellBase}>
                    {editable ? renderSelect(r,"하차시간",r.하차시간,timeOptions) : r.하차시간}
                  </td>

                  <td className={cellBase}>
                    {editable ? renderInput(r,"거래처명",r.거래처명) : r.거래처명}
                  </td>
                  <td className={cellBase}>
                    {editable ? renderInput(r,"상차지명",r.상차지명) : r.상차지명}
                  </td>
                  <td className={cellBase}>
                    {editable ? renderInput(r,"하차지명",r.하차지명) : r.하차지명}
                  </td>

                  <td className={cellBase}>
                    {editable ? renderSelect(r,"차량종류",r.차량종류,VEHICLE_TYPES) : r.차량종류}
                  </td>
                  <td className={cellBase}>
                    {editable ? renderSelect(r,"차량톤수",r.차량톤수,tonOptions) : r.차량톤수}
                  </td>

                  {/* 차량번호 입력 → 엔터로 기사 자동 매칭/등록 */}
                  <td className={cellBase}>
                    <input
                      className={inputBase}
                      defaultValue={r.차량번호}
                      onKeyDown={(e)=>{
                        if(e.key==="Enter"){
                          e.preventDefault();
                          handleCarNoInput(r, e.currentTarget.value);
                        }
                      }}
                    />
                  </td>

                  <td className={cellBase}>{r.이름}</td>
                  <td className={cellBase}>{r.전화번호}</td>

                  {/* 상태 + 금액 3개(자동계산/음수 빨강) */}
                  <td className={cellBase}><StatusBadge s={r.배차상태}/></td>
                  <td className={cellBase}>
                    {editable ? renderInput(r,"청구운임",r.청구운임,"number") : fare.toLocaleString()}
                  </td>
                  <td className={cellBase}>
                    {editable ? renderInput(r,"기사운임",r.기사운임,"number") : driver.toLocaleString()}
                  </td>
                  <td className={cellBase} style={{color: fee<0 ? "red" : undefined}}>
                    {fee.toLocaleString()}
                  </td>

                  {/* 지급/배차/메모 */}
                  <td className={cellBase}>
                    {editable ? renderSelect(r,"지급방식",r.지급방식,PAY_TYPES) : r.지급방식}
                  </td>
                  <td className={cellBase}>
                    {editable ? renderSelect(r,"배차방식",r.배차방식,DISPATCH_TYPES) : r.배차방식}
                  </td>
                  <td className={cellBase}>
                    {editable ? (
                      <textarea
                        className={`${inputBase} h-12`}
                        defaultValue={r.메모}
                        onBlur={(e)=>setEdited(p=>({
                          ...p, [r._id]: { ...(p[r._id]||{}), 메모:e.target.value }
                        }))}
                      />
                    ) : r.메모}
                  </td>

                  {/* 수정/삭제 */}
                  <td className={cellBase}>
                    {editable ? (
                      <button onClick={()=>setEditIdx(null)} className="bg-gray-300 px-2 py-1 rounded">완료</button>
                    ) : (
                      <button onClick={()=>setEditIdx(idx)} className="bg-gray-300 px-2 py-1 rounded">수정</button>
                    )}
                  </td>
                  <td className={cellBase}>
                    <button onClick={()=>removeDispatch(r)} className="bg-red-500 text-white px-2 py-1 rounded">삭제</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
// ===================== DispatchApp.jsx (PART 5/8) — END =====================


// ===================== DispatchApp.jsx (PART 5/8) — END =====================


/* 기사관리 */
function DriverManagement({ drivers, upsertDriver, removeDriver }){
  const [form,setForm]=useState({ 이름:"", 차량번호:"", 전화번호:"" });
  const [search,setSearch]=useState(""); const [editIdx,setEditIdx]=useState(null); const [editForm,setEditForm]=useState({});
  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase(); if(!q) return drivers;
    return (drivers||[]).filter(d=>Object.values(d).some(v=>String(v||"").toLowerCase().includes(q)));
  },[drivers,search]);

  const addDriver=async()=>{
    if(!form.이름) return alert("이름을 입력하세요."); if(!form.차량번호) return alert("차량번호를 입력하세요.");
    await upsertDriver(form); setForm({ 이름:"", 차량번호:"", 전화번호:"" }); alert("기사 등록 완료!");
  };
  const saveEdit=async()=>{
    await upsertDriver(editForm); setEditIdx(null); alert("수정 완료!");
  };
  const remove=async(idx)=>{ const target=filtered[idx]; if(!target) return; if(!confirm("삭제하시겠습니까?")) return; await removeDriver(target.id || target.차량번호); };

  const handleUpload=(e)=>{
    const file=e.target.files?.[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=(evt)=>{
      try{
        const wb=XLSX.read(evt.target.result,{type:"array"});
        const sheet=wb.Sheets[wb.SheetNames[0]];
        const json=XLSX.utils.sheet_to_json(sheet);
        const normalized=json.map(r=>({ 이름:r.이름||"", 차량번호:r.차량번호||"", 전화번호:r.전화번호||"" }));
        Promise.all(normalized.map(upsertDriver)).then(()=>alert(`${normalized.length}명의 기사 데이터를 추가했습니다.`));
      }catch{ alert("엑셀 파일 읽기 오류"); }
    };
    reader.readAsArrayBuffer(file);
  };
  const handleDownload=()=>{
    if(!(drivers||[]).length) return alert("다운로드할 데이터가 없습니다.");
    const ws=XLSX.utils.json_to_sheet(drivers); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "기사목록"); XLSX.writeFile(wb, "기사관리.xlsx");
  };

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">기사관리</h2>
      <div className="flex gap-2 mb-4">
        <label className="bg-green-600 text-white px-3 py-2 rounded cursor-pointer">📁 엑셀 업로드
          <input type="file" accept=".xlsx,.xls" onChange={handleUpload} className="hidden" />
        </label>
        <button onClick={handleDownload} className="bg-blue-600 text-white px-3 py-2 rounded">📤 엑셀 다운로드</button>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3">
        <input className="border p-2 rounded" placeholder="이름" value={form.이름} onChange={(e)=>setForm({...form,이름:e.target.value})} />
        <input className="border p-2 rounded" placeholder="차량번호" value={form.차량번호} onChange={(e)=>setForm({...form,차량번호:e.target.value})} />
        <input className="border p-2 rounded" placeholder="전화번호" value={form.전화번호} onChange={(e)=>setForm({...form,전화번호:e.target.value})} />
        <button onClick={addDriver} className="bg-blue-600 text-white rounded px-3 py-2 col-span-1">추가</button>
      </div>

      <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="검색 (이름 / 차량번호 / 전화번호)" className="border p-2 rounded w-80 mb-3" />

      <table className="w-full text-sm border">
        <thead className="bg-gray-100">
          <tr><th className={headBase}>이름</th><th className={headBase}>차량번호</th><th className={headBase}>전화번호</th><th className={headBase}>관리</th></tr>
        </thead>
        <tbody>
          {filtered.map((d,i)=>(
            <tr key={d.id||i} className="odd:bg-white even:bg-gray-50">
              {editIdx===i ? (
                <>
                  <td className={cellBase}><input className="border p-1 rounded w-full" value={editForm.이름||""} onChange={(e)=>setEditForm({...editForm,이름:e.target.value})}/></td>
                  <td className={cellBase}><input className="border p-1 rounded w-full" value={editForm.차량번호||""} onChange={(e)=>setEditForm({...editForm,차량번호:e.target.value})}/></td>
                  <td className={cellBase}><input className="border p-1 rounded w-full" value={editForm.전화번호||""} onChange={(e)=>setEditForm({...editForm,전화번호:e.target.value})}/></td>
                  <td className={cellBase}><button onClick={saveEdit} className="bg-blue-500 text-white px-2 py-1 rounded mr-1">저장</button><button onClick={()=>setEditIdx(null)} className="border px-2 py-1 rounded">취소</button></td>
                </>
              ):(
                <>
                  <td className={cellBase}>{d.이름}</td>
                  <td className={cellBase}>{d.차량번호}</td>
                  <td className={cellBase}>{d.전화번호}</td>
                  <td className={cellBase}>
                    <button onClick={()=>{setEditIdx(i); setEditForm(d);}} className="bg-yellow-400 text-white px-2 py-1 rounded mr-1">수정</button>
                    <button onClick={()=>remove(i)} className="bg-red-500 text-white px-2 py-1 rounded">삭제</button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* 거래처관리 */
function ClientManagement({ clients, upsertClient, removeClient }){
  const [form,setForm]=useState({ 거래처명:"", 사업자번호:"", 대표자:"", 업태:"", 종목:"", 주소:"", 담당자:"", 연락처:"" });
  const [search,setSearch]=useState(""); const [editIdx,setEditIdx]=useState(null); const [editForm,setEditForm]=useState({});
  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase(); if(!q) return clients;
    return (clients||[]).filter(c=>Object.values(c).some(v=>String(v||"").toLowerCase().includes(q)));
  },[clients,search]);

  const addClient=async()=>{ if(!form.거래처명) return alert("거래처명을 입력하세요."); await upsertClient(form); setForm({ 거래처명:"", 사업자번호:"", 대표자:"", 업태:"", 종목:"", 주소:"", 담당자:"", 연락처:"" }); alert("거래처 등록 완료!"); };
  const saveEdit=async()=>{ await upsertClient(editForm); setEditIdx(null); alert("수정 완료!"); };
  const remove=async(idx)=>{ const target=filtered[idx]; if(!target) return; if(!confirm("삭제하시겠습니까?")) return; await removeClient(target.id || target.거래처명); };

  const handleUpload=(e)=>{
    const file=e.target.files?.[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=(evt)=>{
      try{
        const wb=XLSX.read(evt.target.result,{type:"array"});
        const sheet=wb.Sheets[wb.SheetNames[0]];
        const json=XLSX.utils.sheet_to_json(sheet);
        const normalized = normalizeClients(json);
        Promise.all(normalized.map(upsertClient)).then(()=>alert(`${normalized.length}건의 거래처 데이터를 추가했습니다.`));
      }catch{ alert("엑셀 파일 읽기 오류"); }
    };
    reader.readAsArrayBuffer(file);
  };
  const handleDownload=()=>{
    if(!(clients||[]).length) return alert("다운로드할 데이터가 없습니다.");
    const ws=XLSX.utils.json_to_sheet(clients); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "거래처목록"); XLSX.writeFile(wb, "거래처관리.xlsx");
  };

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">거래처관리</h2>
      <div className="flex gap-2 mb-4">
        <label className="bg-green-600 text-white px-3 py-2 rounded cursor-pointer">📁 엑셀 업로드
          <input type="file" accept=".xlsx,.xls" onChange={handleUpload} className="hidden" />
        </label>
        <button onClick={handleDownload} className="bg-blue-600 text-white px-3 py-2 rounded">📤 엑셀 다운로드</button>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3">
        <input className="border p-2 rounded" placeholder="거래처명" value={form.거래처명} onChange={(e)=>setForm({...form,거래처명:e.target.value})}/>
        <input className="border p-2 rounded" placeholder="사업자번호" value={form.사업자번호} onChange={(e)=>setForm({...form,사업자번호:e.target.value})}/>
        <input className="border p-2 rounded" placeholder="대표자" value={form.대표자} onChange={(e)=>setForm({...form,대표자:e.target.value})}/>
        <input className="border p-2 rounded" placeholder="연락처" value={form.연락처} onChange={(e)=>setForm({...form,연락처:e.target.value})}/>
        <button onClick={addClient} className="bg-blue-600 text-white rounded px-3 py-2 col-span-1">추가</button>
      </div>

      <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="검색 (거래처명 / 대표자 / 연락처)" className="border p-2 rounded w-80 mb-3" />

      <table className="w-full text-sm border">
        <thead className="bg-gray-100">
          <tr>{["거래처명","사업자번호","대표자","업태","종목","주소","담당자","연락처","관리"].map(h=><th key={h} className={headBase}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {filtered.map((c,i)=>(
            <tr key={c.id||i} className="odd:bg-white even:bg-gray-50">
              {editIdx===i ? (
                <>
                  {["거래처명","사업자번호","대표자","업태","종목","주소","담당자","연락처"].map(k=>(
                    <td key={k} className={cellBase}><input className="border p-1 rounded w-full" value={editForm[k]||""} onChange={(e)=>setEditForm({...editForm,[k]:e.target.value})} /></td>
                  ))}
                  <td className={cellBase}><button onClick={saveEdit} className="bg-blue-500 text-white px-2 py-1 rounded mr-1">저장</button><button onClick={()=>setEditIdx(null)} className="border px-2 py-1 rounded">취소</button></td>
                </>
              ):(
                <>
                  {["거래처명","사업자번호","대표자","업태","종목","주소","담당자","연락처"].map(k=><td key={k} className={cellBase}>{c[k]||"-"}</td>)}
                  <td className={cellBase}>
                    <button onClick={()=>{setEditIdx(i); setEditForm(c);}} className="bg-yellow-400 text-white px-2 py-1 rounded mr-1">수정</button>
                    <button onClick={()=>remove(i)} className="bg-red-500 text-white px-2 py-1 rounded">삭제</button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
// ===================== DispatchApp.jsx (PART 5/8) — END =====================
// ===================== DispatchApp.jsx (PART 6/8) — START =====================
function Settlement({ dispatchData }){
  const [startDate,setStartDate]=useState("");
  const [endDate,setEndDate]=useState("");
  const [clientFilter,setClientFilter]=useState("");

  const toInt=(v)=>{ const n=parseInt(String(v||"0").replace(/[^\d-]/g,""),10); return isNaN(n)?0:n; };
  const todayStrLocal=()=>new Date().toISOString().slice(0,10);
  const monthKey=()=>new Date().toISOString().slice(0,7);
  const prevMonthKey=()=>{ const d=new Date(); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,7); };
  const isInRange=(d,s,e)=>{ if(!d) return false; if(s && d<s) return false; if(e && d>e) return false; return true; };

  const baseRows = Array.isArray(dispatchData)?dispatchData:[];
  const rangeRows = useMemo(()=>{
    let rows=baseRows.filter(r=>(r.배차상태||"")==="배차완료");
    if(clientFilter) rows=rows.filter(r=>(r.거래처명||"")===clientFilter);
    if(startDate||endDate) rows=rows.filter(r=>isInRange((r.상차일||""),startDate,endDate));
    return rows.sort((a,b)=>(a.상차일||"").localeCompare(b.상차일||""));
  },[baseRows,startDate,endDate,clientFilter]);

  const mKey=monthKey(); const pKey=prevMonthKey(); const today=todayStrLocal();
  const monthRows=useMemo(()=>baseRows.filter(r=>(r.배차상태||"")==="배차완료" && String(r.상차일||"").startsWith(mKey)),[baseRows,mKey]);
  const prevMonthRows=useMemo(()=>baseRows.filter(r=>(r.배차상태||"")==="배차완료" && String(r.상차일||"").startsWith(pKey)),[baseRows,pKey]);
  const todayRows=useMemo(()=>baseRows.filter(r=>(r.배차상태||"")==="배차완료" && (r.상차일||"")===today),[baseRows,today]);

  const sumBy=(rows,key)=>rows.reduce((a,r)=>a+toInt(r[key]),0);
  const kpi = {
    월매출: sumBy(monthRows,"청구운임"),
    월기사: sumBy(monthRows,"기사운임"),
    당일매출: sumBy(todayRows,"청구운임"),
    당일기사: sumBy(todayRows,"기사운임"),
    전월매출: sumBy(prevMonthRows,"청구운임"),
  };
  kpi.월수수료 = kpi.월매출 - kpi.월기사;
  kpi.당일수수료 = kpi.당일매출 - kpi.당일기사;
  kpi.전월증감 = kpi.월매출 - kpi.전월매출;
  kpi.전월증감률 = kpi.전월매출 ? ((kpi.전월증감 / kpi.전월매출) * 100) : 0;
  const monthProfitRate = kpi.월매출>0 ? (kpi.월수수료/kpi.월매출)*100 : 0;

  const rangeTotals = useMemo(()=>{
    const 매출=sumBy(rangeRows,"청구운임");
    const 기사=sumBy(rangeRows,"기사운임");
    const 수수료=매출-기사;
    return { 매출, 기사, 수수료 };
  },[rangeRows]);

  const clients = useMemo(()=>{
    const s=new Set(); baseRows.forEach(r=>{ if(r.거래처명) s.add(r.거래처명); }); return Array.from(s).sort((a,b)=>a.localeCompare(b));
  },[baseRows]);

  const clientAgg = useMemo(()=>{
    const map=new Map();
    for(const r of rangeRows){
      const c=r.거래처명||"미지정"; const sale=toInt(r.청구운임); const driver=toInt(r.기사운임); const fee=sale-driver;
      const prev=map.get(c)||{ 거래처명:c, 건수:0, 매출:0, 기사:0, 수수료:0 };
      prev.건수+=1; prev.매출+=sale; prev.기사+=driver; prev.수수료+=fee;
      map.set(c,prev);
    }
    const arr=Array.from(map.values()); arr.sort((a,b)=>b.매출-a.매출);
    return arr;
  },[rangeRows]);

  const topClients = useMemo(()=>clientAgg.slice(0,5),[clientAgg]);
  const riskyClients = useMemo(()=>{
    const arr = clientAgg.map(r=>({ ...r, rate: r.매출>0 ? (r.수수료/r.매출)*100 : 0 }))
      .filter(r=>r.매출>0 && r.rate<10).sort((a,b)=>b.매출-a.매출).slice(0,5);
    return arr;
  },[clientAgg]);

  const monthDaily = useMemo(()=>{
    const add=(rows, yyyymm)=>{
      const m=new Map();
      rows.forEach(r=>{
        const d=r.상차일||""; if(!d.startsWith(yyyymm)) return;
        const day=parseInt(d.slice(8,10),10)||0; const sale=toInt(r.청구운임);
        m.set(day, (m.get(day)||0)+sale);
      });
      return Array.from(m.entries()).map(([day,sum])=>({ day, sum })).sort((a,b)=>a.day-b.day);
    };
    const cur=add(monthRows,mKey); const prev=add(prevMonthRows,pKey);
    const maxDay=Math.max(cur.at(-1)?.day||0, prev.at(-1)?.day||0, 1);
    const xs=Array.from({length:maxDay},(_,i)=>i+1);
    const y1=xs.map(d=>cur.find(x=>x.day===d)?.sum||0);
    const y2=xs.map(d=>prev.find(x=>x.day===d)?.sum||0);
    return xs.map((d,i)=>({ x:String(d).padStart(2,"0"), y1:y1[i], y2:y2[i] }));
  },[monthRows,prevMonthRows,mKey,pKey]);

  const dailyTrend = useMemo(()=>{
    const m=new Map();
    for(const r of rangeRows){
      const d=r.상차일||""; if(!d) continue;
      const sale=toInt(r.청구운임); const driver=toInt(r.기사운임); const fee=sale-driver;
      const prev=m.get(d)||{ date:d, 매출:0, 기사:0, 수수료:0 };
      prev.매출+=sale; prev.기사+=driver; prev.수수료+=fee; m.set(d,prev);
    }
    return Array.from(m.values()).sort((a,b)=>a.date.localeCompare(b.date));
  },[rangeRows]);

  const won=(n)=>`${(n||0).toLocaleString()}원`;

  const downloadExcel=()=>{
    try{
      if(!window.XLSX && typeof XLSX==="undefined"){ alert("엑셀 라이브러리가 로드되지 않았습니다. (XLSX)"); return; }
      const summaryRows=[
        { 항목:"기간시작", 값:startDate||"-" },{ 항목:"기간종료", 값:endDate||"-" },{ 항목:"거래처", 값:clientFilter||"전체" },{},
        { 항목:"기간 매출", 값:rangeTotals.매출 },{ 항목:"기간 기사운반비", 값:rangeTotals.기사 },{ 항목:"기간 수수료", 값:rangeTotals.수수료 },{},
        { 항목:"이번달 매출", 값:kpi.월매출 },{ 항목:"이번달 기사운반비", 값:kpi.월기사 },{ 항목:"이번달 수수료", 값:kpi.월수수료 },
        { 항목:"이번달 평균 이익률(%)", 값:Number(monthProfitRate.toFixed(1)) },{},
        { 항목:"전월 매출", 값:kpi.전월매출 },{ 항목:"전월 대비 증감", 값:kpi.전월증감 },{ 항목:"전월 대비 증감률(%)", 값:Number(kpi.전월증감률.toFixed(1)) },
      ];
      const wsSummary=XLSX.utils.json_to_sheet(summaryRows);
      const wsClients=XLSX.utils.json_to_sheet(clientAgg.map(r=>({ 거래처명:r.거래처명, 건수:r.건수, 매출:r.매출, 기사운반비:r.기사, 수수료:r.수수료, 이익률:r.매출>0?Number(((r.수수료/r.매출)*100).toFixed(1)):0 })));
      const wsDetail=XLSX.utils.json_to_sheet(rangeRows.map((r,i)=>({ 순번:i+1, 상차일:r.상차일||"", 거래처명:r.거래처명||"", 차량번호:r.차량번호||"", 기사이름:r.이름||"", 청구운임:toInt(r.청구운임), 기사운임:toInt(r.기사운임), 수수료:toInt(r.청구운임)-toInt(r.기사운임), 메모:r.메모||"" })));
      const wsTrend=XLSX.utils.json_to_sheet(dailyTrend.map(d=>({ 일자:d.date, 매출:d.매출, 기사운반비:d.기사, 수수료:d.수수료 })));
      const wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsSummary, "요약");
      XLSX.utils.book_append_sheet(wb, wsClients, "거래처별집계");
      XLSX.utils.book_append_sheet(wb, wsDetail, "상세목록");
      XLSX.utils.book_append_sheet(wb, wsTrend, "일자트렌드");
      XLSX.writeFile(wb, `매출관리_${startDate||"all"}~${endDate||"all"}.xlsx`);
    }catch(err){ console.error(err); alert("엑셀 내보내기 중 오류가 발생했습니다."); }
  };

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">매출관리</h2>
      {monthProfitRate<15 && <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 px-4 py-2"><span className="font-semibold">⚠ 이번달 평균 이익률 {monthProfitRate.toFixed(1)}%</span><span className="text-rose-600"> (목표 15% 미만)</span></div>}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex flex-col"><label className="text-xs text-gray-500 mb-1">시작일</label><input type="date" className="border p-2 rounded" value={startDate} onChange={(e)=>setStartDate(e.target.value)} /></div>
        <div className="flex flex-col"><label className="text-xs text-gray-500 mb-1">종료일</label><input type="date" className="border p-2 rounded" value={endDate} onChange={(e)=>setEndDate(e.target.value)} /></div>
        <div className="flex flex-col"><label className="text-xs text-gray-500 mb-1">거래처</label>
          <select className="border p-2 rounded min-w-[200px]" value={clientFilter} onChange={(e)=>setClientFilter(e.target.value)}>
            <option value="">전체</option>{clients.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button type="button" onClick={()=>{setStartDate(""); setEndDate(""); setClientFilter("");}} className="px-3 py-2 rounded bg-gray-200">필터 초기화</button>
        <button type="button" onClick={downloadExcel} className="ml-auto px-3 py-2 rounded bg-blue-600 text-white">엑셀 다운로드</button>
      </div>

      <div className="grid grid-cols-3 xl:grid-cols-8 gap-3 mb-4">
        <KpiCard title="월 매출" value={kpi.월매출} />
        <KpiCard title="월 기사운반비" value={kpi.월기사} />
        <KpiCard title="월 수수료" value={kpi.월수수료} accent />
        <KpiMiniRate title="이번달 평균 이익률" rate={monthProfitRate} />
        <KpiCard title="전월 매출" value={kpi.전월매출} subtle />
        <KpiDeltaCard title="전월 대비" diff={kpi.전월증감} rate={kpi.전월증감률} />
        <KpiCard title="당일 매출" value={kpi.당일매출} />
        <KpiCard title="당일 수수료" value={kpi.당일수수료} />
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <SumCard label="기간 매출" value={won(rangeTotals.매출)} />
        <SumCard label="기간 기사운반비" value={won(rangeTotals.기사)} />
        <SumCard label="기간 수수료" value={won(rangeTotals.수수료)} highlight />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <ChartPanel title="🏆 Top5 거래처 (매출 기준)">
          {topClients.length===0 ? <div className="text-gray-500 text-sm">표시할 데이터가 없습니다.</div> :
            <SimpleBars data={topClients.map(d=>({ label:d.거래처명, value:d.매출 }))} max={Math.max(1,...topClients.map(d=>d.매출))} valueLabel={(v)=>won(v)} />}
        </ChartPanel>
        <ChartPanel title="⚠ 주의 거래처 (이익률 10% 미만)">
          {riskyClients.length===0 ? <div className="text-gray-500 text-sm">이익률 10% 미만 거래처가 없습니다.</div> :
            <div className="space-y-2">
              {riskyClients.map(d=>(
                <div key={d.거래처명} className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                  <div className="truncate font-medium text-rose-700">{d.거래처명}</div>
                  <div className="text-xs text-rose-700">매출 {d.매출.toLocaleString()}원 · 수수료 {d.수수료.toLocaleString()}원 · 이익률 {(d.rate).toFixed(1)}%</div>
                </div>
              ))}
            </div>}
        </ChartPanel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <ChartPanel title={`전월 대비 일자 매출 (이번달 ${mKey} vs 전월 ${pKey})`}>
          <SimpleLine data={monthDaily.map(d=>({ x:d.x, y1:d.y1, y2:d.y2 }))} series={[{key:"y1",name:"이번달 매출"},{key:"y2",name:"전월 매출"}]} />
        </ChartPanel>
        <ChartPanel title="기간 일자 트렌드 (매출/수수료/기사)">
          <SimpleLine data={dailyTrend.map(d=>({ x:d.date.slice(5), y1:d.매출, y2:d.수수료, y3:d.기사 }))} series={[{key:"y1",name:"매출"},{key:"y2",name:"수수료"},{key:"y3",name:"기사운반비"}]} />
        </ChartPanel>
      </div>

      <div className="mb-6">
        <h3 className="font-semibold mb-2">거래처별 기간 집계</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border">
            <thead className="bg-gray-100">
              <tr>
                <th className={headBase}>거래처명</th><th className={headBase}>건수</th><th className={headBase}>매출</th>
                <th className={headBase}>기사운반비</th><th className={headBase}>수수료</th><th className={headBase}>이익률</th>
              </tr>
            </thead>
            <tbody>
              {clientAgg.length===0 ? (
                <tr><td className="text-center text-gray-500 py-6" colSpan={6}>조건에 맞는 데이터가 없습니다.</td></tr>
              ) : clientAgg.map(r=>{
                const rateNum=r.매출>0?(r.수수료/r.매출)*100:0; const rateStr=r.매출>0?rateNum.toFixed(1)+"%":"-";
                const colorClass=r.매출>0 && rateNum<10 ? "text-red-600 font-semibold" : "text-gray-700";
                return (
                  <tr key={r.거래처명} className="odd:bg-white even:bg-gray-50 text-center">
                    <td className={cellBase}>{r.거래처명}</td>
                    <td className={cellBase}>{r.건수}</td>
                    <td className={cellBase}>{r.매출.toLocaleString()}</td>
                    <td className={cellBase}>{r.기사.toLocaleString()}</td>
                    <td className={`${cellBase} text-blue-600 font-semibold`}>{r.수수료.toLocaleString()}</td>
                    <td className={`${cellBase} ${colorClass}`}>{rateStr}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-2">기간 상세 목록</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border">
            <thead>
              <tr>
                <th className={headBase}>순번</th><th className={headBase}>상차일</th><th className={headBase}>거래처명</th>
                <th className={headBase}>차량번호</th><th className={headBase}>이름</th>
                <th className={headBase}>청구운임</th><th className={headBase}>기사운임</th><th className={headBase}>수수료</th>
              </tr>
            </thead>
            <tbody>
              {rangeRows.length===0 ? (
                <tr><td className="text-center text-gray-500 py-6" colSpan={8}>기간/거래처 조건에 맞는 데이터가 없습니다.</td></tr>
              ) : rangeRows.map((r,i)=>(
                <tr key={r._id||i} className={i%2===0?"bg-white":"bg-gray-50"}>
                  <td className={cellBase}>{i+1}</td>
                  <td className={cellBase}>{r.상차일||""}</td>
                  <td className={cellBase}>{r.거래처명||""}</td>
                  <td className={cellBase}>{r.차량번호||""}</td>
                  <td className={cellBase}>{r.이름||""}</td>
                  <td className={cellBase}>{(toInt(r.청구운임)).toLocaleString()}</td>
                  <td className={cellBase}>{(toInt(r.기사운임)).toLocaleString()}</td>
                  <td className={cellBase}>{(toInt(r.청구운임)-toInt(r.기사운임)).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* 보조 카드/차트 컴포넌트 (동일) */
function KpiCard({ title, value, accent, subtle }){
  const base = subtle ? "bg-gray-50 border-gray-200" : accent ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-200";
  return <div className={`rounded-2xl p-3 border shadow-sm ${base}`}><p className="text-xs text-gray-500">{title}</p><p className="text-xl font-bold mt-1">{Number(value||0).toLocaleString()}원</p></div>;
}
function KpiMiniRate({ title, rate }){
  const danger=rate<10, warn=rate>=10 && rate<15;
  const base = danger?"bg-rose-50 border-rose-200 text-rose-700" : warn?"bg-amber-50 border-amber-200 text-amber-700" : "bg-emerald-50 border-emerald-200 text-emerald-700";
  return <div className={`rounded-2xl p-3 border shadow-sm ${base}`}><p className="text-xs">{title}</p><p className="text-xl font-bold mt-1">{(rate||0).toFixed(1)}%</p></div>;
}
function KpiDeltaCard({ title, diff, rate }){
  const up=diff>=0;
  return (
    <div className={`rounded-2xl p-3 border shadow-sm ${up?"bg-blue-50 border-blue-200":"bg-rose-50 border-rose-200"}`}>
      <p className="text-xs text-gray-500">{title}</p>
      <p className={`text-xl font-bold mt-1 ${up?"text-blue-700":"text-rose-700"}`}>{`${diff>=0?"+":""}${Number(diff||0).toLocaleString()}원`}</p>
      <p className={`text-xs ${up?"text-blue-700":"text-rose-700"}`}>{`${rate>=0?"+":""}${(rate||0).toFixed(1)}%`}</p>
    </div>
  );
}
function SumCard({ label, value, highlight }){
  return <div className={`rounded-2xl p-4 text-center border ${highlight?"bg-blue-50 border-blue-200":"bg-white border-gray-200"} shadow-sm`}><p className="text-sm text-gray-500">{label}</p><p className="text-2xl font-bold mt-1">{value}</p></div>;
}
function ChartPanel({ title, children }){ return <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4"><h4 className="font-semibold mb-3">{title}</h4>{children}</div>; }
function SimpleBars({ data, max, barClass="bg-blue-500", valueLabel }){
  const safeMax=Math.max(1,max||1);
  return (
    <div className="space-y-2">
      {data.length===0 ? <div className="text-gray-500 text-sm">표시할 데이터가 없습니다.</div> :
        data.map(d=>{
          const pct=Math.round((d.value/safeMax)*100);
          return (
            <div key={d.label} className="flex items-center gap-3">
              <div className="w-36 truncate text-xs text-gray-700" title={d.label}>{d.label}</div>
              <div className="flex-1 h-4 bg-gray-100 rounded"><div className={`h-4 rounded ${barClass}`} style={{width:`${pct}%`}} /></div>
              <div className="w-28 text-right text-xs text-gray-600">{valueLabel?valueLabel(d.value):d.value}</div>
            </div>
          );
        })}
    </div>
  );
}
function SimpleLine({ data, series }){
  const width=560, height=280, padding={left:40,right:10,top:10,bottom:24};
  const xs=data.map(d=>d.x); const xCount=xs.length||1;
  const allY=[]; data.forEach(d=>series.forEach(s=>allY.push(d[s.key]||0)));
  const yMax=Math.max(1,...allY), yMin=0;
  const xScale=(i)=>padding.left + (i*(width-padding.left-padding.right))/Math.max(1,xCount-1);
  const yScale=(v)=>padding.top + (height-padding.top-padding.bottom)*(1-(v-yMin)/(yMax-yMin));
  const makePath=(key)=> data.length===0 ? "" : data.map((d,i)=>`${i===0?"M":"L"} ${xScale(i)} ${yScale(d[key]||0)}`).join(" ");
  const colors=["#2563eb","#ef4444","#10b981","#6b7280"];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[300px]">
      {Array.from({length:5}).map((_,i)=>{ const yVal=yMin+((yMax-yMin)*i)/4; const y=yScale(yVal);
        return (<g key={i}><line x1={padding.left} x2={width-padding.right} y1={y} y2={y} stroke="#e5e7eb" strokeWidth="1" /><text x={4} y={y+4} fontSize="10" fill="#6b7280">{Math.round(yVal).toLocaleString()}</text></g>);
      })}
      {xs.map((d,i)=>{ const show=i===0 || i===xCount-1 || i%Math.ceil(xCount/6)===0; if(!show) return null; const x=xScale(i);
        return (<text key={i} x={x} y={height-2} fontSize="10" textAnchor="middle" fill="#6b7280">{d}</text>);
      })}
      {series.map((s,idx)=><path key={s.key} d={makePath(s.key)} fill="none" stroke={colors[idx%colors.length]} strokeWidth="2" />)}
      {series.map((s,idx)=>(<g key={s.key} transform={`translate(${padding.left + idx*140}, ${padding.top + 8})`}><rect width="12" height="12" fill={colors[idx%colors.length]} rx="2" /><text x="16" y="11" fontSize="12" fill="#374151">{s.name}</text></g>))}
    </svg>
  );
}
// ===================== DispatchApp.jsx (PART 6/8) — END =====================
// ===================== DispatchApp.jsx (PART 7/8) — START =====================
function UnassignedStatus({ dispatchData }){
  const [q,setQ]=useState("");
  const filtered = useMemo(()=>{
    const result=(dispatchData||[]).filter(r=>(r.배차상태||"")==="배차중");
    if(!q.trim()) return result;
    const lower=q.toLowerCase();
    return result.filter(r=>Object.values(r).some(v=>String(v||"").toLowerCase().includes(lower)));
  },[dispatchData,q]);

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">미배차현황</h2>
      <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="검색 (거래처명 / 상차지명 / 차량번호)" className="border p-2 rounded w-80 mb-3" />
      <div className="overflow-x-auto">
        <table className="w-full text-sm border">
          <thead>
            <tr>{["순번","등록일","상차일","거래처명","상차지명","하차지명","차량톤수","차량종류","화물내용","배차상태","메모"].map(h=><th key={h} className={headBase}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.length===0 ? (
              <tr><td className="text-center py-4" colSpan={11}>모든 오더가 배차완료 상태입니다 🎉</td></tr>
            ) : filtered.map((r,i)=>(
              <tr key={r._id||i} className={i%2===0?"bg-white":"bg-gray-50"}>
                <td className={cellBase}>{i+1}</td>
                <td className={cellBase}>{r.등록일||""}</td>
                <td className={cellBase}>{r.상차일||""}</td>
                <td className={cellBase}>{r.거래처명||""}</td>
                <td className={cellBase}>{r.상차지명||""}</td>
                <td className={cellBase}>{r.하차지명||""}</td>
                <td className={cellBase}>{r.차량톤수||""}</td>
                <td className={cellBase}>{r.차량종류||""}</td>
                <td className={cellBase}>{r.화물내용||""}</td>
                <td className={cellBase}><StatusBadge s={r.배차상태} /></td>
                <td className={cellBase}>{r.메모||""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
// ===================== DispatchApp.jsx (PART 7/8) — END =====================
// ===================== DispatchApp.jsx (PART 8/8) — START =====================
function ClientSettlement({ dispatchData, clients = [], setClients }) {
  const [client, setClient] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [editInfo, setEditInfo] = useState({});
  const [showEdit, setShowEdit] = useState(false);

  const found = useMemo(
    () => (clients || []).find((c) => c.거래처명 === client) || {},
    [client, clients]
  );

  const [cInfo, setCInfo] = useState({});
  useEffect(() => {
    setCInfo({
      거래처명: found.거래처명 || client || "",
      사업자번호: found.사업자번호 || "",
      대표자: found.대표자 || found.사업자명 || "",
      업태: found.업태 || "",
      종목: found.종목 || "",
      주소: found.주소 || "",
      담당자: found.담당자 || "",
      연락처: found.연락처 || "",
    });
  }, [found, client]);

  const toInt = (v) =>
    parseInt(String(v ?? "0").replace(/[^\d-]/g, ""), 10) || 0;
  const won = (n) => (n ?? 0).toLocaleString();
  const inRange = (d) => (!start || d >= start) && (!end || d <= end);

  const rows = useMemo(() => {
    let list = Array.isArray(dispatchData) ? dispatchData : [];
    list = list.filter((r) => (r.배차상태 || "") === "배차완료");
    if (client) list = list.filter((r) => (r.거래처명 || "") === client);
    if (start || end) list = list.filter((r) => inRange(r.상차일 || ""));
    return list.sort((a, b) =>
      (a.상차일 || "").localeCompare(b.상차일 || "")
    );
  }, [dispatchData, client, start, end]);

  const mapped = rows.map((r, i) => ({
    idx: i + 1,
    상하차지: `${r.상차지명 || ""} - ${r.하차지명 || ""}`,
    화물명: r.화물내용 || "",
    기사명: r.이름 || "",
    공급가액: toInt(r.청구운임),
    세액: Math.round(toInt(r.청구운임) * 0.1),
  }));

  const 합계공급가 = mapped.reduce((a, b) => a + b.공급가액, 0);
  const 합계세액 = mapped.reduce((a, b) => a + b.세액, 0);

  const COMPANY_PRINT = {
    name: "(주)돌케",
    ceo: "고현정",
    bizNo: "329-81-00967",
    type: "운수업",
    item: "화물운송주선",
    addr: "인천 서구 청마로19번길 21 4층 402호",
    contact: "TEL 1533-2525 / FAX 032-569-8881",
    bank: "기업은행 955-040276-04-018",
    email: "r15332525@run25.co.kr",
    seal: "/seal.png",
  };

  // ✅ PDF 저장 (A4 꽉 채움 + 자동 페이지 분할)
  const savePDF = async () => {
    const area = document.getElementById("invoiceArea");
    const canvas = await html2canvas(area, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const imgWidth = 210;
    const pageHeight = 297;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(`${client || "거래명세서"}.pdf`);
  };

  // ✅ 엑셀 다운로드 (화면 UI 그대로 출력)
  const downloadExcel = () => {
    const table = document.getElementById("invoiceArea");

    if (!table) {
      alert("내보낼 테이블을 찾을 수 없습니다.");
      return;
    }

    try {
      const wb = XLSX.utils.table_to_book(table, { sheet: "거래명세서" });
      XLSX.writeFile(
        wb,
        `거래명세서_${cInfo.거래처명 || "미지정"}_${start || "all"}~${
          end || "all"
        }.xlsx`
      );
    } catch (err) {
      console.error(err);
      alert("엑셀 저장 중 오류가 발생했습니다.");
    }
  };

  const saveEdit = () => {
    setClients((prev) =>
      prev.map((c) => (c.거래처명 === client ? { ...c, ...editInfo } : c))
    );
    alert("거래처 정보 수정 완료!");
    setShowEdit(false);
  };

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">거래처</label>
          <select
            className="border p-2 rounded min-w-[220px]"
            value={client}
            onChange={(e) => setClient(e.target.value)}
          >
            <option value="">거래처 선택</option>
            {clients.map((c) => (
              <option key={c.거래처명} value={c.거래처명}>
                {c.거래처명}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">시작일</label>
          <input
            type="date"
            className="border p-2 rounded"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">종료일</label>
          <input
            type="date"
            className="border p-2 rounded"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>

        <div className="ml-auto flex gap-2">
          <button
            onClick={downloadExcel}
            className="bg-emerald-600 text-white px-3 py-2 rounded"
          >
            📊 엑셀 다운로드
          </button>
          <button
            onClick={savePDF}
            className="bg-blue-600 text-white px-3 py-2 rounded"
          >
            📄 PDF 저장
          </button>
          <button
            onClick={() => setShowEdit(true)}
            className="border px-3 py-2 rounded"
          >
            거래처 정보
          </button>
        </div>
      </div>

      <div
  id="invoiceArea"
  className="w-[1200px] mx-auto bg-white border-2 border-blue-400 rounded-2xl shadow-md overflow-hidden text-[15px]"
>

        <h2 className="text-3xl font-extrabold text-blue-800 text-center mt-6 mb-1">
          거래명세서
        </h2>
        {(start || end) && (
          <p className="text-center text-gray-600 font-medium mb-2">
            거래기간 : {start || "시작일"} ~ {end || "종료일"}
          </p>
        )}
        <p className="text-center text-gray-500 mb-4">
          (공급자 및 공급받는자 기재)
        </p>

        <div className="grid grid-cols-2 border-t-2 border-blue-400 mx-6 mb-6 rounded overflow-hidden">
          <table className="w-full border border-blue-200 text-sm">
            <thead>
              <tr>
                <th
                  colSpan="2"
                  className="bg-blue-100 text-blue-900 font-bold text-center p-2 border-b"
                >
                  공급받는자
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                ["상호", cInfo.거래처명],
                ["대표자", cInfo.대표자],
                ["사업자번호", cInfo.사업자번호],
                ["주소", cInfo.주소],
                ["업태", cInfo.업태],
                ["종목", cInfo.종목],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td className="border p-2 bg-blue-50 text-blue-900 font-semibold text-center w-28">
                    {k}
                  </td>
                  <td className="border p-2">{v || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <table className="w-full border border-blue-200 text-sm">
            <thead>
              <tr>
                <th
                  colSpan="2"
                  className="bg-blue-100 text-blue-900 font-bold text-center p-2 border-b"
                >
                  공급자
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border p-2 bg-blue-50 text-blue-900 font-semibold text-center w-28">
                  상호
                </td>
                <td className="border p-2">{COMPANY_PRINT.name}</td>
              </tr>
              <tr>
                <td className="border p-2 bg-blue-50 text-blue-900 font-semibold text-center">
                  대표자
                </td>
                <td className="border p-2 relative">
                  {COMPANY_PRINT.ceo} (인)
                  <img
                    src={COMPANY_PRINT.seal}
                    alt="seal"
                    className="absolute right-4 top-1 h-8 w-8 opacity-80"
                  />
                </td>
              </tr>
              <tr>
                <td className="border p-2 bg-blue-50 text-blue-900 font-semibold text-center">
                  사업자번호
                </td>
                <td className="border p-2">{COMPANY_PRINT.bizNo}</td>
              </tr>
              <tr>
                <td className="border p-2 bg-blue-50 text-blue-900 font-semibold text-center">
                  주소
                </td>
                <td className="border p-2">{COMPANY_PRINT.addr}</td>
              </tr>
              <tr>
                <td className="border p-2 bg-blue-50 text-blue-900 font-semibold text-center">
                  업태
                </td>
                <td className="border p-2">{COMPANY_PRINT.type}</td>
              </tr>
              <tr>
                <td className="border p-2 bg-blue-50 text-blue-900 font-semibold text-center">
                  종목
                </td>
                <td className="border p-2">{COMPANY_PRINT.item}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 상세 내역 */}
        <div className="overflow-x-auto px-6 pb-6">
          <table className="w-full text-sm border border-blue-300">
            <thead>
              <tr className="bg-blue-50 text-blue-900 font-semibold text-center">
                {["No", "상하차지", "화물명", "기사명", "공급가액", "세액(10%)"].map(
                  (h) => (
                    <th key={h} className="border border-blue-300 p-2">
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {mapped.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center text-gray-500 py-8"
                  >
                    표시할 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                mapped.map((m) => (
                  <tr key={m.idx} className="odd:bg-white even:bg-blue-50">
                    <td className="border border-blue-300 p-2 text-center">
                      {m.idx}
                    </td>
                    <td className="border border-blue-300 p-2">{m.상하차지}</td>
                    <td className="border border-blue-300 p-2">{m.화물명}</td>
                    <td className="border border-blue-300 p-2 text-center">
                      {m.기사명}
                    </td>
                    <td className="border border-blue-300 p-2 text-right">
                      {won(m.공급가액)}
                    </td>
                    <td className="border border-blue-300 p-2 text-right">
                      {won(m.세액)}
                    </td>
                  </tr>
                ))
              )}

              {mapped.length > 0 && (
                <tr className="bg-blue-100 font-bold">
                  <td
                    colSpan={4}
                    className="border border-blue-300 p-2 text-center"
                  >
                    합계
                  </td>
                  <td className="border border-blue-300 p-2 text-right">
                    {won(합계공급가)}
                  </td>
                  <td className="border border-blue-300 p-2 text-right">
                    {won(합계세액)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="text-sm text-gray-600 text-center border-t py-3">
          입금계좌: {COMPANY_PRINT.bank} | 문의: {COMPANY_PRINT.email}
        </div>
      </div>

      {showEdit && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-[420px]">
            <h3 className="text-lg font-bold mb-4">거래처 정보 수정</h3>
            {["거래처명", "사업자번호", "대표자", "업태", "종목", "주소", "담당자", "연락처"].map(
              (k) => (
                <div key={k} className="mb-3">
                  <label className="block text-sm font-medium mb-1">{k}</label>
                  <input
                    className="border p-2 w-full rounded"
                    value={editInfo[k] || ""}
                    onChange={(e) =>
                      setEditInfo({ ...editInfo, [k]: e.target.value })
                    }
                  />
                </div>
              )
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowEdit(false)}
                className="px-3 py-2 border rounded"
              >
                닫기
              </button>
              <button
                onClick={saveEdit}
                className="px-3 py-2 bg-blue-600 text-white rounded"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===================== DispatchApp.jsx (PART 8/8) — END =====================
// ===================== DispatchApp.jsx (PART 9/9 — 지급관리) — START =====================
function PaymentManagement({ dispatchData }) {
  // 로컬 유틸 (전역 todayStr() 있으면 그걸 우선 사용)
  const todayStr9 = () => {
    try { return typeof todayStr === "function" ? todayStr() : new Date().toISOString().slice(0,10); }
    catch { return new Date().toISOString().slice(0,10); }
  };
  const toInt = (v)=>{ const n=parseInt(String(v ?? "0").replace(/[^\d-]/g,""),10); return isNaN(n)?0:n; };
  const won = (n)=> (toInt(n)).toLocaleString();

  // Firestore 패치 (PART 1에서 db, setDoc, doc, COLL 가 이미 import/정의되어 있다고 가정)
  const patchDispatchDirect = async (id, patch)=>{
    if(!id) return;
    await setDoc(doc(db, COLL.dispatch, id), patch, { merge:true });
  };

  // 필터 상태
  const [statusFilter, setStatusFilter] = useState("전체");       // 전체 | 지급중 | 지급완료
  const [payStart, setPayStart] = useState("");                   // 지급일 시작
  const [payEnd, setPayEnd] = useState("");                       // 지급일 끝
  const [carNoQ, setCarNoQ] = useState("");
  const [nameQ, setNameQ] = useState("");
  const [clientQ, setClientQ] = useState("");
  const [loadStart, setLoadStart] = useState("");                 // 상차일 시작
  const [loadEnd, setLoadEnd] = useState("");                     // 상차일 끝

  // 지급일 수동 수정 모드
  const [editId, setEditId] = useState(null);
  const [editDate, setEditDate] = useState("");

  // 배차완료 건만 가져오기 + 필터
  const base = useMemo(()=> Array.isArray(dispatchData) ? dispatchData.filter(r => (r.배차상태||"") === "배차완료") : [], [dispatchData]);

  const filtered = useMemo(()=>{
    let rows = [...base];

    // 지급상태 필터
    if (statusFilter !== "전체") {
      rows = rows.filter(r => (r.지급상태 || "지급중") === statusFilter);
    }

    // 지급일 범위
    if (payStart) rows = rows.filter(r => (r.지급일 || "") >= payStart);
    if (payEnd)   rows = rows.filter(r => (r.지급일 || "") <= payEnd);

    // 상차일 범위
    if (loadStart) rows = rows.filter(r => (r.상차일 || "") >= loadStart);
    if (loadEnd)   rows = rows.filter(r => (r.상차일 || "") <= loadEnd);

    // 키워드들
    const car = carNoQ.trim().toLowerCase();
    const name = nameQ.trim().toLowerCase();
    const client = clientQ.trim().toLowerCase();
    if (car)    rows = rows.filter(r => String(r.차량번호||"").toLowerCase().includes(car));
    if (name)   rows = rows.filter(r => String(r.이름||"").toLowerCase().includes(name));
    if (client) rows = rows.filter(r => String(r.거래처명||"").toLowerCase().includes(client));

    // 정렬: 상차일 → 순번
    rows.sort((a,b)=> (a.상차일||"").localeCompare(b.상차일||"") || (parseInt(a.순번||0)-parseInt(b.순번||0)));
    return rows;
  }, [base, statusFilter, payStart, payEnd, carNoQ, nameQ, clientQ, loadStart, loadEnd]);

  // KPI
  const kpi = useMemo(()=>{
    const cnt = filtered.length;
    const sale = filtered.reduce((s,r)=> s + toInt(r.청구운임), 0);
    const driver = filtered.reduce((s,r)=> s + toInt(r.기사운임), 0);
    const fee = sale - driver;
    const done = filtered.filter(r => (r.지급상태||"지급중")==="지급완료").length;
    return { cnt, sale, driver, fee, done };
  }, [filtered]);

  // 지급 상태 토글
  const togglePay = async (row) => {
    const now = todayStr9();
    const cur = row.지급상태 || "지급중";
    const next = cur === "지급중" ? "지급완료" : "지급중";
    const patch = { 지급상태: next, 지급일: (next === "지급완료" ? now : "") };
    await patchDispatchDirect(row._id, patch);
  };

  // 지급일 수동 수정 저장
  const saveEditedDate = async () => {
    if (!editId) return;
    await patchDispatchDirect(editId, { 지급일: editDate || "" });
    setEditId(null);
    setEditDate("");
    alert("지급일이 수정되었습니다.");
  };

  const resetFilters = () => {
    setStatusFilter("전체"); setPayStart(""); setPayEnd("");
    setCarNoQ(""); setNameQ(""); setClientQ("");
    setLoadStart(""); setLoadEnd("");
  };

  // 엑셀 다운로드
  const downloadExcel = () => {
    if (!filtered.length) { alert("내보낼 데이터가 없습니다."); return; }
    const rows = filtered.map((r,i)=>({
      순번: r.순번 || i+1,
      상차일: r.상차일 || "",
      거래처명: r.거래처명 || "",
      상차지명: r.상차지명 || "",
      하차지명: r.하차지명 || "",
      차량번호: r.차량번호 || "",
      이름: r.이름 || "",
      전화번호: r.전화번호 || "",
      지급방식: r.지급방식 || "",
      배차방식: r.배차방식 || "",
      청구운임: toInt(r.청구운임),
      기사운임: toInt(r.기사운임),
      수수료: toInt(r.청구운임) - toInt(r.기사운임),
      지급상태: r.지급상태 || "지급중",
      지급일: r.지급일 || "",
      메모: r.메모 || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "지급관리");
    XLSX.writeFile(wb, `지급관리_${todayStr9()}.xlsx`);
  };

  // 스타일 공통 (상위 파트에 headBase/cellBase/inputBase 있으면 재사용)
  const head = typeof headBase === "string" ? headBase : "px-3 py-2 border";
  const cell = typeof cellBase === "string" ? cellBase : "px-3 py-2 border text-center";
  const input = typeof inputBase === "string" ? inputBase : "border rounded px-2 py-1";

  const StatusButton = ({ row }) => {
    const s = row.지급상태 || "지급중";
    const isDone = s === "지급완료";
    return (
      <button
        onClick={()=>togglePay(row)}
        className={`px-2 py-1 rounded text-sm ${isDone ? "bg-emerald-600 text-white" : "bg-blue-600 text-white"}`}
        title="클릭하여 상태 전환"
      >
        {isDone ? "✅ 지급완료" : "🔵 지급중"}
      </button>
    );
  };

  return (
    <div>
      <h2 className="text-lg font-bold mb-3">지급관리</h2>

      {/* KPI */}
      <div className="flex flex-wrap gap-2 text-xs md:text-sm mb-3">
        <span className="px-2 py-1 rounded bg-gray-100">총 건수 <b>{kpi.cnt.toLocaleString()}</b>건</span>
        <span className="px-2 py-1 rounded bg-blue-50 text-blue-700">총 청구 <b>{kpi.sale.toLocaleString()}</b>원</span>
        <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700">총 기사 <b>{kpi.driver.toLocaleString()}</b>원</span>
        <span className="px-2 py-1 rounded bg-indigo-50 text-indigo-700">총 수수료 <b>{kpi.fee.toLocaleString()}</b>원</span>
        <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-800">지급완료 <b>{kpi.done.toLocaleString()}</b>건</span>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap items-end gap-2 mb-3">
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">지급상태</label>
          <select className="border p-2 rounded min-w-[140px]" value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)}>
            <option value="전체">전체</option>
            <option value="지급중">지급중</option>
            <option value="지급완료">지급완료</option>
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">지급일 시작</label>
          <input type="date" className="border p-2 rounded" value={payStart} onChange={(e)=>setPayStart(e.target.value)} />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">지급일 종료</label>
          <input type="date" className="border p-2 rounded" value={payEnd} onChange={(e)=>setPayEnd(e.target.value)} />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">상차일 시작</label>
          <input type="date" className="border p-2 rounded" value={loadStart} onChange={(e)=>setLoadStart(e.target.value)} />
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">상차일 종료</label>
          <input type="date" className="border p-2 rounded" value={loadEnd} onChange={(e)=>setLoadEnd(e.target.value)} />
        </div>

        <input className="border p-2 rounded" placeholder="차량번호" value={carNoQ} onChange={(e)=>setCarNoQ(e.target.value)} />
        <input className="border p-2 rounded" placeholder="기사명" value={nameQ} onChange={(e)=>setNameQ(e.target.value)} />
        <input className="border p-2 rounded" placeholder="거래처명" value={clientQ} onChange={(e)=>setClientQ(e.target.value)} />

        <button onClick={resetFilters} className="px-3 py-2 rounded bg-gray-200">필터 초기화</button>
        <button onClick={downloadExcel} className="ml-auto px-3 py-2 rounded bg-blue-600 text-white">📥 엑셀 다운로드</button>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto">
        <table className="min-w-[1400px] text-sm border">
          <thead className="bg-gray-100">
            <tr>
              {["순번","상차일","거래처명","상차지명","하차지명","차량번호","이름","전화번호",
                "지급방식","배차방식","청구운임","기사운임","수수료","지급상태","지급일","메모","수정"].map(h=>(
                  <th key={h} className={head}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length===0 ? (
              <tr><td className="text-center text-gray-500 py-6" colSpan={16}>표시할 데이터가 없습니다.</td></tr>
            ) : filtered.map((r, i) => {
              const fee = toInt(r.청구운임) - toInt(r.기사운임);
              const isEditing = editId === r._id;
              return (
                <tr key={r._id||i} className={i%2===0 ? "bg-white" : "bg-gray-50"}>
                  <td className={cell}>{r.순번 || i+1}</td>
                  <td className={cell}>{r.상차일 || ""}</td>
                  <td className={cell}>{r.거래처명 || ""}</td>
                  <td className={cell}>{r.상차지명 || ""}</td>
                  <td className={cell}>{r.하차지명 || ""}</td>
                  <td className={cell}>{r.차량번호 || ""}</td>
                  <td className={cell}>{r.이름 || ""}</td>
                  <td className={cell}>{r.전화번호 || ""}</td>
                  <td className={cell}>{r.지급방식 || ""}</td>
                  <td className={cell}>{r.배차방식 || ""}</td>
                  <td className={cell}>{won(r.청구운임)}</td>
                  <td className={cell}>{won(r.기사운임)}</td>
                  <td className={`${cell} text-blue-700 font-semibold`}>{won(fee)}</td>
                  <td className={cell}><StatusButton row={r} /></td>
                  <td className={cell}>
                    {isEditing ? (
                      <input type="date" className={input} value={editDate} onChange={(e)=>setEditDate(e.target.value)} />
                    ) : (r.지급일 || "")}
                  </td>
                  <td className={cell}>{r.메모 || ""}</td>
                  <td className={cell}>
                    {isEditing ? (
                      <div className="flex gap-1 justify-center">
                        <button onClick={saveEditedDate} className="px-2 py-1 rounded bg-blue-600 text-white">저장</button>
                        <button onClick={()=>{setEditId(null); setEditDate("");}} className="px-2 py-1 rounded border">취소</button>
                      </div>
                    ) : (
                      <button
                        onClick={()=>{
                          setEditId(r._id);
                          setEditDate(r.지급일 || todayStr9()); // 기본값: 기존 지급일, 없으면 오늘
                        }}
                        className="px-2 py-1 rounded border"
                      >
                        수정
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
// ===================== DispatchApp.jsx (PART 9/9 — 지급관리) — END =====================
