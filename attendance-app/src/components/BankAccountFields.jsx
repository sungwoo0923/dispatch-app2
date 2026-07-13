import { KOREAN_BANKS, formatAccountNumber } from "../utils/bankAccount";

// 급여은행 + 계좌번호를 한 쌍으로 다루는 컴포넌트 — 은행 선택에 따라
// 계좌번호 입력을 숫자만 받아 자동으로 하이픈을 넣어준다(utils/bankAccount의
// formatAccountNumber). 호출부는 일반 controlled input 두 개를 쓰듯 value/
// onChange류 props만 넘기면 되고, 라벨 텍스트/필수표시(*)/비활성화 등은
// 기존 폼과 동일하게 보이도록 props로 그대로 전달한다.
//
// wrapperClassName 기본값 "contents"는 이 컴포넌트를 grid 레이아웃(예:
// grid-cols-4 gap-3) 안에 그대로 끼워 넣었을 때, 내부 두 <label>이 감싸는
// div 없이 부모 grid의 셀 두 칸을 그대로 차지하게 하기 위함이다. 세로로
// 쌓인 폼(예: MyInfoPage)에서는 wrapperClassName="grid grid-cols-2 gap-3"
// 처럼 넘겨 두 필드를 나란히 배치할 수 있다.
export default function BankAccountFields({
  bankName,
  bankAccount,
  onBankNameChange,
  onBankAccountChange,
  bankLabel = "은행",
  accountLabel = "계좌번호",
  required = false,
  disabled = false,
  bankSelectRef,
  accountInputRef,
  wrapperClassName = "contents",
  fieldClassName = "w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm disabled:bg-slate-50 disabled:text-muted",
  labelClassName = "mb-1.5 block text-xs font-medium text-muted",
  bankId,
  accountId,
}) {
  const handleBankChange = (e) => {
    const nextBank = e.target.value;
    onBankNameChange?.(nextBank);
    // 은행을 바꾸면 이미 입력된 숫자를 새 은행의 하이픈 규칙으로 다시
    // 묶어준다 — 그대로 두면 이전 은행 기준 그룹핑이 남아 헷갈릴 수 있다.
    if (bankAccount) onBankAccountChange?.(formatAccountNumber(nextBank, bankAccount));
  };

  const handleAccountChange = (e) => {
    onBankAccountChange?.(formatAccountNumber(bankName, e.target.value));
  };

  return (
    <div className={wrapperClassName}>
      <label className="block">
        <span className={labelClassName}>
          {bankLabel} {required && <span className="text-danger">*</span>}
        </span>
        <select
          id={bankId}
          ref={bankSelectRef}
          disabled={disabled}
          className={fieldClassName}
          value={bankName || ""}
          onChange={handleBankChange}
        >
          <option value="">선택</option>
          {KOREAN_BANKS.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={labelClassName}>
          {accountLabel} {required && <span className="text-danger">*</span>}
        </span>
        <input
          id={accountId}
          ref={accountInputRef}
          disabled={disabled}
          inputMode="numeric"
          className={fieldClassName}
          value={bankAccount || ""}
          onChange={handleAccountChange}
          placeholder="- 없이 숫자만 입력하세요"
        />
      </label>
    </div>
  );
}
