// Compatibility export for older imports. All client initialization lives in
// firebaseClient.ts so there is only one validated Firebase app instance.
export { clientDb as db } from "./firebaseClient";
