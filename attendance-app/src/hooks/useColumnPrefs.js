import { useEffect, useState, useCallback, useRef } from "react";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "./useAuth";

// 표 컬럼의 순서(드래그로 이동)와 표시여부(체크박스로 숨김/표시)를 계정별로
// Firestore(users/{uid}.tablePrefs.{tableId})에 저장해, 어느 기기에서 다시
// 접속해도 같은 배치를 그대로 불러온다.
export function useColumnPrefs(tableId, defaultColumns) {
  const { user } = useAuth();
  const defaultOrder = defaultColumns.map((c) => c.key);
  const [order, setOrder] = useState(defaultOrder);
  const [hidden, setHidden] = useState([]);
  const loadedRef = useRef(false);

  useEffect(() => {
    loadedRef.current = false;
    if (!user?.uid) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      const prefs = snap.data()?.tablePrefs?.[tableId];
      if (prefs) {
        const validOrder = (prefs.order || []).filter((k) => defaultOrder.includes(k));
        const missing = defaultOrder.filter((k) => !validOrder.includes(k));
        setOrder([...validOrder, ...missing]);
        setHidden((prefs.hidden || []).filter((k) => defaultOrder.includes(k)));
      } else {
        setOrder(defaultOrder);
        setHidden([]);
      }
      loadedRef.current = true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, tableId]);

  const persist = useCallback(
    (nextOrder, nextHidden) => {
      if (!user?.uid) return;
      updateDoc(doc(db, "users", user.uid), {
        [`tablePrefs.${tableId}`]: { order: nextOrder, hidden: nextHidden },
      }).catch(() => {});
    },
    [user?.uid, tableId]
  );

  const moveColumn = (fromKey, toKey) => {
    if (fromKey === toKey) return;
    setOrder((cur) => {
      const next = [...cur];
      const fromIdx = next.indexOf(fromKey);
      const toIdx = next.indexOf(toKey);
      if (fromIdx === -1 || toIdx === -1) return cur;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, fromKey);
      persist(next, hidden);
      return next;
    });
  };

  const toggleColumn = (key) => {
    setHidden((cur) => {
      const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
      persist(order, next);
      return next;
    });
  };

  const columns = order.map((key) => defaultColumns.find((c) => c.key === key)).filter(Boolean);
  const visibleColumns = columns.filter((c) => !hidden.includes(c.key));

  return { columns, visibleColumns, hidden, moveColumn, toggleColumn };
}
