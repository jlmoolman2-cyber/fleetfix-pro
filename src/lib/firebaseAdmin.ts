import "server-only";

import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { resolveServerFirebaseProject } from "./firebaseEnvironment";

// App Hosting and Cloud Run supply Application Default Credentials through
// the runtime service account. Local server development should use ADC too.
const projectId = resolveServerFirebaseProject(process.env);
const adminApp = getApps()[0] ?? initializeApp({ projectId });

export const adminDb = getFirestore(adminApp);
export const adminAuth = getAuth(adminApp);
export const adminStorage = getStorage(adminApp);
