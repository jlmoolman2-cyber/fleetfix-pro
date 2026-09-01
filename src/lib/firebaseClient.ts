import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { resolveFirebasePublicConfig } from "./firebaseEnvironment";

const firebaseConfig = resolveFirebasePublicConfig({
  environment: process.env.NEXT_PUBLIC_FLEETFIX_ENVIRONMENT,
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
});

const app = getApps()[0] ?? initializeApp(firebaseConfig);

export const clientAuth = getAuth(app);
export const clientDb = getFirestore(app);
export const storage = getStorage(app);
