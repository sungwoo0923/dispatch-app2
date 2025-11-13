// src/firebase.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDaCTK03VbaXQCEKEiD7yp2KIzzX5x64a4",
  authDomain: "dispatch-app-9b92f.firebaseapp.com",
  projectId: "dispatch-app-9b92f",
  
  // ✅ 새 버킷으로 수정!
  storageBucket: "dispatch-app-uploads.appspot.com",

  messagingSenderId: "273115387263",
  appId: "1:273115387263:web:8ae6946cb01e265e55764a",
  measurementId: "G-1NVFMVHQ28"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// ✅ 이제 기본 버킷이 바로 custom bucket이므로 그대로 사용 OK
export const storage = getStorage(app);
