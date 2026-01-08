import { useState, useEffect } from "react";
import { db, auth } from "../../firebase";
import {
  addDoc,
  collection,
  serverTimestamp,
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import { useNavigate, useSearchParams } from "react-router-dom";

/* ================= 공통 유틸 ================= */
const timeOptions = Array.from({ length: 48 }, (_, i) => {
  const hour24 = Math.floor(i / 2);
  const minute = i % 2 === 0 ? "00" : "30";
  const isAM = hour24 < 12;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

  return {
    value: `${String(hour24).padStart(2, "0")}:${minute}`,
    label: `${isAM ? "오전" : "오후"} ${hour12}시${minute === "30" ? " 30분" : ""}`,
  };
});

const getDate = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

export default function ShipperOrder() {
  const user = auth.currentUser;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get("edit");

  const [company, setCompany] = useState("");
  const [loading, setLoading] = useState(!!editId);

  // ================= 회사명 로드 =================
  useEffect(() => {
    if (!user) return;

    const loadCompany = async () => {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        const d = snap.data();
        setCompany(
          d.companyName || d.회사명 || d.company || d.거래처명 || ""
        );
        return;
      }
      setCompany(`(주)${user.email?.split("@")[0] || "화주사"}`);
    };

    loadCompany();
  }, [user]);

  // ================= form (🔥 기존 항목 전부 유지) =================
  const [form, setForm] = useState({
    status: "요청",
    청구운임: "",
    상차지명: "",
    상차지주소: "",
    하차지명: "",
    하차지주소: "",
    상차일: getDate(0),
    상차시간: "08:00",
    하차일: getDate(0),
    하차시간: "12:00",
    차량종류: "",
    차량톤수: "",
    상차방법: "",
    하차방법: "",
    지급방식: "",
    화물내용: "",
  });

  const onChange = (k, v) =>
    setForm((p) => ({ ...p, [k]: v }));

  // ================= 수정모드 로드 =================
  useEffect(() => {
    if (!editId) return;

    const load = async () => {
      const snap = await getDoc(doc(db, "shipper_orders", editId));
      if (snap.exists()) {
        setForm((p) => ({ ...p, ...snap.data() }));
      }
      setLoading(false);
    };

    load();
  }, [editId]);

  // ================= 저장 =================
  const submit = async () => {
    if (!form.상차지명 || !form.하차지명) {
      return alert("상차지 / 하차지를 입력하세요.");
    }

    if (editId) {
      await updateDoc(doc(db, "shipper_orders", editId), {
        ...form,
        updatedAt: serverTimestamp(),
      });
    } else {
      await addDoc(collection(db, "shipper_orders"), {
        ...form,
        shipperUid: user.uid,
        거래처명: company,
        shipperCompany: company,
        status: "요청",
        createdAt: serverTimestamp(),
      });
    }

    navigate("/shipper/status");
  };

  if (loading) {
    return <div className="py-20 text-center text-gray-400">불러오는 중…</div>;
  }

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-2xl border shadow-sm p-8">
      <h2 className="text-xl font-bold mb-6">
              {/* ================= 거래처 정보 ================= */}
      <section className="mb-8">
        <h3 className="text-sm font-bold text-gray-700 mb-3">거래처 정보</h3>

        <div className="bg-gray-50 p-4 rounded-xl space-y-3">
          <div>
            <div className="text-xs text-gray-500 mb-1">거래처명</div>
            <input
              value={company}
              disabled
              className="w-full border rounded-lg p-3 bg-gray-100 text-gray-700 font-semibold"
            />
          </div>

          {/* 🔥 수정모드일 때만 상태 / 운임 표시 */}
          {editId && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">배차상태</div>
                <div className="p-3 bg-white border rounded-lg font-semibold text-gray-800">
                  {form.status || "요청"}
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500 mb-1">청구운임</div>
                <div className="p-3 bg-white border rounded-lg font-semibold text-gray-800">
                  {form.청구운임
                    ? `${Number(form.청구운임).toLocaleString()}원`
                    : "-"}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

        {editId ? "오더 수정" : "오더 등록"}
      </h2>

      {/* ================= 운송 일정 ================= */}
      <section className="mb-8">
        <h3 className="text-sm font-bold text-gray-700 mb-3">운송 일정</h3>

        <div className="bg-gray-50 p-4 rounded-xl space-y-4">
          {/* 상차 */}
          <div className="grid grid-cols-6 gap-2 items-center">
            <span className="text-sm text-gray-600">상차</span>
            <input
              type="date"
              className="input col-span-2"
              value={form.상차일}
              onChange={(e) => onChange("상차일", e.target.value)}
            />
            <select
              className="input"
              value={form.상차시간}
              onChange={(e) => onChange("상차시간", e.target.value)}
            >
              {timeOptions.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <div className="flex gap-1 col-span-2">
              <button
                type="button"
                className={`px-3 py-1 rounded border ${
                  form.상차일 === getDate(0)
                    ? "bg-blue-600 text-white"
                    : "bg-white"
                }`}
                onClick={() => onChange("상차일", getDate(0))}
              >
                당일
              </button>
              <button
                type="button"
                className={`px-3 py-1 rounded border ${
                  form.상차일 === getDate(1)
                    ? "bg-blue-600 text-white"
                    : "bg-white"
                }`}
                onClick={() => onChange("상차일", getDate(1))}
              >
                내일
              </button>
            </div>
          </div>

          {/* 하차 */}
          <div className="grid grid-cols-6 gap-2 items-center">
            <span className="text-sm text-gray-600">하차</span>
            <input
              type="date"
              className="input col-span-2"
              value={form.하차일}
              onChange={(e) => onChange("하차일", e.target.value)}
            />
            <select
              className="input"
              value={form.하차시간}
              onChange={(e) => onChange("하차시간", e.target.value)}
            >
              {timeOptions.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <div className="flex gap-1 col-span-2">
              <button
                type="button"
                className={`px-3 py-1 rounded border ${
                  form.하차일 === getDate(0)
                    ? "bg-blue-600 text-white"
                    : "bg-white"
                }`}
                onClick={() => onChange("하차일", getDate(0))}
              >
                당일
              </button>
              <button
                type="button"
                className={`px-3 py-1 rounded border ${
                  form.하차일 === getDate(1)
                    ? "bg-blue-600 text-white"
                    : "bg-white"
                }`}
                onClick={() => onChange("하차일", getDate(1))}
              >
                내일
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ================= 상·하차 ================= */}
      <section className="mb-8">
        <h3 className="text-sm font-bold text-gray-700 mb-3">상·하차 정보</h3>
        <div className="bg-gray-50 p-4 rounded-xl space-y-3">
          <input
            className="input"
            placeholder="상차지명"
            value={form.상차지명}
            onChange={(e) => onChange("상차지명", e.target.value)}
          />
          <input
            className="input"
            placeholder="상차지 주소"
            value={form.상차지주소}
            onChange={(e) => onChange("상차지주소", e.target.value)}
          />
          <input
            className="input"
            placeholder="하차지명"
            value={form.하차지명}
            onChange={(e) => onChange("하차지명", e.target.value)}
          />
          <input
            className="input"
            placeholder="하차지 주소"
            value={form.하차지주소}
            onChange={(e) => onChange("하차지주소", e.target.value)}
          />
        </div>
      </section>

      {/* ================= 차량 / 화물 ================= */}
      <section className="mb-8">
        <h3 className="text-sm font-bold text-gray-700 mb-3">차량 / 화물</h3>
        <div className="bg-gray-50 p-4 rounded-xl space-y-3">
          <select
            className="input"
            value={form.차량종류}
            onChange={(e) => onChange("차량종류", e.target.value)}
          >
            <option value="">차량종류</option>
            <option>라보/다마스</option>
            <option>냉장탑</option>
            <option>냉동탑</option>
            <option>냉동윙</option>
            <option>냉장윙</option>
            <option>리프트</option>
            <option>오토바이</option>
            <option>윙바디</option>
            <option>탑차</option>
          </select>

          <input
            className="input"
            placeholder="톤수"
            value={form.차량톤수}
            onChange={(e) => onChange("차량톤수", e.target.value)}
          />

          <select
            className="input"
            value={form.상차방법}
            onChange={(e) => onChange("상차방법", e.target.value)}
          >
            <option value="">상차방법</option>
            <option>지게차</option>
            <option>수도움</option>
            <option>수작업</option>
          </select>

          <select
            className="input"
            value={form.하차방법}
            onChange={(e) => onChange("하차방법", e.target.value)}
          >
            <option value="">하차방법</option>
            <option>지게차</option>
            <option>수도움</option>
            <option>수작업</option>
          </select>

          <select
            className="input"
            value={form.지급방식}
            onChange={(e) => onChange("지급방식", e.target.value)}
          >
            <option value="">지급방식</option>
            <option>계산서</option>
            <option>선불</option>
            <option>착불</option>
          </select>

          <textarea
            className="input h-28"
            placeholder="화물내용"
            value={form.화물내용}
            onChange={(e) => onChange("화물내용", e.target.value)}
          />
        </div>
      </section>

      {/* ================= 버튼 ================= */}
      <div className="flex justify-end gap-3">
        <button
          onClick={() => navigate(-1)}
          className="px-6 py-2 rounded bg-gray-200"
        >
          취소
        </button>
        <button
          onClick={submit}
          className="px-6 py-2 rounded bg-blue-600 text-white"
        >
          {editId ? "수정 저장" : "오더 등록"}
        </button>
      </div>
    </div>
  );
}
