import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
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

// Previously used initializeFirestore() with a persistent (IndexedDB)
// multi-tab cache to avoid a single-tab-manager lease hang on mobile
// Safari. In practice that persistent cache itself intermittently throws
// "FIRESTORE INTERNAL ASSERTION FAILED: Unexpected state" after backgrounding
// a tab and returning to it (a known firebase-js-sdk issue) — worse than the
// hang it was meant to prevent, and this app has no offline requirement to
// justify the tradeoff. Plain in-memory cache avoids both failure modes.
export const db = getFirestore(app);

export const auth = getAuth(app);
export const storage = getStorage(app);

if (useEmulator) {
  connectFirestoreEmulator(db, "localhost", 8081);
  connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
  connectStorageEmulator(storage, "localhost", 9199);
}
