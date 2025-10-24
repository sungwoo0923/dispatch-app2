// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// ✅ 실제 프로젝트 Firebase 설정값
const firebaseConfig = {
  apiKey: "AIzaSyDaCTK03VbaXQCEKEiD7yp2KIzzX5x64a4",
  authDomain: "dispatch-app-9b92f.firebaseapp.com",
  projectId: "dispatch-app-9b92f",
  storageBucket: "dispatch-app-9b92f.firebasestorage.app",
  messagingSenderId: "273115387263",
  appId: "1:273115387263:web:46cbe8f482436a1855764a",
  measurementId: "G-P2694JX6E5",
};

// ✅ Firebase 초기화 (한 번만)
const app = initializeApp(firebaseConfig);

// ✅ 서비스 내보내기
export const db = getFirestore(app);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
