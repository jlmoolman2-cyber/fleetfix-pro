"use client";

import Image from "next/image";
import Link from "next/link";

import { getAuth }
  from "firebase/auth";

import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  addDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
}
  from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";

import { clientDb, storage } from "@/lib/firebaseClient";
import { auditFields } from "@/lib/audit";
import { formatDateTime24 } from "@/lib/dateTime";
import { resolvedStockByLocation, stockTotals } from "@/lib/inventoryStock";

import {
  Fragment,
  useEffect,
  useState,
} from "react";

interface InventoryItem {

  id: string;

  imageUrl?: string;

  imageUrls?: string[];

  qrCodeUrl?: string;

  partNumber?: string;

  description?: string;

  crossReferences?: string;

  category?: string;

  brand?: string;

  unit?: string;

  barcode?: string;

  rrStandardTime?: string;

  costPrice?: number;

  markupPercent?: number | null;

  sellPrice?: number;

  quantityTracking?: boolean;

  serialNumberTracking?: boolean;

  warehouseStock?: {
    [key: string]: number;
  };

  minimumStockByLocation?: {
    [key: string]: number | null;
  };

  warehouseTotal?: number;

  vanTotal?: number;

  grandTotal?: number;

  isActive?: boolean;

  customFields?: {
    [fieldId: string]: string | number;
  };
}

interface CustomFieldDefinition {
  id: string;
  label: string;
  type: "text" | "number" | "date" | "time" | "textarea";
  required: boolean;
}

interface DropdownItem {
  id: string;
  name: string;
}

