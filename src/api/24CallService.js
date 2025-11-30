import { mapTo24Order } from "../utils/mapper24";
import CryptoJS from "crypto-js";

const ENC_KEY = import.meta.env.VITE_24CALL_ENC_KEY;
const IV_KEY = import.meta.env.VITE_24CALL_IV_KEY;

function encrypt(data) {
  const cipher = CryptoJS.AES.encrypt(
    JSON.stringify(data),
    CryptoJS.enc.Utf8.parse(ENC_KEY),
    {
      iv: CryptoJS.enc.Utf8.parse(IV_KEY),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    }
  );
  return cipher.toString(); 
}

export async function sendOrderTo24(order) {
  try {
    const encryptedData = encrypt(mapTo24Order(order));


    

    const res = await fetch(
      `${import.meta.env.VITE_24CALL_URL}/api/order/addOrder`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "call24-api-key": import.meta.env.VITE_24CALL_API_KEY,
        },
        body: JSON.stringify({
          data: encryptedData,
          userVal: "RUN25",
        }),
      }
    );

    const json = await res.json();

    if (json?.code !== 1) throw new Error(json?.message);

    return { success: true, detail: json };
  } catch (err) {
    return { success: false, detail: err.message };
  }
}
