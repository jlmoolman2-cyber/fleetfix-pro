import admin from "firebase-admin";

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}

export const db = admin.firestore();

async function importSampleJob() {
  const jobRef = db.collection("jobs").doc("job_001");

  await jobRef.set({
    jobNumber: "NJ0000001",
    description: "Brake pads replacement",
    statusCode: "Active",
    customerName: "ABC Logistics",
    assignedTo: "tech_123",
    createdAt: admin.firestore.Timestamp.fromDate(new Date("2023-07-03T00:00:00Z")),
    location: {
      addressText: "123 Main St, Cityville",
      name: "Warehouse",
    },
  });

  // Add subcollection: form
  const formRef = jobRef.collection("form").doc("form_001");
  await formRef.set({
    formType: "Safety Inspection",
    completed: true,
  });

  // Add subcollection: photos
  const photoRef = jobRef.collection("photos").doc("photo_001");
  await photoRef.set({
    url: "https://example.com/photo.jpg",
    description: "Brake pads photo",
  });

  // Add subcollection: events
  const eventRef = jobRef.collection("events").doc("event_001");
  await eventRef.set({
    eventType: "Job Assigned",
    timestamp: admin.firestore.Timestamp.fromDate(new Date("2023-07-03T00:00:00Z")),
  });

  console.log("Sample job document and subcollections added successfully.");
}

importSampleJob().catch(console.error);