function SearchableLookup({
  id,
  label,
  value,
  options,
  required = false,
  className = "",
  onChange,
  onAdd,
}: {
  id: string;
  label: string;
  value: string;
  options: DropdownItem[];
  required?: boolean;
  className?: string;
  onChange: (value: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="mb-2 block text-sm font-bold text-gray-700"
      >
        {label}
        {required && (
          <span className="ml-1 text-red-500">*</span>
        )}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          type="text"
          list={`${id}-options`}
          value={value}
          required={required}
          onChange={(event) => onChange(event.target.value)}
          placeholder={`Search or select ${label.toLowerCase()}`}
          className="
            h-14
            min-w-0
            flex-1
            rounded-2xl
            border-2
            border-gray-200
            bg-white
            px-5
            outline-none
            focus:border-blue-500
          "
        />
        <datalist id={`${id}-options`}>
          {options.map((option) => (
            <option key={option.id} value={option.name} />
          ))}
        </datalist>
        <button
          type="button"
          onClick={onAdd}
          className="
            h-14
            shrink-0
            rounded-2xl
            border-2
            border-blue-200
            bg-blue-50
            px-4
            text-sm
            font-black
            text-blue-700
            hover:bg-blue-100
          "
        >
          + Add New
        </button>
      </div>
    </div>
  );
}

export default function InventoryDetailsPage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [uploadingImages, setUploadingImages] = useState(false);
  const [imageUploadError, setImageUploadError] = useState("");
  const [isDraggingImage, setIsDraggingImage] = useState(false);

  const [item, setItem] =
    useState<InventoryItem | null>(
      null
    );

  const auth = getAuth();

  const currentUser =
    auth.currentUser;

  const [stockLocations, setStockLocations] =
    useState<any[]>([]);

  const [movements, setMovements] =
    useState<any[]>([]);
  const [expandedJobMovements, setExpandedJobMovements] =
    useState<Set<string>>(new Set());

  const [serialRecords, setSerialRecords] =
    useState<any[]>([]);

  const [customFieldDefinitions, setCustomFieldDefinitions] =
    useState<CustomFieldDefinition[]>([]);

  const [categories, setCategories] =
    useState<DropdownItem[]>([]);

  const [brands, setBrands] =
    useState<DropdownItem[]>([]);

  const [binLocations, setBinLocations] =
    useState<DropdownItem[]>([]);

  useEffect(() => {

    async function load() {

      const resolvedParams =
        await params;

      const docRef = doc(
        clientDb,
        "companies",
        "comp_001",
        "inventory",
        resolvedParams.id
      );

      const snapshot =
        await getDoc(docRef);

      if (snapshot.exists()) {

        setItem({
          id: snapshot.id,
          ...(snapshot.data() as any),
        });
        loadMovements(
          snapshot.id
        );
        loadSerialRecords(snapshot.id);
      }

      setLoading(false);
    }

    load();

    loadStockLocations();
    loadCustomFieldDefinitions();
    loadLookupOptions();


  }, [params]);

  async function loadCustomFieldDefinitions() {
    const fieldSnap = await getDocs(
      collection(
        clientDb,
        "companies",
        "comp_001",
        "inventory_settings",
        "setup",
        "custom_fields"
      )
    );

    setCustomFieldDefinitions(
      fieldSnap.docs.map((fieldDoc) => ({
        id: fieldDoc.id,
        label: String(fieldDoc.data().label || ""),
        type: (fieldDoc.data().type || "text") as
          CustomFieldDefinition["type"],
        required: Boolean(fieldDoc.data().required),
      }))
    );
  }

  async function loadLookupOptions() {
    const [categorySnap, brandSnap, binLocationSnap] =
      await Promise.all([
        getDocs(
          collection(
            clientDb,
            "companies",
            "comp_001",
            "inventory_categories"
          )
        ),
        getDocs(
          collection(
            clientDb,
            "companies",
            "comp_001",
            "inventory_brands"
          )
        ),
        getDocs(
          collection(
            clientDb,
            "companies",
            "comp_001",
            "inventory_bin_locations"
          )
        ),
      ]);

    const toDropdownItems = (
      snapshot: typeof categorySnap
    ): DropdownItem[] =>
      snapshot.docs
        .map((optionDoc) => ({
          id: optionDoc.id,
          name: String(optionDoc.data().name || ""),
        }))
        .filter((option) => option.name);

    setCategories(toDropdownItems(categorySnap));
    setBrands(toDropdownItems(brandSnap));
    setBinLocations(toDropdownItems(binLocationSnap));
  }

  async function addLookupOption(
    collectionName:
      | "inventory_categories"
      | "inventory_brands"
      | "inventory_bin_locations",
    label: string,
    onSelect: (value: string) => void
  ) {
    const enteredName = prompt(`Enter new ${label.toLowerCase()}`);
    const name = enteredName?.trim();

    if (!name) return;

    await setDoc(
      doc(
        clientDb,
        "companies",
        "comp_001",
        collectionName,
        name
      ),
      {
        name,
        active: true,
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );

    onSelect(name);
    await loadLookupOptions();
  }

  async function loadMovements(
    inventoryId: string
  ) {
    const itemMovements = collection(
      clientDb,
      "companies",
      "comp_001",
      "inventory",
      inventoryId,
      "movements"
    );
    const transactionMovements = query(
      collection(
        clientDb,
        "companies",
        "comp_001",
        "inventory_transactions"
      ),
      where("inventoryId", "==", inventoryId)
    );

    const results = await Promise.allSettled([
      getDocs(itemMovements),
      getDocs(transactionMovements),
    ]);
    const combined = results.flatMap((result, sourceIndex) => {
      if (result.status === "rejected") {
        console.error("Failed to load inventory movement source", result.reason);
        return [];
      }

      return result.value.docs.map((movementDoc) => ({
        id: `${sourceIndex}-${movementDoc.id}`,
        sourceDocumentId: movementDoc.id,
        ...movementDoc.data(),
      }));
    });
    const uniqueMovements = new Map<string, any>();

    combined.forEach((movement: any) => {
      const createdAt = movement.createdAt?.toMillis?.()
        ?? movement.createdAt?.seconds
        ?? movement.createdAt
        ?? "";
      const fingerprint = [
        createdAt,
        movement.type,
        movement.qty,
        movement.locationId,
        movement.fromLocationId,
        movement.toLocationId,
        movement.referenceType,
        movement.referenceNumber,
      ].join("|");

      if (!uniqueMovements.has(fingerprint)) {
        uniqueMovements.set(fingerprint, movement);
      }
    });

    const sourceDocuments = new Map<string, any>();
    const sourceRequests = Array.from(uniqueMovements.values()).flatMap((movement: any) => {
      const requests: Array<{ key: string; collectionName: string; id: string }> = [];
      if (movement.partsReturnId) requests.push({ key: `return:${movement.partsReturnId}`, collectionName: "partsReturns", id: movement.partsReturnId });
      if (movement.partsRequestId) requests.push({ key: `request:${movement.partsRequestId}`, collectionName: "partsRequests", id: movement.partsRequestId });
      if (movement.purchaseOrderId) requests.push({ key: `po:${movement.purchaseOrderId}`, collectionName: "purchase_orders", id: movement.purchaseOrderId });
      if (movement.stockTakeId) requests.push({ key: `stocktake:${movement.stockTakeId}`, collectionName: "stock_takes", id: movement.stockTakeId });
      if (movement.jobId) requests.push({ key: `job:${movement.jobId}`, collectionName: "jobs", id: movement.jobId });
      return requests;
    });
    await Promise.all(Array.from(new Map(sourceRequests.map((request) => [request.key, request])).values()).map(async (request) => {
      const snapshot = await getDoc(doc(clientDb, "companies", "comp_001", request.collectionName, request.id));
      if (snapshot.exists()) sourceDocuments.set(request.key, { id: snapshot.id, ...snapshot.data() });
    }));
    const enrichedMovements = Array.from(uniqueMovements.values()).map((movement: any) => {
      const returnDocument = movement.partsReturnId ? sourceDocuments.get(`return:${movement.partsReturnId}`) : null;
      const requestDocument = movement.partsRequestId ? sourceDocuments.get(`request:${movement.partsRequestId}`) : null;
      const purchaseOrder = movement.purchaseOrderId ? sourceDocuments.get(`po:${movement.purchaseOrderId}`) : null;
      const stockTake = movement.stockTakeId ? sourceDocuments.get(`stocktake:${movement.stockTakeId}`) : null;
      const jobDocument = movement.jobId ? sourceDocuments.get(`job:${movement.jobId}`) : null;
      return {
        ...movement,
        derequisitionNumber: movement.derequisitionNumber || returnDocument?.derequisitionNumber,
        requisitionNumber: movement.requisitionNumber || requestDocument?.requisitionNumber,
        grvNumber: movement.grvNumber || purchaseOrder?.grvNumber,
        stockTakeNumber: movement.stockTakeNumber || stockTake?.stockTakeNumber || stockTake?.number,
        jobNumber: movement.jobNumber || jobDocument?.jobNumber,
        jobStatus: jobDocument?.status || jobDocument?.statusName,
        jobClosedAt: jobDocument?.closedAt || jobDocument?.completedAt,
      };
    });

    setMovements(
      enrichedMovements.sort((a: any, b: any) => {
        const time = (value: any) => {
          const milliseconds = value?.createdAt?.toMillis?.();
          return typeof milliseconds === "number"
            ? milliseconds
            : Number(value?.createdAt?.seconds || 0) * 1000;
        };
        return time(b) - time(a);
      })
    );


  }

  async function loadStockLocations() {

    const locations: any[] = [];


    // LOAD WAREHOUSES

    const warehouseSnap =
      await getDocs(

        collection(
          clientDb,
          "companies",
          "comp_001",
          "inventory_settings",
          "setup",
          "warehouses"
        )

      );


    warehouseSnap.docs.forEach(d => {

      locations.push({

        id: d.id,

        name: d.data().name,

        type: "warehouse"

      });

    });



    // LOAD RAV

    const ravSnap =
      await getDocs(

        collection(
          clientDb,
          "companies",
          "comp_001",
          "inventory_settings",
          "setup",
          "rav"
        )

      );


    ravSnap.docs.forEach(d => {

      locations.push({

        id: d.id,

        name: d.data().name,

        type: "rav"

      });

    });


    setStockLocations(
      locations
    );


  }

  async function saveChanges() {

    if (!item) return;

    const missingRequiredField =
      customFieldDefinitions.find((field) => {
        if (!field.required) return false;

        const value = item.customFields?.[field.id];
        return value === undefined || String(value).trim() === "";
      });

    if (missingRequiredField) {
      alert(`${missingRequiredField.label} is required`);
      return;
    }

    try {

      setSaving(true);

      let warehouseTotal = 0;

      let vanTotal = 0;


      stockLocations.forEach(
        (location: any) => {


          const qty =
            Number(
              item.warehouseStock?.[location.id]
              ||
              0
            );


          if (location.type === "warehouse") {

            warehouseTotal += qty;

          }


          if (location.type === "rav") {

            vanTotal += qty;

          }


        }

      );


     
      stockLocations.forEach(
        (location: any) => {


          const qty =
            Number(
              item.warehouseStock?.[location.id]
              ||
              0
            );


          if (
            location.type?.toLowerCase()
            ===
            "warehouse"
          ) {

            warehouseTotal += qty;

          }


          if (
            location.type?.toLowerCase()
            ===
            "rav"
          ) {

            vanTotal += qty;

          }


        });


      const grandTotal =
        warehouseTotal +
        vanTotal;

      const oldSnap =
        await getDoc(

          doc(
            clientDb,
            "companies",
            "comp_001",
            "inventory",
            item.id
          )

        );


      const oldData: any =
        oldSnap.data();


      await updateDoc(

        doc(
          clientDb,
          "companies",
          "comp_001",
          "inventory",
          item.id
        ),

        {
          ...item,

          warehouseStock: oldData?.warehouseStock || {},

          warehouseTotal: Number(oldData?.warehouseTotal || 0),

          vanTotal: Number(oldData?.vanTotal || 0),

          grandTotal: Number(oldData?.grandTotal || 0),

          updatedAt:
            serverTimestamp(),

          ...auditFields("UPDATE"),
        }
      );

      alert(
        "Inventory updated"
      );

    } catch (error) {

      console.error(error);

      alert(
        "Failed to save"
      );

    } finally {

      setSaving(false);

    }
  }

  async function loadSerialRecords(inventoryId: string) {
    try {
      const serialSnapshot = await getDocs(query(
        collection(clientDb, "companies", "comp_001", "inventory_serials"),
        where("inventoryId", "==", inventoryId),
      ));
      setSerialRecords(serialSnapshot.docs.map((serialDocument) => ({
        id: serialDocument.id,
        ...serialDocument.data(),
      })));
    } catch (error) {
      console.error("Failed to load serial movement history", error);
      setSerialRecords([]);
    }
  }

  function currentImageUrls(currentItem: InventoryItem) {
    if (currentItem.imageUrls?.length) return currentItem.imageUrls;
    if (currentItem.imageUrl && !currentItem.imageUrl.includes("placehold.co")) return [currentItem.imageUrl];
    return [];
  }

  async function addItemImages(files: File[]) {
    if (!item || files.length === 0) return;
    setImageUploadError("");
    const existingUrls = currentImageUrls(item);

    if (files.some((file) => !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024)) {
      setImageUploadError("Use image files no larger than 5 MB each.");
      return;
    }
    if (existingUrls.length + files.length > 5) {
      setImageUploadError(`You can add ${Math.max(0, 5 - existingUrls.length)} more image${5 - existingUrls.length === 1 ? "" : "s"}. Maximum 5 per item.`);
      return;
    }

    try {
      setUploadingImages(true);
      const uploadedUrls = await Promise.all(files.map(async (file) => {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        const fileRef = storageRef(storage, `companies/comp_001/inventory/${item.id}/${crypto.randomUUID()}-${safeName}`);
        await uploadBytes(fileRef, file, { contentType: file.type });
        return getDownloadURL(fileRef);
      }));
      const imageUrls = [...existingUrls, ...uploadedUrls];
      await updateDoc(doc(clientDb, "companies", "comp_001", "inventory", item.id), {
        imageUrls,
        imageUrl: imageUrls[0],
        updatedAt: serverTimestamp(),
        ...auditFields("UPDATE"),
      });
      setItem({ ...item, imageUrls, imageUrl: imageUrls[0] });
    } catch (error) {
      console.error(error);
      setImageUploadError("Image upload failed. Check Firebase Storage access and try again.");
    } finally {
      setUploadingImages(false);
    }
  }


  async function recordStockMovement({

    type,
    qty,
    beforeQty,
    afterQty,
    locationId,
    locationName,
    referenceType,
    referenceNumber,

  }: any) {


    if (!item) return;


    await addDoc(

      collection(
        clientDb,
        "companies",
        "comp_001",
        "inventory",
        item.id,
        "movements"
      ),

      {

        type,

        qty,

        beforeQty,

        afterQty,

        locationId,

        locationName,


        referenceType,

        referenceNumber,


        createdByName:

          currentUser?.displayName
          ||
          currentUser?.email
          ||
          "Unknown User",


        createdById:

          currentUser?.uid
          ||
          "",


        createdAt:
          serverTimestamp()

      }

    );


    await loadMovements(
      item.id
    );


  }

  if (loading) {

    return (
      <div className="p-10">
        Loading...
      </div>
    );
  }

  const resolvedStock = resolvedStockByLocation(item, stockLocations);
  const {
    warehouseTotal: liveWarehouseTotal,
    vanTotal: liveVanTotal,
    grandTotal: liveGrandTotal,
  } = stockTotals(resolvedStock, stockLocations);
  const movementRows = movements.flatMap((movement: any) => {
    const rawType = String(movement.type || "").toUpperCase();
    const rawReferenceType = String(movement.referenceType || "").toUpperCase();
    const rawMovementType = String(movement.movementType || "").toUpperCase();
    const quantity = Math.abs(Number(movement.qty ?? movement.adjustment ?? 0));
    const common = {
      createdAt: movement.createdAt,
      reference: movement.referenceNumber || movement.reference || movement.purchaseOrderId || movement.invoiceId || "—",
      user: movement.createdByName || movement.userName || movement.lastChangedByName || "Unknown User",
      jobId: movement.jobId || "",
      jobNumber: movement.jobNumber || (movement.jobId ? movement.referenceNumber : "") || "",
      jobStatus: movement.jobStatus || "",
      jobClosedAt: movement.jobClosedAt,
    };

    if (rawType === "TRANSFER" || rawReferenceType === "STOCK_TRANSFER") {
      const transferId = String(movement.sourceDocumentId || movement.id || "").replace(/^\d+-/, "");
      const transferNumber = movement.transferNumber || movement.documentNumber || `TRF-${transferId.slice(0, 8).toUpperCase()}`;
      return [
        { ...common, id: `${movement.id}-from`, type: "TRANSFER", documentNumber: transferNumber, documentHref: `/stock-transfer?transactionId=${encodeURIComponent(transferId)}`, quantity: -quantity, location: movement.fromLocationName || movement.fromLocationId || movement.locationName || "—" },
        { ...common, id: `${movement.id}-to`, type: "TRANSFER", documentNumber: transferNumber, documentHref: `/stock-transfer?transactionId=${encodeURIComponent(transferId)}`, quantity, location: movement.toLocationName || movement.toLocationId || "—" },
      ];
    }

    const reference = String(common.reference || "").toUpperCase();
    const isJobReference = /^FF[A-Z0-9-]*\d/.test(reference);
    const type = movement.partsRequestId || rawReferenceType === "PARTS_REQUEST"
      ? "REQ"
      : rawMovementType === "JOB" || ["JOB", "JOB MATERIAL CORRECTION"].includes(rawReferenceType) || rawType === "JOB"
        ? "JOB"
      : rawMovementType === "DEREQ" || ["DEREQ", "DEREQUISITION", "PARTS_RETURN"].includes(rawReferenceType) || ["DEREQ", "DEREQUISITION"].includes(rawType)
        ? "DEREQ"
        : rawMovementType === "GRV" || rawType === "GRV" || rawReferenceType === "GRV"
          ? "GRV"
          : rawMovementType === "STOCKTAKE" || rawType === "STOCKTAKE" || rawReferenceType === "STOCKTAKE"
            ? "STOCKTAKE"
            : rawType === "OUT" && isJobReference
              ? "JOB"
              : rawType === "IN" && isJobReference
                ? "DEREQ"
                : "ADJUSTMENT";
    const stockOut = rawType === "OUT" || Number(movement.adjustment) < 0;
    const transactionId = String(movement.sourceDocumentId || movement.id || "").replace(/^\d+-/, "");
    const documentNumber = type === "REQ"
      ? movement.requisitionNumber || movement.documentNumber || "—"
      : type === "JOB"
        ? "—"
      : type === "DEREQ"
        ? movement.derequisitionNumber || movement.documentNumber || (movement.partsReturnId ? `DREQ-${String(movement.partsReturnId).slice(0, 8).toUpperCase()}` : "—")
        : type === "GRV"
          ? movement.grvNumber || (movement.grvBatchId ? `GRV-${String(movement.grvBatchId).slice(0, 8).toUpperCase()}` : `GRV-${transactionId.slice(0, 8).toUpperCase()}`)
          : type === "STOCKTAKE"
            ? "—"
            : type === "ADJUSTMENT"
              ? "—"
              : movement.documentNumber || movement.transferNumber || transactionId || "—";
    const documentHref = type === "REQ" && movement.partsRequestId
      ? `/stock-picking/${movement.partsRequestId}`
      : type === "DEREQ" && movement.partsReturnId
        ? `/stock-returns/${movement.partsReturnId}`
        : type === "GRV" && movement.purchaseOrderId
          ? `/grv/purchase-order/${movement.purchaseOrderId}`
          : type === "GRV"
            ? `/grv?grvBatchId=${encodeURIComponent(movement.grvBatchId || transactionId)}`
            : "";

    return [{
      ...common,
      id: movement.id,
      type,
      documentNumber,
      documentHref,
      quantity: stockOut ? -quantity : quantity,
      location: movement.locationName || movement.warehouse || movement.locationId || "—",
    }];
  });
  const movementDisplayRows = (() => {
    const jobGroups = new Map<string, any>();
    const displayRows: any[] = [];
    movementRows.forEach((row: any) => {
      const isJobMovement = row.type === "JOB" || row.type === "REQ" || row.type === "DEREQ";
      const jobNumber = row.jobNumber || (/^FF[A-Z0-9-]*\d/i.test(String(row.reference || "")) ? row.reference : "");
      const groupKey = row.jobId || jobNumber;
      if (!isJobMovement || !groupKey) {
        displayRows.push(row);
        return;
      }
      let group = jobGroups.get(groupKey);
      if (!group) {
        group = { id: `job-group-${groupKey}`, isJobGroup: true, jobId: row.jobId, jobNumber, type: "JOB", documentNumber: "—", documentHref: "", createdAt: row.jobClosedAt || row.createdAt, quantity: 0, children: [], locations: new Set<string>(), users: new Set<string>() };
        jobGroups.set(groupKey, group);
        displayRows.push(group);
      }
      group.children.push(row);
      group.quantity += Number(row.quantity || 0);
      if (row.location && row.location !== "—") group.locations.add(row.location);
      if (row.user && row.user !== "Unknown User") group.users.add(row.user);
      const rowTime = Number(row.createdAt?.seconds || row.createdAt?.toMillis?.() || 0);
      const groupTime = Number(group.createdAt?.seconds || group.createdAt?.toMillis?.() || 0);
      if (!row.jobClosedAt && rowTime > groupTime) group.createdAt = row.createdAt;
      if (row.jobClosedAt) group.createdAt = row.jobClosedAt;
    });
    jobGroups.forEach((group) => {
      group.quantity = Math.max(0, -group.quantity);
      group.location = Array.from(group.locations).join(", ") || "—";
      group.user = Array.from(group.users).join(", ") || "Unknown User";
      group.reference = group.jobNumber || "—";
    });
    return displayRows;
  })();
  const serialMovementRows = serialRecords.flatMap((serial: any) => {
    const rows: any[] = [];
    const addEvent = (date: any, type: string, location: string, reference: string, user: string) => {
      if (date) rows.push({ id: `${serial.id}-${type}-${date?.seconds || type}`, serialNumber: serial.serialNumber || serial.id, date, type, location: location || "—", reference: reference || "—", user: user || "—" });
    };
    addEvent(serial.receivedAt || serial.createdAt, "RECEIVED", serial.locationName || serial.locationId, serial.documentNumber || serial.purchaseOrderId, serial.receivedByName || "FleetFix User");
    addEvent(serial.allocatedAt, "ALLOCATED", serial.locationName || serial.locationId, serial.jobNumber || serial.jobId, serial.allocatedByName);
    addEvent(serial.usedAt, "USED", serial.usedLocationName || serial.usedLocationId, serial.usedJobNumber || serial.usedJobId, serial.usedByName);
    addEvent(serial.returnedAt, "RETURNED", serial.returnedLocationName || serial.locationName || serial.locationId, serial.returnReference || serial.jobNumber || serial.jobId, serial.returnedByName);
    return rows;
  }).sort((a: any, b: any) => Number(b.date?.seconds || 0) - Number(a.date?.seconds || 0));

  if (!item) {

    return (
      <div className="p-10">
        Item not found
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-6">

      <div className="max-w-[1700px] mx-auto">

        {/* HEADER */}
        <div className="flex items-center justify-between mb-6">

          <div className="flex items-center gap-5">

            <div
              onDragEnter={(event) => { event.preventDefault(); setIsDraggingImage(true); }}
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setIsDraggingImage(true); }}
              onDragLeave={(event) => { event.preventDefault(); if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDraggingImage(false); }}
              onDrop={(event) => { event.preventDefault(); setIsDraggingImage(false); void addItemImages(Array.from(event.dataTransfer.files)); }}
              className={`group relative h-28 w-28 shrink-0 overflow-hidden rounded-3xl border-2 bg-white transition ${isDraggingImage ? "scale-105 border-blue-600 ring-4 ring-blue-100" : "border-gray-200 hover:border-blue-400"}`}
            >

              <Image
                src={
                  item.imageUrls?.[0] ||
                  item.imageUrl ||
                  "https://placehold.co/300x300/png"
                }
                alt="Inventory"
                width={300}
                height={300}
                className="h-full w-full object-cover"
              />

              <label className="absolute inset-0 flex cursor-pointer items-center justify-center bg-slate-950/0 p-3 text-center text-[11px] font-black text-white opacity-0 transition group-hover:bg-slate-950/65 group-hover:opacity-100">
                {uploadingImages ? "Uploading…" : isDraggingImage ? "Drop images" : "Drop or choose images"}
                <input data-ignore-dirty="true" type="file" accept="image/*" multiple disabled={uploadingImages || currentImageUrls(item).length >= 5} onChange={(event) => { void addItemImages(Array.from(event.target.files || [])); event.target.value = ""; }} className="sr-only" />
              </label>

            </div>

            <div>

              <div className="text-xs uppercase tracking-[0.2em] text-gray-400 font-bold mb-2">
                Inventory Item
              </div>

              <h1 className="text-4xl font-black text-gray-900">
                {item.partNumber}
              </h1>

              <div className="text-lg text-gray-500 mt-1">
                {item.description}
              </div>

            </div>

          </div>

          <div className="flex items-center gap-3">

            <div
              className={`
                px-5
                h-12
                rounded-2xl
                flex
                items-center
                text-sm
                font-black

                ${item.isActive
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
                }
              `}
            >
              {item.isActive
                ? "ACTIVE"
                : "INACTIVE"}
            </div>

            <Link
              href="/inventory"
              className="
                bg-gray-200
                hover:bg-gray-300
                px-5
                h-12
                rounded-2xl
                inline-flex
                items-center
                text-sm
                font-bold
              "
            >
              Back
            </Link>

          </div>

        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className={`inline-flex cursor-pointer items-center rounded-xl px-4 py-2 text-sm font-black ${uploadingImages || currentImageUrls(item).length >= 5 ? "cursor-not-allowed bg-gray-200 text-gray-400" : "bg-blue-600 text-white hover:bg-blue-700"}`}>
            {uploadingImages ? "Uploading images…" : `Add Item Images (${currentImageUrls(item).length}/5)`}
            <input data-ignore-dirty="true" type="file" accept="image/*" multiple disabled={uploadingImages || currentImageUrls(item).length >= 5} onChange={(event) => { void addItemImages(Array.from(event.target.files || [])); event.target.value = ""; }} className="sr-only" />
          </label>
          <span className="text-xs font-semibold text-gray-500">Drag images onto the item picture or choose files. Maximum 5 MB each.</span>
        </div>

        {imageUploadError && <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{imageUploadError}</p>}

        {item.imageUrls && item.imageUrls.length > 1 && <section className="mb-6 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-black uppercase tracking-wider text-gray-500">Item Images</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
            {item.imageUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
              <Image src={url} alt={`${item.partNumber || "Inventory item"} image ${index + 1}`} width={400} height={400} className="aspect-square w-full object-cover transition hover:scale-105" />
            </a>)}
          </div>
        </section>}

        {/* MAIN GRID */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(440px,3fr)]">

          {/* LEFT */}
          <div className="order-1 space-y-6 xl:contents">

            {/* DETAILS */}
            <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm xl:col-start-1 xl:row-span-2 xl:row-start-1">

              <h2 className="text-2xl font-black text-gray-900 mb-6">
                Item Information
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                <div>

                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Part Number
                  </label>

                  <input
                    type="text"
                    value={
                      item.partNumber || ""
                    }
                    onChange={(e) =>
                      setItem({
                        ...item,
                        partNumber:
                          e.target.value,
                      })
                    }
                    className="
                      w-full
                      h-14
                      rounded-2xl
                      border-2
                      border-gray-200
                      px-5
                    "
                  />

                </div>

                <div>

                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Description
                  </label>

                  <input
                    type="text"
                    value={
                      item.description || ""
                    }
                    onChange={(e) =>
                      setItem({
                        ...item,
                        description:
                          e.target.value,
                      })
                    }
                    className="
                      w-full
                      h-14
                      rounded-2xl
                      border-2
                      border-gray-200
                      px-5
                    "
                  />

                </div>

                <div className="md:col-span-2">
                  <label
                    htmlFor="inventory-cross-references"
                    className="mb-2 block text-sm font-bold text-gray-700"
                  >
                    Cross References
                  </label>
                  <input
                    id="inventory-cross-references"
                    type="text"
                    value={item.crossReferences || ""}
                    onChange={(event) =>
                      setItem({
                        ...item,
                        crossReferences: event.target.value,
                      })
                    }
                    placeholder="Enter numbers, text, or a combination"
                    className="
                      h-14
                      w-full
                      rounded-2xl
                      border-2
                      border-gray-200
                      bg-white
                      px-5
                      outline-none
                      focus:border-blue-500
                    "
                  />
                </div>

                <div className="
                  relative
                  grid
                  grid-cols-1
                  gap-x-6
                  md:col-span-2
                  md:grid-cols-2
                  md:min-h-[520px]
                ">
                  <div className="
                    space-y-4
                    rounded-2xl
                    border
                    border-gray-200
                    bg-gray-50
                    p-5
                    md:col-start-1
                    md:row-start-1
                  ">
                    <h3 className="text-base font-black text-gray-900">
                      Information
                    </h3>

                <SearchableLookup
                  id="inventory-brand"
                  label="Brand"
                  value={item.brand || ""}
                  options={brands}
                  onChange={(brand) =>
                    setItem({
                      ...item,
                      brand,
                    })
                  }
                  onAdd={() =>
                    addLookupOption(
                      "inventory_brands",
                      "Brand",
                      (brand) =>
                        setItem({
                          ...item,
                          brand,
                        })
                    )
                  }
                />

                <SearchableLookup
                  id="inventory-category"
                  label="Category"
                  value={item.category || ""}
                  options={categories}
                  onChange={(category) =>
                    setItem({
                      ...item,
                      category,
                    })
                  }
                  onAdd={() =>
                    addLookupOption(
                      "inventory_categories",
                      "Category",
                      (category) =>
                        setItem({
                          ...item,
                          category,
                        })
                    )
                  }
                />

                {customFieldDefinitions.map((field) => {
                  const value =
                    item.customFields?.[field.id] ?? "";
                  const isBinLocation =
                    field.label
                      .trim()
                      .toLowerCase()
                      .replace(/[^a-z0-9]/g, "") === "binlocation";

                  if (isBinLocation) {
                    return (
                      <SearchableLookup
                        key={field.id}
                        id={`custom-field-${field.id}`}
                        label={field.label}
                        value={String(value)}
                        options={binLocations}
                        required={field.required}
                        onChange={(binLocation) =>
                          setItem({
                            ...item,
                            customFields: {
                              ...item.customFields,
                              [field.id]: binLocation,
                            },
                          })
                        }
                        onAdd={() =>
                          addLookupOption(
                            "inventory_bin_locations",
                            "Bin Location",
                            (binLocation) =>
                              setItem({
                                ...item,
                                customFields: {
                                  ...item.customFields,
                                  [field.id]: binLocation,
                                },
                              })
                          )
                        }
                      />
                    );
                  }

                  return (
                    <div key={field.id}>
                      <label
                        htmlFor={`custom-field-${field.id}`}
                        className="
                          mb-2
                          block
                          text-sm
                          font-bold
                          text-gray-700
                        "
                      >
                        {field.label}
                        {field.required && (
                          <span className="ml-1 text-red-500">*</span>
                        )}
                      </label>

                      {field.type === "textarea" ? (
                        <textarea
                          id={`custom-field-${field.id}`}
                          value={value}
                          required={field.required}
                          onChange={(event) =>
                            setItem({
                              ...item,
                              customFields: {
                                ...item.customFields,
                                [field.id]: event.target.value,
                              },
                            })
                          }
                          rows={4}
                          className="
                            w-full
                            rounded-2xl
                            border-2
                            border-gray-200
                            px-5
                            py-4
                            outline-none
                            focus:border-blue-500
                          "
                        />
                      ) : (
                        <input
                          id={`custom-field-${field.id}`}
                          type={field.type}
                          value={value}
                          required={field.required}
                          onChange={(event) =>
                            setItem({
                              ...item,
                              customFields: {
                                ...item.customFields,
                                [field.id]:
                                  field.type === "number" &&
                                  event.target.value !== ""
                                    ? Number(event.target.value)
                                    : event.target.value,
                              },
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
                      )}
                    </div>
                  );
                })}

                  </div>

                <div className="
                  space-y-4
                  rounded-2xl
                  border
                  border-gray-200
                  bg-gray-50
                  p-5
                  mt-6
                  order-3
                  md:order-none
                  md:col-start-2
                  md:row-start-1
                  md:row-span-20
                  md:mt-0
                ">
                  <h3 className="text-base font-black text-gray-900">
                    Pricing (Excluding VAT)
                  </h3>

                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 text-sm font-bold">
                    <input type="checkbox" checked={item.serialNumberTracking === true} onChange={(event) => setItem({ ...item, serialNumberTracking: event.target.checked })} className="h-5 w-5 accent-blue-600" />
                    Track individual serial numbers
                  </label>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-gray-700">
                      Cost Price Excl.
                    </label>

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.costPrice ?? 0}
                      onChange={(event) => {
                        const costPrice = Number(event.target.value);
                        const markup = item.markupPercent;

                        setItem({
                          ...item,
                          costPrice,
                          sellPrice:
                            typeof markup === "number"
                              ? Number(
                                  (
                                    costPrice *
                                    (1 + markup / 100)
                                  ).toFixed(2)
                                )
                              : item.sellPrice,
                        });
                      }}
                      className="
                        h-14
                        w-full
                        rounded-2xl
                        border-2
                        border-gray-200
                        bg-white
                        px-5
                        outline-none
                        focus:border-blue-500
                      "
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-gray-700">
                      Markup %
                    </label>

                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Enter markup percentage"
                        value={item.markupPercent ?? ""}
                        onChange={(event) => {
                          const inputValue = event.target.value;
                          const markupPercent =
                            inputValue === ""
                              ? null
                              : Number(inputValue);

                          setItem({
                            ...item,
                            markupPercent,
                            sellPrice:
                              markupPercent === null
                                ? item.sellPrice
                                : Number(
                                    (
                                      Number(item.costPrice || 0) *
                                      (1 + markupPercent / 100)
                                    ).toFixed(2)
                                  ),
                          });
                        }}
                        className="
                          h-14
                          w-full
                          rounded-2xl
                          border-2
                          border-gray-200
                          bg-white
                          px-5
                          pr-12
                          outline-none
                          focus:border-blue-500
                        "
                      />
                      <span className="
                        pointer-events-none
                        absolute
                        right-5
                        top-1/2
                        -translate-y-1/2
                        font-black
                        text-gray-400
                      ">
                        %
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      Sell price = cost price + markup percentage.
                    </p>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-gray-700">
                      Sell Price Excl.
                    </label>

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.sellPrice ?? 0}
                      onChange={(event) =>
                        {
                          const sellPrice = Number(
                            event.target.value
                          );
                          const costPrice = Number(
                            item.costPrice || 0
                          );

                          setItem({
                            ...item,
                            sellPrice,
                            markupPercent:
                              costPrice > 0
                                ? Number(
                                    (
                                      ((sellPrice - costPrice) /
                                        costPrice) *
                                      100
                                    ).toFixed(2)
                                  )
                                : item.markupPercent,
                          });
                        }
                      }
                      className="
                        h-14
                        w-full
                        rounded-2xl
                        border-2
                        border-gray-200
                        bg-white
                        px-5
                        font-bold
                        outline-none
                        focus:border-blue-500
                      "
                    />
                    <p className="mt-2 text-xs text-gray-500">
                      Manual sell price entry updates the markup percentage.
                    </p>
                  </div>
                </div>

                {false && ((item: InventoryItem) => (
                <div>
                {customFieldDefinitions.map((field) => {
                  const value =
                    item.customFields?.[field.id] ?? "";
                  const isBinLocation =
                    field.label
                      .trim()
                      .toLowerCase()
                      .replace(/[^a-z0-9]/g, "") === "binlocation";

                  if (isBinLocation) {
                    return (
                      <SearchableLookup
                        key={field.id}
                        id={`custom-field-${field.id}`}
                        label={field.label}
                        value={String(value)}
                        options={binLocations}
                        required={field.required}
                        onChange={(binLocation) =>
                          setItem({
                            ...item,
                            customFields: {
                              ...item.customFields,
                              [field.id]: binLocation,
                            },
                          })
                        }
                        onAdd={() =>
                          addLookupOption(
                            "inventory_bin_locations",
                            "Bin Location",
                            (binLocation) =>
                              setItem({
                                ...item,
                                customFields: {
                                  ...item.customFields,
                                  [field.id]: binLocation,
                                },
                              })
                          )
                        }
                      />
                    );
                  }

                  return (
                    <div
                      key={field.id}
                    >
                      <label
                        htmlFor={`custom-field-${field.id}`}
                        className="
                          mb-2
                          block
                          text-sm
                          font-bold
                          text-gray-700
                        "
                      >
                        {field.label}
                        {field.required && (
                          <span className="ml-1 text-red-500">*</span>
                        )}
                      </label>

                      {field.type === "textarea" ? (
                        <textarea
                          id={`custom-field-${field.id}`}
                          value={value}
                          required={field.required}
                          onChange={(event) =>
                            setItem({
                              ...item,
                              customFields: {
                                ...item.customFields,
                                [field.id]: event.target.value,
                              },
                            })
                          }
                          rows={4}
                          className="
                            w-full
                            rounded-2xl
                            border-2
                            border-gray-200
                            px-5
                            py-4
                            outline-none
                            focus:border-blue-500
                          "
                        />
                      ) : (
                        <input
                          id={`custom-field-${field.id}`}
                          type={field.type}
                          value={value}
                          required={field.required}
                          onChange={(event) =>
                            setItem({
                              ...item,
                              customFields: {
                                ...item.customFields,
                                [field.id]:
                                  field.type === "number" &&
                                  event.target.value !== ""
                                    ? Number(event.target.value)
                                    : event.target.value,
                              },
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
                      )}
                    </div>
                  );
                })}
                </div>
                ))(item!)}
                </div>

              </div>

            </div>

            <div className="
              grid
              grid-cols-1
              gap-6
              md:grid-cols-2
              xl:col-start-2
              xl:row-start-1
              xl:grid-cols-1
              xl:self-start
            ">
            {/* STOCK */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">

              <h2 className="text-xl font-black text-gray-900 mb-4">
                Stock Location
              </h2>

              <div className="space-y-3">

                {stockLocations.map(
                  (location: any) => (


                    <div
                      key={location.id}
                      className="
                        grid
                        grid-cols-[minmax(0,1fr)_110px_150px]
                        items-center
                        gap-3
                        border-b
                        border-gray-100
                        pb-3
                      "
                    >

                      <div className="font-bold text-gray-700">
                        {location.type === "rav"
                          ? "🚚 "
                          : "🏪 "
                        }

                        {location.name}
                      </div>

                      <div className="text-right">
                        <div className="text-[10px] font-black uppercase text-gray-400">Current Qty</div>
                        <div className="mt-1 font-black text-gray-700">{Number(resolvedStock[location.id] || 0)}</div>
                      </div>

                      <label className="block">
                        <span className="text-[10px] font-black uppercase text-gray-400">Minimum Qty</span>
                        <input type="number" min="0" value={item.minimumStockByLocation?.[location.id] ?? ""} placeholder="Optional" onChange={(event) => setItem({ ...item, minimumStockByLocation: { ...item.minimumStockByLocation, [location.id]: event.target.value === "" ? null : Math.max(0, Number(event.target.value)) } })} className="mt-1 h-10 w-full rounded-xl border-2 border-gray-200 px-3 text-right font-bold" />
                      </label>

                    </div>
                  )
                )}

              </div>

            </div>

            {/* QR */}
            <div className="
              bg-white
              border
              border-gray-200
              rounded-2xl
              p-5
              shadow-sm
            ">
              <h2 className="mb-4 text-xl font-black text-gray-900">
                QR Code
              </h2>

              <div className="flex justify-center">
                <div className="
                  h-40
                  w-40
                  overflow-hidden
                  rounded-2xl
                  border
                  border-gray-200
                  bg-white
                  p-3
                ">
                  <Image
                    src={
                      item.qrCodeUrl ||
                      "https://placehold.co/300x300/png"
                    }
                    alt="QR"
                    width={200}
                    height={200}
                    className="h-full w-full object-contain"
                  />
                </div>
              </div>
            </div>
            </div>

          </div>

          {/* MOVEMENT HISTORY */}

          <div className="order-5 grid grid-cols-1 gap-6 xl:col-span-2 xl:row-start-4 xl:grid-cols-2">
          <div className={`rounded-3xl border bg-white p-6 shadow-sm ${item.serialNumberTracking === true ? "xl:col-span-1" : "xl:col-span-2"}`}>


            <h2 className="
text-2xl
font-black
mb-6
">

              📜 Movement History

            </h2>


            <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] table-fixed text-left text-xs">

              <thead>

                <tr>

                  <th className="w-[13%] px-3 py-2 align-bottom">Job Number</th>
                  <th className="w-[14%] px-3 py-2 align-bottom">Date</th>
                  <th className="w-[9%] px-3 py-2 align-bottom">Type</th>
                  <th className="w-[6%] px-3 py-2 text-right align-bottom">Qty</th>
                  <th className="w-[14%] px-3 py-2 align-bottom">Location</th>
                  <th className="w-[16%] px-3 py-2 align-bottom">Document Number</th>
                  <th className="w-[15%] px-3 py-2 align-bottom">Reference</th>
                  <th className="w-[13%] px-3 py-2 align-bottom">User</th>

                </tr>

              </thead>


              <tbody>

                {movementDisplayRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-500">
                      No movement history recorded for this inventory item.
                    </td>
                  </tr>
                )}

                {movementDisplayRows.map((m: any) => {
                  const expanded = m.isJobGroup && expandedJobMovements.has(m.id);
                  const rows = m.isJobGroup && expanded ? m.children : [];
                  return <Fragment key={m.id}>
                    <tr className={`border-b ${m.isJobGroup ? "cursor-pointer bg-blue-50/60 hover:bg-blue-100/70" : ""}`} onClick={m.isJobGroup ? () => setExpandedJobMovements((current) => { const next = new Set(current); if (next.has(m.id)) next.delete(m.id); else next.add(m.id); return next; }) : undefined}>
                      <td className="break-words px-3 py-2 align-top font-black">{m.jobNumber ? (m.jobId ? <Link href={`/jobs/${m.jobId}`} onClick={(event) => event.stopPropagation()} className="text-blue-600 hover:underline">{m.jobNumber}</Link> : m.jobNumber) : "—"}</td>
                      <td className="px-3 py-2 align-top tabular-nums">{m.createdAt?.toDate?.() ? formatDateTime24(m.createdAt.toDate()) : ""}</td>
                      <td className="px-3 py-2 align-top font-bold">{m.isJobGroup && <span className="mr-2 text-blue-600">{expanded ? "▼" : "▶"}</span>}{m.type}</td>
                      <td className={`px-3 py-2 text-right align-top font-black tabular-nums ${m.isJobGroup ? "text-gray-900" : m.quantity < 0 ? "text-red-600" : "text-green-700"}`}>{!m.isJobGroup && m.quantity > 0 ? "+" : ""}{m.quantity}</td>
                      <td className="px-3 py-2 align-top">{m.location}</td>
                      <td className="break-words px-3 py-2 align-top font-bold">{m.documentHref ? <Link href={m.documentHref} onClick={(event) => event.stopPropagation()} className="text-blue-600 hover:text-blue-800 hover:underline">{m.documentNumber}</Link> : m.documentNumber}</td>
                      <td className="break-words px-3 py-2 align-top">{m.reference}</td>
                      <td className="break-words px-3 py-2 align-top">{m.user}</td>
                    </tr>
                    {rows.map((detail: any) => <tr key={`${m.id}-${detail.id}`} className="border-b bg-gray-50 text-[11px] text-gray-700">
                      <td className="py-2 pl-8 pr-3 align-top font-bold">{detail.jobNumber || m.jobNumber || "—"}</td>
                      <td className="px-3 py-2 align-top tabular-nums">{detail.createdAt?.toDate?.() ? formatDateTime24(detail.createdAt.toDate()) : ""}</td>
                      <td className="px-3 py-2 align-top font-bold">{detail.type}</td>
                      <td className={`px-3 py-2 text-right align-top font-black tabular-nums ${detail.quantity < 0 ? "text-red-600" : "text-green-700"}`}>{detail.quantity > 0 ? "+" : ""}{detail.quantity}</td>
                      <td className="px-3 py-2 align-top">{detail.location}</td>
                      <td className="break-words px-3 py-2 align-top font-bold">{detail.documentHref ? <Link href={detail.documentHref} className="text-blue-600 hover:underline">{detail.documentNumber}</Link> : detail.documentNumber}</td>
                      <td className="break-words px-3 py-2 align-top">{detail.reference}</td>
                      <td className="break-words px-3 py-2 align-top">{detail.user}</td>
                    </tr>)}
                  </Fragment>;
                })}


              </tbody>


            </table>
            </div>


          </div>

          {item.serialNumberTracking === true && <div className="rounded-3xl border bg-white p-6 shadow-sm">
            <h2 className="mb-6 text-2xl font-black">Serial Movement</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] table-fixed text-left text-xs">
                <thead><tr><th className="w-[18%] px-3 py-2">Date</th><th className="w-[19%] px-3 py-2">Serial Number</th><th className="w-[13%] px-3 py-2">Movement</th><th className="w-[18%] px-3 py-2">Location</th><th className="w-[18%] px-3 py-2">Reference</th><th className="w-[14%] px-3 py-2">User</th></tr></thead>
                <tbody>
                  {serialMovementRows.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-gray-500">No serial movement history recorded for this inventory item.</td></tr>}
                  {serialMovementRows.map((movement: any) => <tr key={movement.id} className="border-b"><td className="px-3 py-2 align-top tabular-nums">{movement.date?.toDate?.() ? formatDateTime24(movement.date.toDate()) : ""}</td><td className="break-words px-3 py-2 align-top font-mono font-black text-blue-700">{movement.serialNumber}</td><td className="px-3 py-2 align-top font-black">{movement.type}</td><td className="break-words px-3 py-2 align-top">{movement.location}</td><td className="break-words px-3 py-2 align-top">{movement.reference}</td><td className="break-words px-3 py-2 align-top">{movement.user}</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>}
          </div>

          {/* RIGHT */}
          <div className="order-4 space-y-6 xl:contents">

            {/* TOTALS */}
            <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm space-y-5 xl:col-start-2 xl:row-start-2 xl:self-start">

              <div className="flex items-center justify-between">

                <div className="text-gray-500 font-bold">
                  Warehouse Total
                </div>

                <div className={`text-3xl font-black ${liveWarehouseTotal < 0 ? "text-red-600" : "text-blue-600"}`}>
                  {liveWarehouseTotal.toFixed(2)}
                </div>

              </div>

              <div className="flex items-center justify-between">

                <div className="text-gray-500 font-bold">
                  Van Total
                </div>

                <div className={`text-3xl font-black ${liveVanTotal < 0 ? "text-red-600" : "text-orange-600"}`}>
                  {liveVanTotal.toFixed(2)}
                </div>

              </div>

              <div className="border-t border-gray-200 pt-5 flex items-center justify-between">

                <div className="text-gray-900 font-black text-xl">
                  Grand Total
                </div>

                <div className={`text-5xl font-black ${liveGrandTotal < 0 ? "text-red-600" : "text-green-600"}`}>
                  {liveGrandTotal.toFixed(2)}
                </div>

              </div>

            </div>

            {/* SAVE */}
            <div className="flex justify-end xl:col-span-2 xl:row-start-3">
              <button
                onClick={saveChanges}
                disabled={saving}
                className="
                  h-16
                  w-full
                  rounded-3xl
                  bg-blue-600
                  px-10
                  text-lg
                  font-black
                  text-white
                  transition
                  hover:bg-blue-700
                  disabled:opacity-50
                  sm:w-auto
                  sm:min-w-64
                "
              >
                {saving
                  ? "Saving..."
                  : "Save Changes"}
              </button>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
