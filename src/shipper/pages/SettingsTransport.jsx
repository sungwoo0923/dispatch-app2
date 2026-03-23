import { useState, useEffect } from "react";

/* ================= Row ================= */
function Row({ label, value }) {
  return (
    <div className="grid grid-cols-[160px_1fr] items-center py-3">
      {/* 🔥 라벨 */}
      <span className="text-[18px] text-gray-800 font-semibold">
        {label}
      </span>
      {/* 🔥 값 */}
      <span className="text-[18px] text-gray-700">
        {value || "-"}
      </span>
    </div>
  );
}

const getInitial = (name) => {
  if (!name) return "?";
  return name.charAt(0).toUpperCase();
};

/* 🔥 [추가] 코드 생성 함수 (여기로 이동) */
const generateCode = () => {
  const prefix = "TS";
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}-${rand}`;
};

/* ================= 메인 ================= */
export default function SettingsTransport() {

  const [list, setList] = useState(() => {
    const saved = localStorage.getItem("transportList");
    return saved ? JSON.parse(saved) : [
      {
        name: "돌캐",
        address: "인천광역시 서구 청마로19번길21, 4층(성주빌딩)",
        phone: "1533-2525",
        ceo: "박주상",
        type: "운수/운송주선업",
        biz: "",
        bank: "기업은행 955-040276-04-018",
        email: "r15332525@daum.net",
        price: "",
        memo: "",
      },
    ];
  });

  const [selected, setSelected] = useState(list[0]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    localStorage.setItem("transportList", JSON.stringify(list));
  }, [list]);
useEffect(() => {
  let changed = false;

  const updatedList = list.map(item => {
    if (!item.code) {
      changed = true;
      return {
        ...item,
        code: generateCode(), // 🔥 없는 애들만 생성
      };
    }
    return item;
  });

  if (changed) {
    setList(updatedList);
  }
}, []);
  const handleSave = () => {
    if (!form.name) {
      alert("운송사명을 입력하세요");
      return;
    }

    if (selected) {
      // 🔥 수정
      const updated = {
        ...form,
        code: selected.code, // 🔥 코드 유지
      };

      setList(prev =>
        prev.map(i =>
          i === selected ? updated : i
        )
      );

      setSelected(updated); // 🔥 중요 수정
    } else {
      // 🔥 신규
      const newItem = {
        ...form,
        code: generateCode(), // 🔥 자동 생성
      };

      setList(prev => [...prev, newItem]);
      setSelected(newItem); // 🔥 중요 수정
    }

    setOpen(false);
    setForm({});
  };

  return (
    <div className="flex gap-4">

      {/* ================= 좌측 ================= */}
      <div className="w-[300px] bg-white p-4 rounded-lg">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="border w-full px-3 py-2 mb-3 rounded-md"
          placeholder="운송사명, 대표번호 검색"
        />

        <div className="border rounded p-2 space-y-2">
          {list
            .filter(item =>
              item.name?.includes(keyword) ||
              item.phone?.includes(keyword)
            )
            .map((item, idx) => (
              <div
                key={idx}
                onClick={() => setSelected(item)}
                className={`
                  p-2 rounded cursor-pointer flex items-center gap-2
                  ${
                    selected?.code === item.code // 🔥 수정됨
                      ? "bg-blue-100 border border-blue-300"
                      : "hover:bg-gray-100"
                  }
                `}
              >
                <div className="w-6 h-6 rounded-full bg-gray-500 text-white text-xs flex items-center justify-center">
                  {getInitial(item.name)}
                </div>
                <span className="text-sm font-medium">{item.name}</span>
              </div>
            ))}
        </div>
      </div>

      {/* ================= 우측 ================= */}
      <div className="flex-1 bg-white p-6 rounded-lg relative">

        {/* 등록 버튼 */}
        <div className="absolute top-6 right-6 z-50">
          <button
            onClick={() => {
              setSelected(null);
              setForm({
                name: "",
                address: "",
                phone: "",
                ceo: "",
                type: "",
                biz: "",
                bank: "",
                email: "",
                price: "",
                memo: "",
              });
              setOpen(true);
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700"
          >
            + 운송사 등록
          </button>
        </div>

        {selected && (
          <>
            {/* 헤더 */}
            <div className="relative flex flex-col items-center mb-6">

              <div className="absolute right-0 top-12 flex gap-2">
                <button
                  onClick={() => {
                    setForm(selected);
                    setOpen(true);
                  }}
                  className="px-3 py-1 text-xs border rounded-md bg-white hover:bg-gray-50"
                >
                  수정
                </button>

                <button
                  onClick={() => {
                    if (!window.confirm("삭제하시겠습니까?")) return;

                    setList(prev => {
                      const newList = prev.filter(i => i !== selected);
                      setSelected(newList[0] || null);
                      return newList;
                    });
                  }}
                  className="px-3 py-1 text-xs border rounded-md bg-red-50 text-red-600 hover:bg-red-100"
                >
                  삭제
                </button>
              </div>

              <div className="w-16 h-16 rounded-full bg-gray-500 text-white flex items-center justify-center text-xl font-semibold">
                {getInitial(selected?.name)}
              </div>

              <div className="mt-3 font-semibold text-[18px] text-gray-800">
                {selected.name}
              </div>
            </div>

            {/* 🔥 코드 추가 */}
            <div className="bg-white rounded-xl px-10 py-8 max-w-[520px] mx-auto shadow-sm">
              <Row label="운송사코드" value={selected.code} />
              <Row label="주소" value={selected.address} />
              <Row label="연락처" value={selected.phone} />
              <Row label="대표" value={selected.ceo} />
              <Row label="업태/업종" value={selected.type} />
              <Row label="사업자번호" value={selected.biz} />
            </div>

            <div className="bg-[#f8fafc] rounded-xl px-10 py-8 max-w-[520px] mx-auto mt-4">
              <Row label="은행정보" value={selected.bank} />
              <Row label="세금계산서 이메일" value={selected.email} />
              <Row label="계약운임" value={selected.price} />

              <div className="grid grid-cols-[160px_1fr] items-center py-3">
                <span className="text-[17px] text-gray-800 font-semibold">
                  요금표 조회
                </span>
                <button className="text-xs border px-3 py-1 rounded-md w-fit">
                  조회
                </button>
              </div>

              <Row label="등록서류" value="" />
              <Row label="메모" value={selected.memo} />
            </div>
          </>
        )}
      </div>

      {/* ================= 팝업 ================= */}
      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-[500px] rounded-xl p-6">

            <h2 className="text-lg font-bold mb-4">운송사 등록</h2>

            <div className="space-y-3 text-sm">

              <Input label="운송사명" value={form.name} onChange={(v) => setForm(f => ({ ...f, name: v }))} />
              <Input label="주소" value={form.address} onChange={(v) => setForm(f => ({ ...f, address: v }))} />
              <Input label="연락처" value={form.phone} onChange={(v) => setForm(f => ({ ...f, phone: v }))} />
              <Input label="대표" value={form.ceo} onChange={(v) => setForm(f => ({ ...f, ceo: v }))} />
              <Input label="업태/업종" value={form.type} onChange={(v) => setForm(f => ({ ...f, type: v }))} />
              <Input label="사업자번호" value={form.biz} onChange={(v) => setForm(f => ({ ...f, biz: v }))} />

              <Input label="은행정보" value={form.bank} onChange={(v) => setForm(f => ({ ...f, bank: v }))} />
              <Input label="세금계산서 이메일" value={form.email} onChange={(v) => setForm(f => ({ ...f, email: v }))} />
              <Input label="계약운임" value={form.price} onChange={(v) => setForm(f => ({ ...f, price: v }))} />

              <Input label="등록서류" value={form.doc} onChange={(v) => setForm(f => ({ ...f, doc: v }))} />
              <Input label="메모" value={form.memo} onChange={(v) => setForm(f => ({ ...f, memo: v }))} />

            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 border rounded-md text-sm"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm"
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

/* ================= Input ================= */
function Input({ label, value, onChange }) {
  return (
    <div>
      <div className="text-gray-500 mb-1">{label}</div>
      <input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border px-3 py-2 rounded-md"
      />
    </div>
  );
}