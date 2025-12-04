import CryptoJS from "crypto-js";

const ENC_KEY = CryptoJS.enc.Hex.parse(import.meta.env.VITE_24CALL_ENCRYPT_KEY);
const IV = CryptoJS.enc.Hex.parse(import.meta.env.VITE_24CALL_IV);

// AES 암호화
export const encryptAES = (str) => {
  return CryptoJS.AES.encrypt(str, ENC_KEY, {
    iv: IV,
    padding: CryptoJS.pad.Pkcs7,
    mode: CryptoJS.mode.CBC,
  }).toString();
};

// 오더 데이터 매핑 함수
export const mapTo24Order = (row) => {
  const payTypeMap = {
    계산서: "인수증",
    선불: "선불",
    착불: "착불",
  };
  const payType24 = payTypeMap[row.지급방식] || "인수증";

  const price =
    Number(row.기사운임 || "0") ||
    Number(row.보낼금액 || "0");

  return {
    UpAddr: row.상차지주소 || "",
    DownAddr: row.하차지주소 || "",
    CarTon: row.차량톤수 || "",
    CarType: row.차량종류 || "",
    GoodsInfo: row.화물내용 || "",
    ReqDate: row.상차일 || "",
    CarNo: row.차량번호 || "",
    DriverName: row.이름 || "",
    DriverTel: (row.전화번호 || "").replace(/\D/g, ""),
    Price: price,
    PayType: payType24,
  };
};
