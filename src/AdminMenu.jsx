// src/AdminMenu.jsx
import React, { useEffect, useState, useMemo } from "react";
import { auth, db } from "./firebase";
import {
  collection,
  setDoc,
  deleteDoc,
  doc,
  onSnapshot,
  getDoc,
} from "firebase/firestore";

const TOTAL_MASTER_EMAIL = "tjddnqkf@naver.com";

export default function AdminMenu({ parentRole = "", parentCompany = "" }) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [editUser, setEditUser] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editCompany, setEditCompany] = useState("");
  const [showMobilePreview, setShowMobilePreview] = useState(false);

  const [myRole, setMyRole] = useState("");
  const [myCompany, setMyCompany] = useState("");

  const me = auth.currentUser;
  const isTotalMaster = parentRole === "totalMaster" || me?.email === TOTAL_MASTER_EMAIL || myRole === "totalMaster";
  // totalMaster 권한은 totalMaster만 부여/변경 가능
  const ROLES = isTotalMaster
    ? ["totalMaster", "admin", "user", "driver", "shipper", "test"]
    : ["admin", "user", "driver", "shipper", "test"];
  // 유효 회사명: Firestore 로드 전에는 parentCompany 사용
  const effectiveCompany = myCompany || parentCompany || localStorage.getItem("userCompany") || "돌캐";

  // 내 정보 로드
  useEffect(() => {
    if (!me) return;
    const unsub = onSnapshot(doc(db, "users", me.uid), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setMyRole(d.role || "");
        setMyCompany(d.companyName || "");
      }
    });
    return () => unsub();
  }, [me?.uid]);

  // 사용자 목록 불러오기
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setUsers(list);
    });
    return () => unsub();
  }, []);

  // 회사 기준 필터
  // totalMaster: 전체 사용자 (본인 포함)
  // admin: 자기 회사만, 총마스터 계정은 제외
  const visibleUsers = useMemo(() => {
    if (isTotalMaster) return users;
    return users.filter(u =>
      u.email !== TOTAL_MASTER_EMAIL &&
      u.role !== "totalMaster" &&
      (u.companyName || "돌캐") === effectiveCompany
    );
  }, [users, isTotalMaster, effectiveCompany]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visibleUsers.filter((u) => {
      const matchSearch = !q
        ? true
        : [u.email, u.name, u.phone, u.role, u.companyName].join(" ").toLowerCase().includes(q);
      const matchRole = roleFilter === "all" ? true : u.role === roleFilter;
      return matchSearch && matchRole;
    });
  }, [search, visibleUsers, roleFilter]);

  // 승인 토글
  const toggleApprove = async (u) => {
    if (!isTotalMaster && (u.companyName || "돌캐") !== effectiveCompany) return;
    const status = !u.approved;
    const updateData = { approved: status };
    if (u.role === "shipper" && status === true) updateData.isMaster = true;
    await setDoc(doc(db, "users", u.id), updateData, { merge: true });
    await setDoc(doc(db, "drivers", u.id), { active: status, updatedAt: new Date() }, { merge: true });
  };

  // 삭제
  const removeUser = async (u) => {
    if (me?.uid === u.id) return alert("본인 계정은 삭제할 수 없습니다.");
    if (!isTotalMaster && (u.companyName || "돌캐") !== effectiveCompany) return;
    await deleteDoc(doc(db, "users", u.id));
  };

  const openEdit = (u) => {
    setEditUser(u);
    setEditName(u.name || "");
    setEditPhone(u.phone || "");
    setEditRole(u.role || "user");
    setEditCompany(u.companyName || "");
  };

  const saveEdit = async () => {
    if (!editName.trim()) return alert("이름을 입력하세요.");
    // totalMaster 권한은 totalMaster만 부여 가능
    if (editRole === "totalMaster" && !isTotalMaster) return alert("totalMaster 권한은 부여할 수 없습니다.");
    const payload = {
      name: editName.trim(),
      phone: editPhone.trim(),
      role: editRole,
      companyName: editCompany.trim(),
    };
    await setDoc(doc(db, "users", editUser.id), payload, { merge: true });
    setEditUser(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-[#1B2B4B]">관리자 메뉴</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">사용자 계정 권한 및 승인 관리</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-[#1B2B4B]/10 rounded-xl px-4 py-2 text-center">
            <div className="text-[22px] font-bold text-[#1B2B4B]">{visibleUsers.length}</div>
            <div className="text-[11px] text-gray-500">전체 사용자</div>
          </div>
          <div className="bg-emerald-50 rounded-xl px-4 py-2 text-center">
            <div className="text-[22px] font-bold text-emerald-600">{visibleUsers.filter(u => u.approved).length}</div>
            <div className="text-[11px] text-gray-500">승인 완료</div>
          </div>
          <div className="bg-amber-50 rounded-xl px-4 py-2 text-center">
            <div className="text-[22px] font-bold text-amber-500">{visibleUsers.filter(u => !u.approved).length}</div>
            <div className="text-[11px] text-gray-500">승인 대기</div>
          </div>
          <button
            onClick={() => setShowMobilePreview(v => !v)}
            className={`px-4 py-2.5 rounded-xl text-[13px] font-semibold shadow-sm transition ${showMobilePreview ? "bg-gray-700 text-white" : "bg-[#1B2B4B] text-white hover:bg-[#243a60]"}`}
          >
            모바일 미리보기
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          {/* 검색 + 필터 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4 mb-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 border-2 border-[#1B2B4B] rounded-xl overflow-hidden bg-white flex-1 min-w-[200px] max-w-[320px]">
                <span className="pl-3 text-gray-400 text-[15px]">🔍</span>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="이메일 · 이름 · 회사명 검색"
                  className="flex-1 px-2 py-2 text-[13px] outline-none" />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {["all", ...ROLES].map(r => (
                  <button key={r} onClick={() => setRoleFilter(r)}
                    className={`h-[36px] px-3.5 rounded-full text-[12px] font-semibold border transition ${roleFilter === r ? "bg-[#1B2B4B] text-white border-[#1B2B4B]" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
                    {r === "all" ? "전체" : r}
                  </button>
                ))}
              </div>
              <div className="ml-auto text-[13px] text-gray-400 font-medium">{filtered.length}명 표시 중</div>
            </div>
          </div>

          {/* 테이블 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-visible">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-[#1B2B4B]">
                  {["이메일", "이름", "연락처", "권한", "회사명", "승인", "관리"].map(h => (
                    <th key={h} className="px-4 py-3 text-center text-[13px] font-semibold text-white whitespace-nowrap border-b border-white/10">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="py-16 text-center text-[13px] text-gray-400">검색 결과가 없습니다</td></tr>
                ) : filtered.map((u, idx) => {
                  const isMe = me?.uid === u.id;
                  const canManage = isTotalMaster || (u.companyName || "돌캐") === effectiveCompany;
                  return (
                    <tr key={u.id} className={`transition hover:bg-blue-50/40 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                      <td className="px-4 py-3 text-center">
                        <div className="text-[13px] text-gray-700 font-medium">{u.email}</div>
                        {isMe && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 font-semibold">나</span>}
                        {u.email === TOTAL_MASTER_EMAIL && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-semibold ml-1">총마스터</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-[13px] font-semibold text-gray-800">{u.name || <span className="text-gray-300">-</span>}</td>
                      <td className="px-4 py-3 text-center text-[13px] text-gray-600">{u.phone || <span className="text-gray-300">-</span>}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#1B2B4B]/10 text-[#1B2B4B] border border-[#1B2B4B]/30">
                          {u.role || "user"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-[13px] text-gray-600">
                        {u.companyName || <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${u.approved ? "bg-emerald-100 text-emerald-700 border-emerald-300" : "bg-amber-100 text-amber-600 border-amber-300"}`}>
                          {u.approved ? "✓ 승인" : "⏳ 대기"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {canManage ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => toggleApprove(u)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition ${u.approved ? "text-amber-600 border-amber-300 hover:bg-amber-50" : "text-emerald-600 border-emerald-300 hover:bg-emerald-50"}`}
                            >
                              {u.approved ? "승인해제" : "승인"}
                            </button>
                            <button
                              onClick={() => openEdit(u)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[#1B2B4B] border border-[#1B2B4B]/40 hover:bg-[#1B2B4B]/10 transition"
                            >
                              수정
                            </button>
                            {!isMe && (
                              <button
                                onClick={() => removeUser(u)}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-red-500 border border-red-200 hover:bg-red-50 transition"
                              >
                                삭제
                              </button>
                            )}
                          </div>
                        ) : <span className="text-gray-300 text-[12px]">-</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 모바일 미리보기 */}
        {showMobilePreview && (
          <div className="w-[420px] shrink-0">
            <div className="sticky top-4 bg-white border border-gray-200 rounded-2xl shadow-lg overflow-hidden">
              <div className="bg-[#1B2B4B] px-4 py-3 flex items-center justify-between">
                <span className="text-white font-semibold text-[14px]">모바일 미리보기</span>
                <button onClick={() => setShowMobilePreview(false)} className="text-white/60 hover:text-white text-lg">✕</button>
              </div>
              <div className="p-3">
                <iframe src="/mobile" title="mobile-preview" className="w-full h-[760px] border border-gray-200 rounded-xl" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 수정 모달 */}
      {editUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-[420px] overflow-hidden">
            <div className="bg-[#1B2B4B] px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold text-[15px]">사용자 정보 수정</h3>
                <p className="text-white/60 text-[12px] mt-0.5">{editUser.email}</p>
              </div>
              <button onClick={() => setEditUser(null)} className="text-white/60 hover:text-white text-lg">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-gray-500 mb-1">회사명</label>
                <input placeholder="회사명 입력" value={editCompany} onChange={e => setEditCompany(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:border-[#1B2B4B]" />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-500 mb-1">이름</label>
                <input placeholder="이름 입력" value={editName} onChange={e => setEditName(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:border-[#1B2B4B]" />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-500 mb-1">핸드폰번호</label>
                <input placeholder="010-0000-0000" value={editPhone}
                  onChange={e => {
                    let v = e.target.value.replace(/[^0-9]/g, "");
                    if (v.length <= 3) {}
                    else if (v.length <= 7) v = v.replace(/(\d{3})(\d+)/, "$1-$2");
                    else v = v.replace(/(\d{3})(\d{4})(\d+)/, "$1-$2-$3");
                    setEditPhone(v);
                  }}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:border-[#1B2B4B]" />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-500 mb-1">권한</label>
                <select value={editRole} onChange={e => setEditRole(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-[13px] focus:outline-none focus:border-[#1B2B4B] bg-white">
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setEditUser(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition">
                취소
              </button>
              <button onClick={saveEdit}
                className="flex-1 py-2.5 rounded-xl bg-[#1B2B4B] text-white text-[13px] font-bold hover:bg-[#243a60] transition">
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
