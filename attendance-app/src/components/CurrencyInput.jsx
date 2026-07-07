import { formatWithCommas, stripCommas } from "../utils/currencyFormat";

// 금액 입력칸: 사용자가 50000을 입력하면 50,000으로 보이지만, onChange로는 항상
// 콤마가 빠진 순수 숫자 문자열을 부모에게 전달한다(계산/저장은 항상 순수 숫자로).
export default function CurrencyInput({ value, onChange, className = "", ...rest }) {
  return (
    <input
      inputMode="numeric"
      className={className}
      value={formatWithCommas(value)}
      onChange={(e) => onChange(stripCommas(e.target.value).replace(/[^0-9.]/g, ""))}
      {...rest}
    />
  );
}
