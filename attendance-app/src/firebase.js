import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
} from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getStorage, connectStorageEmulator } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Without a .env.local (gitignored, so absent on every fresh clone) these
// import.meta.env values are all undefined; treat that as "no real project
// configured yet" and default to the emulator rather than letting
// getAuth() throw auth/invalid-api-key on an empty key.
export const useEmulator = import.meta.env.VITE_USE_EMULATOR === "true" || !import.meta.env.VITE_FIREBASE_API_KEY;

// The emulators don't validate these against a real project, so local dev
// works even before a real Firebase project's keys are filled in (or before
// .env.local exists at all — it's gitignored, so every fresh clone starts
// without it). Only fall back when running against the emulator; a real
// deploy must still fail loudly if the real keys are missing.
export const app = initializeApp(
  useEmulator
    ? {
        ...firebaseConfig,
        apiKey: firebaseConfig.apiKey || "demo-api-key",
        authDomain: firebaseConfig.authDomain || "localhost",
        projectId: firebaseConfig.projectId || "kp-work-dev",
        appId: firebaseConfig.appId || "demo-app-id",
      }
    : firebaseConfig
);

// persistentSingleTabManager requires exclusive ownership of the IndexedDB
// persistence lease across tabs; a stale/backgrounded tab (very common on
// mobile Safari, which keeps tabs alive rather than closing them) can hold
// that lease forever and leave every other tab's Firestore calls hanging
// indefinitely with no error. persistentMultipleTabManager shares the cache
// across tabs instead, so a new tab's reads/writes never block on another.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export const auth = getAuth(app);
export const storage = getStorage(app);

if (useEmulator) {
  connectFirestoreEmulator(db, "localhost", 8081);
  connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
  connectStorageEmulator(storage, "localhost", 9199);
}
