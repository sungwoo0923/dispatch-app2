import React, { useEffect, useState } from "react";
import { db } from "./firebase";
import { collection, getDocs, updateDoc, deleteDoc, doc } from "firebase/firestore";

export default function Admin() {
  const [users, setUsers] = useState([]);

  const fetchUsers = async () => {
    const querySnapshot = await getDocs(collection(db, "users"));
    const list = querySnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    setUsers(list);
  };

  const approveUser = async (id) => {
    await updateDoc(doc(db, "users", id), { approved: true });
    alert("승인 완료!");
    fetchUsers();
  };

  const deleteUser = async (id) => {
    if (window.confirm("정말 삭제하시겠습니까?")) {
      await deleteDoc(doc(db, "users", id));
      alert("삭제 완료!");
      fetchUsers();
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  return (
    <div style={{ padding: 20, textAlign: "center" }}>
      <h1>👨‍💼 관리자 승인 페이지</h1>
      <table
        style={{
          margin: "20px auto",
          borderCollapse: "collapse",
          minWidth: "600px",
        }}
      >
        <thead>
          <tr style={{ background: "#eee" }}>
            <th style={{ border: "1px solid #ccc", padding: "8px" }}>이메일</th>
            <th style={{ border: "1px solid #ccc", padding: "8px" }}>승인여부</th>
            <th style={{ border: "1px solid #ccc", padding: "8px" }}>역할</th>
            <th style={{ border: "1px solid #ccc", padding: "8px" }}>작업</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td style={{ border: "1px solid #ccc", padding: "8px" }}>{u.email}</td>
              <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                {u.approved ? "✅ 승인됨" : "⏳ 대기중"}
              </td>
              <td style={{ border: "1px solid #ccc", padding: "8px" }}>{u.role}</td>
              <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                {!u.approved && (
                  <button onClick={() => approveUser(u.id)}>승인</button>
                )}
                <button
                  onClick={() => deleteUser(u.id)}
                  style={{ marginLeft: "10px", color: "red" }}
                >
                  삭제
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
