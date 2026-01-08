import { Link } from "react-router-dom";

export default function ShipperHome() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="bg-white p-6 rounded-xl shadow">
        <h3 className="font-bold mb-2">📦 오더 등록</h3>
        <p className="text-sm text-gray-600 mb-4">
          배송 요청을 직접 등록합니다.
        </p>
        <Link
          to="/shipper/order"
          className="block text-center bg-blue-600 text-white py-3 rounded"
        >
          오더 등록하기
        </Link>
      </div>

      <div className="bg-white p-6 rounded-xl shadow">
        <h3 className="font-bold mb-2">🚚 배차 현황</h3>
        <p className="text-sm text-gray-600 mb-4">
          배차 진행 상태를 확인합니다.
        </p>
        <Link
          to="/shipper/status"
          className="block text-center bg-green-600 text-white py-3 rounded"
        >
          배차 현황 보기
        </Link>
      </div>
    </div>
  );
}
