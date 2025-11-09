// src/UploadPage.jsx
import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { db, storage } from "./firebase";
import {
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  deleteDoc,
} from "firebase/firestore";
import { uploadBytesResumable, getDownloadURL, ref } from "firebase/storage";

export default function UploadPage() {
  const [params] = useSearchParams();
  const dispatchId = params.get("id");

  const [loading, setLoading] = useState(true);
  const [dispatch, setDispatch] = useState(null);
  const [files, setFiles] = useState([]);
  const [uploaded, setUploaded] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!dispatchId) return;
      const snap = await getDoc(doc(db, "dispatch", dispatchId));
      if (snap.exists()) setDispatch(snap.data());

      const col = collection(db, "dispatch", dispatchId, "attachments");
      const snaps = await getDocs(col);
      setUploaded(snaps.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    };
    load();
  }, [dispatchId]);

  const onPickFiles = (e) => {
    const list = Array.from(e.target.files || []);
    const merged = [...files, ...list];

    if (merged.length + uploaded.length > 5) {
      alert("최대 5장까지 업로드 가능합니다.");
      return;
    }
    for (const f of list) {
      if (f.size > 10 * 1024 * 1024) {
        alert(`❌ ${f.name} (10MB 초과)`);
        return;
      }
    }
    setFiles(merged);
  };

  const uploadAll = async () => {
    if (!files.length) return alert("업로드할 파일을 선택하세요.");
    setUploading(true);

    for (const file of files) {
      const path = `dispatch/${dispatchId}/${Date.now()}-${file.name}`;
      const storageRef = ref(storage, path);
      const task = uploadBytesResumable(storageRef, file);

      await new Promise((resolve, reject) => {
        task.on("state_changed", null, reject, async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          await addDoc(collection(db, "dispatch", dispatchId, "attachments"), {
            url,
            createdAt: serverTimestamp(),
          });
          resolve();
        });
      });
    }

    setFiles([]);
    setComplete(true);
    setUploading(false);
  };

  const removeFile = async (id) => {
    if (!window.confirm("삭제할까요?")) return;
    await deleteDoc(doc(db, "dispatch", dispatchId, "attachments", id));
    setUploaded((p) => p.filter((x) => x.id !== id));
  };

  if (!dispatchId) return <div className="p-5 text-center text-red-600">❌ 잘못된 링크</div>;
  if (loading) return <div className="p-5 text-center">⏳ 로딩중...</div>;
  if (!dispatch) return <div className="p-5 text-center text-red-600">❌ 데이터 없음</div>;

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h2 className="text-xl font-bold mb-3 text-center">📎 운송장 / 인수증 업로드</h2>

      <div className="border rounded p-4 text-sm bg-gray-50 mb-4">
        <div>✅ <b>상차일:</b> {dispatch.상차일}</div>
        <div>✅ <b>거래처:</b> {dispatch.거래처명}</div>
        <div>✅ <b>차량:</b> {dispatch.차량번호} ({dispatch.이름 || "-"})</div>
      </div>

      {!complete ? (
        <>
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png"
            onChange={onPickFiles}
            className="mb-3"
          />

          {files.length > 0 && (
            <div className="mb-2 text-sm text-gray-600">
              ✅ 선택된 파일: <b>{files.length}장</b>
            </div>
          )}

          <button
            onClick={uploadAll}
            disabled={uploading}
            className={`w-full py-2 rounded text-white ${
              uploading ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {uploading ? "업로드 중..." : "업로드"}
          </button>
        </>
      ) : (
        <div className="text-center text-lg font-semibold text-emerald-700 py-10">
          ✅ 업로드 완료! 감사합니다 🙂
        </div>
      )}

      {uploaded.length > 0 && (
        <div className="mt-6">
          <div className="text-sm font-semibold mb-2">📎 업로드된 파일 ({uploaded.length}/5)</div>
          <div className="grid grid-cols-3 gap-3">
            {uploaded.map((f) => (
              <div key={f.id} className="border rounded p-1 relative">
                <img src={f.url} alt="" className="w-full h-24 object-cover rounded" />
                <button
                  onClick={() => removeFile(f.id)}
                  className="absolute top-1 right-1 bg-white/80 px-1 rounded text-xs"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
