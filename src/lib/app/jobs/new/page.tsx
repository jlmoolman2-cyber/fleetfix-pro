"use client";

import Link from "next/link";

import {
  useEffect,
  useState,
} from "react";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";

import {
  clientDb,
} from "@/lib/firebaseClient";

import {
  COMPANY_ID,
} from "@/lib/company";

interface Customer {
  id: string;
  companyName?: string;
  customerCode?: string;
  primaryContactName?: string;
  primaryContactNumber?: string;
  primaryContactEmail?: string;
}

interface Vehicle {
  id: string;
  regNo?: string;
  fleetNo?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleType?: string;
  vinNumber?: string;
  driverName?: string;
  driverContactNumber?: string;
}

interface Technician {

  id: string;

  name?: string;

  role?: string;

  email?: string;

  mobile?: string;

  active?: boolean;

}

interface JobType {
  id: string;
  name?: string;
}

export default function AddJobPage() {

  const [saving, setSaving] =
    useState(false);

  const [customers, setCustomers] =
    useState<Customer[]>([]);

  const [contacts, setContacts] =
    useState<any[]>([]);

  const [vehicles, setVehicles] =
    useState<Vehicle[]>([]);

  const [technicians, setTechnicians] =
    useState<Technician[]>([]);

  const [jobLocations, setJobLocations] =
    useState<any[]>([]);

  const [jobTypes, setJobTypes] =
    useState<JobType[]>([]);

  const [vehicleMakes, setVehicleMakes] =
    useState<any[]>([]);


  const [vehicleTypes, setVehicleTypes] =
    useState<any[]>([]);


  const [
    showMakeResults,
    setShowMakeResults,
  ] = useState(false);


  const [
    showTypeResults,
    setShowTypeResults,
  ] = useState(false);

  const [jobCardFields, setJobCardFields] =
    useState<string[]>([]);

  const [
    showCustomerResults,
    setShowCustomerResults,
  ] = useState(false);

  const [
    showJobTypeResults,
    setShowJobTypeResults,
  ] = useState(false);

  const [
    showVehicleResults,
    setShowVehicleResults,
  ] = useState(false);


  const [
    showLocationResults,
    setShowLocationResults,
  ] = useState(false);

  const [
    showTechnicianResults,
    setShowTechnicianResults,
  ] = useState(false);

  const [
    showAddLocation,
    setShowAddLocation,
  ] = useState(false);

  const [
    statusFields,
    setStatusFields
  ] = useState<any[]>([]);


  const [
    newLocation,
    setNewLocation,
  ] = useState<any>({

    name: "",
    city: "",
    address: "",
    province: "",
    country: "",
    latitude: "",
    longitude: "",
    googleMaps: "",
    notes: "",

  });

  const [
    showContactResults,
    setShowContactResults,
  ] = useState(false);

  const [form, setForm] =
    useState<any>({

      status: "booked",

      customerId: "",
      customerName: "",
      customerContact: "",

      customerContactNumber: "",

      customerContactEmail: "",

      vehicleId: "",
      vehicleRegNo: "",
      vehicleFleetNo: "",
      vehicleMake: "",
      vehicleModel: "",
      vehicleType: "",
      vinNumber: "",

      driverName: "",
      driverContactNo: "",

      location: "",

      jobType: "",
      complaint: "",

      assignedTo: "",

      assignedUserId: "",
    });

  useEffect(() => {

    loadJobCardFields();

  }, []);

  useEffect(() => {

    loadStartStatusFields();

  }, []);

  async function loadJobCardFields() {

    try {

      const ref =
        doc(
          clientDb,
          "companies",
          COMPANY_ID,
          "jobcard_settings",
          "Job"
        );

      const snap =
        await getDoc(ref);

      if (snap.exists()) {

        const data =
          snap.data();

        setJobCardFields(
          data.selectedFields || []
        );
      }

    } catch (err) {

      console.error(err);
    }
  }

  async function loadStartStatusFields() {

    const statusQuery = query(

      collection(
        clientDb,
        "companies",
        COMPANY_ID,
        "statuses"
      ),

      where(
        "startStatus",
        "==",
        true
      )
    );


    const snap =
      await getDocs(statusQuery);


    if (!snap.empty) {

      const statusDoc =
        snap.docs[0];

      const data =
        statusDoc.data();


      setForm((prev: any) => ({

        ...prev,

        status:
          data.name,

        statusId:
          statusDoc.id,

      }));


      setStatusFields(
        data.fields || []
      );

    }

  }

  useEffect(() => {


    const unsubCustomers =
      onSnapshot(

        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "customers"
        ),

        (snapshot) => {

          setCustomers(

            snapshot.docs.map(
              (doc) => ({

                id: doc.id,
                ...(doc.data() as any),

              })
            )

          );

        }

      );



    const unsubTechs =
      onSnapshot(


        collection(
          clientDb,
          "users"
        ),

        (snapshot) => {

          setTechnicians(

            snapshot.docs

              .map((doc) => ({

                id: doc.id,

                ...(doc.data() as any),

              }))

              .filter(
                (user: any) =>
                  user.active !== false
              )

          );

        }

      );

    async function loadAllContacts() {

      try {

        const allContacts: any[] = [];

        const customerSnapshot =
          await getDocs(

            collection(
              clientDb,
              "companies",
              COMPANY_ID,
              "customers"
            )
          );

        for (const customerDoc of customerSnapshot.docs) {

          const contactsSnapshot =
            await getDocs(

              collection(
                clientDb,
                "companies",
                COMPANY_ID,
                "customers",
                customerDoc.id,
                "contacts"
              )
            );

          contactsSnapshot.forEach((contactDoc) => {

            allContacts.push({

              id:
                contactDoc.id,

              customerId:
                customerDoc.id,

              customerName:
                customerDoc.data()
                  ?.companyName || "",

              ...contactDoc.data(),
            });

          });

        }

        setContacts(allContacts);

      } catch (err) {

        console.error(
          "Failed loading contacts",
          err
        );

      }

    }

    loadAllContacts();

    const unsubLocations =
      onSnapshot(

        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "job_locations"
        ),

        (snapshot) => {

          setJobLocations(

            snapshot.docs.map(
              (doc) => ({
                id: doc.id,
                ...(doc.data() as any),
              })
            )
          );
        }
      );

    const unsubJobTypes =
      onSnapshot(

        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "jobTypes"
        ),

        (snapshot) => {

          setJobTypes(

            snapshot.docs.map(
              (doc) => ({
                id: doc.id,
                ...(doc.data() as any),
              })
            )
          );
        }
      );


    const unsubMakes =
      onSnapshot(

        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "vehicle_makes"
        ),

        (snapshot) => {

          setVehicleMakes(

            snapshot.docs.map(doc => ({

              id: doc.id,
              ...doc.data()

            }))

          );

        }

      );



    const unsubTypes =
      onSnapshot(

        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "vehicle_types"
        ),

        (snapshot) => {

          setVehicleTypes(

            snapshot.docs.map(doc => ({

              id: doc.id,
              ...doc.data()

            }))

          );

        }

      );

    return () => {

      unsubCustomers();
      unsubLocations();
      unsubJobTypes();
      unsubTechs();
      unsubMakes();
      unsubTypes();

    };

  }, []);

  useEffect(() => {

    if (!form.customerId) {

      setVehicles([]);

      return;
    }

    const unsubVehicles =
      onSnapshot(

        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "customers",
          form.customerId,
          "fleet"
        ),

        (snapshot) => {

          setVehicles(

            snapshot.docs.map(
              (doc) => ({
                id: doc.id,
                ...(doc.data() as any),
              })
            )
          );
        }
      );

    return () =>
      unsubVehicles();

  }, [form.customerId]);

  async function addNewLocation() {


    if (!newLocation.name) {

      alert(
        "Location name required"
      );

      return;

    }


    await addDoc(

      collection(
        clientDb,
        "companies",
        COMPANY_ID,
        "job_locations"
      ),

      {

        ...newLocation,

        createdAt:
          serverTimestamp(),

      }

    );


    setForm({

      ...form,

      location:
        newLocation.name,

    });


    setNewLocation({

      name: "",
      city: "",
      address: "",
      province: "",
      country: "",
      latitude: "",
      longitude: "",
      googleMaps: "",
      notes: "",

    });


    setShowAddLocation(false);

  }

  async function createJob() {

    try {

      setSaving(true);

      if (!form.customerId) {
        alert("Customer required");
        setSaving(false);
        return;
      }


      if (!form.customerContact) {
        alert("Customer contact required");
        setSaving(false);
        return;
      }


      if (!form.location) {
        alert("Job location required");
        setSaving(false);
        return;
      }


      if (!form.jobType) {
        alert("Job type required");
        setSaving(false);
        return;
      }


      if (!form.complaint) {
        alert("Job description required");
        setSaving(false);
        return;
      }


      if (!form.assignedTo) {
        alert("Assigned technician required");
        setSaving(false);
        return;
      }


      for (const fieldId of jobCardFields) {

        if (!form[fieldId]) {

          alert(
            `${fieldId} is required`
          );

          setSaving(false);

          return;
        }

      }

      for (const field of statusFields) {


        if (
          field.required &&
          !form[field.id]
        ) {

          alert(
            field.name + " required"
          );

          setSaving(false);

          return;
        }

      }

      const activeJobQuery =
        query(

          collection(
            clientDb,
            "companies",
            COMPANY_ID,
            "jobs"
          ),

          where(
            "vehicleRegNo",
            "==",
            form.vehicleRegNo
          ),

          where(
            "status",
            "==",
            "booked"
          )
        );

      const activeJobSnap =
        await getDocs(
          activeJobQuery
        );

      if (!activeJobSnap.empty) {

        const proceed =
          confirm(
            "Vehicle already has active booked job. Continue?"
          );

        if (!proceed) {

          setSaving(false);

          return;
        }
      }

      const jobNumber =

        "NJ" +

        Date.now()
          .toString()
          .slice(-6);

      // AUTO ADD VEHICLE TO CUSTOMER FLEET
      if (
        form.customerId &&
        form.vehicleRegNo
      ) {

        const fleetRef =
          collection(
            clientDb,
            "companies",
            COMPANY_ID,
            "customers",
            form.customerId,
            "fleet"
          );


        const fleetSnapshot =
          await getDocs(
            fleetRef
          );


        const existingVehicle =
          fleetSnapshot.docs.find(
            (doc) => {

              const data =
                doc.data();

              return (
                data.regNo
                  ?.toLowerCase()
                  .trim()
                ===
                form.vehicleRegNo
                  ?.toLowerCase()
                  .trim()
              );

            }
          );


        if (!existingVehicle) {

          await addDoc(
            fleetRef,
            {

              regNo:
                form.vehicleRegNo,

              fleetNo:
                form.vehicleFleetNo,

              vehicleMake:
                form.vehicleMake,

              vehicleModel:
                form.vehicleModel,

              vehicleType:
                form.vehicleType,

              vinNumber:
                form.vinNumber,

              driverName:
                form.driverName,

              driverContactNumber:
                form.driverContactNo,

              createdAt:
                serverTimestamp(),

            }
          );

        }

      }

      await addDoc(

        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "jobs"
        ),

        {

          jobNumber,

          status:
            form.status,

          statusId:
            form.statusId,

          customerId:
            form.customerId,

          customerName:
            form.customerName,

          customerContact:
            form.customerContact,

          customerContactNumber:
            form.customerContactNumber,

          customerContactEmail:
            form.customerContactEmail,

          vehicleId:
            form.vehicleId,

          vehicleRegNo:
            form.vehicleRegNo,

          vehicleFleetNo:
            form.vehicleFleetNo,

          vehicleMake:
            form.vehicleMake,

          vehicleModel:
            form.vehicleModel,

          vehicleType:
            form.vehicleType,

          vinNumber:
            form.vinNumber,

          driverName:
            form.driverName,

          driverContactNo:
            form.driverContactNo,

          location:
            form.location,

          jobType:
            form.jobType,

          description:
            form.complaint,

          complaint:
            form.complaint,

          assignedTo:
            form.assignedTo,

          assignedUserId:
            form.assignedUserId,

          dynamicFields: {

            ...jobCardFields.reduce(

              (acc: any, fieldId) => {

                acc[fieldId] =
                  form[fieldId] || "";

                return acc;

              },

              {}

            ),


            ...statusFields.reduce(

              (acc: any, field: any) => {

                acc[field.id] =
                  form[field.id] || "";

                return acc;

              },

              {}

            ),

          },

          createdAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),
        }
      );

      alert(
        "Job Created Successfully"
      );

      location.href =
        "/jobs";

    } catch (err) {

      console.error(err);

      alert(
        "Failed to create job"
      );

    } finally {

      setSaving(false);

    }
  }

  function LocationInput({
    label,
    field,
    textarea = false,
  }: any) {

    return (

      <div>

        <label className="
text-sm
font-bold
">

          {label}

        </label>


        {textarea ? (

          <textarea

            value={newLocation[field]}

            onChange={(e) =>

              setNewLocation({

                ...newLocation,

                [field]:
                  e.target.value,

              })

            }

            className="
mt-2
w-full
h-28
rounded-xl
border
p-3
"

          />

        )

          :

          (

            <input

              value={newLocation[field]}

              onChange={(e) =>

                setNewLocation({

                  ...newLocation,

                  [field]:
                    e.target.value,

                })

              }

              className="
mt-2
h-12
w-full
rounded-xl
border
px-3
"

            />

          )}

      </div>

    );

  }

  return (

    <div className="min-h-screen bg-[#f3f6fb] p-6">

      <div className="mx-auto max-w-[1800px]">

        {/* HEADER */}
        <div className="mb-6 flex items-center justify-between">

          <div>

            <div className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-gray-400">
              FleetFix Pro
            </div>

            <h1 className="text-4xl font-black tracking-tight text-gray-900">
              Create New Job
            </h1>

          </div>

          <Link
            href="/jobs"
            className="
              inline-flex
              h-14
              items-center
              rounded-2xl
              border
              border-gray-300
              bg-white
              px-6
              text-sm
              font-black
              hover:bg-gray-100
            "
          >
            Back
          </Link>

        </div>

        {/* MAIN GRID */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.3fr_1fr]">

          {/* LEFT */}
          <div className="space-y-6">

            {/* CUSTOMER */}
            <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">

              <h2 className="mb-6 text-2xl font-black text-gray-900">
                Customer Information
              </h2>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">

                {/* CUSTOMER */}
                <div className="relative">

                  <label className="mb-2 block text-sm font-bold text-gray-700">
                    Customer / Company Name
                  </label>

                  <input
                    type="text"
                    placeholder="Search customer..."
                    value={form.customerName}
                    onFocus={() =>
                      setShowCustomerResults(true)
                    }
                    onBlur={() => {

                      setTimeout(() => {

                        setShowCustomerResults(false);

                      }, 200);

                    }}
                    onChange={(e) => {

                      setForm({
                        ...form,
                        customerName:
                          e.target.value,
                      });

                      setShowCustomerResults(true);

                    }}
                    className="
                      h-14
                      w-full
                      rounded-2xl
                      border-2
                      border-gray-200
                      px-5
                      outline-none
                      focus:border-blue-500
                    "
                  />

                  {showCustomerResults && (

                    <div className="
                      absolute
                      left-0
                      right-0
                      top-[88px]
                      z-[9999]
                      overflow-hidden
                      rounded-2xl
                      border
                      border-gray-200
                      bg-white
                      shadow-2xl
                    ">

                      <div className="max-h-[300px] overflow-y-auto">
                        {customers
                          .filter((customer) =>

                            customer.companyName
                              ?.toLowerCase()
                              .includes(
                                form.customerName.toLowerCase()
                              )
                          )
                          .map((customer) => (

                            <button
                              key={customer.id}
                              type="button"
                              onClick={() => {

                                setForm({
                                  ...form,

                                  customerId:
                                    customer.id,

                                  customerName:
                                    customer.companyName || "",

                                  customerContact: "",

                                  customerContactNumber: "",

                                  customerContactEmail: "",
                                });

                                setShowCustomerResults(false);

                              }}
                              className="
        w-full
        border-b
        border-gray-100
        px-5
        py-4
        text-left
        hover:bg-blue-600
        hover:text-white
      "
                            >

                              <div className="font-bold">
                                {customer.companyName}
                              </div>

                              <div className="mt-1 text-xs opacity-70">
                                {customer.customerCode}
                              </div>

                              <div className="mt-1 text-xs opacity-70">
                                {customer.primaryContactNumber}
                              </div>

                            </button>

                          ))}

                      </div>

                    </div>

                  )}

                </div>

                {/* CONTACT */}
                <div className="relative">

                  <label className="mb-2 block text-sm font-bold text-gray-700">
                    Customer Contact
                  </label>

                  <input
                    type="text"
                    placeholder="Search customer contact..."
                    value={form.customerContact}
                    onFocus={() =>
                      setShowContactResults(true)
                    }
                    onBlur={() => {

                      setTimeout(() => {

                        setShowContactResults(false);

                      }, 200);

                    }}
                    onChange={(e) => {

                      setForm({
                        ...form,
                        customerContact:
                          e.target.value,
                      });

                      setShowContactResults(true);

                    }}
                    className="
      h-14
      w-full
      rounded-2xl
      border-2
      border-gray-200
      px-5
      outline-none
      focus:border-blue-500
    "
                  />

                  {showContactResults && (

                    <div className="
absolute
left-0
right-0
top-[88px]
z-[9999]
overflow-hidden
rounded-2xl
border
border-gray-200
bg-white
shadow-2xl
">

                      <div className="max-h-[300px] overflow-y-auto">

                        {contacts

                          .filter((contact) =>

                            contact.customerId ===
                            form.customerId

                          )

                          .filter((contact) =>

                            (contact.name || "")
                              .toLowerCase()
                              .includes(
                                form.customerContact.toLowerCase()
                              )

                            ||

                            (contact.phone || "")
                              .toLowerCase()
                              .includes(
                                form.customerContact.toLowerCase()
                              )

                            ||

                            (contact.email || "")
                              .toLowerCase()
                              .includes(
                                form.customerContact.toLowerCase()
                              )

                          )

                          .map((contact) => (


                            <button

                              key={contact.id}

                              type="button"

                              onClick={() => {

                                setForm({

                                  ...form,

                                  customerContact:
                                    contact.name || "",

                                  customerContactNumber:
                                    contact.phone || "",

                                  customerContactEmail:
                                    contact.email || "",

                                });


                                setShowContactResults(false);

                              }}

                              className="
w-full
border-b
border-gray-100
px-5
py-4
text-left
hover:bg-blue-600
hover:text-white
"

                            >


                              <div className="font-bold">

                                {contact.name}

                              </div>


                              <div className="text-xs opacity-70">

                                {contact.position}

                              </div>


                              <div className="text-xs opacity-70">

                                {contact.phone}

                              </div>


                              <div className="text-xs opacity-70">

                                {contact.email}

                              </div>


                            </button>


                          ))}


                      </div>

                    </div>

                  )}

                </div>
                {/* END CONTACT */}

              </div>
              {/* END CUSTOMER GRID */}

            </div>
            {/* END CUSTOMER CARD */}



            {/* VEHICLE */}
            <div className="
              rounded-3xl
              border
              border-gray-200
              bg-white
              p-8
              shadow-sm
            ">

              <h2 className="
                mb-6
                text-2xl
                font-black
                text-gray-900
              ">
                Vehicle Details
              </h2>

              <div className="
grid
grid-cols-1
gap-6
xl:grid-cols-2
">


                {/* VEHICLE SEARCH */}
                <div className="xl:col-span-2 relative">

                  <label className="
mb-2
block
text-sm
font-bold
text-gray-700
">
                    Vehicle Search
                  </label>


                  <input

                    type="text"

                    placeholder="Search customer fleet..."

                    value={form.vehicleRegNo}

                    onFocus={() =>
                      setShowVehicleResults(true)
                    }

                    onChange={(e) => {

                      setForm({

                        ...form,

                        vehicleId: "",
                        vehicleRegNo: e.target.value,

                      });

                      setShowVehicleResults(true);

                    }}

                    className="
h-14
w-full
rounded-2xl
border-2
border-gray-200
px-5
outline-none
focus:border-blue-500
"

                  />



                  {showVehicleResults && (

                    <div className="
absolute
top-[90px]
left-0
right-0
z-[9999]
rounded-2xl
border
bg-white
shadow-2xl
overflow-hidden
">


                      <div className="
max-h-[350px]
overflow-y-auto
">


                        {vehicles

                          .sort((a, b) =>

                            (a.regNo || "")
                              .localeCompare(
                                b.regNo || ""
                              )

                          )

                          .filter((vehicle) =>

                            [

                              vehicle.regNo,
                              vehicle.fleetNo,
                              vehicle.vehicleMake,
                              vehicle.vehicleModel,
                              vehicle.vinNumber

                            ]

                              .join(" ")
                              .toLowerCase()
                              .includes(
                                form.vehicleRegNo.toLowerCase()
                              )

                          )


                          .map((vehicle) => (


                            <button

                              key={vehicle.id}

                              type="button"

                              onClick={() => {


                                setForm({

                                  ...form,


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


                                setShowVehicleResults(false);


                              }}

                              className="
w-full
border-b
border-gray-100
px-5
py-4
text-left
hover:bg-blue-600
hover:text-white
"

                            >


                              <div className="font-black">

                                {vehicle.regNo}

                              </div>


                              <div className="
text-xs
opacity-70
">

                                Fleet:

                                {vehicle.fleetNo}

                                {" | "}

                                {vehicle.vehicleMake}

                                {" "}

                                {vehicle.vehicleModel}

                              </div>


                              <div className="
text-xs
opacity-70
">

                                VIN:

                                {vehicle.vinNumber}

                              </div>


                            </button>


                          ))

                        }


                        {/* ADD NEW OPTION */}

                        <button

                          type="button"

                          onClick={() => {

                            setForm({

                              ...form,

                              vehicleId: "",

                              vehicleRegNo: "",

                              vehicleFleetNo: "",

                              vehicleMake: "",

                              vehicleModel: "",

                              vehicleType: "",

                              vinNumber: "",

                              driverName: "",

                              driverContactNo: "",

                            });


                            setShowVehicleResults(false);


                          }}

                          className="
w-full
bg-blue-50
px-5
py-4
text-left
font-black
text-blue-600
"

                        >

                          + Add New Vehicle Manually

                        </button>


                      </div>

                    </div>

                  )}



                  {form.vehicleId && (

                    <button

                      type="button"

                      onClick={() => {


                        setForm({

                          ...form,

                          vehicleId: "",

                          vehicleRegNo: "",

                          vehicleFleetNo: "",

                          vehicleMake: "",

                          vehicleModel: "",

                          vehicleType: "",

                          vinNumber: "",

                          driverName: "",

                          driverContactNo: "",

                        });


                      }}

                      className="
mt-3
rounded-xl
bg-red-50
px-4
py-2
text-sm
font-bold
text-red-600
"

                    >

                      Clear Vehicle / Enter Manually

                    </button>

                  )}


                </div>


                <Field
                  label="Reg No"
                  value={form.vehicleRegNo}
                  onChange={(v: any) =>
                    setForm({
                      ...form,
                      vehicleRegNo: v
                    })
                  }
                />


                <Field
                  label="Fleet No"
                  value={form.vehicleFleetNo}
                  onChange={(v: any) =>
                    setForm({
                      ...form,
                      vehicleFleetNo: v
                    })
                  }
                />


                <SearchDropDown
                  label="Vehicle Make"
                  value={form.vehicleMake}
                  items={vehicleMakes}
                  show={showMakeResults}
                  setShow={setShowMakeResults}
                  onChange={(v: any) =>
                    setForm({
                      ...form,
                      vehicleMake: v
                    })
                  }
                  collectionName="vehicle_makes"
                />


                <Field
                  label="Vehicle Model"
                  value={form.vehicleModel}
                  onChange={(v: any) =>
                    setForm({
                      ...form,
                      vehicleModel: v
                    })
                  }
                />


                <SearchDropDown
                  label="Vehicle Type"
                  value={form.vehicleType}
                  items={vehicleTypes}
                  show={showTypeResults}
                  setShow={setShowTypeResults}
                  onChange={(v: any) =>
                    setForm({
                      ...form,
                      vehicleType: v
                    })
                  }
                  collectionName="vehicle_types"
                />


                <Field
                  label="VIN / Chassis No"
                  value={form.vinNumber}
                  onChange={(v: any) =>
                    setForm({
                      ...form,
                      vinNumber: v
                    })
                  }
                />


                <Field
                  label="Driver Name"
                  value={form.driverName}
                  onChange={(v: any) =>
                    setForm({
                      ...form,
                      driverName: v
                    })
                  }
                />


                <Field
                  label="Driver Contact Number"
                  value={form.driverContactNo}
                  onChange={(v: any) =>
                    setForm({
                      ...form,
                      driverContactNo: v
                    })
                  }
                />


              </div>


              <div className="
                grid
                grid-cols-1
                gap-6
                xl:grid-cols-2
              ">

                {/* KEEP YOUR EXISTING VEHICLE FIELDS HERE */}

              </div>

            </div>


          </div>
          {/* END LEFT */}



          {/* RIGHT */}
          <div className="space-y-6">

            {/* LOCATION */}
            <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">

              <h2 className="mb-6 text-2xl font-black text-gray-900">
                Job Location
              </h2>

              <div className="relative">


                <input

                  type="text"

                  placeholder="Search location..."

                  value={form.location}

                  onFocus={() =>
                    setShowLocationResults(true)
                  }

                  onChange={(e) => {

                    setForm({
                      ...form,
                      location: e.target.value,
                    });

                    setShowLocationResults(true);

                  }}

                  className="
h-14
w-full
rounded-2xl
border-2
border-gray-200
px-5
"

                />


                {showLocationResults && (

                  <div className="
absolute
top-[60px]
left-0
right-0
z-[9999]
bg-white
rounded-2xl
border
shadow-2xl
">

                    {jobLocations

                      .sort((a, b) =>
                        (a.name || "")
                          .localeCompare(
                            b.name || ""
                          )
                      )

                      .filter(loc =>

                        loc.name
                          ?.toLowerCase()
                          .includes(
                            form.location.toLowerCase()
                          )

                      )

                      .map(loc => (

                        <button

                          key={loc.id}

                          type="button"

                          onClick={() => {

                            setForm({
                              ...form,
                              location:
                                loc.name
                            });

                            setShowLocationResults(false);

                          }}

                          className="
w-full
text-left
px-5
py-4
font-bold
hover:bg-blue-600
hover:text-white
"

                        >

                          {loc.name}

                        </button>

                      ))

                    }

                  </div>

                )}

              </div>

              <div className="mt-3 flex justify-end">

                <button

                  type="button"

                  onClick={() =>
                    setShowAddLocation(true)
                  }

                  className="
rounded-xl
border
border-blue-200
bg-blue-50
px-4
py-2
text-sm
font-semibold
text-blue-700
hover:bg-blue-100
"

                >

                  + Add New Location

                </button>

              </div>

            </div>

            {/* JOB DETAILS */}
            <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">

              <h2 className="mb-6 text-2xl font-black text-gray-900">
                Job Details
              </h2>

              <div className="space-y-6">

                <div>

                  <label className="mb-2 block text-sm font-bold text-gray-700">
                    Job Type
                  </label>

                  <div className="relative">

                    <input
                      type="text"
                      placeholder="Search job type..."
                      value={form.jobType}

                      onFocus={() =>
                        setShowJobTypeResults(true)
                      }

                      onBlur={() => {

                        setTimeout(() => {

                          setShowJobTypeResults(false);

                        }, 200);

                      }}

                      onChange={(e) => {

                        setForm({
                          ...form,
                          jobType:
                            e.target.value,
                        });

                        setShowJobTypeResults(true);

                      }}

                      className="
      h-14
      w-full
      rounded-2xl
      border-2
      border-gray-200
      px-5
      outline-none
      focus:border-blue-500
    "
                    />


                    {showJobTypeResults && (

                      <div
                        className="
        absolute
        left-0
        right-0
        top-[60px]
        z-[9999]
        overflow-hidden
        rounded-2xl
        border
        border-gray-200
        bg-white
        shadow-2xl
      "
                      >

                        <div className="max-h-[300px] overflow-y-auto">

                          {jobTypes

                            .sort((a, b) =>
                              (a.name || "")
                                .localeCompare(
                                  b.name || ""
                                )
                            )

                            .filter((jobType) =>

                              jobType.name
                                ?.toLowerCase()
                                .includes(
                                  form.jobType.toLowerCase()
                                )

                            )

                            .map((jobType) => (

                              <button
                                key={jobType.id}
                                type="button"

                                onClick={() => {

                                  setForm({
                                    ...form,

                                    jobType:
                                      jobType.name || "",
                                  });

                                  setShowJobTypeResults(false);

                                }}

                                className="
                w-full
                border-b
                border-gray-100
                px-5
                py-4
                text-left
                font-bold
                hover:bg-blue-600
                hover:text-white
              "
                              >

                                {jobType.name}

                              </button>

                            ))}

                        </div>

                      </div>

                    )}

                  </div>

                </div>

                <div>

                  <label className="mb-2 block text-sm font-bold text-gray-700">
                    Job Description
                  </label>

                  <textarea
                    value={form.complaint}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        complaint:
                          e.target.value,
                      })
                    }
                    className="
                      min-h-[180px]
                      w-full
                      rounded-2xl
                      border-2
                      border-gray-200
                      p-5
                      outline-none
                      focus:border-blue-500
                    "
                  />

                </div>

                <div>

                  <label className="mb-2 block text-sm font-bold text-gray-700">
                    Assigned Technician
                  </label>

                  <div className="relative">


                    <input

                      type="text"

                      placeholder="Search technician..."

                      value={form.assignedTo}

                      onFocus={() =>
                        setShowTechnicianResults(true)
                      }

                      onChange={(e) => {

                        setForm({

                          ...form,

                          assignedTo:
                            e.target.value,

                        });


                        setShowTechnicianResults(true);


                      }}

                      className="
