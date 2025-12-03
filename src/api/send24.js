import CryptoJS from "crypto-js";

const AUTH_KEY = process.env.VITE_24CALL_AUTH_KEY;
const BASE_URL = process.env.VITE_24CALL_BASE_URL;
const ENC_KEY = CryptoJS.enc.Hex.parse(process.env.VITE_24CALL_ENCRYPT_KEY);
const IV = CryptoJS.enc.Hex.parse(process.env.VITE_24CALL_IV);

const encryptAES = (str) => {
  const encrypted = CryptoJS.AES.encrypt(str, ENC_KEY, {
    iv: IV,
    padding: CryptoJS.pad.Pkcs7,
    mode: CryptoJS.mode.CBC,
  });
  return encrypted.toString();
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const row = req.body;
    const encrypted = encryptAES(JSON.stringify(row));

    const apiRes = await fetch(`${BASE_URL}/Order/OrderSet.do`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authKey: AUTH_KEY,
      },
      body: JSON.stringify({ data: encrypted }),
    });

    const data = await apiRes.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.toString() });
  }
}
