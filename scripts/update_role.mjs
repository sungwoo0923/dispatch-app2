import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, updateDoc, doc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDaCTK03VbaXQCEKEiD7yp2KIzzX5x64a4",
  authDomain: "dispatch-app-9b92f.firebaseapp.com",
  projectId: "dispatch-app-9b92f",
  storageBucket: "dispatch-app-9b92f.firebasestorage.app",
  messagingSenderId: "273115387263",
  appId: "1:273115387263:web:8ae6946cb01e265e55764a",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const TARGET_EMAIL = "tjddnqkf@naver.com";

const q = query(collection(db, "users"), where("email", "==", TARGET_EMAIL));
const snap = await getDocs(q);

if (snap.empty) {
  console.log("User not found:", TARGET_EMAIL);
  process.exit(1);
}

for (const docSnap of snap.docs) {
  const data = docSnap.data();
  console.log("Found user:", docSnap.id, "current role:", data.role, "companyName:", data.companyName);
  await updateDoc(doc(db, "users", docSnap.id), {
    role: "totalMaster",
    companyName: data.companyName || "돌캐",
  });
  console.log("Updated to totalMaster, companyName:", data.companyName || "돌캐");
}

process.exit(0);
