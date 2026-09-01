"use client";

import Link from "next/link";
import { use } from "react";
import { useEffect, useState } from "react";

import {
  doc,
  getDoc,
  getDocs,
  collection,
  updateDoc,
  setDoc,
  addDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";

import { clientDb } from "@/lib/firebaseClient";
import { getAuth } from "firebase/auth";
import { COMPANY_ID } from "@/lib/company";

import JobStatusSelect from "@/components/jobs/JobStatusSelect";
import { useRouter } from "next/navigation";


interface JobDetailsProps {
  params: Promise<{
    id: string;
  }>;
}

export default function JobDetail({
  params,
}: JobDetailsProps) {


  const router = useRouter();

  const auth = getAuth();

  const currentUser =
    auth.currentUser;

  const [
    statuses,
    setStatuses,
  ] = useState<any[]>([]);

  const { id } = use(params);

  const [job, setJob] =
    useState<any>(null);

  const [customer, setCustomer] =
    useState<any>(null);

  const [saving, setSaving] =
    useState(false);

  const [selectedTechnician, setSelectedTechnician] =
    useState("");

  const [managementOpen, setManagementOpen] =
    useState(false);

  const [customers, setCustomers] =
    useState<any[]>([]);

  const [vehicles, setVehicles] =
    useState<any[]>([]);

  const [locations, setLocations] =
    useState<any[]>([]);

  const [loading, setLoading] = useState(true);

  const [showTechnicianModal, setShowTechnicianModal] = useState(false);

  const [technicians, setTechnicians] =
    useState<any[]>([]);

  const [showCustomerModal, setShowCustomerModal] =
    useState(false);

  const [showVehicleModal, setShowVehicleModal] =
    useState(false);

  const [showLocationModal, setShowLocationModal] =
    useState(false);

  const [selectedFields, setSelectedFields] =
    useState<string[]>([]);

  const [editableLabels, setEditableLabels] =
    useState<Record<string, string>>({});

  const [editableFields, setEditableFields] =
    useState<any>({});

  const [showAttachments, setShowAttachments] =
    useState(false);

  const [showCommunication, setShowCommunication] =
    useState(false);

  const [showSummary, setShowSummary] =
    useState(false);

  const [pendingStatus, setPendingStatus] =
    useState<any>(null);

  const [showStatusModal, setShowStatusModal] =
    useState(false);

  const [statusFormValues, setStatusFormValues] =
    useState<any>({});


  const [attachments, setAttachments] =
    useState<any[]>([]);

  const [communications, setCommunications] =
    useState<any[]>([]);

  const [materials, setMaterials] =
    useState<any[]>([]);

  const [showPartsModal, setShowPartsModal] =
    useState(false);


  const [inventory, setInventory] =
    useState<any[]>([]);

  const [stockLocations, setStockLocations] =
    useState<any[]>([]);


  const [partSearch, setPartSearch] =
    useState("");

  const [jobNotes, setJobNotes] =
    useState<any[]>([]);

  const [jobTasks, setJobTasks] =
    useState<any[]>([]);

  const [linkedItems, setLinkedItems] =
    useState<any[]>([]);


  const [newNote, setNewNote] =
    useState("");

  const [newTask, setNewTask] =
    useState("");

  const [newMaterial, setNewMaterial] =
    useState<any>({});

  useEffect(() => {

    loadJob();

    loadJobCollections();

    loadInventory();

    loadStockLocations();

  }, []);

  useEffect(() => {

    const unsub = onSnapshot(

      collection(
        clientDb,
        "companies",
        COMPANY_ID,
        "jobs",
        id,
        "notes"
      ),

      (snapshot) => {

        setJobNotes(

          snapshot.docs.map(d => ({

            id: d.id,
            ...d.data()

          }))

        );

      }

    );


    return () => unsub();


  }, [id]);

  useEffect(() => {


    const unsub =
      onSnapshot(

        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "statuses"
        ),

        (snapshot) => {


          const list =
            snapshot.docs

              .map((doc) => ({

                id: doc.id,

                ...doc.data(),

              }))


              .filter(
                (status: any) =>
                  status.active !== false
              )


              .sort(
                (a: any, b: any) =>

                  (a.sortOrder || 0)
                  -
                  (b.sortOrder || 0)

              );


          setStatuses(list);


        }

      );




    return () => unsub();


  }, []);

  async function handleStatusTimer(
    status: any
  ) {

    const timersRef =
      collection(
        clientDb,
        "companies",
        COMPANY_ID,
        "jobs",
        job.id,
        "timers"
      );


    // STOP CURRENT RUNNING TIMER

    const runningTimers =
      await getDocs(

        query(
          timersRef,
          where(
            "active",
            "==",
            true
          )

        )

      );


    for (
      const timer of runningTimers.docs
    ) {

      await updateDoc(

        timer.ref,

        {

          endTime:
            serverTimestamp(),

          active: false,

          updatedAt:
            serverTimestamp(),

        }

      );

    }



    // STOP ONLY STATUS

    if (!status.startTimer) {

      return;

    }



    // GET ASSIGNED TECHNICIAN

    let techId =

      job.assignedTechnicianId ||
      job.technicianId ||
      "";


    let techName =

      job.assignedTechnician ||
      job.technician ||
      job.assignedTechnicianName ||
      job.technicianName ||
      "";


    // LOAD USER DIRECTLY

    if (techId) {

      const techSnap =
        await getDoc(

          doc(
            clientDb,
            "companies",
            COMPANY_ID,
            "users",
            techId
          )

        );


      if (techSnap.exists()) {


        const user: any =
          techSnap.data();


        techName =

          user.name ||

          `${user.firstName || ""} ${user.lastName || ""}`.trim();


      }

    }


    // FINAL SAFETY

    if (!techName) {

      techName = "Unassigned";

    }


    // START NEW TIMER

    await addDoc(

      timersRef,

      {

        employeeId:
          techId,


        employeeName:
          techName,


        statusName:
          status.name,


        statusId:
          status.id,


        startTime:
          serverTimestamp(),


        endTime:
          null,


        active:
          true,


        createdAt:
          serverTimestamp(),

      }

    );


  }

  async function requestStatusChange(
    newStatusId: string
  ) {

    const statusConfig =
      statuses.find(
        (s: any) =>
          s.id === newStatusId ||
          s.name === newStatusId
      );


    if (
      statusConfig?.fields &&
      statusConfig.fields.length > 0
    ) {

      setPendingStatus(statusConfig);

      setStatusFormValues(
        job.statusFieldValues || {}
      );

      setShowStatusModal(true);

      return;
    }


    await handleStatusTimer(
      statusConfig
    );


    await updateDoc(

      doc(
        clientDb,
        "companies",
        COMPANY_ID,
        "jobs",
        job.id
      ),

      {

        status:
          statusConfig.name,

        statusId:
          statusConfig.id,

        updatedAt:
          serverTimestamp(),

      }

    );


    setJob({

      ...job,

      status:
        statusConfig.name,

      statusId:
        statusConfig.id,

    });


  }

  async function loadJob() {

    try {

      const jobRef =
        doc(
          clientDb,
          "companies",
          COMPANY_ID,
          "jobs",
          id
        );

      const settingsRef =
        doc(
          clientDb,
          "companies",
          COMPANY_ID,
          "jobcard_settings",
          "Job"
        );


      const [
        jobSnap,
        settingsSnap,
        customerSnap,
        vehicleSnap,
        locationSnap,
        technicianSnap,
      ] = await Promise.all([

        getDoc(jobRef),

        getDoc(settingsRef),

        getDocs(
          collection(
            clientDb,
            "companies",
            COMPANY_ID,
            "customers"
          )
        ),


        getDocs(
          collection(
            clientDb,
            "companies",
            COMPANY_ID,
            "vehicles"
          )
        ),

        getDocs(
          collection(
            clientDb,
            "companies",
            COMPANY_ID,
            "locations"
          )
        ),


        getDocs(
          collection(
            clientDb,
            "companies",
            COMPANY_ID,
            "users"
          )
        ),

      ]);

      if (!jobSnap.exists()) {
        return;
      }

      const data =
        jobSnap.data();

      if (data.customerId) {

        const customerDoc =
          await getDoc(

            doc(
              clientDb,
              "companies",
              COMPANY_ID,
              "customers",
              data.customerId
            )
          );

        if (customerDoc.exists()) {

          setCustomer(
            customerDoc.data()
          );
        }
      }

      setJob({
        id: jobSnap.id,
        ...data,
      });

      setEditableFields(
        data.dynamicFields || {}
      );

      if (settingsSnap.exists()) {

        const settings =
          settingsSnap.data();


        setSelectedFields(
          settings.selectedFields || []
        );


        setEditableLabels(
          settings.editableLabels || {}
        );

      }

      setCustomers(
        customerSnap.docs.map(
          (d) => ({
            id: d.id,
            ...d.data(),
          })
        )
      );

      setVehicles(
        vehicleSnap.docs.map(
          (d) => ({
            id: d.id,
            ...d.data(),
          })
        )
      );

      setLocations(
        locationSnap.docs.map(
          (d) => ({
            id: d.id,
            ...d.data(),
          })
        )
      );

      setTechnicians(
        technicianSnap.docs.map(
          (d) => ({
            id: d.id,
            ...d.data(),
          })
        )
      );

    } catch (err) {

      console.error(err);
    }
  }

  async function loadJobCollections() {


    // MATERIALS

    const materialSnap =
      await getDocs(

        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "jobs",
          id,
          "materials"
        )

      );


    setMaterials(

      materialSnap.docs.map((d) => ({

        id: d.id,

        ...d.data(),

      }))

    );



    // NOTES

    const notesSnap =
      await getDocs(

        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "jobs",
          id,
          "notes"
        )

      );


    setJobNotes(

      notesSnap.docs.map((d) => ({

        id: d.id,

        ...d.data(),

      }))

    );




    // TASKS

    const taskSnap =
      await getDocs(

        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "jobs",
          id,
          "tasks"
        )

      );


    setJobTasks(

      taskSnap.docs.map((d) => ({

        id: d.id,

        ...d.data(),

      }))

    );




    // LINKED ITEMS

    const linkedSnap =
      await getDocs(

        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "jobs",
          id,
          "linkedItems"
        )

      );


    setLinkedItems(

      linkedSnap.docs.map((d) => ({

        id: d.id,

        ...d.data(),

      }))

    );


  }

  async function loadInventory() {


    const snap =
      await getDocs(

        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "inventory"
        )

      );


    setInventory(

      snap.docs.map(d => ({

        id: d.id,
        ...d.data()

      }))

    );

  }

  async function saveJobNote() {

    if (!newNote.trim()) {

      alert("Enter note");

      return;

    }


    await addDoc(

      collection(
        clientDb,
        "companies",
        COMPANY_ID,
        "jobs",
        job.id,
        "notes"
      ),

      {

        comment:
          newNote,


        createdById:
          currentUser?.uid || "",


        createdByName:
          currentUser?.displayName ||
          currentUser?.email ||
          "Unknown User",


        createdAt:
          serverTimestamp()

      }

    );


    setNewNote("");

    await loadJobCollections();


  }

  async function saveJobFields() {

    try {

      setSaving(true);

      await updateDoc(

        doc(
          clientDb,
          "companies",
          COMPANY_ID,
          "jobs",
          job.id
        ),

        {
          description:
            job.description || "",

          dynamicFields:
            editableFields,

          updatedAt:
            serverTimestamp(),
        }
      );

      alert(
        "Job updated successfully"
      );

    } catch (err) {

      console.error(err);

      alert(
        "Failed to save job"
      );

    } finally {

      setSaving(false);
    }
  }

  async function changeCustomer(
    customer: any
  ) {

    try {

      await updateDoc(

        doc(
          clientDb,
          "companies",
          COMPANY_ID,
          "jobs",
          job.id
        ),

        {

          customerId:
            customer.id,

          customerName:
            customer.companyName,

          updatedAt:
            serverTimestamp(),
        }
      );

      setCustomer(customer);

      setJob({
        ...job,

        customerId:
          customer.id,

        customerName:
          customer.companyName,
      });

      setShowCustomerModal(false);

    } catch (err) {

      console.error(err);
    }
  }

  async function closeJob() {

    try {

      await updateDoc(

        doc(
          clientDb,
          "companies",
          COMPANY_ID,
          "jobs",
          job.id
        ),

        {
          status: "closed",

          closedAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),
        }
      );

      setJob({
        ...job,
        status: "closed",
      });

      setManagementOpen(false);

    } catch (err) {

      console.error(err);
    }
  }

  async function cancelJob() {

    try {

      await updateDoc(

        doc(
          clientDb,
          "companies",
          COMPANY_ID,
          "jobs",
          job.id
        ),

        {
          status: "cancelled",

          cancelledAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),
        }
      );

      setJob({
        ...job,
        status: "cancelled",
      });

      setManagementOpen(false);

    } catch (err) {

      console.error(err);
    }
  }

  async function duplicateJob() {

    try {

      const newJobRef =
        doc(
          collection(
            clientDb,
            "companies",
            COMPANY_ID,
            "jobs"
          )
        );

      await setDoc(
        newJobRef,
        {
          ...job,

          jobNumber:
            `${job.jobNumber}-COPY`,

          status:
            "booked",

          createdAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),
        }
      );

      alert(
        "Job duplicated successfully"
      );

    } catch (err) {

      console.error(err);
    }
  }

  async function changeVehicle(
    vehicle: any
  ) {

    try {

      await updateDoc(

        doc(
          clientDb,
          "companies",
          COMPANY_ID,
          "jobs",
          job.id
        ),

        {

          vehicleId:
            vehicle.id,


          vehicleRegNo:
            vehicle.regNo || "",


          vehicleFleetNo:
            vehicle.fleetNo || "",


          vehicleMake:
            vehicle.vehicleMake || "",


          vehicleModel:
            vehicle.vehicleModel || "",


          vehicleType:
            vehicle.vehicleType || "",


          vinNumber:
            vehicle.vinNumber || "",


          driverName:
            vehicle.driverName || "",


          driverContactNo:
            vehicle.driverContactNumber || "",


          updatedAt:
            serverTimestamp(),

        }

      );


      setJob({

        ...job,


        vehicleId:
          vehicle.id,


        vehicleRegNo:
          vehicle.regNo || "",


        vehicleFleetNo:
          vehicle.fleetNo || "",


        vehicleMake:
          vehicle.vehicleMake || "",


        vehicleModel:
          vehicle.vehicleModel || "",


        vehicleType:
          vehicle.vehicleType || "",


        vinNumber:
          vehicle.vinNumber || "",


        driverName:
          vehicle.driverName || "",


        driverContactNo:
          vehicle.driverContactNumber || "",

      });


      setShowVehicleModal(false);


    } catch (err) {

      console.error(err);

    }

  }

  async function changeTechnician(
    tech: any
  ) {

    await updateDoc(

      doc(
        clientDb,
        "companies",
        COMPANY_ID,
        "jobs",
        job.id
      ),

      {
        technicianId: tech.id,

        assignedTechnicianId: tech.id,

        technician:
          `${tech.firstName} ${tech.lastName}`,

        assignedTechnician:
          `${tech.firstName} ${tech.lastName}`,

        updatedAt:
          serverTimestamp(),
      }

    );


    setJob({

      ...job,

      technicianId: tech.id,

      assignedTechnicianId: tech.id,

      technician:
        `${tech.firstName} ${tech.lastName}`,

      assignedTechnician:
        `${tech.firstName} ${tech.lastName}`,

    });


    setShowTechnicianModal(false);
  }

  async function changeLocation(
    location: any
  ) {

    try {

      await updateDoc(

        doc(
          clientDb,
          "companies",
          COMPANY_ID,
          "jobs",
          job.id
        ),

        {
          locationId:
            location.id,

          location:
            location,

          updatedAt:
            serverTimestamp(),
        }
      );

      setJob({
        ...job,
        location,
      });

      setShowLocationModal(false);

    } catch (err) {

      console.error(err);
    }
  }

  async function addInventoryToJob(
    item: any
  ) {


    const qtyUsed = 1;


    const sellPrice =
      Number(
        item.sellPrice || 0
      );


    await addDoc(

      collection(
        clientDb,
        "companies",
        COMPANY_ID,
        "jobs",
        job.id,
        "materials"
      ),

      {

        inventoryId:
          item.id,


        partNumber:
          item.partNumber || "",


        description:
          item.description || "",


        category:
          item.category || "",


        brand:
          item.brand || "",


        qty:
          qtyUsed,


        sellPrice:
          sellPrice,


        total:
          sellPrice * qtyUsed,

        sourceId: "",

        sourceType: "",

        sourceName: "",


        createdById:
          currentUser?.uid || "",


        createdByName:
          currentUser?.displayName ||
          currentUser?.email ||
          "Unknown User",


        createdAt:
          serverTimestamp()

      }

    );



    // REDUCE MASTER STOCK

    await updateDoc(

      doc(
        clientDb,
        "companies",
        COMPANY_ID,
        "inventory",
        item.id
      ),

      {

        grandTotal:

          Number(
            item.grandTotal || 0
          )

          -

          qtyUsed,


        updatedAt:
          serverTimestamp()

      }

    );



    setShowPartsModal(false);


    await loadJobCollections();


    await loadInventory();


  }

  async function updateMaterial(
    materialId: string,
    field: string,
    value: any
  ) {


    const current =
      materials.find(
        m => m.id === materialId
      );


    if (!current) {
      return;
    }


    const updated: any = {

      [field]:
        value,


      updatedAt:
        serverTimestamp()

    };


    // recalculate totals

    const qty =
      field === "qty"
        ?
        Number(value)
        :
        Number(current.qty || 0);


    const price =
      field === "sellPrice"
        ?
        Number(value)
        :
        Number(current.sellPrice || 0);


    updated.total =
      qty * price;



    await updateDoc(

      doc(
        clientDb,
        "companies",
        COMPANY_ID,
        "jobs",
        job.id,
        "materials",
        materialId
      ),

      updated

    );


    loadJobCollections();


  }

  async function loadStockLocations() {


    const locations: any[] = [];


    // LOAD WAREHOUSES

    const warehouseSnap =
      await getDocs(

        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "inventory_settings",
          "setup",
          "warehouses"
        )

      );


    warehouseSnap.docs.forEach((d) => {

      locations.push({

        id: d.id,

        type: "warehouse",

        name:
          d.data().name

      });

    });



    // LOAD RAV VEHICLES

    const ravSnap =
      await getDocs(

        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "inventory_settings",
          "setup",
          "rav"
        )

      );


    ravSnap.docs.forEach((d) => {

      locations.push({

        id: d.id,

        type: "rav",

        name:
          d.data().name

      });

    });


    setStockLocations(
      locations
    );


  }


  if (!job) {

    return (

      <div className="p-10">
        Loading...
      </div>

    );
  }
  const fieldDefinitions: Record<string, any> = {

    customerCode: {
      label: "Customer Code",
      value: customer?.customerCode,
    },

    customerName: {
      label: "Customer Name",
      value: customer?.companyName || job.customerName,
    },

    contactName: {
      label: "Contact Name",
      value: customer?.contactPerson,
    },

    email1: {
      label: "Email",
      value: customer?.contactEmail,
    },

    mobileNumber1: {
      label: "Mobile Number",
      value: customer?.contactNumber,
    },

    address: {
      label: "Address",
      value: customer?.address,
    },


    assignedEmployees: {
      label: "Assigned Technician",
      value: job.assignedTechnician,
    },

    assignedVan: {
      label: "Assigned Van",
      value: job.assignedVan,
    },

    customerAssets: {
      label: "Customer Asset",
      value: job.vehicleRegNo,
    },


    materials: {
      label: "Materials",
      value: job.materials,
    },

    quotes: {
      label: "Quotes",
      value: job.quotes,
    },

    invoices: {
      label: "Invoices",
      value: job.invoices,
    },

    appointments: {
      label: "Appointments",
      value: job.appointments,
    },

    timers: {
      label: "Timers",
      value: job.timers,
    },

    tasks: {
      label: "Tasks",
      value: job.tasks,
    },

    jobSummary: {
      label: "Job Summary",
      value: job.jobSummary,
    },

    internalComments: {
      label: "Internal Comments",
      value: job.internalComments,
    },

  };

  const availableStatusFields = [
    {
      id: "startKm",
      label: "🏪 Start KM Reading",
      type: "number",
    },

    {
      id: "travelledFor",
      label: "🛻 Traveled For? (Description)",
      type: "text",
    },

    {
      id: "photoRef",
      label: "📸 NVTS PHOTO PRO REF NO",
      type: "photo",
    },

    {
      id: "jobSummary",
      label: "Job Summary",
      type: "textarea",
    },

    {
      id: "endKm",
      label: "🏁 End KM Reading",
      type: "number",
    },

    {
      id: "supplier",
      label: "Supplier",
      type: "text",
    },

    {
      id: "referenceNumber",
      label: "Reference Number",
      type: "text",
    },

    {
      id: "previousJobNumber",
      label: "Previous Job Number",
      type: "text",
    },
  ];

  const assignedTechnician =
    technicians.find(
      (user: any) => {

        const fullName =
          `${user.firstName || ""} ${user.lastName || ""}`
            .trim()
            .toLowerCase();


        return (

          user.id === job.assignedTechnicianId ||

          user.id === job.assignedTechnician ||

          user.id === job.technicianId ||

          user.id === job.technician ||

          fullName ===
          String(job.assignedTechnician || "")
            .toLowerCase() ||

          fullName ===
          String(job.technician || "")
            .toLowerCase()

        );

      }
    );

  const statusFields =
    statuses

      // get ALL status fields
      .flatMap(
        (status: any) =>
          status.fields || []
      )


      // remove duplicates
      .filter(
        (
          field: any,
          index: number,
          array: any[]
        ) =>
          index ===
          array.findIndex(
            (f: any) =>
              f.id === field.id
          )
      )


      // repair old saved fields
      .map((field: any) => {

        const master =
          availableStatusFields.find(
            (f) =>
              f.id === field.id
          );


        return {

          ...field,

          label:
            field.label ||
            master?.label ||
            field.id,

          type:
            field.type ||
            master?.type ||
            "text",

        };

      })

      .sort((a: any, b: any) => {

        const order: any = {

          startKm: 1,

          endKm: 2,

        };


        return (

          (order[a.id] || 99)
          -
          (order[b.id] || 99)

        );

      });


  return (

    <div className="min-h-screen bg-[#f5f7fb] p-6">

      <div className="mx-auto max-w-[1700px]">

        {/* HEADER */}
        <div className="overflow-visible rounded-3xl border border-gray-200 bg-white shadow-sm">

          <div className="border-b border-gray-200 px-8 py-6">

            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">

              <div className="flex flex-col gap-4 lg:flex-row lg:items-center">

                <div>

                  <h1 className="text-5xl font-black tracking-tight text-red-600">

                    {job.jobNumber}

                  </h1>

                  <p className="mt-2 text-sm text-gray-500">
                    Breakdown Job Details
                  </p>

                </div>

                <JobStatusSelect

                  jobId={job.id}

                  currentStatus={
                    job.status || "booked"
                  }

                  onChange={
                    requestStatusChange
                  }

                />

              </div>

              <div className="flex flex-wrap items-center gap-3">

                <Link
                  href={`/jobs/${job.id}/form`}
                  className="
                    rounded-xl
                    border
                    border-gray-200
                    bg-white
                    px-4
                    py-2
                    text-sm
                    font-semibold
                    hover:bg-gray-50
                  "
                >
                  📋 Job Form
                </Link>

                <Link
                  href={`/jobs/${job.id}/photos`}
                  className="
                    rounded-xl
                    border
                    border-gray-200
                    bg-white
                    px-4
                    py-2
                    text-sm
                    font-semibold
                    hover:bg-gray-50
                  "
                >
                  📷 Photo Album
                </Link>

                <button
                  onClick={() =>
                    router.push(`/jobs/${job.id}/timers`)
                  }
                  className="
 rounded-xl
 border
 border-gray-200
 bg-white
 px-4
 py-2
 text-sm
 font-semibold
 hover:bg-gray-50
 "
                >
                  ⏱ Timers
                </button>


                <button
                  onClick={() =>
                    router.push(`/jobs/${job.id}/attachments`)
                  }
                  className="
 rounded-xl
 border
 border-gray-200
 bg-white
 px-4
 py-2
 text-sm
 font-semibold
 hover:bg-gray-50
 "
                >
                  📎 Attachments
                </button>


                <button
                  onClick={() => setShowCommunication(true)}
                  className="
 rounded-xl
 border
 border-gray-200
 bg-white
 px-4
 py-2
 text-sm
 font-semibold
 hover:bg-gray-50
 "
                >
                  ✉ Job Communication
                </button>


                <button
                  onClick={() => setShowSummary(true)}
                  className="
 rounded-xl
 border
 border-gray-200
 bg-white
 px-4
 py-2
 text-sm
 font-semibold
 hover:bg-gray-50
 "
                >
                  📊 Job Summary
                </button>

                <div className="relative z-50">

                  <button
                    onClick={() =>
                      setManagementOpen(
                        !managementOpen
                      )
                    }
                    className="
                      rounded-xl
                      border
                      border-gray-300
                      bg-white
                      px-4
                      py-2
                      text-sm
                      font-semibold
                      hover:bg-gray-50
                    "
                  >
                    ⚙ Job Management
                  </button>

                  {managementOpen && (

                    <div
                      className="
      absolute
      right-0
      z-50
      mt-2
      w-80
      overflow-hidden
      rounded-2xl
      border
      border-gray-200
      bg-white
      shadow-2xl
    "
                    >

                      {/* DOCUMENTS */}
                      <div className="border-b border-gray-200 px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-400">

                        Documents

                      </div>

                      <Link
                        href={`/quotes/new?jobId=${job.id}`}
                        className="block px-5 py-3 text-sm hover:bg-gray-50"
                      >
                        Create Quote
                      </Link>

                      <Link
                        href={`/invoices/new?jobId=${job.id}`}
                        className="block px-5 py-3 text-sm hover:bg-gray-50"
                      >
                        Create Invoice
                      </Link>

                      {/* MANAGEMENT */}
                      <div className="border-b border-t border-gray-200 px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-400">

                        Job Management

                      </div>

                      <button
                        onClick={() =>
                          setShowCustomerModal(true)
                        }
                        className="w-full px-5 py-3 text-left text-sm hover:bg-gray-50"
                      >
                        Change Customer
                      </button>

                      <button
                        onClick={() =>
                          setShowVehicleModal(true)
                        }
                        className="w-full px-5 py-3 text-left text-sm hover:bg-gray-50"
                      >
                        Change Vehicle
                      </button>

                      <button
                        onClick={() =>
                          setShowLocationModal(true)
                        }
                        className="w-full px-5 py-3 text-left text-sm hover:bg-gray-50"
                      >
                        Change Location
                      </button>

                      <button
                        onClick={() => setShowTechnicianModal(true)}
                        className="w-full text-left px-4 py-2 hover:bg-gray-100"
                      >
                        Change Technician
                      </button>

                      <button
                        className="w-full px-5 py-3 text-left text-sm hover:bg-gray-50"
                      >
                        Change Priority
                      </button>

                      <button
                        className="w-full px-5 py-3 text-left text-sm hover:bg-gray-50"
                      >
                        Change Job Type
                      </button>

                      {/* ACTIONS */}
                      <div className="border-b border-t border-gray-200 px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-400">

                        Actions

                      </div>

                      <button
                        onClick={duplicateJob}
                        className="
    w-full
    px-5
    py-3
    text-left
    text-sm
    hover:bg-gray-50
  "
                      >
                        Duplicate Job
                      </button>

                      <button
                        onClick={closeJob}
                        className="
    w-full
    px-5
    py-3
    text-left
    text-sm
    text-orange-600
    hover:bg-orange-50
  "
                      >
                        Close Job
                      </button>

                      <button
                        onClick={cancelJob}
                        className="
    w-full
    px-5
    py-3
    text-left
    text-sm
    text-red-600
    hover:bg-red-50
  "
                      >
                        Cancel Job
                      </button>

                    </div>

                  )}

                </div>

              </div>

            </div>

          </div>

        </div>

        {/* BODY */}
        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_380px]">

          {/* LEFT */}
          <div className="space-y-6">

            {/* CUSTOMER */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">

              <h2 className="mb-5 text-xl font-bold text-gray-900">
                Customer Information
              </h2>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 text-sm">

                <div>

                  <div className="mb-1 text-gray-500">
                    Customer / Company Name
                  </div>

                  <div className="font-semibold text-gray-900">

                    {customer?.companyName ||
                      job.customerName ||
                      "-"}

                  </div>

                </div>

                <div>

                  <div className="mb-1 text-gray-500">
                    Contact Person
                  </div>

                  <div className="font-semibold text-gray-900">

                    {customer?.contactPerson ||
                      "-"}

                  </div>

                </div>

                <div>

                  <div className="mb-1 text-gray-500">
                    Contact Number
                  </div>

                  <div className="font-semibold text-gray-900">

                    {customer?.contactNumber ||
                      "-"}

                  </div>

                </div>

                <div>

                  <div className="mb-1 text-gray-500">
                    Contact Email
                  </div>

                  <div className="font-semibold text-gray-900">

                    {customer?.contactEmail ||
                      "-"}

                  </div>

                </div>

              </div>

            </div>

            {/* VEHICLE */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">

              <h2 className="mb-5 text-xl font-bold text-gray-900">
                Vehicle Details
              </h2>


              <div className="
grid
grid-cols-1
gap-6
md:grid-cols-2
text-sm
">


                <div>
                  <div className="mb-1 text-gray-500">
                    Registration Number
                  </div>

                  <div className="font-semibold">
                    {job.vehicleRegNo || "-"}
                  </div>
                </div>


                <div>
                  <div className="mb-1 text-gray-500">
                    Fleet Number
                  </div>

                  <div className="font-semibold">
                    {job.vehicleFleetNo || "-"}
                  </div>
                </div>


                <div>
                  <div className="mb-1 text-gray-500">
                    Vehicle Make
                  </div>

                  <div className="font-semibold">
                    {job.vehicleMake || "-"}
                  </div>
                </div>


                <div>
                  <div className="mb-1 text-gray-500">
                    Vehicle Model
                  </div>

                  <div className="font-semibold">
                    {job.vehicleModel || "-"}
                  </div>
                </div>


                <div>
                  <div className="mb-1 text-gray-500">
                    Vehicle Type
                  </div>

                  <div className="font-semibold">
                    {job.vehicleType || "-"}
                  </div>
                </div>


                <div>
                  <div className="mb-1 text-gray-500">
                    VIN / Chassis
                  </div>

                  <div className="font-semibold">
                    {job.vinNumber || "-"}
                  </div>
                </div>


                <div>
                  <div className="mb-1 text-gray-500">
                    Driver Name
                  </div>

                  <div className="font-semibold">
                    {job.driverName || "-"}
                  </div>
                </div>


                <div>
                  <div className="mb-1 text-gray-500">
                    Driver Contact
                  </div>

                  <div className="font-semibold">
                    {job.driverContactNo || "-"}
                  </div>
                </div>


              </div>

            </div>


            {/* DESCRIPTION */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">

              <h2 className="mb-5 text-xl font-bold text-gray-900">
                Job Description
              </h2>

              <textarea
                value={job.description || ""}
                onChange={(e) =>
                  setJob({
                    ...job,
                    description:
                      e.target.value,
                  })
                }
                className="
                  min-h-[180px]
                  w-full
                  rounded-2xl
                  border
                  border-gray-300
                  bg-white
                  px-5
                  py-4
                  text-sm
                  outline-none
                  focus:border-blue-500
                "
                placeholder="Enter job description..."
              />

            </div>


            {/* ADDITIONAL INFORMATION */}
            <div className="bg-white rounded-xl border p-6 mt-5">

              <h2 className="text-lg font-bold mb-5">
                Additional Information
              </h2>


              <div className="grid grid-cols-2 gap-5">


                {/* LOCKED START KM */}
                <div>

                  <label className="text-sm font-semibold text-gray-700">
                    🏪 Start KM Reading
                  </label>

                  <input
                    type="number"

                    value={
                      job.statusFieldValues?.startKm || ""
                    }

                    onChange={(e) =>
                      setJob({
                        ...job,
                        statusFieldValues: {
                          ...(job.statusFieldValues || {}),
                          startKm: e.target.value,
                        },
                      })
                    }

                    className="
        mt-2
        w-full
        border
        rounded-lg
        px-3
        py-2
        "
                  />

                </div>



                {/* LOCKED END KM */}
                <div>

                  <label className="text-sm font-semibold text-gray-700">
                    🏁 End KM Reading
                  </label>

                  <input
                    type="number"

                    value={
                      job.statusFieldValues?.endKm || ""
                    }

                    onChange={(e) =>
                      setJob({
                        ...job,
                        statusFieldValues: {
                          ...(job.statusFieldValues || {}),
                          endKm: e.target.value,
                        },
                      })
                    }

                    className="
        mt-2
        w-full
        border
        rounded-lg
        px-3
        py-2
        "
                  />

                </div>



                {/* ADMIN JOBCARD FIELDS */}
                {selectedFields

                  .filter(
                    (fieldId) =>
                      fieldId !== "startKm" &&
                      fieldId !== "endKm"
                  )

                  .map((fieldId: string) => (


                    <div key={fieldId}>


                      <label className="text-sm font-semibold text-gray-700">

                        {
                          editableLabels[fieldId] ||
                          fieldId
                        }

                      </label>


                      <input

                        value={
                          editableFields[fieldId] || ""
                        }

                        onChange={(e) =>

                          setEditableFields({

                            ...editableFields,

                            [fieldId]:
                              e.target.value,

                          })

                        }

                        className="
          mt-2
          w-full
          border
          rounded-lg
          px-3
          py-2
          "

                      />

                    </div>


                  ))}




                {/* STATUS FIELDS */}
                {statusFields

                  .filter(
                    (field: any) =>
                      field.id !== "startKm" &&
                      field.id !== "endKm"
                  )

                  .map((field: any) => (


                    <div key={field.id}>


                      <label className="text-sm font-semibold text-gray-700">

                        {field.label}

                        {field.required && (

                          <span className="text-red-500 ml-1">
                            *
                          </span>

                        )}

                      </label>


                      <input

                        type={field.type || "text"}

                        value={
                          job.statusFieldValues?.[field.id] || ""
                        }


                        onChange={(e) =>

                          setJob({

                            ...job,

                            statusFieldValues: {

                              ...(job.statusFieldValues || {}),

                              [field.id]:
                                e.target.value,

                            },

                          })

                        }


                        className="
          mt-2
          w-full
          border
          rounded-lg
          px-3
          py-2
          "

                      />


                    </div>


                  ))}


              </div>


            </div>

            {/* INVENTORY PARTS & SERVICES */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">

              <h2 className="text-xl font-bold mb-5">
                📦 Inventory (Parts & Services)
              </h2>


              <table className="w-full text-sm">

                <thead>

                  <tr className="border-b text-left text-gray-500">

                    <th>Part Number</th>

                    <th>Description</th>

                    <th>Qty</th>

                    <th>Sell Price</th>

                    <th>Total</th>

                    <th>Used From</th>

                  </tr>

                </thead>


                <tbody>

                  {materials.map(
                    (item: any) => (

                      <tr
                        key={item.id}
                        className="border-b"
                      >


                        {/* PART NUMBER */}
                        <td className="py-2">

                          {item.partNumber}

                        </td>



                        {/* DESCRIPTION */}
                        <td>

                          {item.description}

                        </td>



                        {/* QTY EDITABLE */}
                        <td>

                          <input

                            type="number"

                            value={
                              item.qty || 0
                            }

                            onChange={(e) =>

                              updateMaterial(
                                item.id,
                                "qty",
                                Number(e.target.value)
                              )

                            }

                            className="
w-20
border
rounded
p-1
"

                          />

                        </td>



                        {/* SELL PRICE EDITABLE */}
                        <td>

                          <input

                            type="number"

                            value={
                              item.sellPrice || 0
                            }

                            onChange={(e) =>

                              updateMaterial(
                                item.id,
                                "sellPrice",
                                Number(e.target.value)
                              )

                            }

                            className="
w-28
border
rounded
p-1
"

                          />

                        </td>



                        {/* TOTAL */}
                        <td>

                          R {

                            Number(
                              item.total || 0
                            )
                              .toFixed(2)

                          }

                        </td>



                        {/* USED FROM */}
                        <td>

                          <select

                            value={
                              item.sourceId || ""
                            }

                            onChange={(e) => {


                              const selected =
                                stockLocations.find(
                                  x => x.id === e.target.value
                                );


                              updateMaterial(
                                item.id,
                                "sourceId",
                                selected.id
                              );


                              updateMaterial(
                                item.id,
                                "sourceName",
                                selected.name
                              );


                              updateMaterial(
                                item.id,
                                "sourceType",
                                selected.type
                              );


                            }}

                            className="
border
rounded
p-1
"

                          >


                            <option value="">
                              Select Location
                            </option>


                            {stockLocations.map(
                              (location: any) => (


                                <option
                                  key={location.id}
                                  value={location.id}
                                >

                                  {location.type === "rav"
                                    ? "🚚 "
                                    : "🏪 "
                                  }

                                  {location.name}


                                </option>


                              )

                            )}


                          </select>


                        </td>


                      </tr>

                    )

                  )}

                </tbody>


              </table>


              <button

                onClick={() =>
                  setShowPartsModal(true)
                }

                className="
mt-5
rounded-xl
border
px-4
py-2
font-semibold
"

              >

                + Add Item

              </button>


            </div>

            {/* JOB NOTES */}
            <div className="rounded-2xl border bg-white p-6 shadow-sm">


              <h2 className="text-xl font-bold mb-5">
                💬 Job Notes / Comments
              </h2>


              <textarea

                value={newNote}

                onChange={(e) =>
                  setNewNote(e.target.value)
                }

                placeholder="Enter Job Note..."

                className="
w-full
border
rounded-xl
p-4
min-h-[120px]
"

              />


              <button

                onClick={saveJobNote}

                className="
mt-3
bg-blue-600
text-white
rounded-xl
px-5
py-2
font-bold
"
              >

                💾 Save Note

              </button>



              <div className="mt-6 space-y-3">


                {jobNotes.map(note => (


                  <div
                    key={note.id}
                    className="rounded-xl bg-gray-50 p-4"
                  >


                    <div className="text-sm font-bold">

                      {note.createdByName}

                    </div>


                    <div>

                      {note.comment}

                    </div>


                    <div className="text-xs text-gray-400">

                      {
                        note.createdAt
                          ?.toDate()
                          ?.toLocaleString()
                      }

                    </div>


                  </div>


                ))}


              </div>


            </div>

            {/* JOB TASKS */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">


              <h2 className="text-xl font-bold mb-5">

                ✅ Job Tasks

              </h2>


              {jobTasks.map(
                (task: any, index: number) => (


                  <div
                    key={index}
                    className="
flex
justify-between
border-b
py-3
"
                  >


                    <div>

                      <div className="font-bold">

                        {task.name}

                      </div>


                      <div className="text-xs text-gray-500">

                        Assigned: {task.assignedTo}

                      </div>


                    </div>


                    <div>

                      {task.completed ? "✅ Done" : "⏳ Pending"}

                    </div>


                  </div>


                ))}


              <button

                onClick={() =>
                  router.push(`/jobs/${job.id}/tasks`)
                }

                className="
mt-5
rounded-xl
border
px-4
py-2
font-semibold
hover:bg-gray-50
"

              >

                + Add Task

              </button>


            </div>

          </div>

          {/* RIGHT */}
          <div className="space-y-6">


            {/* BREAKDOWN LOCATION */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">

              <h2 className="mb-5 text-xl font-bold text-gray-900">
                Breakdown Location
              </h2>


              {typeof job.location === "string" ? (

                <div className="text-sm font-semibold text-gray-900">
                  {job.location}
                </div>

              ) : (

                <div className="space-y-4 text-sm">

                  <div>

                    <div className="mb-1 text-gray-500">
                      Site
                    </div>

                    <div className="font-semibold text-gray-900">
                      {job.location?.name || "-"}
                    </div>

                  </div>


                  <div>

                    <div className="mb-1 text-gray-500">
                      Address
                    </div>

                    <div className="text-gray-700">
                      {job.location?.addressText || "-"}
                    </div>

                  </div>

                </div>

              )}

            </div>



            {/* TECHNICIAN */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">

              <h2 className="mb-5 text-xl font-bold text-gray-900">
                Assigned Technician
              </h2>

              {assignedTechnician ? (

                <div className="flex items-center gap-3">

                  {/* COLOUR ICON */}
                  <div
                    className="
          flex
          h-12
          w-12
          items-center
          justify-center
          rounded-full
          text-sm
          font-black
          text-white
          uppercase
        "

                    style={{
                      backgroundColor:
                        assignedTechnician.colour ||
                        assignedTechnician.color ||
                        assignedTechnician.userColor ||
                        "#2563eb",
                    }}
                  >

                    {
                      `${(
                        assignedTechnician.firstName ||
                        assignedTechnician.name ||
                        ""
                      ).charAt(0)}
  ${(
                        assignedTechnician.surname ||
                        assignedTechnician.lastName ||
                        ""
                      ).charAt(0)}`
                    }

                  </div>


                  {/* NAME + ROLE */}
                  <div>

                    <div className="font-bold text-gray-900">

                      {
                        `${assignedTechnician.firstName || ""}
   ${assignedTechnician.surname ||
                          assignedTechnician.lastName ||
                          ""
                          }`
                          .trim()
                      }

                    </div>


                    <div className="text-xs text-gray-500">

                      {
                        assignedTechnician.primaryRole ||
                        assignedTechnician.role ||
                        "-"
                      }

                    </div>

                  </div>

                </div>

              ) : (

                <div className="text-sm text-gray-400">
                  No Technician Assigned
                </div>

              )}

            </div>

            {/* LINKED ITEMS */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">


              <h2 className="text-xl font-bold mb-5">

                🔗 Linked Items

              </h2>


              <div className="space-y-3">


                <div className="rounded-xl border p-3">

                  📄 Quotes

                  <span className="float-right">

                    {job.quotes?.length || 0}

                  </span>

                </div>



                <div className="rounded-xl border p-3">

                  🛒 Purchase Orders

                  <span className="float-right">

                    {job.purchaseOrders?.length || 0}

                  </span>

                </div>



                <div className="rounded-xl border p-3">

                  🧾 Invoices

                  <span className="float-right">

                    {job.invoices?.length || 0}

                  </span>

                </div>


              </div>


            </div>

            {/* JOB COST SUMMARY */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">


              <h2 className="text-xl font-bold mb-5">

                💰 Job Summary / Costing

              </h2>


              <div className="space-y-3 text-sm">


                <div>
                  Parts Total:
                  R {job.partsTotal || 0}
                </div>


                <div>
                  Labour:
                  R {job.labourTotal || 0}
                </div>


                <div>
                  Travel:
                  R {job.travelTotal || 0}
                </div>


                <hr />


                <div className="font-black">

                  Total:
                  R {job.total || 0}

                </div>


              </div>


            </div>

          </div>
          {/* END RIGHT */}


        </div>
        {/* END BODY GRID */}


      </div>
      {/* END MAIN CONTAINER */}


      {/* CUSTOMER MODAL */}
      {
        showCustomerModal && (

          <div
            className="
            fixed
            inset-0
            z-[100]
            flex
            items-center
            justify-center
            bg-black/50
          "
          >

            <div
              className="
              w-full
              max-w-2xl
              rounded-3xl
              bg-white
              p-6
            "
            >

              <div className="mb-5 flex items-center justify-between">

                <h2 className="text-2xl font-black">
                  Select Customer
                </h2>

                <button
                  onClick={() =>
                    setShowCustomerModal(false)
                  }
                >
                  ✕
                </button>

              </div>

              <div className="max-h-[500px] overflow-y-auto">

                {customers.map((customer) => (

                  <button
                    key={customer.id}
                    onClick={() =>
                      changeCustomer(customer)
                    }
                    className="
                    mb-3
                    w-full
                    rounded-2xl
                    border
                    border-gray-200
                    p-5
                    text-left
                    hover:bg-gray-50
                  "
                  >

                    <div className="font-bold">
                      {customer.companyName}
                    </div>

                    <div className="text-sm text-gray-500">
                      {customer.contactPerson}
                    </div>

                  </button>

                ))}

              </div>

            </div>

          </div>

        )
      }

      {/* VEHICLE MODAL */}
      {
        showVehicleModal && (

          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">

            <div className="w-full max-w-2xl rounded-3xl bg-white p-6">

              <div className="mb-5 flex items-center justify-between">

                <h2 className="text-2xl font-black">
                  Select Vehicle
                </h2>

                <button
                  onClick={() =>
                    setShowVehicleModal(false)
                  }
                >
                  ✕
                </button>

              </div>

              <div className="max-h-[500px] overflow-y-auto">

                {vehicles.map((vehicle) => (

                  <button
                    key={vehicle.id}
                    onClick={() =>
                      changeVehicle(vehicle)
                    }
                    className="mb-3 w-full rounded-2xl border border-gray-200 p-5 text-left hover:bg-gray-50"
                  >

                    <div className="font-bold">
                      {vehicle.vehicleReg}
                    </div>

                    <div className="text-sm text-gray-500">
                      {vehicle.fleetNo}
                    </div>

                  </button>

                ))}

              </div>

            </div>

          </div>

        )
      }

      {/* TECHNICIAN MODAL */}
      {
        showTechnicianModal && (

          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">

            <div className="bg-white rounded-3xl p-6 w-[500px]">

              <h2 className="text-2xl font-black mb-5">
                Select Technician
              </h2>


              {technicians.map((tech: any) => (

                <button
                  key={tech.id}
                  onClick={() => changeTechnician(tech)}
                  className="
w-full
flex
items-center
gap-3
p-3
rounded-xl
hover:bg-gray-100
"
                >

                  <div
                    className="
w-12
h-12
rounded-full
text-white
font-black
flex
items-center
justify-center
"
                    style={{
                      backgroundColor:
                        tech.colour ||
                        tech.color ||
                        "#2563eb"
                    }}
                  >

                    {tech.firstName?.charAt(0)}
                    {tech.lastName?.charAt(0)}

                  </div>


                  <div className="text-left">

                    <div className="font-bold">

                      {tech.firstName} {tech.lastName}

                    </div>

                    <div className="text-xs text-gray-500">

                      {tech.primaryRole || tech.role}

                    </div>

                  </div>


                </button>

              ))}


              <button
                onClick={() => setShowTechnicianModal(false)}
                className="mt-5 border rounded-xl p-3 w-full"
              >
                Cancel
              </button>


            </div>

          </div>

        )
      }

      {/* LOCATION MODAL */}
      {
        showLocationModal && (

          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">

            <div className="w-full max-w-2xl rounded-3xl bg-white p-6">

              <div className="mb-5 flex items-center justify-between">

                <h2 className="text-2xl font-black">
                  Select Location
                </h2>

                <button
                  onClick={() =>
                    setShowLocationModal(false)
                  }
                >
                  ✕
                </button>

              </div>

              <div className="max-h-[500px] overflow-y-auto">

                {locations.map((location) => (

                  <button
                    key={location.id}
                    onClick={() =>
                      changeLocation(location)
                    }
                    className="mb-3 w-full rounded-2xl border border-gray-200 p-5 text-left hover:bg-gray-50"
                  >

                    <div className="font-bold">
                      {location.name}
                    </div>

                    <div className="text-sm text-gray-500">
                      {location.addressText}
                    </div>

                  </button>

                ))}

              </div>

            </div>

          </div>

        )
      }
      {
        showStatusModal && pendingStatus && (

          <div className="
fixed
inset-0
z-[200]
flex
items-center
justify-center
bg-black/50
">

            <div className="
bg-white
rounded-3xl
p-6
w-[500px]
">

              <h2 className="text-2xl font-black mb-5">

                {pendingStatus.name}

              </h2>


              {pendingStatus.fields.map(
                (field: any) => {

                  const master =
                    availableStatusFields.find(
                      (f) =>
                        f.id === field.id
                    );


                  const fixedField = {

                    ...field,

                    label:
                      field.label ||
                      master?.label ||
                      field.id,


                    type:
                      field.type ||
                      master?.type ||
                      "text"

                  };


                  return (

                    <div
                      key={fixedField.id}
                      className="mb-4"
                    >

                      <label className="font-semibold">

                        {fixedField.label}

                        {fixedField.required && (
                          <span className="text-red-500">
                            *
                          </span>
                        )}

                      </label>


                      <input

                        type={fixedField.type}

                        value={
                          statusFormValues[fixedField.id] || ""
                        }

                        onChange={(e) =>

                          setStatusFormValues({

                            ...statusFormValues,

                            [fixedField.id]:
                              e.target.value

                          })

                        }

                        className="
mt-2
w-full
border
rounded-xl
p-3
"

                      />

                    </div>

                  );

                }
              )}

              <button

                onClick={async () => {


                  const missing =
                    pendingStatus.fields.find(
                      (f: any) =>
                        f.required &&
                        !statusFormValues[f.id]
                    );


                  if (missing) {

                    alert(
                      `${missing.label} is required`
                    );

                    return;

                  }

                  await handleStatusTimer(
                    pendingStatus
                  );

                  const updateData: any = {

                    status:
                      pendingStatus.name,

                    statusId:
                      pendingStatus.id,

                    statusFieldValues:
                      statusFormValues,

                    updatedAt:
                      serverTimestamp(),

                  };


                  await updateDoc(

                    doc(
                      clientDb,
                      "companies",
                      COMPANY_ID,
                      "jobs",
                      job.id
                    ),

                    updateData

                  );


                  setJob({

                    ...job,

                    status:
                      pendingStatus.name,

                    statusId:
                      pendingStatus.id,

                    statusFieldValues:
                      statusFormValues,

                  });


                  setShowStatusModal(false);

                  setPendingStatus(null);


                }}

                className="
w-full
bg-blue-600
text-white
rounded-xl
p-3
font-bold
"

              >

                Complete Status Change

              </button>


              <button

                onClick={() =>
                  setShowStatusModal(false)
                }

                className="
mt-3
w-full
border
rounded-xl
p-3
"

              >

                Cancel

              </button>


            </div>

          </div>

        )
      }

      {/* PARTS MODAL */}
      {
        showPartsModal && (

          <div className="
fixed inset-0
bg-black/50
z-[200]
flex
items-center
justify-center
">


            <div className="
bg-white
rounded-3xl
p-6
w-[900px]
">


              <h2 className="text-2xl font-black mb-5">

                📦 Select Inventory Item

              </h2>


              <input

                placeholder="Search code or description..."

                value={partSearch}

                onChange={(e) =>
                  setPartSearch(e.target.value)
                }

                className="
border
rounded-xl
p-3
w-full
mb-5
"

              />



              {inventory

                .filter((item: any) =>

                  item.description
                    ?.toLowerCase()
                    .includes(
                      partSearch.toLowerCase()
                    )

                  ||

                  item.partNumber
                    ?.toLowerCase()
                    .includes(
                      partSearch.toLowerCase()
                    )

                )

                .map((item: any) => (


                  <button

                    key={item.id}

                    onClick={() =>
                      addInventoryToJob(item)
                    }

                    className="
w-full
border
rounded-xl
p-4
mb-2
text-left
hover:bg-gray-50
"

                  >


                    <div className="font-bold">

                      {item.itemCode}
                      -
                      {item.description}

                    </div>


                    <div className="text-sm text-gray-500">

                      Stock:
                      {item.stockQty}

                      &nbsp;

                      Price:
                      R {item.sellPrice}

                    </div>


                  </button>


                ))}


              <button

                onClick={() =>
                  setShowPartsModal(false)
                }

                className="
mt-5
border
rounded-xl
p-3
w-full
"

              >

                Cancel

              </button>


            </div>

          </div>

        )
      }

    </div >


  );
}