h-14
w-full
rounded-2xl
border-2
border-gray-200
px-5
outline-none
focus:border-blue-500
"

                    />



                    {showTechnicianResults && (

                      <div className="
absolute
top-[60px]
left-0
right-0
z-[9999]
rounded-2xl
border
bg-white
shadow-2xl
overflow-hidden
">

                        <div className="
max-h-[300px]
overflow-y-auto
">


                          {technicians


                            .sort((a, b) =>

                              (a.name || "")
                                .localeCompare(
                                  b.name || ""
                                )

                            )


                            .filter((tech) =>

                              [
                                tech.name,
                                tech.role,
                                tech.mobile,
                                tech.email
                              ]

                                .join(" ")
                                .toLowerCase()
                                .includes(
                                  form.assignedTo.toLowerCase()
                                )

                            )


                            .map((tech) => (


                              <button

                                key={tech.id}

                                type="button"

                                onClick={() => {

                                  setForm({

                                    ...form,

                                    assignedTo:
                                      tech.name,

                                    assignedUserId:
                                      tech.id,

                                  });


                                  setShowTechnicianResults(false);


                                }}

                                className="
w-full
border-b
border-gray-100
px-5
py-4
text-left
hover:bg-blue-600
hover:text-white
"

                              >


                                <div className="font-black">

                                  {tech.name}

                                </div>


                                <div className="
text-xs
opacity-70
">

                                  {tech.role}

                                  {" | "}

                                  {tech.mobile}

                                </div>


                                <div className="
text-xs
opacity-70
">

                                  {tech.email}

                                </div>


                              </button>


                            ))

                          }


                        </div>

                      </div>

                    )}

                  </div>

                </div>

              </div>

            </div>

            {/* JOB FIELDS */}
            {jobCardFields.length > 0 && (

              <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">

                <h2 className="mb-6 text-2xl font-black text-gray-900">
                  Job Fields
                </h2>

                <div className="grid grid-cols-1 gap-5">

                  {jobCardFields.map((fieldId) => (

                    <div key={fieldId}>

                      <label className="mb-2 block text-sm font-bold text-gray-700">

                        {fieldId
                          .replace(/([A-Z])/g, " $1")
                          .replace(/^./, (s: string) =>
                            s.toUpperCase()
                          )}

                      </label>

                      <input
                        type="text"
                        value={form[fieldId] || ""}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            [fieldId]:
                              e.target.value,
                          })
                        }
                        className="
                          h-14
                          w-full
                          rounded-2xl
                          border-2
                          border-gray-200
                          px-5
                          outline-none
                          focus:border-blue-500
                        "
                      />

                    </div>

                  ))}

                </div>

              </div>

            )}

            {/* STATUS REQUIRED FIELDS */}

            {statusFields.length > 0 && (

              <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">


                <h2 className="mb-6 text-2xl font-black text-gray-900">

                  {form.status} Fields

                </h2>


                <div className="grid grid-cols-1 gap-5">


                  {statusFields.map((field: any) => (


                    <div key={field.id}>


                      <label className="mb-2 block text-sm font-bold">

                        {field.name}


                        {field.required && (

                          <span className="text-red-600">
                            *
                          </span>

                        )}

                      </label>


                      <input

                        type={field.type || "text"}

                        value={form[field.id] || ""}

                        onChange={(e) =>

                          setForm({

                            ...form,

                            [field.id]:
                              e.target.value,

                          })

                        }

                        className="
h-14
w-full
rounded-2xl
border-2
border-gray-200
px-5
"

                      />


                    </div>


                  ))}


                </div>


              </div>

            )}

            {/* SAVE */}
            <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">

              <div className="mb-6">

                <div className="text-sm font-bold text-gray-500">
                  Default Status
                </div>

                <div className="mt-1 text-xl font-black text-blue-600">
                  Job Booked
                </div>

              </div>

              <button
                onClick={createJob}
                disabled={saving}
                className="
                  h-16
                  w-full
                  rounded-2xl
                  bg-blue-600
                  text-lg
                  font-black
                  text-white
                  hover:bg-blue-700
                  disabled:opacity-50
                "
              >

                {saving
                  ? "Creating Job..."
                  : "Create Job"}

              </button>

            </div>

          </div>

        </div>


        {/* ADD LOCATION POPUP */}
        {showAddLocation && (

          <div className="
fixed
inset-0
z-[99999]
flex
items-center
justify-center
bg-black/40
">


            <div className="
w-[900px]
rounded-3xl
bg-white
p-8
shadow-2xl
">


              <div className="
flex
justify-between
items-center
mb-8
">

                <h2 className="
text-2xl
font-black
">

                  Add Job Location

                </h2>


                <button
                  onClick={() =>
                    setShowAddLocation(false)
                  }
                >
                  ✕
                </button>


              </div>



              <div className="
grid
grid-cols-2
gap-5
">


                <LocationInput
                  label="Location Name"
                  field="name"
                />


                <LocationInput
                  label="City"
                  field="city"
                />


                <div className="col-span-2">

                  <LocationInput
                    label="Address"
                    field="address"
                    textarea
                  />

                </div>


                <LocationInput
                  label="Province"
                  field="province"
                />


                <LocationInput
                  label="Country"
                  field="country"
                />


                <LocationInput
                  label="GPS Latitude"
                  field="latitude"
                />


                <LocationInput
                  label="GPS Longitude"
                  field="longitude"
                />


                <div className="col-span-2">

                  <LocationInput
                    label="Google Maps Link"
                    field="googleMaps"
                  />

                </div>


                <div className="col-span-2">

                  <LocationInput
                    label="Notes"
                    field="notes"
                    textarea
                  />

                </div>


              </div>



              <div className="
mt-8
flex
justify-end
gap-4
">


                <button

                  onClick={() =>
                    setShowAddLocation(false)
                  }

                  className="
px-8
py-3
rounded-xl
bg-gray-200
"

                >

                  Cancel

                </button>


                <button

                  onClick={addNewLocation}

                  className="
px-8
py-3
rounded-xl
bg-blue-600
text-white
font-bold
"

                >

                  Save Location

                </button>


              </div>


            </div>


          </div>

        )}


      </div>

    </div>

  );

}


