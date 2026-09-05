// ==================== gom-hour-site/src/inventoryUtil.js ====================
// 주문 접수 시 재료 재고를 자동으로 차감하는 로직. 관리자가 gomRecipes에
// "이 종류/옵션을 고르면 이 재료를 몇 개 쓴다"를 등록해두면, 고객이 주문을
// 넣을 때마다 gomMaterials의 stock이 자동으로 줄어든다.
// 레시피가 하나도 없으면(관리자가 아직 안 만들었으면) 아무 일도 일어나지
// 않고, 재고 차감 중 오류가 나도 절대 주문 자체를 막지 않는다(최선 노력).
import { collection, doc, getDocs, increment, setDoc } from "firebase/firestore";
import { db } from "./firebase";

// 지금 주문에서 실제로 선택된 것들의 id 목록을 모은다.
// targetId는 종류 id(box-4 등) / 옵션 id / select 옵션의 선택지 id 중 하나이며,
// 관리자가 레시피를 등록할 때 이 중 아무 id나 골라서 재료를 연결할 수 있다.
export function collectRecipeTargets(kind, visibleOptions, optionValues) {
  const targets = [{ id: kind, qty: 1 }];
  visibleOptions.forEach((o) => {
    const value = optionValues[o.id];
    if (o.type === "checkbox" && value) {
      targets.push({ id: o.id, qty: 1 });
    } else if (o.type === "checkbox_qty" && value > 0) {
      targets.push({ id: o.id, qty: value });
    } else if (o.type === "select" && value) {
      targets.push({ id: value, qty: 1 }); // 선택지 id
    } else if (o.type === "text" && value && value.trim()) {
      targets.push({ id: o.id, qty: 1 });
    }
  });
  return targets;
}

export async function applyRecipeDeductions(targets) {
  try {
    const recipesSnap = await getDocs(collection(db, "gomRecipes"));
    const targetQty = new Map(targets.map((t) => [t.id, t.qty]));

    // materialId별로 차감할 총량을 먼저 합산
    const deductions = new Map();
    recipesSnap.docs.forEach((d) => {
      const r = d.data();
      const qty = targetQty.get(r.targetId);
      if (!qty || !r.materialId) return;
      const amount = (r.qtyPerUnit || 0) * qty;
      deductions.set(r.materialId, (deductions.get(r.materialId) || 0) + amount);
    });
    if (deductions.size === 0) return;

    // increment()는 서버에서 원자적으로 처리되고, 문서가 아직 없어도
    // set(merge:true)와 함께 쓰면 그 값 그대로 문서를 만들어주기 때문에
    // 먼저 읽어올 필요 없이 바로 차감할 수 있다.
    await Promise.all(
      [...deductions.entries()].map(([materialId, amount]) =>
        setDoc(doc(db, "gomMaterials", materialId), { stock: increment(-amount) }, { merge: true })
      )
    );
  } catch (e) {
    // 재고 차감은 부가 기능이라 실패해도 주문 접수 자체는 막지 않는다.
    console.error("재고 자동 차감 실패:", e);
  }
}
