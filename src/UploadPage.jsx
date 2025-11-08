// src/UploadPage.jsx
import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { db } from "./firebase";
import {
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { uploadProofImage } from "./utils/storageUpload";

export default function UploadPage() {
  const [params] = useSearchParams();
  const dispatchId = params.get("id");

  const [loading, setLoading] = useState(true);
  const [record, setRecord] = useState(null);

  const [carNoInput, setCarNoInput] = useState("");
  const [authOk, setAuthOk] = useState(false);

  const [files, setFiles] = useState([]);

  useEffect(() => {
    const load = async () => {
      if (!dispatchId) return;
      const snap = await getDoc(doc(db, "dispatch", dispatchId));
      if (snap.exists()) setRecord(snap.data());
      setLoading(false);
    };
    load();
  }, [dispatchId]);

  const handleAuth = () => {
    if (!record) return;
    const real = String(record.차량번호 || "").replace(/\s+/g, "");
    const input = String(carNoInput).replace(/\s+/g, "");
    if (real && real === input) {
      alert("✅ 인증되었습니다. 파일 업로드가 가능합니다.");
      setAuthOk(true);
    } else {
      alert("❌ 차량번호가 일치하지 않습니다.");
    }
  };

  const handleFileSelect = (e) => {
    const list = Array.from(e.target.files || []);
    const over = list.find((f) => f.size > 10 * 1024 * 1024);
    if (over) return alert("⚠️ 10MB 초과 파일은 업로드할 수 없습니다.");
    setFiles(list);
  };

  const handleUpload = async () => {
    if (!files.length) return alert("업로드할 파일을 선택하세요.");
    setLoading(true);
    try {
      for (const f of files) {
        await uploadProofImage(dispatchId, f, record.차량번호 || "");
      }
      alert("✅ 업로드 완료!");
      setFiles([]);
    } catch (err) {
      console.error(err);
      alert("❌ 업로드 중 오류 발생");
    }
    setLoading(false);
  };

  if (loading) return <div className="p-6 text-center">⏳ 로딩중…</div>;
  if (!record) return <div className="p-6 text-center text-red-600">❌ 잘못된 링크입니다.</div>;

  return (
    <div className="min-h-screen bg-gray-100 flex justify-center items-center p-6">
      <div className="bg-white shadow-xl rounded-xl p-6 w-full max-w-lg">
        <h2 className="text-xl font-bold mb-4 text-center">📎 인수증 / 운송장 업로드</h2>

        <div className="text-sm mb-4 p-3 border rounded bg-gray-50">
          <b>거래처:</b> {record.거래처명}<br />
          <b>상차지:</b> {record.상차지명} ({record.상차일})<br />
          <b>차량번호(등록된 정보):</b> {record.차량번호}
        </div>

        {!authOk && (
          <>
            <input
              className="border p-2 w-full rounded mb-2"
              placeholder="차량번호 입력 (예: 83가1234)"
              value={carNoInput}
              onChange={(e) => setCarNoInput(e.target.value)}
            />
            <button
              onClick={handleAuth}
              className="w-full bg-blue-600 text-white py-2 rounded"
            >
              ✅ 차량번호 인증
            </button>
          </>
        )}

        {authOk && (
          <>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="w-full mb-3"
            />

            {files.length > 0 && (
              <div className="mb-3 text-sm text-gray-600">
                선택된 파일: {files.length}개
              </div>
            )}

            <button
              onClick={handleUpload}
              className="w-full bg-emerald-600 text-white py-2 rounded"
            >
              📤 업로드하기
            </button>
          </>
        )}
      </div>
    </div>
  );
}
