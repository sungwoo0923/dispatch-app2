import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

// 통계 하위 메뉴(근로자별출근집계/월별출근집계/월별출퇴근시간집계/센터별집계)가
// 공통으로 쓰는 조회 데이터·필터 로직 — 예전엔 한 파일 안의 탭이었지만, 참고
// 화면처럼 좌측 메뉴에서 각각 별도 페이지로 들어가는 구조로 바뀌면서 공용
// 부분만 이 파일로 뽑아냈다.
export function useCompanyLookups(companyId) {
  const [companyName, setCompanyName] = useState("");
  const [employees, setEmployees] = useState([]);
  const [workSites, setWorkSites] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);

  useEffect(() => {
    if (!companyId) return;
    getDoc(doc(db, "companies", companyId)).then((s) => setCompanyName(s.data()?.name || ""));
    const unsubs = [
      onSnapshot(query(collection(db, "users"), where("companyId", "==", companyId), where("role", "==", "employee")), (snap) =>
        setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "workSites"), where("companyId", "==", companyId)), (snap) =>
        setWorkSites(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "vendors"), where("companyId", "==", companyId)), (snap) =>
        setVendors(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "departments"), where("companyId", "==", companyId)), (snap) =>
        setDepartments(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "positions"), where("companyId", "==", companyId)), (snap) =>
        setPositions(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
      onSnapshot(query(collection(db, "leaveTypes"), where("companyId", "==", companyId)), (snap) =>
        setLeaveTypes(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [companyId]);

  return { companyName, employees, workSites, vendors, departments, positions, leaveTypes };
}

export function filterEmployees(employees, filters) {
  return employees.filter((emp) => {
    if (!emp.approved) return false;
    if (filters.siteId && emp.workSiteId !== filters.siteId) return false;
    if (filters.vendorId && emp.vendorId !== filters.vendorId) return false;
    if (filters.shiftType && emp.shiftType !== filters.shiftType) return false;
    if (filters.employmentType && emp.employmentType !== filters.employmentType) return false;
    if (filters.team && emp.team !== filters.team) return false;
    if (filters.position && emp.position !== filters.position) return false;
    if (filters.search && !`${emp.name}${emp.phone}`.includes(filters.search)) return false;
    return true;
  });
}

export function daysInMonth(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

// 승인된 휴가 중 특정 날짜를 포함하는 건을 찾아, 그 휴가유형이 유급/무급인지
// 판정한다. leaveTypes에 등록되지 않은(직원이 모바일에서 기본 유형으로 직접
// 신청한) 유형은 대부분 연차 계열이라 유급으로 간주한다.
export function leaveStatusOn(leaves, leaveTypes, uid, dateKey) {
  const lv = leaves.find((l) => l.uid === uid && l.status === "approved" && dateKey >= l.startDate && dateKey <= (l.endDate || l.startDate));
  if (!lv) return null;
  const typeDef = leaveTypes.find((t) => t.name === lv.type);
  const paid = typeDef ? typeDef.paid === "유급" : true;
  return { type: lv.type, paid };
}
