import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCLhSpsCxFTGJVUe0455eNusVwp7uA83JU",
  authDomain: "fleetfix-pro.firebaseapp.com",
  projectId: "fleetfix-pro",
  storageBucket: "fleetfix-pro.firebasestorage.app",
  messagingSenderId: "1037791772033",
  appId: "1:1037791772033:web:9c8e14787c695200497c80",
  measurementId: "G-BEH5S6CQ27"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function testFetchJob() {
  const jobId = "job_001";
  const docRef = doc(db, "jobs", jobId);
  try {
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      console.log("Job document data:", docSnap.data());
    } else {
      console.log("No such job document!");
    }
  } catch (error) {
    console.error("Error getting job document:", error);
  }
}

testFetchJob();