function Field({
  label,
  value,
  onChange,
}: any) {

  return (

    <div>

      <label className="mb-2 block text-sm font-bold text-gray-700">
        {label}
      </label>

      <input
        value={value}
        onChange={(e) =>
          onChange(
            e.target.value
          )
        }
        className="
          h-14
          w-full
          rounded-2xl
          border-2
          border-gray-200
          px-5
          outline-none
          focus:border-blue-500
        "
      />

    </div>

  );
}

function SearchDropDown({

  label,
  value,
  items,
  show,
  setShow,
  onChange,
  collectionName,

}: any) {


  async function addNew() {

    if (!value) return;


    await addDoc(

      collection(
        clientDb,
        "companies",
        COMPANY_ID,
        collectionName
      ),

      {

        name: value,

        createdAt:
          serverTimestamp(),

      }

    );


    setShow(false);


    alert(
      `${value} added`
    );

  }



  return (

    <div className="relative">


      <label className="
        mb-2
        block
        text-sm
        font-bold
        text-gray-700
      ">
        {label}
      </label>


      <input

        value={value}

        onFocus={() =>
          setShow(true)
        }

        onBlur={() => {

          setTimeout(() => {

            setShow(false);

          }, 200);

        }}

        onChange={(e) =>
          onChange(
            e.target.value
          )
        }

        className="
          h-14
          w-full
          rounded-2xl
          border-2
          border-gray-200
          px-5
          outline-none
          focus:border-blue-500
        "
      />


      {show && (

        <div className="
          absolute
          top-[85px]
          left-0
          right-0
          z-[9999]
          rounded-xl
          border
          bg-white
          shadow-xl
          overflow-hidden
        ">


          {items

            .sort((a: any, b: any) =>

              (a.name || "")
                .localeCompare(
                  b.name || ""
                )

            )

            .filter((item: any) =>

              item.name
                ?.toLowerCase()
                .includes(
                  value.toLowerCase()
                )

            )


            .map((item: any) => (


              <button

                key={item.id}

                type="button"

                onClick={() => {

                  onChange(
                    item.name
                  );

                  setShow(false);

                }}

                className="
                  w-full
                  px-5
                  py-3
                  text-left
                  font-bold
                  hover:bg-blue-600
                  hover:text-white
                "
              >

                {item.name}

              </button>

            ))}



          <button

            type="button"

            onClick={addNew}

            className="
              w-full
              bg-blue-50
              px-5
              py-3
              text-left
              font-black
              text-blue-600
            "
          >

            + Add "{value}"

          </button>


        </div>

      )}

    </div>
  );
}