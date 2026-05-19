import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { db, auth } from "../../firebase";
import ShipperOrder from "./ShipperOrder";
import {
  collection,
  query,
  where,
  doc,
  deleteDoc,
  getDoc,
  onSnapshot,
  updateDoc,
  addDoc,
  serverTimestamp,
  increment,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";

const STATUS = {
  요청: { label: "요청", cls: "bg-blue-100 text-blue-700" },
  배차중: { label: "배차중", cls: "bg-amber-100 text-amber-700" },
  배차완료: { label: "배차완료", cls: "bg-emerald-100 text-emerald-700" },
  배차취소: { label: "취소", cls: "bg-red-100 text-red-600" },
};

const getTodayKST = () => {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
};

const get3MonthsAgo = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
};

export default function ShipperStatus() {
  const user = auth.currentUser;
  const [userData, setUserData] = useState(null);
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("전체");
  const [keyword, setKeyword] = useState("");
  const [open, setOpen] = useState(true);
  const scrollRef = useRef(null);
  const prevAttachRef = useRef({});
  const [attachNotif, setAttachNotif] = useState(null);
  const [attachViewer, setAttachViewer] = useState(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleWheel = (e) => {
      if (e.shiftKey) { e.preventDefault(); el.scrollLeft += e.deltaY; }
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  const [startDate, setStartDate] = useState(get3MonthsAgo());
  const [endDate, setEndDate] = useState(getTodayKST());
  const [searchType, setSearchType] = useState("통합");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [hideCanceled, setHideCanceled] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 100;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ message: "", onConfirm: null });

  const openConfirm = (message, onConfirm) => {
    setConfirmConfig({ message, onConfirm });
    setConfirmOpen(true);
  };

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) setUserData(snap.data());
    });
  }, [user]);

  useEffect(() => {
    if (!user || !userData) return;

    const isMaster = userData?.permissions?.master === true || userData?.isMaster === true;
    const isSubMaster = userData?.permissions?.subMaster === true;
    const isTransport = userData?.permissions?.transport === true;

    let q;
    if (isMaster || isSubMaster) {
      q = query(
        collection(db, "orders"),
        where("shipperCompany", "==", userData.company)
      );
    } else if (isTransport) {
      const threeMonthsAgo = get3MonthsAgo();
      q = query(
        collection(db, "orders"),
        where("shipperCompany", "==", userData.company),
        where("상차일", ">=", threeMonthsAgo)
      );
    } else {
      q = query(
        collection(db, "orders"),
        where("shipperUid", "==", user.uid)
      );
    }

    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // 첨부 증가 감지 -> 알림
      docs.forEach((o) => {
        const cur = o.attachCount || 0;
        const prev = prevAttachRef.current[o.id] ?? null;
        if (prev !== null && cur > prev) {
          setAttachNotif({
            id: o.id,
            text: `${o.거래처명 || o.상차지명 || "오더"}에 첨부파일이 추가되었습니다.`,
            order: o,
          });
          setTimeout(() => setAttachNotif(null), 5000);
        }
        prevAttachRef.current[o.id] = cur;
      });

      setOrders(docs);
      setLoading(false);
    });

    return () => unsub();
  }, [user, userData]);

  const getStatus = useCallback((o) => {
    if (["취소", "배차취소", "오더취소", "취소됨"].includes(o.상태)) return "배차취소";
    if (o.차량번호 && o.차량번호.trim()) return "배차완료";
    return "요청";
  }, []);

  const activeOrders = orders.filter(o => o.상태 !== "취소");
  const kpi = useMemo(() => ({
    total: activeOrders.length,
    요청: activeOrders.filter(o => !o.차량번호).length,
    배차완료: activeOrders.filter(o => o.차량번호).length,
    취소: orders.filter(o => o.상태 === "취소").length,
    총금액: activeOrders.reduce((sum, o) => sum + (Number(o.청구운임) || 0), 0),
  }), [orders]);

  const toYMD = (d) => {
    if (!d) return "";
    if (d?.toDate) return d.toDate().toISOString().slice(0, 10);
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    return String(d).slice(0, 10);
  };

  const toggleExpand = (id, type) => {
    setExpandedRows(prev => ({ ...prev, [`${id}_${type}`]: !prev[`${id}_${type}`] }));
  };

  const toggleSelect = (id, checked) => {
    setSelectedIds(prev => checked ? [...prev, id] : prev.filter(v => v !== id));
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) { alert("선택된 항목 없음"); return; }
    if (!window.confirm("정말 삭제하시겠습니까?")) return;
    for (let id of selectedIds) {
      await deleteDoc(doc(db, "orders", id));
    }
    setSelectedIds([]);
  };

  const handleEditSelected = () => {
    if (selectedIds.length !== 1) { alert("1개만 선택하세요"); return; }
    const target = orders.find(o => o.id === selectedIds[0]);
    if (!target) { alert("데이터 못찾음"); return; }
    setEditData(target);
    setEditOpen(true);
  };

  const handleExcelDownload = () => {
    import("xlsx").then(XLSX => {
      const data = rows.map((o, i) => ({
        순번: i + 1,
        상차일: o.상차일 || "",
        상차시간: o.상차시간 || "",
        하차일: o.하차일 || "",
        거래처: o.거래처명 || "",
        상차지: o.상차지명 || "",
        하차지: o.하차지명 || "",
        화물: o.화물내용 || "",
        차량종류: o.차량종류 || "",
        톤수: o.차량톤수 || "",
        차량번호: o.차량번호 || "",
        기사: o.이름 || "",
        청구운임: o.청구운임 || "",
        지급방식: o.지급방식 || "",
        상태: getStatus(o),
        운송사: o.운송사명 || "",
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "운송목록");
      XLSX.writeFile(wb, `운송목록_${startDate}_${endDate}.xlsx`);
    });
  };

  const rows = useMemo(() => {
    return orders.filter((o) => {
      if (hideCanceled && filter !== "배차취소" && o.상태 === "취소") return false;
      const currentStatus = getStatus(o);
      if (filter !== "전체" && currentStatus !== filter) return false;
      const orderDate = toYMD(o.상차일);
      if (startDate && orderDate && orderDate < startDate) return false;
      if (endDate && orderDate && orderDate > endDate) return false;
      if (!keyword) return true;
      const val = keyword.toLowerCase();
      switch (searchType) {
        case "운송사명": return o.운송사명?.toLowerCase().includes(val);
        case "상차지명": return o.상차지명?.toLowerCase().includes(val);
        case "차량번호": return o.차량번호?.toLowerCase().includes(val);
        case "이름": return o.기사이름?.toLowerCase().includes(val);
        default:
          return (
            o.거래처명?.toLowerCase().includes(val) ||
            o.상차지명?.toLowerCase().includes(val) ||
            o.하차지명?.toLowerCase().includes(val) ||
            o.운송사명?.toLowerCase().includes(val) ||
            o.차량번호?.toLowerCase().includes(val) ||
            o.기사이름?.toLowerCase().includes(val)
          );
      }
    });
  }, [orders, filter, keyword, startDate, endDate, searchType, hideCanceled, getStatus]);

  useEffect(() => { setPage(1); }, [startDate, endDate, filter, keyword]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page]);

  const totalPages = Math.ceil(rows.length / pageSize);

  const restoreOrder = (order) => {
    openConfirm("오더를 재등록하시겠습니까?", () => {
      setDetailOpen(false);
      setEditData({ ...order, 상태: "요청" });
      setEditOpen(true);
      setConfirmOpen(false);
    });
  };

  const cancelOrder = (id) => {
    openConfirm("오더를 취소하시겠습니까?", async () => {
      await updateDoc(doc(db, "orders", id), { 상태: "취소" });
      setSelectedOrder(prev => prev?.id === id ? { ...prev, 상태: "취소" } : prev);
      setConfirmOpen(false);
    });
  };

  if (loading) {
    return <div className="py-24 text-center text-gray-400">불러오는 중...</div>;
  }

  const colGrid = "grid-cols-[40px_60px_110px_90px_110px_90px_140px_140px_200px_140px_200px_140px_120px_90px_120px_120px_120px_110px_110px_120px_90px_70px]";

  return (
    <div className="flex h-screen overflow-hidden">

      {/* 첨부 알림 배너 */}
      {attachNotif && (
        <div
          style={{
            position: "fixed", top: 0, left: 0, right: 0, zIndex: 999999,
            background: "#059669", color: "white", textAlign: "center",
            padding: "10px 16px", fontSize: "13px", fontWeight: 600,
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
            animation: "bannerDown 0.4s ease-out forwards",
          }}
          onClick={() => { setAttachViewer(attachNotif.order); setAttachNotif(null); }}
          className="cursor-pointer"
        >
          <style>{`@keyframes bannerDown { from { opacity:0; transform:translateY(-100%); } to { opacity:1; transform:translateY(0); } }`}</style>
          <span style={{ display:"inline-block", width:6, height:6, borderRadius:"50%", background:"#a7f3d0", marginRight:8, verticalAlign:"middle" }} />
          {attachNotif.text}
          <span style={{ marginLeft:12, textDecoration:"underline", opacity:0.85 }}>클릭하여 확인</span>
        </div>
      )}

      {/* 좌측 슬라이드 */}
      <div className={`${open ? "w-56" : "w-16"} flex-shrink-0 bg-gray-100 border-r transition-all duration-300`}>
        <div className="flex justify-end p-2">
          <button
            onClick={() => setOpen(!open)}
            className="w-8 h-8 flex items-center justify-center rounded-md bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold transition"
          >
            {open ? "<" : ">"}
          </button>
        </div>
        <div className="p-3 space-y-2 text-sm">
          <MenuItem label="운송목록" type="list" active open={open} />
          <MenuItem label="일반 배차등록" type="truck" open={open} onClick={() => navigate("/shipper/order")} />
          <MenuItem label="대량 배차등록" type="fast" open={open} />
        </div>
      </div>

      {/* 우측 메인 */}
      <div className="flex-1 min-w-0 px-8 py-6 bg-[#f4f7fb] space-y-6 transition-all duration-300">

        {/* KPI */}
        <div className="grid grid-cols-5 gap-4">
          <KPI title="전체 오더" value={kpi.total} />
          <KPI title="요청" value={kpi.요청} color="text-blue-600" />
          <KPI title="배차완료" value={kpi.배차완료} color="text-emerald-600" />
          <KPI title="취소" value={kpi.취소} color="text-red-500" />
          <KPI title="총 운송료" value={`${kpi.총금액.toLocaleString()}원`} color="text-gray-700" />
        </div>

        <div className="bg-white rounded-xl p-4 space-y-3 shadow-sm">

          {/* 상태 필터 */}
          <div className="flex gap-2 flex-wrap">
            {["전체", "요청", "배차중", "배차완료", "배차취소"].map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                  filter === s
                    ? "bg-blue-600 text-white"
                    : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                }`}
              >
                {s}
              </button>
            ))}
            <label className="flex items-center gap-2 text-sm ml-4">
              <input type="checkbox" checked={hideCanceled} onChange={(e) => setHideCanceled(e.target.checked)} />
              취소 오더 숨기기
            </label>
          </div>

          <div className="flex justify-between items-center flex-wrap gap-2">

            {/* 검색 영역 */}
            <div className="flex gap-2 items-center flex-wrap">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
              <span>~</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />

              <button
                onClick={() => { const t = getTodayKST(); setStartDate(t); setEndDate(t); }}
                className="px-3 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200"
              >당일</button>

              <button
                onClick={() => {
                  const d = new Date(); d.setDate(d.getDate() + 1);
                  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
                  const tmr = kst.toISOString().slice(0, 10);
                  setStartDate(tmr); setEndDate(tmr);
                }}
                className="px-3 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200"
              >내일</button>

              <button
                onClick={() => { setStartDate(get3MonthsAgo()); setEndDate(getTodayKST()); }}
                className="px-3 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200"
              >3개월</button>

              <select
                value={searchType}
                onChange={(e) => setSearchType(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm"
              >
                <option>통합검색</option>
                <option>운송사명</option>
                <option>상차지명</option>
                <option>차량번호</option>
                <option>이름</option>
              </select>

              <input
                className="border rounded-lg px-4 py-2 text-sm w-64"
                placeholder="검색어 입력"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>

            {/* 버튼 */}
            <div className="flex gap-2">
              <button onClick={handleEditSelected} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold">선택수정</button>
              <button onClick={handleDeleteSelected} className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-semibold">선택삭제</button>
              <button onClick={handleExcelDownload} className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-semibold">엑셀다운</button>
            </div>
          </div>
        </div>

        <div ref={scrollRef} className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <div className="min-w-[2200px]">

            {/* 헤더 */}
            <div className={`grid ${colGrid} bg-[#eef3fb] text-[15px] font-extrabold text-gray-800 px-4 py-4 text-center`}>
              <div>
                <input
                  type="checkbox"
                  checked={selectedIds.length === rows.length && rows.length > 0}
                  onChange={(e) => setSelectedIds(e.target.checked ? rows.map(o => o.id) : [])}
                />
              </div>
              <div>순번</div>
              <div>상차일</div>
              <div>상차시간</div>
              <div>하차일</div>
              <div>하차시간</div>
              <div>거래처</div>
              <div>상차지</div>
              <div>상차지주소</div>
              <div>하차지</div>
              <div>하차지주소</div>
              <div>화물</div>
              <div>차량</div>
              <div>톤수</div>
              <div>차량번호</div>
              <div>이름</div>
              <div>전화번호</div>
              <div>청구운임</div>
              <div>지급방식</div>
              <div>상태</div>
              <div>운송사</div>
              <div>첨부</div>
            </div>

            {/* 데이터 행 */}
            {pagedRows.map((o, i) => {
              const st = STATUS[getStatus(o)];
              const attachCnt = o.attachCount || 0;
              return (
                <div
                  key={o.id}
                  onDoubleClick={() => { setSelectedOrder(o); setDetailOpen(true); }}
                  className={`cursor-pointer grid ${colGrid} px-4 py-4 border-t text-[17px] text-center items-center [&>div]:flex [&>div]:justify-center [&>div]:items-center ${
                    getStatus(o) === "배차취소" ? "bg-red-50 text-red-600" : "text-gray-800 hover:bg-blue-50"
                  }`}
                >
                  <div>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(o.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => toggleSelect(o.id, e.target.checked)}
                    />
                  </div>
                  <div>{i + 1}</div>
                  <div>{o.상차일 || "-"}</div>
                  <div className="font-semibold">{o.상차시간 || "-"}</div>
                  <div>{o.하차일 || "-"}</div>
                  <div className="font-semibold">{o.하차시간 || "-"}</div>
                  <div className="font-semibold text-gray-900 text-[16px]">{o.거래처명}</div>
                  <div>{o.상차지명}</div>
                  <div
                    onClick={() => toggleExpand(o.id, "up")}
                    className={`cursor-pointer px-2 text-center text-gray-700 ${expandedRows[`${o.id}_up`] ? "text-[17px]" : "text-[15px] line-clamp-1"}`}
                  >{o.상차지주소}</div>
                  <div>{o.하차지명}</div>
                  <div
                    onClick={() => toggleExpand(o.id, "down")}
                    className={`cursor-pointer px-2 text-center text-gray-700 ${expandedRows[`${o.id}_down`] ? "text-[17px]" : "text-[15px] line-clamp-1"}`}
                  >{o.하차지주소}</div>
                  <div className="truncate">{o.화물내용 || "-"}</div>
                  <div>{o.차량종류}</div>
                  <div>{o.차량톤수}</div>
                  <div>{o.차량번호 || "-"}</div>
                  <div>{o.이름 || "-"}</div>
                  <div className="whitespace-nowrap">{o.전화번호 || "-"}</div>
                  <div className="font-bold text-blue-600">
                    {o.청구운임 ? Number(o.청구운임).toLocaleString() + "원" : "-"}
                  </div>
                  <div>{o.지급방식}</div>
                  <div>
                    <span className={`px-3 py-1 rounded-full text-[13px] font-bold ${st.cls}`}>{st.label}</span>
                  </div>
                  <div className="font-semibold text-gray-900">{o.운송사명 || "-"}</div>
                  {/* 첨부 컬럼 */}
                  <div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setAttachViewer(o); }}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[12px] font-bold border transition ${
                        attachCnt > 0
                          ? "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                          : "border-gray-200 text-gray-400 hover:bg-gray-50"
                      }`}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                      {attachCnt > 0 ? attachCnt : "-"}
                    </button>
                  </div>
                </div>
              );
            })}

            {/* 페이지네이션 */}
            <div className="flex justify-center items-center gap-4 py-6 border-t bg-white">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-4 py-2 bg-gray-200 rounded disabled:opacity-30">이전</button>
              <div className="text-sm font-semibold">{page} / {totalPages || 1}</div>
              <button disabled={page === totalPages || totalPages === 0} onClick={() => setPage(p => p + 1)} className="px-4 py-2 bg-gray-200 rounded disabled:opacity-30">다음</button>
            </div>
          </div>
        </div>
      </div>

      {/* 상세 패널 */}
      {detailOpen && selectedOrder && (
        <div className="fixed top-0 right-0 h-full w-[720px] bg-white shadow-2xl z-50 overflow-y-auto">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <div className={`text-[18px] font-bold ${selectedOrder?.상태 === "취소" ? "text-red-600" : "text-blue-600"}`}>
              {selectedOrder?.상태 === "취소" ? "배차취소 되었습니다." : selectedOrder?.차량번호 ? "배차완료 되었습니다." : "배차 요청중입니다."}
            </div>
            <div className="flex gap-2">
              <button
                disabled={selectedOrder?.상태 === "취소"}
                onClick={() => { setEditData(selectedOrder); setEditOpen(true); }}
                className={`px-4 py-2 rounded-lg text-sm font-semibold ${selectedOrder?.상태 === "취소" ? "bg-gray-300 text-gray-500 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"}`}
              >수정</button>
              <button
                disabled={selectedOrder?.상태 === "취소"}
                onClick={() => cancelOrder(selectedOrder.id)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold ${selectedOrder?.상태 === "취소" ? "bg-gray-300 text-gray-500 cursor-not-allowed" : "bg-red-500 text-white hover:bg-red-600"}`}
              >오더취소</button>
              <button
                onClick={() => setAttachViewer(selectedOrder)}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700"
              >
                첨부 {selectedOrder.attachCount > 0 ? `(${selectedOrder.attachCount})` : ""}
              </button>
              {selectedOrder?.상태 === "취소" && (
                <button onClick={() => restoreOrder(selectedOrder)} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700">재등록</button>
              )}
            </div>
            <button onClick={() => setDetailOpen(false)} className="text-gray-500 hover:text-black text-xl">×</button>
          </div>

          <div className="p-8 space-y-8 text-[20px]">
            <Section title="물품정보">
              <Row label="화물" value={selectedOrder?.화물내용 || "-"} />
              <Row label="톤수" value={selectedOrder?.차량톤수 || "-"} />
              <div className="pt-3 border-t space-y-3">
                <Row label="전달사항" value={selectedOrder?.전달사항 || "-"} />
                <Row label="요청차량" value={selectedOrder?.차량종류 || "-"} />
                <Row label="추가정보" value={selectedOrder?.추가정보 || "-"} />
                <Row label="메모" value={selectedOrder?.메모 || "-"} />
              </div>
            </Section>
            <Section title="운송내역">
              <Timeline order={selectedOrder} />
            </Section>
          </div>
        </div>
      )}

      {/* 수정 모달 */}
      {editOpen && editData && (
        <div className="fixed inset-0 bg-black/40 z-50 flex justify-center items-center">
          <div className="bg-white w-[1200px] h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <div className="text-xl font-bold">오더 수정</div>
              <button onClick={() => setEditOpen(false)} className="text-gray-500 hover:text-black text-2xl">×</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ShipperOrder editData={editData} onClose={() => setEditOpen(false)} />
            </div>
          </div>
        </div>
      )}

      {/* 확인 모달 */}
      {confirmOpen && (
        <ConfirmModal
          message={confirmConfig.message}
          onConfirm={confirmConfig.onConfirm}
          onClose={() => setConfirmOpen(false)}
        />
      )}

      {/* 첨부파일 뷰어 */}
      {attachViewer && (
        <ShipperAttachmentViewer
          order={attachViewer}
          onClose={() => setAttachViewer(null)}
        />
      )}
    </div>
  );
}

