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
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import {
  clientDb,
} from "@/lib/firebaseClient";
import { getAuth } from "firebase/auth";

import {
  COMPANY_ID,
} from "@/lib/company";
import { googleMapsLinkFromCoordinates, resolveGoogleMapsCoordinates } from "@/lib/googleMapsCoordinates";
import { recalculateActiveJobQueue } from "@/lib/jobQueue";
import { effectivePermissions } from "@/lib/permissions";
import UserAvatar from "@/components/shared/UserAvatar";

interface Customer {
  id: string;
  companyName?: string;
  customerCode?: string;
  primaryContactName?: string;
  primaryContactNumber?: string;
  primaryContactEmail?: string;
  physicalAddress?: string;
  address?: string;
  customFields?: Record<string, unknown>;
  [key: string]: unknown;
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

  firstName?: string;

  lastName?: string;

  color?: string;

  profileColor?: string;

  role?: string;

  email?: string;

  mobile?: string;

  active?: boolean;

}

interface JobType {
  id: string;
  name?: string;
  active?: boolean;
  linkedJobCardTemplateId?: string;
  linkedJobCardTemplateName?: string;
  linkedTaskTemplateIds?: string[];
}

function currentLocalDateTime() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

function localDateTimeValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function coordinatesFromLocation(location: any): { latitude: number; longitude: number } | null {
  const latitudeValue = String(location?.latitude ?? "").trim()
    || String(location?.gpsLat ?? location?.gpsLatitude ?? "").trim();
  const longitudeValue = String(location?.longitude ?? "").trim()
    || String(location?.gpsLng ?? location?.gpsLongitude ?? "").trim();
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  if (latitudeValue && longitudeValue && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
    return { latitude, longitude };
  }
  const link = String(location?.googleMapsLink || location?.googleMaps || "");
  const match = link.match(/(?:@|query=|q=|\/place\/)(-?\d+(?:\.\d+)?)[,%2C\s]+(-?\d+(?:\.\d+)?)/i);
  if (!match) return null;
  return { latitude: Number(match[1]), longitude: Number(match[2]) };
}

