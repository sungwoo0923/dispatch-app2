import { useNavigate } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import Modal from "./Modal";
import Button from "./Button";

// 서명/이수 등을 마쳤을 때 토스트만으로는 놓치기 쉬워, 완료 사실을 명확히
// 보여주고 체크(홈) 탭으로 바로 이동할 수 있는 버튼을 주는 공용 팝업.
export default function CompletionSuccessModal({ open, onClose, message }) {
  const navigate = useNavigate();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="완료되었습니다"
      footer={
        <Button
          className="w-full"
          onClick={() => {
            onClose();
            navigate("/");
          }}
        >
          홈으로 이동
        </Button>
      }
    >
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 size={30} />
        </span>
        <p className="text-sm text-ink">{message}</p>
      </div>
    </Modal>
  );
}