/* 첨부파일 뷰어 컴포넌트 */
function ShipperAttachmentViewer({ order, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [copyDone, setCopyDone] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!order?.id) return;
    const colRef = collection(db, "orders", order.id, "attachments");
    const unsub = onSnapshot(colRef, (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [order]);

  useEffect(() => {
    if (!selected) return;
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "c") { e.preventDefault(); handleCopy(selected, `ctrl_${selected.id}`); }
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected]);

  const handleDownload = (item) => {
    const a = document.createElement("a");
    a.href = item.base64 || item.url;
    a.download = item.name || "attachment.jpg";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const handleCopy = async (item, id) => {
    const src = item.base64 || item.url;
    try {
      let blob;
      if (src && src.startsWith("data:")) {
        const parts = src.split(",");
        const mime = (parts[0].match(/:(.*?);/) || [])[1] || "image/png";
        const bytes = atob(parts[1]);
        const arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        blob = new Blob([arr], { type: mime });
      } else {
        const res = await fetch(src);
        blob = await res.blob();
      }
      const type = blob.type && blob.type !== "application/octet-stream" ? blob.type : "image/png";
      if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
      } else {
        throw new Error("unsupported");
      }
      setCopyDone(id); setTimeout(() => setCopyDone(null), 2000);
    } catch {
      try {
        await navigator.clipboard.writeText(item.url || "");
        setCopyDone(id); setTimeout(() => setCopyDone(null), 2000);
      } catch {
        alert("복사 실패 - 이미지를 길게 눌러 복사하세요");
      }
    }
  };

  const handleUpload = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    for (const file of files) {
      try {
        const reader = new FileReader();
        const base64 = await new Promise((res, rej) => {
          reader.onload = e => res(e.target.result);
          reader.onerror = rej;
          reader.readAsDataURL(file);
        });
        await addDoc(collection(db, "orders", order.id, "attachments"), {
          url: base64,
          base64,
          name: file.name,
          size: file.size,
          sizeKB: Math.round(file.size / 1024),
          uploadedBy: auth.currentUser?.email || "shipper",
          createdAt: serverTimestamp(),
        });
        await updateDoc(doc(db, "orders", order.id), { attachCount: increment(1) });
      } catch (e) { alert("업로드 실패: " + e.message); }
    }
    setUploading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[99999] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <div className="font-bold text-[15px] text-[#1B2B4B]">
              첨부파일 <span className="text-[13px] font-normal text-gray-400">{loading ? "" : `${items.length}장`}</span>
            </div>
            <div className="text-[12px] text-gray-400 mt-0.5">
              {order.상차지명} → {order.하차지명}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className={`px-3 py-1.5 text-white text-[12px] font-bold rounded-lg hover:opacity-90 transition cursor-pointer ${uploading ? "bg-gray-400" : "bg-emerald-600"}`}>
              {uploading ? "업로드중..." : "파일 추가"}
              <input type="file" multiple accept="image/*,.pdf" className="hidden"
                disabled={uploading}
                onChange={e => handleUpload(Array.from(e.target.files))} />
            </label>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-400 text-lg">×</button>
          </div>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-[#1B2B4B] rounded-full animate-spin" />
              <span className="text-[14px]">불러오는 중...</span>
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="text-[14px] text-gray-400 font-medium">첨부파일이 없습니다</div>
              <div className="text-[12px] text-gray-300">파일 추가 버튼으로 업로드하세요</div>
            </div>
          )}
          {!loading && items.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {items.map((item) => (
                <div key={item.id} className="border border-gray-100 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  <div className="aspect-[4/3] bg-gray-50 cursor-zoom-in relative group" onClick={() => setSelected(item)}>
                    <img src={item.base64 || item.url} alt={item.name}
                      className="w-full h-full object-cover"
                      onError={e => { e.target.parentElement.innerHTML = '<div class="w-full h-full flex items-center justify-center text-gray-300 text-[12px]">미리보기 없음</div>'; }} />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 text-white text-[11px] font-bold bg-black/40 px-2 py-1 rounded-full transition-opacity">확대보기</span>
                    </div>
                  </div>
                  <div className="px-3 py-2.5 bg-white">
                    <div className="text-[11px] text-gray-400 truncate mb-2">{item.name || "파일"} {item.sizeKB ? `· ${item.sizeKB}KB` : ""}</div>
                    <div className="flex gap-1.5">
                      <button onClick={() => handleDownload(item)}
                        className="flex-1 py-1.5 rounded-lg bg-[#1B2B4B] text-white text-[11px] font-bold hover:opacity-90 transition">
                        저장
                      </button>
                      <button onClick={() => handleCopy(item, item.id)}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition border ${
                          copyDone === item.id ? "bg-emerald-500 text-white border-emerald-500" : "border-gray-200 text-gray-500 hover:bg-gray-50"
                        }`}>
                        {copyDone === item.id ? "복사됨" : "복사"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 전체화면 뷰 */}
      {selected && (
        <div className="fixed inset-0 bg-black/95 z-[999999] flex items-center justify-center" onClick={() => setSelected(null)}>
          <img src={selected.base64 || selected.url} alt="full" className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg" />
          <button className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full text-white text-xl transition" onClick={() => setSelected(null)}>×</button>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/40 text-[12px]">Ctrl+C 로 복사 | ESC 로 닫기</div>
          <div className="absolute bottom-6 flex gap-3">
            <button className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[13px] font-bold transition"
              onClick={e => { e.stopPropagation(); handleCopy(selected, `fs_${selected.id}`); }}>
              {copyDone === `ctrl_${selected.id}` || copyDone === `fs_${selected.id}` ? "복사됨" : "복사"}
            </button>
            <button className="px-5 py-2.5 bg-[#1B2B4B] hover:opacity-90 text-white rounded-xl text-[13px] font-bold transition"
              onClick={e => { e.stopPropagation(); handleDownload(selected); }}>
              저장하기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function KPI({ title, value, color = "text-gray-900" }) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm">
      <div className="text-base text-gray-500">{title}</div>
      <div className={`text-3xl font-bold mt-2 ${color}`}>{value}</div>
    </div>
  );
}

function MenuItem({ label, type, active, open, onClick }) {
  const renderIcon = () => {
    switch (type) {
      case "list":
        return (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2"/>
            <path d="M7 8h6M7 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M15 12l2 2 3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        );
      case "truck":
        return (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect x="1" y="6" width="13" height="10" rx="2" stroke="currentColor" strokeWidth="2"/>
            <path d="M14 10h4l3 3v3h-7" stroke="currentColor" strokeWidth="2"/>
            <circle cx="6" cy="18" r="2" stroke="currentColor" strokeWidth="2"/>
            <circle cx="18" cy="18" r="2" stroke="currentColor" strokeWidth="2"/>
          </svg>
        );
      case "fast":
        return (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M1 12h15l4-4" stroke="currentColor" strokeWidth="2"/>
            <circle cx="6" cy="18" r="2" stroke="currentColor" strokeWidth="2"/>
            <circle cx="18" cy="18" r="2" stroke="currentColor" strokeWidth="2"/>
          </svg>
        );
      default: return null;
    }
  };

  return (
    <div className="relative group">
      <div
        onClick={onClick}
        className={`flex items-center ${open ? "justify-start px-4" : "justify-center"} py-3 rounded cursor-pointer transition ${
          active ? "bg-blue-100 text-blue-600" : "text-gray-600 hover:bg-gray-200"
        }`}
      >
        {!open && <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-gray-200">{renderIcon()}</div>}
        {open && <span className="whitespace-nowrap text-base font-bold">{label}</span>}
      </div>
      {!open && (
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 bg-gray-800 text-white text-xs px-3 py-1.5 rounded opacity-0 group-hover:opacity-100 transition">
          {label}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div className="text-[21px] font-bold text-gray-800 mb-4">{title}</div>
      <div className="bg-gray-50 rounded-xl p-6">{children}</div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between py-2 text-[18px]">
      <div className="text-gray-500 w-[110px]">{label}</div>
      <div className="font-semibold text-gray-900 text-right flex-1">{value || "-"}</div>
    </div>
  );
}

function Timeline({ order }) {
  const isDone = order?.차량번호 && order?.차량번호.trim();
  const isCanceled = order?.상태 === "취소" || order?.상태 === "오더취소" || order?.취소여부 === true;

  const steps = [
    { title: "배차접수", company: order?.운송사명 || "돌캐", date: order?.상차일, time: order?.상차시간 },
    { title: "배차중", company: order?.운송사명 || "돌캐", date: order?.상차일, time: order?.상차시간 },
    { title: "배차완료", company: order?.운송사명 || "돌캐" },
    { title: "상차완료", company: order?.운송사명 || "돌캐", location: order?.상차지명 },
    { title: "운송완료", company: order?.운송사명 || "돌캐", location: order?.하차지명 },
  ];

  let currentIndex = isDone ? 2 : 1;
  if (isCanceled) currentIndex = 1;

  return (
    <div className="relative pl-16">
      <div className="absolute left-[20px] top-0 bottom-0 w-[3px] bg-gray-200" />
      {steps.map((step, i) => {
        const isPrev = i < currentIndex;
        const isCurrent = i === currentIndex;
        const isCancelPoint = isCanceled && i === currentIndex;
        return (
          <div key={i} className="relative mb-12">
            {(isCurrent || isCancelPoint) && (
              <div className={`absolute left-[20px] top-[6px] -translate-x-1/2 w-7 h-7 rounded-full border-[4px] bg-white z-10 animate-pulseSlow ${isCancelPoint ? "border-red-500" : "border-blue-500"}`} />
            )}
            <div className={`absolute left-[20px] top-[14px] -translate-x-1/2 w-3 h-3 rounded-full ${isCancelPoint ? "bg-red-500" : isCurrent ? "bg-blue-500" : isPrev ? "bg-gray-300" : "bg-gray-200"}`} />
            <div className="ml-14">
              <div className={`text-[20px] font-bold ${isCancelPoint ? "text-red-500" : isCurrent ? "text-blue-600" : isPrev ? "text-gray-400" : "text-gray-300"}`}>
                {isCancelPoint ? "취소 [오더취소] 배차중" : step.title}
              </div>
              {step.company && <div className="text-[16px] text-gray-700 mt-1">{step.company}</div>}
              {step.location && <div className="text-[14px] text-gray-500">{step.location}</div>}
              {step.date && <div className="text-[14px] text-gray-400 mt-1">요청일자 {step.date} {step.time}</div>}
            </div>
          </div>
        );
      })}
      <style>{`
        .animate-pulseSlow { animation: pulseSlow 2s infinite; }
        @keyframes pulseSlow {
          0% { transform: translateX(-50%) scale(1); opacity: 1; }
          50% { transform: translateX(-50%) scale(1.2); opacity: 0.6; }
          100% { transform: translateX(-50%) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function ConfirmModal({ message, onConfirm, onClose }) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Enter") onConfirm && onConfirm();
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onConfirm, onClose]);

  return (
    <div className="fixed inset-0 bg-black/40 z-[999] flex items-center justify-center">
      <div className="bg-white w-[360px] rounded-2xl shadow-2xl p-6">
        <div className="text-lg font-bold text-gray-800 mb-3">확인</div>
        <div className="text-sm text-gray-600 mb-6">{message}</div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm">취소 (ESC)</button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-semibold">확인 (ENTER)</button>
        </div>
      </div>
    </div>
  );
}