function roundTripTravelEstimate(company: any, location: any) {
  const destination = coordinatesFromLocation(location);
  if (!destination) return { distanceKm: 0, minutes: 0, branchName: "" };
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const branches = [
    { ...company, name: company?.primaryBranchName || company?.companyName || "Primary Branch" },
    ...(Array.isArray(company?.branches) ? company.branches : []),
  ];
  const estimates = branches.flatMap((branch: any) => {
    const origin = coordinatesFromLocation(branch);
    if (!origin) return [];
    const latitudeDelta = radians(destination.latitude - origin.latitude);
    const longitudeDelta = radians(destination.longitude - origin.longitude);
    const value = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(origin.latitude)) * Math.cos(radians(destination.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
    const oneWayKm = 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
    const distanceKm = oneWayKm * 2;
    return [{ distanceKm, minutes: Math.ceil(distanceKm / 70 * 60), branchName: branch.name || "Branch" }];
  });
  return estimates.sort((left, right) => left.distanceKm - right.distanceKm)[0] || { distanceKm: 0, minutes: 0, branchName: "" };
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
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [externalServiceProvider, setExternalServiceProvider] = useState(false);
  const [externalSupplierId, setExternalSupplierId] = useState("");

  const [bookedStatus, setBookedStatus] = useState<any>(null);
  const [setupStatus, setSetupStatus] = useState<any>(null);
  const [advancedBooking, setAdvancedBooking] = useState(false);
  const [bookingDateTime, setBookingDateTime] = useState(currentLocalDateTime);
  const [estimatedDispatchTime, setEstimatedDispatchTime] = useState(currentLocalDateTime);
  const [estimatedRepairMinutes, setEstimatedRepairMinutes] = useState(120);
  const [estimatedTravelMinutes, setEstimatedTravelMinutes] = useState(0);
  const [estimatedTravelDistanceKm, setEstimatedTravelDistanceKm] = useState(0);
  const [closestBranchName, setClosestBranchName] = useState("");
  const [estimatedQueuePosition, setEstimatedQueuePosition] = useState(1);
  const [edtManuallyEdited, setEdtManuallyEdited] = useState(false);
  const [edtCalculationClock, setEdtCalculationClock] = useState(() => Date.now());

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
  const [jobCardFieldLabels, setJobCardFieldLabels] = useState<Record<string, string>>({});

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

  const [assignedUserSearch, setAssignedUserSearch] = useState("");

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

    locationType: "",
    roadsidePosition: "",
    pointA: "",
    pointB: "",
    nearPoint: "",
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

  const [updatingLocationCoordinates, setUpdatingLocationCoordinates] = useState(false);

  useEffect(() => {
    function closeDropdownsOnOutsideClick(event: MouseEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("[data-job-search-dropdown='true']")) return;
      if (target instanceof HTMLInputElement && target.placeholder.toLowerCase().startsWith("search")) return;

      setShowCustomerResults(false);
      setShowContactResults(false);
      setShowVehicleResults(false);
      setShowLocationResults(false);
      setShowJobTypeResults(false);
      setShowMakeResults(false);
      setShowTypeResults(false);
      setShowTechnicianResults(false);
    }

    document.addEventListener("click", closeDropdownsOnOutsideClick);
    return () => document.removeEventListener("click", closeDropdownsOnOutsideClick);
  }, []);

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
      jobTypeId: "",
      complaint: "",

      assignedTo: "",

      assignedUserId: "",
      assignedUserIds: [],
      assignedUsers: [],
    });

  useEffect(() => {

    loadJobCardFields();

  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setEdtCalculationClock(Date.now());
    }, 30_000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function calculateEstimatedDispatch() {
      try {
        const [snapshot, companySnapshot] = await Promise.all([
          getDocs(collection(clientDb, "companies", COMPANY_ID, "jobs")),
          getDoc(doc(clientDb, "companies", COMPANY_ID)),
        ]);
        const company = companySnapshot.exists() ? companySnapshot.data() : {};
        const currentTravel = roundTripTravelEstimate(company, form.locationDetails);
        const assignedIds = new Set<string>(form.assignedUserIds || []);
        const bookingDate = advancedBooking ? new Date(bookingDateTime) : new Date(edtCalculationClock);
        const baseTime = Number.isNaN(bookingDate.getTime()) ? new Date() : bookingDate;
        const existingJobs = snapshot.docs.map((item) => item.data() as any);
        const assignedToSelectedUser = (existingJob: any) => {
          const existingAssignedIds = Array.isArray(existingJob.assignedUserIds) && existingJob.assignedUserIds.length > 0
            ? existingJob.assignedUserIds
            : (existingJob.assignedUsers || []).map((user: any) => user.id).filter(Boolean);
          if (existingAssignedIds.length === 0 && existingJob.assignedUserId) {
            existingAssignedIds.push(existingJob.assignedUserId);
          }
          return existingAssignedIds.some((id: string) => assignedIds.has(id));
        };
        const jobsAhead = existingJobs.filter((existingJob) => {
          if (existingJob.isClosed === true || existingJob.isCompleted === true || existingJob.archived === true) return false;
          if (existingJob.edtPaused === true || /on\s*hold|hold/.test(String(existingJob.status || "").toLowerCase())) return false;
          return assignedToSelectedUser(existingJob);
        }).sort((left, right) => {
          const leftQueue = Number(String(left.queueNumber || "").replace(/\D/g, "")) || Number.MAX_SAFE_INTEGER;
          const rightQueue = Number(String(right.queueNumber || "").replace(/\D/g, "")) || Number.MAX_SAFE_INTEGER;
          return leftQueue - rightQueue;
        });

        let nextAvailableAt = baseTime.getTime();
        existingJobs
          .filter((existingJob) => existingJob.isCompleted === true && assignedToSelectedUser(existingJob))
          .forEach((completedJob) => {
            const completedDate = completedJob.completedAt?.toDate?.() ||
              completedJob.updatedAt?.toDate?.() ||
              (completedJob.completedAt ? new Date(completedJob.completedAt) : null);
            if (!(completedDate instanceof Date) || Number.isNaN(completedDate.getTime())) return;
            const roundTripMinutes = Math.max(
              0,
              Number(completedJob.travelTimeMinutes) ||
                roundTripTravelEstimate(company, completedJob.locationDetails).minutes
            );
            const returnedToBaseAt = completedDate.getTime() + Math.ceil(roundTripMinutes / 2) * 60_000;
            nextAvailableAt = Math.max(nextAvailableAt, returnedToBaseAt);
          });
        jobsAhead.forEach((existingJob) => {
          const repairMinutes = Math.max(15, Number(existingJob.actualRepairMinutes) || Number(existingJob.estimatedRepairMinutes) || 120);
          const travelMinutes = Math.max(0, Number(existingJob.travelTimeMinutes) || roundTripTravelEstimate(company, existingJob.locationDetails).minutes);
          nextAvailableAt += (repairMinutes + travelMinutes) * 60_000;
        });
        if (cancelled) return;
        setEstimatedTravelMinutes(currentTravel.minutes);
        setEstimatedTravelDistanceKm(currentTravel.distanceKm);
        setClosestBranchName(currentTravel.branchName);
        setEstimatedQueuePosition(jobsAhead.length + 1);
        // ETA includes all earlier jobs' round-trip travel and repair time,
        // this job's one-way travel, and a 20-minute mobilisation allowance.
        const oneWayTravelMinutes = Math.ceil(currentTravel.minutes / 2);
        const estimatedArrivalAt = nextAvailableAt + (oneWayTravelMinutes + 20) * 60_000;
        if (!edtManuallyEdited) setEstimatedDispatchTime(localDateTimeValue(new Date(estimatedArrivalAt)));
      } catch (error) {
        console.error("Unable to calculate estimated dispatch time", error);
      }
    }
    calculateEstimatedDispatch();
    return () => { cancelled = true; };
  }, [form.assignedUserIds, form.locationDetails, advancedBooking, bookingDateTime, edtManuallyEdited, edtCalculationClock]);

  useEffect(() => {
    const details = form.locationDetails;
    const link = String(details?.googleMapsLink || details?.googleMaps || "");
    if (!link || coordinatesFromLocation(details)) return;

    let cancelled = false;

    async function hydrateLocationCoordinates() {
      const coordinates = await resolveGoogleMapsCoordinates(link);
      if (!coordinates || cancelled) return;

      setForm((current: any) => {
        const currentLink = String(
          current.locationDetails?.googleMapsLink
          || current.locationDetails?.googleMaps
          || ""
        );
        if (currentLink !== link) return current;

        return {
          ...current,
          locationDetails: {
            ...current.locationDetails,
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
            gpsLat: coordinates.latitude,
            gpsLng: coordinates.longitude,
          },
        };
      });

      if (form.locationId) {
        try {
          await updateDoc(
            doc(clientDb, "companies", COMPANY_ID, "job_locations", form.locationId),
            {
              gpsLat: coordinates.latitude,
              gpsLng: coordinates.longitude,
              latitude: coordinates.latitude,
              longitude: coordinates.longitude,
            }
          );
        } catch (error) {
          console.error("Unable to store resolved job-location coordinates", error);
        }
      }
    }

    void hydrateLocationCoordinates();
    return () => { cancelled = true; };
  }, [form.locationId, form.locationDetails]);

  useEffect(() => {
    if (!form.locationId) return;

    const savedLocation = jobLocations.find((location) => location.id === form.locationId);
    const coordinates = coordinatesFromLocation(savedLocation);
    if (!coordinates) return;

    setForm((current: any) => {
      const existing = coordinatesFromLocation(current.locationDetails);
      if (
        existing
        && existing.latitude === coordinates.latitude
        && existing.longitude === coordinates.longitude
      ) return current;

      return {
        ...current,
        locationDetails: {
          ...current.locationDetails,
          latitude: String(coordinates.latitude),
          longitude: String(coordinates.longitude),
          gpsLat: String(coordinates.latitude),
          gpsLng: String(coordinates.longitude),
          googleMaps: savedLocation.googleMapsLink || savedLocation.googleMaps || "",
          googleMapsLink: savedLocation.googleMapsLink || savedLocation.googleMaps || "",
        },
      };
    });
  }, [form.locationId, jobLocations]);

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
          Array.from(new Set<string>(data.selectedFields || []))
        );
        setJobCardFieldLabels(data.editableLabels || {});
      }

    } catch (err) {

      console.error(err);
    }
  }

  const selectedCustomer = customers.find((customer) => customer.id === form.customerId);
  const customerOwnedFieldIds = new Set([
    "customerCode", "customerName", "contactName", "email1", "email2", "email3",
    "mobileNumber1", "mobileNumber2", "address", "addressName",
    "customtext1", "customtext2", "customtext3", "customtext4",
  ]);
  const customerReferenceFieldIds = new Set(["customerOrderNumber", "referenceNumber", "invoiceNumber"]);
  const customerFieldValue = (fieldId: string) => {
    const values: Record<string, unknown> = {
      customerCode: selectedCustomer?.customerCode,
      customerName: selectedCustomer?.companyName,
      contactName: form.customerContact || selectedCustomer?.primaryContactName,
      email1: form.customerContactEmail || selectedCustomer?.primaryContactEmail,
      mobileNumber1: form.customerContactNumber || selectedCustomer?.primaryContactNumber,
      address: selectedCustomer?.physicalAddress || selectedCustomer?.address,
      addressName: selectedCustomer?.physicalAddress || selectedCustomer?.address,
    };
    return String(values[fieldId] ?? selectedCustomer?.[fieldId] ?? selectedCustomer?.customFields?.[fieldId] ?? "");
  };
  const isHoldReasonField = (fieldId: string) => {
    const normalizedId = fieldId.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const normalizedLabel = String(jobCardFieldLabels[fieldId] || "")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
    return normalizedId === "holdreason" || normalizedLabel === "holdreason";
  };
  const additionalCustomerFields = jobCardFields.filter((fieldId) =>
    customerOwnedFieldIds.has(fieldId) &&
    !["customerName", "contactName"].includes(fieldId) &&
    !isHoldReasonField(fieldId)
  );
  const fieldsAlreadyRenderedOnCreateJob = new Set([
    "assignedEmployees",
    "assignedVan",
    "customerAssets",
  ]);
  const editableJobFields = jobCardFields.filter((fieldId) =>
    !customerOwnedFieldIds.has(fieldId) && !customerReferenceFieldIds.has(fieldId) && !fieldsAlreadyRenderedOnCreateJob.has(fieldId)
  );
  const technicianName = (user: any) =>
    `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || user?.name || "Unnamed User";
  const technicianInitials = (user: any) => {
    const parts = technicianName(user).split(/\s+/).filter(Boolean);
    return `${parts[0]?.charAt(0) || ""}${parts[1]?.charAt(0) || ""}`.toUpperCase();
  };

  async function loadStartStatusFields() {
    const snap = await getDocs(collection(clientDb, "companies", COMPANY_ID, "statuses"));
    const statusDocs = snap.docs.map((statusDoc) => ({ id: statusDoc.id, ...statusDoc.data() } as any));
    const booked = statusDocs.find((status) => status.startStatus === true) ||
      statusDocs.find((status) => String(status.name || "").trim().toLowerCase() === "job booked");
    const setup = statusDocs.find((status) => String(status.name || "").trim().toLowerCase() === "setup");

    if (booked) {
      setBookedStatus(booked);
      setSetupStatus(setup || null);


      setForm((prev: any) => ({

        ...prev,

        status:
          booked.name,

        statusId:
          booked.id,

      }));


      setStatusFields(
        booked.fields || []
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

    const unsubSuppliers = onSnapshot(
      collection(clientDb, "companies", COMPANY_ID, "suppliers"),
      (snapshot) => setSuppliers(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
    );

    return () => {

      unsubCustomers();
      unsubLocations();
      unsubJobTypes();
      unsubTechs();
      unsubMakes();
      unsubTypes();
      unsubSuppliers();

    };

  }, []);

  useEffect(() => {

    if (!form.customerId) {

      setVehicles([]);

      return;
    }

    let customerFleet: Vehicle[] = [];
    let companyVehicles: Vehicle[] = [];

    const normalizeVehicle = (id: string, data: any): Vehicle => ({
      ...data,
      id,
      regNo: data.regNo || data.vehicleReg || data.registrationNumber || data.registration || "",
      fleetNo: data.fleetNo || data.fleetNumber || "",
      vehicleMake: data.vehicleMake || data.make || "",
      vehicleModel: data.vehicleModel || data.model || "",
      vehicleType: data.vehicleType || data.type || "",
      vinNumber: data.vinNumber || data.vin || data.chassisNumber || "",
      driverName: data.driverName || data.driver || "",
      driverContactNumber: data.driverContactNumber || data.driverContactNo || data.driverPhone || "",
    });

    const publishVehicles = () => {
      const merged = new Map<string, Vehicle>();
      [...companyVehicles, ...customerFleet].forEach((vehicle) => {
        const identity = String(
          vehicle.regNo || vehicle.vinNumber || vehicle.fleetNo || vehicle.id
        ).trim().toLowerCase();
        merged.set(identity, vehicle);
      });
      setVehicles(Array.from(merged.values()));
    };

    const unsubCustomerFleet = onSnapshot(
      collection(clientDb, "companies", COMPANY_ID, "customers", form.customerId, "fleet"),
      (snapshot) => {
        customerFleet = snapshot.docs.map((vehicleDoc) =>
          normalizeVehicle(vehicleDoc.id, vehicleDoc.data())
        );
        publishVehicles();
      },
      (error) => console.error("Unable to load the customer fleet:", error)
    );

    const unsubCompanyVehicles = onSnapshot(
      collection(clientDb, "companies", COMPANY_ID, "vehicles"),
      (snapshot) => {
        companyVehicles = snapshot.docs
          .filter((vehicleDoc) => {
            const data = vehicleDoc.data();
            return data.customerId === form.customerId || data.customer?.id === form.customerId;
          })
          .map((vehicleDoc) => normalizeVehicle(vehicleDoc.id, vehicleDoc.data()));
        publishVehicles();
      },
      (error) => console.error("Unable to load linked company vehicles:", error)
    );

    return () => {
      unsubCustomerFleet();
      unsubCompanyVehicles();
    };

  }, [form.customerId]);

  async function addNewLocation() {


    if (!newLocation.name) {

      alert(
        "Location name required"
      );

      return;

    }


    const locationDocument = await addDoc(

      collection(
        clientDb,
        "companies",
        COMPANY_ID,
        "job_locations"
      ),

      {

        ...newLocation,

        gpsLat: newLocation.latitude || "",
        gpsLng: newLocation.longitude || "",
        googleMapsLink: newLocation.googleMaps || "",

        createdAt:
          serverTimestamp(),

      }

    );


    setForm({

      ...form,

      location:
        newLocation.name,

      locationId: locationDocument.id,
      locationDetails: {
        ...newLocation,
        gpsLat: newLocation.latitude || "",
        gpsLng: newLocation.longitude || "",
        googleMapsLink: newLocation.googleMaps || "",
      },

    });


    setNewLocation({

      locationType: "",
      roadsidePosition: "",
      pointA: "",
      pointB: "",
      nearPoint: "",
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

  async function updateNewLocationGpsAndMapsLink() {
    const link = String(newLocation.googleMaps || "").trim();
    const latitude = String(newLocation.latitude || "").trim();
    const longitude = String(newLocation.longitude || "").trim();
    setUpdatingLocationCoordinates(true);

    try {
      if (link) {
        const coordinates = await resolveGoogleMapsCoordinates(link);
        if (!coordinates) {
          alert("No GPS coordinates could be found in this Google Maps link.");
          return;
        }
        setNewLocation((current: any) => ({ ...current, latitude: coordinates.latitude, longitude: coordinates.longitude, gpsLat: coordinates.latitude, gpsLng: coordinates.longitude, googleMaps: link, googleMapsLink: link }));
        return;
      }

      const googleMapsLink = googleMapsLinkFromCoordinates(latitude, longitude);
      if (!googleMapsLink) {
        alert("Paste a Google Maps link or enter valid GPS latitude and longitude first.");
        return;
      }
      setNewLocation((current: any) => ({ ...current, googleMaps: googleMapsLink, googleMapsLink, gpsLat: latitude, gpsLng: longitude }));
    } finally {
      setUpdatingLocationCoordinates(false);
    }
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


      if (!externalServiceProvider && !form.assignedTo) {
        alert("At least one assigned user is required");
        setSaving(false);
        return;
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
          )
        );

      const activeJobSnap =
        await getDocs(
          activeJobQuery
        );

      const hasActiveBookedJob = activeJobSnap.docs.some((jobDocument) => {
        const existingJob = jobDocument.data();
        return existingJob.isClosed !== true && (
          existingJob.isAdvancedBooking === true ||
          String(existingJob.status || "").toLowerCase().includes("booked")
        );
      });

      if (hasActiveBookedJob) {

        const proceed =
          confirm(
            "Vehicle already has active booked job. Continue?"
          );

        if (!proceed) {

          setSaving(false);

          return;
        }
      }

      const selectedJobType =
        jobTypes.find(
          (jobType) =>
            jobType.id === form.jobTypeId
        ) ||
        jobTypes.find(
          (jobType) =>
            jobType.name === form.jobType
        );

      if (!selectedJobType) {
        alert("Select a valid Job Type from the list.");
        setSaving(false);
        return;
      }

      const externalSupplier = externalServiceProvider
        ? suppliers.find((supplier) => supplier.id === externalSupplierId)
        : null;
      if (externalServiceProvider && !externalSupplier) {
        alert("Select an external service provider");
        setSaving(false);
        return;
      }
      if (externalSupplier && (!externalSupplier.email || !externalSupplier.externalJobStatusId || !externalSupplier.externalJobMessageTemplateId)) {
        alert("The selected supplier must have an email address, linked external job status, and booking message template configured.");
        setSaving(false);
        return;
      }

      const requestedBookingDate = advancedBooking ? new Date(bookingDateTime) : new Date();
      const requestedDispatchDate = new Date(estimatedDispatchTime);
      if (Number.isNaN(requestedBookingDate.getTime())) {
        alert("Enter a valid booking date and time");
        setSaving(false);
        return;
      }
      if (advancedBooking && requestedBookingDate.getTime() <= Date.now()) {
        alert("An advanced booking must be scheduled for a future date and time");
        setSaving(false);
        return;
      }
      if (Number.isNaN(requestedDispatchDate.getTime())) {
        alert("Enter a valid estimated arrival time");
        setSaving(false);
        return;
      }
      const [externalStatusSnapshot, externalTemplateSnapshot] = externalSupplier
        ? await Promise.all([
            getDoc(doc(clientDb, "companies", COMPANY_ID, "statuses", externalSupplier.externalJobStatusId)),
            getDoc(doc(clientDb, "companies", COMPANY_ID, "messageTemplates", externalSupplier.externalJobMessageTemplateId)),
          ])
        : [null, null];
      if (externalSupplier && (!externalStatusSnapshot?.exists() || !externalTemplateSnapshot?.exists())) {
        alert("The selected supplier's linked status or message template no longer exists.");
        setSaving(false);
        return;
      }
      const externalStatus = externalStatusSnapshot?.exists()
        ? { id: externalStatusSnapshot.id, ...externalStatusSnapshot.data() } as any
        : null;
      const externalTemplate = externalTemplateSnapshot?.exists()
        ? { id: externalTemplateSnapshot.id, ...externalTemplateSnapshot.data() } as any
        : null;
      const initialStatus = externalStatus
        ? { id: externalStatus.id, name: externalStatus.name }
        : advancedBooking
          ? { id: setupStatus?.id || "", name: "Setup (Advanced Booking)" }
          : { id: bookedStatus?.id || form.statusId, name: bookedStatus?.name || form.status };

      const startFormTemplatesSnapshot = await getDocs(
        collection(clientDb, "companies", COMPANY_ID, "jobforms")
      );
      const startFormDocument = startFormTemplatesSnapshot.docs.find((templateDoc) => {
        const template = templateDoc.data();
        return (
          template.active !== false &&
          template.autoAddStatusIds?.includes(form.statusId) &&
          template.linkedJobTypeIds?.includes(selectedJobType.id)
        );
      });
      const startFormTemplateId = startFormDocument?.id;
      if (!startFormDocument || !startFormTemplateId) {
        alert(
          "No Job Form is linked to both the selected Job Type and the start status. Configure this in the Form Builder."
        );
        setSaving(false);
        return;
      }

      const jobFormSnapshot = startFormDocument;

      const jobFormTemplate =
        jobFormSnapshot.data();

      const preferencesRef = doc(
        clientDb,
        "companies",
        COMPANY_ID,
        "jobcard_preferences",
        "Job"
      );
      const identifiers = await runTransaction(clientDb, async (transaction) => {
        const snapshot = await transaction.get(preferencesRef);
        const settings = snapshot.exists() ? snapshot.data() : {};
        const prefix = String(settings.jobPrefix || "NJ").trim().toUpperCase();
        const currentSequenceText = String(settings.currentJobSequence ?? "00000");
        const sequenceWidth = Math.max(1, currentSequenceText.length);
        const nextSequence = String(Math.max(0, Number(currentSequenceText) || 0) + 1).padStart(sequenceWidth, "0");
        const currentQueueSequence = Math.max(0, Number(settings.currentQueueSequence) || 0);
        const nextQueueSequence = currentQueueSequence + 1;
        transaction.set(preferencesRef, {
          jobPrefix: prefix,
          currentJobSequence: nextSequence,
          recurringPrefix: settings.recurringPrefix || "RJB",
          currentRecurringSequence: Number(settings.currentRecurringSequence) || 10000,
          currentQueueSequence: nextQueueSequence,
          updatedAt: serverTimestamp(),
        }, { merge: true });
        return { jobNumber: `${prefix}${nextSequence}`, queueNumber: nextQueueSequence };
      });
      const { jobNumber, queueNumber } = identifiers;


      const allocatedJobFormFields =
        JSON.parse(
          JSON.stringify(
            (jobFormTemplate.fields || []).map(
              (field: any) => ({
                ...field,
                label:
                  typeof field.label === "string"
                    ? field.label.replace(
                        /\{\{jobNumber\}\}/gi,
                        jobNumber
                      )
                    : field.label,
              })
            )
          )
        );

      const linkedTaskTemplates =
        (
          await Promise.all(
            (selectedJobType.linkedTaskTemplateIds || [])
              .map(async (templateId) => {
                const snapshot =
                  await getDoc(
                    doc(
                      clientDb,
                      "companies",
                      COMPANY_ID,
                      "jobcardtasks",
                      templateId
                    )
                  );

                return snapshot.exists()
                  ? {
                      id: snapshot.id,
                      ...snapshot.data(),
                    }
                  : null;
              })
          )
        ).filter(Boolean) as any[];

      const allocatedJobTasks =
        linkedTaskTemplates.flatMap(
          (template: any) =>
            (template.items || [])
              .filter(
                (item: any) =>
                  item.addToTask !== false
              )
              .map((item: any) => ({
                  name:
                    item.description ||
                    template.name ||
                    "Job Task",
                  assignedTo: "Unassigned",
                  completed: false,
                  templateId: template.id,
                  templateName:
                    template.name || "Task Template",
                  templateItemId:
                    item.id || "",
                  taskType:
                    item.type || "Text",
                  options:
                    item.options || [],
                  addToTask:
                    item.addToTask !== false,
                }))
        );

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

      const createdJobRef =
        await addDoc(

        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "jobs"
        ),

        removeUndefinedValues({

          jobNumber,

          queueNumber,
          queuePositionAtBooking: estimatedQueuePosition,
          queuePosition: estimatedQueuePosition,
          estimatedDispatchAt: externalSupplier ? null : Timestamp.fromDate(requestedDispatchDate),
          estimatedArrivalAt: externalSupplier ? null : Timestamp.fromDate(requestedDispatchDate),
          estimatedRepairMinutes: externalSupplier ? 0 : Math.max(15, Number(estimatedRepairMinutes) || 120),
          travelTimeMinutes: externalSupplier ? 0 : estimatedTravelMinutes,
          travelDistanceKm: externalSupplier ? 0 : Number(estimatedTravelDistanceKm.toFixed(1)),
          travelAverageSpeedKph: 70,
          travelBranchName: externalSupplier ? "" : closestBranchName,
          edtMethod: externalSupplier ? "external-service-provider" : "assigned-technician-queue-eta-v2",
          edtPaused: Boolean(externalSupplier),
          edtCalculatedAt: serverTimestamp(),

          externalServiceProvider: Boolean(externalSupplier),
          supplierId: externalSupplier?.id || "",
          supplierName: externalSupplier?.supplierName || "",
          supplierEmail: externalSupplier?.email || "",
          supplierInformation: externalSupplier ? `${externalSupplier.supplierName || ""}${externalSupplier.supplierCode ? ` (${externalSupplier.supplierCode})` : ""}` : "",

          status:
            initialStatus.name,

          statusId:
            initialStatus.id,

          bookingAt: Timestamp.fromDate(requestedBookingDate),
          dateBooked: requestedBookingDate.toISOString(),
          isAdvancedBooking: advancedBooking,
          bookedStatusId: bookedStatus?.id || form.statusId,
          bookedStatusName: bookedStatus?.name || form.status || "Job Booked",

          createdById: getAuth().currentUser?.uid || "",
          createdByName: getAuth().currentUser?.displayName || getAuth().currentUser?.email || "System",
          updatedById: getAuth().currentUser?.uid || "",
          updatedByName: getAuth().currentUser?.displayName || getAuth().currentUser?.email || "System",

          isClosed: false,
          isCompleted: false,
          completedAt: null,
          archived: false,
          closedAt: null,
          archivedAt: null,

          statusHistory: [
            {
              id: crypto.randomUUID(),
              statusId: initialStatus.id,
              statusName: initialStatus.name,
              enteredAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              updatedById: "",
              updatedByName: getAuth().currentUser?.displayName || getAuth().currentUser?.email || "System",
            },
          ],

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

          customerContactId:
            form.customerContactId || "",

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

          locationId:
            form.locationId || "",

          locationDetails:
            form.locationDetails || { name: form.location },

          jobType:
            form.jobType,

          jobTypeId:
            selectedJobType.id,

          jobFormTemplateId:
            startFormTemplateId,

          jobFormTemplateName:
            jobFormTemplate.name ||
            "Job Form",

          jobFormFields:
            allocatedJobFormFields,

          jobForms: [
            {
              id: crypto.randomUUID(),
              templateId: startFormTemplateId,
              templateName:
                jobFormTemplate.name ||
                "Job Form",
              fields: allocatedJobFormFields,
              allowMultipleUse: jobFormTemplate.allowMultipleUse === true,
              status: form.status,
              statusId: form.statusId,
              allocatedAt: new Date().toISOString(),
            },
          ],

          jobFormAllocatedAt:
            serverTimestamp(),

          jobTaskTemplateIds:
            selectedJobType.linkedTaskTemplateIds || [],

          jobTaskTemplates:
            JSON.parse(JSON.stringify(linkedTaskTemplates)),

          description:
            form.complaint,

          complaint:
            form.complaint,

          assignedTo:
            form.assignedTo,

          assignedUserId:
            form.assignedUserId,

          assignedUserIds:
            form.assignedUserIds || [],

          assignedUsers:
            form.assignedUsers || [],

          dynamicFields: {

            ...jobCardFields.reduce(

              (acc: any, fieldId) => {

                acc[fieldId] =
                  customerOwnedFieldIds.has(fieldId)
                    ? customerFieldValue(fieldId)
                    : form[fieldId] || "";

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
        })
      );

      await recalculateActiveJobQueue();

      await Promise.all(
        allocatedJobTasks.map(
          (task: any) =>
            addDoc(
              collection(
                clientDb,
                "companies",
                COMPANY_ID,
                "jobs",
                createdJobRef.id,
                "tasks"
              ),
              {
                ...task,
                autoAllocated: true,
                createdAt:
                  serverTimestamp(),
              }
            )
        )
      );

      // A newly created job does not pass through the Job Details status-change
      // handler, so run matching "Job Status Change" automations here as well.
      const [communicationSnapshot, messageTemplateSnapshot, notificationUserSnapshot] = await Promise.all([
        getDocs(collection(clientDb, "companies", COMPANY_ID, "communications")),
        getDocs(collection(clientDb, "companies", COMPANY_ID, "messageTemplates")),
        getDocs(collection(clientDb, "companies", COMPANY_ID, "users")),
      ]);
      const messageTemplates = messageTemplateSnapshot.docs.map((templateDocument) => ({
        id: templateDocument.id,
        ...(templateDocument.data() as any),
      }));
      const bookingRules = communicationSnapshot.docs
        .map((communicationDocument) => ({
          id: communicationDocument.id,
          ...(communicationDocument.data() as any),
        }))
        .filter((rule: any) => {
          const matchesStatus = rule.triggerStatusIds?.includes(initialStatus.id) ||
            rule.triggerStatuses?.includes(initialStatus.name);
          const matchesJobType = rule.allJobTypes !== false ||
            rule.selectedJobTypes?.includes(form.jobType) ||
            rule.selectedJobTypes?.includes(selectedJobType.name);
          return rule.active !== false && rule.ruleType === "Job Status Change" &&
            matchesStatus && matchesJobType;
        });
      const jobLink = `${window.location.origin}/jobs/${createdJobRef.id}`;
      const jobCardLink = `${jobLink}/jobcard?type=customer`;
      const baseTagValues: Record<string, string> = {
        jobNumber,
        jobStatus: initialStatus.name,
        status: initialStatus.name,
        jobType: form.jobType || selectedJobType.name || "",
        customerName: form.customerName || "",
        contactName: form.customerContact || "",
        contactTelephone: form.customerContactNumber || "",
        customerEmail: form.customerContactEmail || "",
        vehicleReg: form.vehicleRegNo || "",
        fleetNumber: form.vehicleFleetNo || "",
        fleetNo: form.vehicleFleetNo || "",
        jobDescription: form.complaint || "",
        breakdownLocation: form.location || "",
        queueNumber: String(queueNumber || ""),
        queuePosition: String(queueNumber || ""),
        estimatedDispatchTime: externalSupplier
          ? ""
          : requestedDispatchDate.toLocaleString("en-ZA", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }),
        eta: externalSupplier
          ? ""
          : requestedDispatchDate.toLocaleString("en-ZA", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }),
        link: jobCardLink,
        jobLink,
        jobCardLink,
      };
      const applyBookingTags = (value: string, extra: Record<string, string> = {}) => {
        const replacements = Object.fromEntries(
          Object.entries({ ...baseTagValues, ...extra }).map(([key, replacement]) => [
            key.replace(/[^a-z0-9]/gi, "").toLowerCase(),
            replacement,
          ])
        );
        return String(value || "").replace(
          /\{\{?\s*([a-z0-9_]+)\s*\}\}?/gi,
          (match, key) => replacements[String(key).replace(/[^a-z0-9]/gi, "").toLowerCase()] ?? match
        );
      };

      const bookingNotificationRecipients = notificationUserSnapshot.docs
        .map((userDocument) => ({ id: userDocument.id, ...userDocument.data() } as any))
        .filter((user) => user.active !== false)
        .filter((user) => effectivePermissions(user)["View notifications"] === true)
        .filter((user) => user.notificationPreferences?.job_booked !== false);
      await Promise.all(bookingNotificationRecipients.map((recipient) => addDoc(
        collection(clientDb, "companies", COMPANY_ID, "notifications"),
        {
          type: "job_booked",
          title: `Job ${jobNumber} booked`,
          message: `${form.customerName || "Customer"} · ${form.jobType || selectedJobType.name || "Job"}`,
          recipientId: recipient.id,
          recipientName: recipient.name || recipient.displayName || `${recipient.firstName || ""} ${recipient.lastName || ""}`.trim() || recipient.email || "FleetFix User",
          jobId: createdJobRef.id,
          jobNumber,
          statusId: initialStatus.id,
          statusName: initialStatus.name,
          sourcePath: `/jobs/${createdJobRef.id}`,
          createdById: getAuth().currentUser?.uid || "",
          createdByName: getAuth().currentUser?.displayName || getAuth().currentUser?.email || "System",
          status: "active",
          finalized: false,
          createdAt: serverTimestamp(),
        }
      )));

      for (const rule of bookingRules) {
        for (const message of rule.messages || []) {
          const notificationType = String(message.notificationType || "");
          const recipients = /assigned employees/i.test(notificationType)
            ? (form.assignedUserIds || []).map((userId: string) => {
                const selectedUser = (form.assignedUsers || []).find((user: any) => user.id === userId);
                const technician = technicians.find((user) => user.id === userId);
                return {
                  id: userId,
                  name: selectedUser?.name || technicianName(technician as Technician) || "Assigned Employee",
                  email: selectedUser?.email || technician?.email || "",
                  phone: selectedUser?.mobile || technician?.mobile || "",
                };
              })
            : /customer/i.test(notificationType)
              ? [{ id: form.customerContactId || form.customerId, name: form.customerContact || form.customerName || "Customer", email: form.customerContactEmail || "", phone: form.customerContactNumber || "" }]
              : externalSupplier
                ? [{ id: externalSupplier.id, name: externalSupplier.supplierName || "Supplier", email: externalSupplier.email || "", phone: externalSupplier.mobile || externalSupplier.phone || "" }]
                : [];

          for (const recipient of recipients) {
            if (message.sendEmail === true && !recipient.email) {
              console.warn(`Communication ${rule.name || rule.id} skipped: ${recipient.name} has no email address.`);
              continue;
            }
            for (const templateId of message.templateIds || []) {
              const template = messageTemplates.find((item: any) =>
                item.id === templateId || item.name === templateId
              );
              if (!template) continue;
              const recipientTags = {
                employeeName: recipient.name,
                technicianName: recipient.name,
              };
              const subject = applyBookingTags(template.subject || template.name || rule.name || "Job booked", recipientTags);
              const body = applyBookingTags(template.htmlBody || "", recipientTags);
              const historyRef = await addDoc(
                collection(clientDb, "companies", COMPANY_ID, "jobs", createdJobRef.id, "communications"),
                {
                  source: "job-booking-status",
                  communicationId: rule.id,
                  communicationName: rule.name || "Job Booked",
                  templateId: template.id,
                  templateName: template.name || String(templateId),
                  recipientType: notificationType,
                  recipientId: recipient.id || "",
                  recipientName: recipient.name,
                  recipientEmail: recipient.email,
                  recipientPhone: recipient.phone,
                  subject,
                  body,
                  state: "queued",
                  createdAt: serverTimestamp(),
                }
              );
              await addDoc(collection(clientDb, "companies", COMPANY_ID, "communicationQueue"), {
                communicationId: rule.id,
                communicationName: rule.name || "Job Booked",
                jobId: createdJobRef.id,
                jobNumber,
                historyId: historyRef.id,
                statusId: initialStatus.id,
                statusName: initialStatus.name,
                templateId: template.id,
                templateName: template.name || String(templateId),
                notificationType,
                recipientId: recipient.id || "",
                recipientName: recipient.name,
                recipientEmail: recipient.email,
                recipientPhone: recipient.phone,
                subject,
                body,
                sendEmail: message.sendEmail === true,
                sendSms: message.sendSms === true,
                attachJobCard: message.attachJobCard === true,
                attachCustomerJobCard: message.attachCustomerJobCard === true,
                state: "pending",
                createdAt: serverTimestamp(),
              });
            }
          }
        }
      }

      if (externalSupplier && externalTemplate) {
        const tagValues: Record<string, string> = {
          jobNumber,
          jobStatus: initialStatus.name,
          status: initialStatus.name,
          customerName: form.customerName || "",
          contactName: form.customerContact || "",
          contactTelephone: form.customerContactNumber || "",
          vehicleReg: form.vehicleRegNo || "",
          fleetNumber: form.vehicleFleetNo || "",
          fleetNo: form.vehicleFleetNo || "",
          jobDescription: form.complaint || "",
          breakdownLocation: form.location || "",
          supplierName: externalSupplier.supplierName || "",
          supplierCode: externalSupplier.supplierCode || "",
          link: jobLink,
          jobLink,
          jobCardLink,
        };
        const applyTags = (value: string) => Object.entries(tagValues).reduce(
          (result, [key, replacement]) => result.replaceAll(`{{${key}}}`, replacement),
          String(value || "")
        );
        const subject = applyTags(externalTemplate.subject || externalTemplate.name || `Job ${jobNumber}`);
        const body = applyTags(externalTemplate.htmlBody || "");
        const historyRef = await addDoc(
          collection(clientDb, "companies", COMPANY_ID, "jobs", createdJobRef.id, "communications"),
          {
            source: "external-service-provider",
            templateId: externalTemplate.id,
            templateName: externalTemplate.name || "External service provider booking",
            recipientType: "Supplier",
            recipientId: externalSupplier.id,
            recipientName: externalSupplier.supplierName || "Supplier",
            recipientEmail: externalSupplier.email,
            subject,
            body,
            state: "queued",
            createdById: getAuth().currentUser?.uid || "",
            createdByName: getAuth().currentUser?.displayName || getAuth().currentUser?.email || "System",
            createdAt: serverTimestamp(),
          }
        );
        await addDoc(collection(clientDb, "companies", COMPANY_ID, "communicationQueue"), {
          jobId: createdJobRef.id,
          jobNumber,
          historyId: historyRef.id,
          supplierId: externalSupplier.id,
          recipientId: externalSupplier.id,
          recipientName: externalSupplier.supplierName || "Supplier",
          recipientEmail: externalSupplier.email,
          notificationType: "Supplier",
          templateId: externalTemplate.id,
          templateName: externalTemplate.name || "External service provider booking",
          communicationName: externalTemplate.name || "External service provider booking",
          subject,
          body,
          sendEmail: true,
          sendSms: false,
          attachJobCard: externalTemplate.attachJobCard === true,
          attachCustomerJobCard: externalTemplate.attachCustomerJobCard === true,
          state: "pending",
          createdAt: serverTimestamp(),
        });
      }

      window.dispatchEvent(new Event("fleetfix:changes-saved"));

      alert(
        "Job Created Successfully"
      );

      location.href =
        "/jobs";

    } catch (err: any) {

      console.error(err);

      const errorMessage = err?.message || err?.code || "Unknown error";
      alert(`Failed to create job: ${errorMessage}`);

    } finally {

      setSaving(false);

    }
  }

  return (

    <div className="min-h-screen bg-[#f3f6fb] p-3">

      <div className="mx-auto max-w-[1800px]">

        {/* HEADER */}
        <div className="mb-3 flex items-center justify-between">

          <div>

            <div className="mb-2 text-xs font-black uppercase tracking-[0.25em] text-gray-400">
              FleetFix Pro
            </div>

            <h1 className="text-3xl font-black tracking-tight text-gray-900">
              Create New Job
            </h1>

          </div>

          <Link
            href="/jobs"
            className="
              inline-flex
              h-11
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
        <div className="grid grid-cols-1 gap-3">

          {/* LEFT */}
          <div className="space-y-3">

            {/* CUSTOMER */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">

              <h2 className="mb-3 text-xl font-black text-gray-900">
                Customer Information
              </h2>

              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">

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
                      h-11
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
        px-4
        py-2
        text-left
        text-sm
        hover:bg-blue-600
        hover:text-white
      "
                            >

                              <div className="text-xs font-bold leading-tight">
                                {customer.companyName}
                              </div>

                              <div className="mt-0.5 text-[10px] leading-tight opacity-70">
                                {customer.customerCode}
                              </div>

                              <div className="mt-0.5 text-[10px] leading-tight opacity-70">
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
      h-11
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

                            (contact.mobile || contact.phone || "")
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
                                    contact.mobile || contact.phone || "",

                                  customerContactId:
                                    contact.id || "",

                                  customerContactEmail:
                                    contact.email || "",

                                });


                                setShowContactResults(false);

                              }}

                              className="
w-full
border-b
border-gray-100
px-4
py-2
text-left
text-sm
hover:bg-blue-600
hover:text-white
"

                            >


                              <div className="text-xs font-bold leading-tight">

                                {contact.name}

                              </div>


                              <div className="text-[10px] leading-tight opacity-70">

                                {contact.position}

                              </div>


                              <div className="text-[10px] leading-tight opacity-70">

                                {contact.mobile || contact.phone}

                              </div>


                              <div className="text-[10px] leading-tight opacity-70">

                                {contact.email}

                              </div>


                            </button>


                          ))}


                      </div>

                    </div>

                  )}

                </div>
                {/* END CONTACT */}

                {additionalCustomerFields.map((fieldId) => (
                  <div key={fieldId}>
                    <label className="mb-2 block text-sm font-bold text-gray-700">
                      {jobCardFieldLabels[fieldId] || fieldId.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase())}
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={customerFieldValue(fieldId)}
                      placeholder={form.customerId ? "Not set on customer account" : "Select a customer"}
                      className="h-11 w-full cursor-not-allowed rounded-xl border border-gray-200 bg-gray-100 px-4 text-gray-600"
                    />
                    <p className="mt-2 text-xs text-gray-500">Managed in the customer account.</p>
                  </div>
                ))}

                {jobCardFields.filter((fieldId) => customerReferenceFieldIds.has(fieldId)).map((fieldId) => (
                  <div key={fieldId}>
                    <label className="mb-2 block text-sm font-bold text-gray-700">
                      {jobCardFieldLabels[fieldId] || ({ customerOrderNumber: "Customer Order Number", referenceNumber: "Customer Reference Number", invoiceNumber: "Invoice Number" } as Record<string, string>)[fieldId]}
                    </label>
                    <input
                      type="text"
                      value={form[fieldId] || ""}
                      onChange={(event) => setForm({ ...form, [fieldId]: event.target.value })}
                      className="h-11 w-full rounded-xl border border-gray-300 px-4 outline-none focus:border-blue-500"
                    />
                  </div>
                ))}

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

                    onBlur={() => {
                      setTimeout(() => setShowVehicleResults(false), 200);
                    }}

                    onKeyDown={(event) => {
                      if (event.key === "Escape") setShowVehicleResults(false);
                    }}

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
px-4
py-2
text-left
text-sm
hover:bg-blue-600
hover:text-white
"

                            >


                              <div className="text-xs font-bold leading-tight">

                                {vehicle.regNo}

                              </div>


                              <div className="
text-[10px]
leading-tight
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
          <div className="space-y-3">

            {/* LOCATION */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">

              <h2 className="mb-6 text-2xl font-black text-gray-900">
                Location
              </h2>

              <div className="relative">


                <input

                  type="text"

                  placeholder="Search location..."

                  value={form.location}

                  onFocus={() =>
                    setShowLocationResults(true)
                  }

                  onBlur={() => {
                    setTimeout(() => setShowLocationResults(false), 200);
                  }}

                  onKeyDown={(event) => {
                    if (event.key === "Escape") setShowLocationResults(false);
                  }}

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
                                loc.name,
                              locationId: loc.id,
                              locationDetails: {
                                name: loc.name || "",
                                address: loc.address || "",
                                city: loc.city || "",
                                province: loc.province || "",
                                country: loc.country || "",
                                latitude: loc.latitude || loc.gpsLat || loc.gpsLatitude || "",
                                longitude: loc.longitude || loc.gpsLng || loc.gpsLongitude || "",
                                gpsLat: loc.gpsLat || loc.latitude || loc.gpsLatitude || "",
                                gpsLng: loc.gpsLng || loc.longitude || loc.gpsLongitude || "",
                                googleMaps: loc.googleMapsLink || loc.googleMaps || "",
                                googleMapsLink: loc.googleMapsLink || loc.googleMaps || "",
                                notes: loc.notes || "",
                              },
                            });

                            setShowLocationResults(false);

                          }}

                          className="
w-full
text-left
px-4
py-2
font-bold
text-xs
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
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">

              <h2 className="mb-6 text-2xl font-black text-gray-900">
                Job Details
              </h2>

              <div className="space-y-3">

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

                          jobTypeId: "",
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

                            .filter(
                              (jobType) =>
                                jobType.active !== false
                            )

                            .sort((a, b) =>
                              technicianName(a)
                                .localeCompare(
                                  technicianName(b)
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

                                    jobTypeId:
                                      jobType.id,
                                  });

                                  setShowJobTypeResults(false);

                                }}

                                className="
                w-full
                border-b
                border-gray-100
                px-4
                py-2
                text-left
                text-xs
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

              </div>

            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="mb-4 text-xl font-black text-gray-900">Assign Users / Technicians</h2>
              <div>

                  {(form.assignedUsers || []).length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {form.assignedUsers.map((user: any) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => {
                            const selected = form.assignedUsers.filter((item: any) => item.id !== user.id);
                            setForm({
                              ...form,
                              assignedUsers: selected,
                              assignedUserIds: selected.map((item: any) => item.id),
                              assignedUserId: selected[0]?.id || "",
                              assignedTo: selected.map((item: any) => item.name).join(", "),
                            });
                          }}
                          className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-2 py-1.5 text-sm font-bold text-gray-800"
                          title="Remove user"
                        >
                          <UserAvatar user={user} />
                          <span>{technicianName(user)}</span>
                          <span className="text-gray-400">×</span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="relative">


                    <input

                      type="text"

                      placeholder="Search and add users..."

                      value={assignedUserSearch}

                      onFocus={() =>
                        setShowTechnicianResults(true)
                      }

                      onKeyDown={(event) => {
                        if (event.key === "Escape") setShowTechnicianResults(false);
                      }}

                      onChange={(e) => {

                        setAssignedUserSearch(e.target.value);


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

                        <div className="border-b border-gray-200 bg-white p-3">
                          <button type="button" onClick={() => setShowTechnicianResults(false)} className="w-full rounded-xl bg-blue-600 px-4 py-3 font-black text-white hover:bg-blue-700">Done</button>
                        </div>

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
                                tech.firstName,
                                tech.lastName,
                                tech.role,
                                tech.mobile,
                                tech.email
                              ]

                                .join(" ")
                                .toLowerCase()
                                .includes(
                                  assignedUserSearch.toLowerCase()
                                )

                            )


                            .map((tech) => (


                              <button

                                key={tech.id}

                                type="button"

                                onClick={() => {
                                  const displayName = technicianName(tech);
                                  const existingIds: string[] = form.assignedUserIds || [];
                                  const selected = existingIds.includes(tech.id)
                                    ? (form.assignedUsers || []).filter((user: any) => user.id !== tech.id)
                                    : [...(form.assignedUsers || []), { id: tech.id, name: displayName, firstName: tech.firstName || "", lastName: tech.lastName || "", email: tech.email || "", mobile: tech.mobile || "", color: tech.color || tech.profileColor || "#2563eb" }];
                                  setForm({
                                    ...form,
                                    assignedUsers: selected,
                                    assignedUserIds: selected.map((user: any) => user.id),
                                    assignedUserId: selected[0]?.id || "",
                                    assignedTo: selected.map((user: any) => user.name).join(", "),
                                  });
                                  setAssignedUserSearch("");


                                }}

                                className="w-full border-b border-gray-100 px-4 py-2 text-left text-xs hover:bg-blue-50"

                              >


                                <div className="flex items-center gap-3">
                                  <UserAvatar user={tech} size="lg" />
                                  <div className="font-black text-gray-900">{technicianName(tech)}</div>
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

            {/* JOB FIELDS */}
            {false && editableJobFields.length > 0 && (

              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">

                <h2 className="mb-6 text-2xl font-black text-gray-900">
                  Job Fields
                </h2>

                <div className="grid grid-cols-1 gap-5">

                  {editableJobFields.map((fieldId) => (

                    <div key={fieldId}>

                      <label className="mb-2 block text-sm font-bold text-gray-700">

                        {jobCardFieldLabels[fieldId] || fieldId
                          .replace(/([A-Z])/g, " $1")
                          .replace(/^./, (s: string) =>
                            s.toUpperCase()
                          )}

                      </label>

                      <input
                        type="text"
                        readOnly={customerOwnedFieldIds.has(fieldId)}
                        value={customerOwnedFieldIds.has(fieldId) ? customerFieldValue(fieldId) : (form[fieldId] || "")}
                        onChange={(e) => !customerOwnedFieldIds.has(fieldId) && setForm({ ...form, [fieldId]: e.target.value })}
                        className="
                          h-14
                          w-full
                          rounded-2xl
                          border-2
                          border-gray-200
                          px-5
                          outline-none
                          focus:border-blue-500
                          read-only:cursor-not-allowed
                          read-only:bg-gray-100
                          read-only:text-gray-600
                        "
                      />

                      {customerOwnedFieldIds.has(fieldId) && (
                        <p className="mt-2 text-xs text-gray-500">Managed in the customer account.</p>
                      )}

                    </div>

                  ))}

                </div>

              </div>

            )}

            {/* STATUS REQUIRED FIELDS */}

            {false && statusFields.length > 0 && (

              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">


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

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="text-xl font-black text-gray-900">Queue &amp; Estimated Arrival Time (ETA)</h2>
              <label className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm font-bold text-orange-900">
                <span><span className="block">External Service Provider</span><span className="mt-1 block text-xs font-normal text-orange-700">Disable internal repair and travel time calculations and send the booking to a supplier.</span></span>
                <input type="checkbox" checked={externalServiceProvider} onChange={(event) => { setExternalServiceProvider(event.target.checked); if (!event.target.checked) setExternalSupplierId(""); }} className="h-5 w-5" />
              </label>
              {externalServiceProvider && <label className="mt-4 block text-sm font-bold text-gray-700">External supplier *
                <select value={externalSupplierId} onChange={(event) => setExternalSupplierId(event.target.value)} className="mt-2 h-12 w-full rounded-xl border-2 border-gray-200 bg-white px-4">
                  <option value="">Select supplier</option>
                  {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.supplierCode ? `${supplier.supplierCode} - ` : ""}{supplier.supplierName}</option>)}
                </select>
                {externalSupplierId && (() => { const supplier = suppliers.find((item) => item.id === externalSupplierId); return <span className="mt-2 block text-xs font-normal text-gray-500">Status and email template are taken from {supplier?.supplierName || "the selected supplier"} setup.</span>; })()}
              </label>}
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl bg-blue-50 p-4">
                  <div className="text-xs font-black uppercase text-blue-500">Estimated queue position</div>
                  <div className="mt-1 text-2xl font-black text-blue-800">#{estimatedQueuePosition}</div>
                  <p className="mt-1 text-xs text-blue-600">The permanent queue number is assigned automatically when the job is created.</p>
                </div>
                <label className="text-sm font-bold text-gray-700">Estimated repair time (minutes)
                  <input type="number" min="15" step="15" value={externalServiceProvider ? 0 : estimatedRepairMinutes} disabled={externalServiceProvider} onChange={(event) => setEstimatedRepairMinutes(Math.max(15, Number(event.target.value) || 15))} className="mt-2 h-12 w-full rounded-xl border-2 border-gray-200 px-4 disabled:bg-gray-100" />
                </label>
                <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700 md:col-span-2">
                  Estimated round-trip travel: <strong>{externalServiceProvider ? 0 : estimatedTravelMinutes} min</strong>
                  {!externalServiceProvider && (estimatedTravelDistanceKm > 0 ? ` · ${estimatedTravelDistanceKm.toFixed(1)} km at 70 km/h${closestBranchName ? ` · Closest branch: ${closestBranchName}` : ""}` : " · Add GPS coordinates to Company Details and the job location to calculate automatically.")}
                  {externalServiceProvider && " · Disabled for external service provider"}
                </div>
                <label className="md:col-span-2 text-sm font-bold text-gray-700">ETA — Estimated Arrival Time
                  <input type="datetime-local" value={estimatedDispatchTime} disabled={externalServiceProvider} onChange={(event) => { setEstimatedDispatchTime(event.target.value); setEdtManuallyEdited(true); }} className="mt-2 h-12 w-full rounded-xl border-2 border-gray-200 px-4 disabled:bg-gray-100" />
                  <span className="mt-2 block text-xs font-normal text-gray-500">Calculated from earlier booked jobs’ round-trip travel and repair time, plus this job’s one-way travel and a 20-minute dispatch allowance. You can override this estimate.</span>
                </label>
                {edtManuallyEdited && <button type="button" onClick={() => setEdtManuallyEdited(false)} className="justify-self-start rounded-lg border px-3 py-2 text-xs font-bold text-blue-700">Recalculate ETA</button>}
              </div>
            </div>

            {/* SAVE */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">

              <h2 className="mb-4 text-xl font-black text-gray-900">Create Job</h2>

              <div className="mb-6">

                <div className="text-sm font-bold text-gray-500">
                  Default Status
                </div>

                <div className="mt-1 text-xl font-black text-blue-600">
                  {externalServiceProvider ? (suppliers.find((supplier) => supplier.id === externalSupplierId)?.externalJobStatusName || "Supplier-linked external status") : advancedBooking ? "Setup (Advanced Booking)" : "Job Booked"}
                </div>

                <label className="mt-5 flex cursor-pointer items-center gap-3 text-sm font-bold text-gray-700">
                  <input
                    type="checkbox"
                    checked={advancedBooking}
                    onChange={(event) => {
                      setAdvancedBooking(event.target.checked);
                      if (!event.target.checked) setBookingDateTime(currentLocalDateTime());
                    }}
                    className="h-5 w-5 rounded border-gray-300"
                  />
                  Advanced Booking
                </label>

                <label className="mt-4 block text-sm font-bold text-gray-700">
                  Booking date and time
                  <input
                    type="datetime-local"
                    value={advancedBooking ? bookingDateTime : currentLocalDateTime()}
                    min={advancedBooking ? currentLocalDateTime() : undefined}
                    disabled={!advancedBooking}
                    onChange={(event) => setBookingDateTime(event.target.value)}
                    className="mt-2 h-12 w-full rounded-xl border-2 border-gray-200 px-4 disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </label>
                <p className="mt-2 text-xs text-gray-500">
                  New jobs use the current date and time. Enable Advanced Booking to schedule a future job.
                </p>

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
p-3
">


            <div className="
w-full
max-w-[900px]
max-h-[calc(100vh-1.5rem)]
overflow-hidden
rounded-2xl
bg-white
flex
flex-col
shadow-2xl
">


              <div className="
flex
justify-between
items-center
shrink-0
border-b
border-gray-200
px-5
py-4
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



              <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="
grid
grid-cols-1
gap-4
md:grid-cols-6
">

                <div className="md:col-span-3">
                  <label className="text-sm font-bold">Location Type</label>
                  <select value={newLocation.locationType || ""} onChange={(event) => setNewLocation((current: any) => ({ ...current, locationType: event.target.value }))} className="mt-2 h-11 w-full rounded-xl border border-gray-300 bg-white px-3 outline-none focus:border-blue-500">
                    <option value="">Select location type</option><option value="Parking">Parking</option><option value="Depot">Depot</option><option value="Roadside">Roadside</option><option value="Place">Place</option>
                  </select>
                </div>

                <div className="md:col-span-3"><LocationInput location={newLocation} setLocation={setNewLocation} label="Location Name" field="name" /></div>

                {newLocation.locationType === "Roadside" && <div className="grid grid-cols-1 gap-4 md:col-span-6 md:grid-cols-2">
                  <div className="md:col-span-2"><label className="text-sm font-bold">Roadside Position</label><select value={newLocation.roadsidePosition || ""} onChange={(event) => setNewLocation((current: any) => ({ ...current, roadsidePosition: event.target.value }))} className="mt-2 h-11 w-full rounded-xl border border-gray-300 bg-white px-3"><option value="">Select roadside position</option><option value="between">Standing between Point A and Point B</option><option value="near">Standing near a Point</option></select></div>
                  {newLocation.roadsidePosition === "between" && <><LocationInput location={newLocation} setLocation={setNewLocation} label="Point A" field="pointA" /><LocationInput location={newLocation} setLocation={setNewLocation} label="Point B" field="pointB" /></>}
                  {newLocation.roadsidePosition === "near" && <div className="md:col-span-2"><LocationInput location={newLocation} setLocation={setNewLocation} label="Near Point" field="nearPoint" /></div>}
                </div>}


                {newLocation.locationType !== "Roadside" && <div className="md:col-span-6">

                  <LocationInput
                    location={newLocation}
                    setLocation={setNewLocation}
                    label="Address"
                    field="address"
                    textarea
                  />

                </div>}

                {newLocation.locationType !== "Roadside" && <div className="md:col-span-2"><LocationInput
                  location={newLocation}
                  setLocation={setNewLocation}
                  label="City"
                  field="city"
                /></div>}

                <div className={newLocation.locationType === "Roadside" ? "md:col-span-3" : "md:col-span-2"}><LocationInput
                  location={newLocation}
                  setLocation={setNewLocation}
                  label="Province"
                  field="province"
                /></div>

                <div className={newLocation.locationType === "Roadside" ? "md:col-span-3" : "md:col-span-2"}><LocationInput location={newLocation} setLocation={setNewLocation} label="Country" field="country" /></div>


                <div className="md:col-span-3"><LocationInput
                  location={newLocation}
                  setLocation={setNewLocation}
                  label="GPS Latitude"
                  field="latitude"
                /></div>


                <div className="md:col-span-3"><LocationInput
                  location={newLocation}
                  setLocation={setNewLocation}
                  label="GPS Longitude"
                  field="longitude"
                /></div>


                <div className="md:col-span-6">

                  <LocationInput
                    location={newLocation}
                    setLocation={setNewLocation}
                    label="Google Maps Link"
                    field="googleMaps"
                  />

                  <button
                    type="button"
                    onClick={() => void updateNewLocationGpsAndMapsLink()}
                    disabled={updatingLocationCoordinates}
                    className="mt-3 h-11 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {updatingLocationCoordinates ? "Updating..." : "Update GPS / Maps Link"}
                  </button>

                </div>


                <div className="md:col-span-6">

                  <LocationInput
                    location={newLocation}
                    setLocation={setNewLocation}
                    label="Notes"
                    field="notes"
                    textarea
                  />

                </div>


              </div>

              </div>



              <div className="
shrink-0
flex
justify-end
gap-4
border-t
border-gray-200
bg-white
px-5
py-4
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


function removeUndefinedValues<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => removeUndefinedValues(item)) as T;
  }

  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, removeUndefinedValues(item)])
    ) as T;
  }
  return value;
}

function LocationInput({ label, field, textarea = false, location, setLocation }: any) {
  const sharedClass = "mt-2 w-full rounded-xl border border-gray-300 px-3 outline-none focus:border-blue-500";
  const updateValue = (value: string) => setLocation((current: any) => ({ ...current, [field]: value }));

  return <div>
    <label className="text-sm font-bold">{label}</label>
    {textarea ? (
      <textarea value={location[field] || ""} onChange={(event) => updateValue(event.target.value)} className={`${sharedClass} h-24 p-3`} />
    ) : (
      <input value={location[field] || ""} onChange={(event) => updateValue(event.target.value)} className={`${sharedClass} h-11`} />
    )}
  </div>;
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

    <div className="relative" data-job-search-dropdown="true">


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
                  px-4
                  py-2
                  text-left
                  text-xs
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
