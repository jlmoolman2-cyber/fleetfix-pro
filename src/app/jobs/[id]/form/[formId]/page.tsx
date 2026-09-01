"use client";

import Link from "next/link";
import { getAuth } from "firebase/auth";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection, doc, getDoc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";

import { COMPANY_ID } from "@/lib/company";
import { clientDb } from "@/lib/firebaseClient";
import { formatDate, formatDateTime24, formatTime24 } from "@/lib/dateTime";
import { hasPermission, hasPrivilegedRole } from "@/lib/accessControl";
import {
  buildJobFormLayoutFields,
  getJobFormCanvasHeight,
  getJobFormPageCount,
  isJobFormFooter,
  moveJobFormFieldsPastFooters,
  JOB_FORM_PAGE_HEIGHT,
  JOB_FORM_PAGE_GAP,
  JOB_FORM_PAGE_STRIDE,
} from "@/lib/jobFormLayout";

type FormField = {
  id: string;
  type: string;
  label: string;
  linkedType?: string;
  options?: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  inputFontSize?: number;
  showLabel?: boolean;
  showBorder?: boolean;
  required?: boolean;
  autoAdjustHeight?: boolean;
  bold?: boolean;
  labelWidth?: number;
  labelHeight?: number;
  linkedTermsId?: string;
  linkedTermsText?: string;
  signatureType?: string;
  autoFillTargetFieldIds?: string[];
  autoFillRules?: Array<{ sourceValue: string; targetFieldIds: string[] }>;
  fleetAssetRole?: "truck" | "trailer-a" | "trailer-b";
  fleetProperty?: "vehicleMake" | "vehicleModel" | "vehicleType" | "regNo" | "fleetNo" | "vinNumber" | "odometer";
};

type TermsTemplate = {
  id: string;
  linkedFormId?: string;
  signatureType?: "Employee" | "Customer";
  termsText?: string;
  allowResign?: boolean;
  active?: boolean;
};

export default function AllocatedJobFormPage({
  params,
}: {
  params: Promise<{ id: string; formId: string }>;
}) {
  const { id: jobId, formId } = use(params);
  const instanceId = formId;
  const [job, setJob] = useState<any>(null);
  const [company, setCompany] = useState<any>({});
  const [values, setValues] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [updatedTemplateFields, setUpdatedTemplateFields] =
    useState<FormField[] | null>(null);
  const [updatingTemplate, setUpdatingTemplate] =
    useState(false);
  const [autoFieldHeights, setAutoFieldHeights] =
    useState<Record<string, number>>({});
  const [termsTemplates, setTermsTemplates] =
    useState<TermsTemplate[]>([]);
  const [pdfView, setPdfView] = useState(false);
  const [embeddedView, setEmbeddedView] = useState(false);
  const [documentPalette, setDocumentPalette] = useState({ primary: "#164e7a", primaryText: "#ffffff", labelBackground: "#e2e8f0", alternateBackground: "#f8fafc", border: "#94a3b8" });
  const [canEditForm, setCanEditForm] = useState(false);
  const [vehicleCategoryOptions, setVehicleCategoryOptions] = useState<
    Record<string, string[]>
  >({});
  const [customerFleet, setCustomerFleet] = useState<any[]>([]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setPdfView(query.get("pdf") === "1");
    setEmbeddedView(query.get("embedded") === "1");
    setDocumentPalette((current) => ({
      primary: query.get("primary") || current.primary,
      primaryText: query.get("primaryText") || current.primaryText,
      labelBackground: query.get("labelBackground") || current.labelBackground,
      alternateBackground: query.get("alternateBackground") || current.alternateBackground,
      border: query.get("border") || current.border,
    }));
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const companySnapshot = await getDoc(
          doc(clientDb, "companies", COMPANY_ID)
        );
        if (companySnapshot.exists()) {
          setCompany(companySnapshot.data());
        }

        const vehicleCategoriesSnapshot = await getDocs(
          collection(
            clientDb,
            "companies",
            COMPANY_ID,
            "vehicleFieldCategories"
          )
        );
        setVehicleCategoryOptions(
          Object.fromEntries(
            vehicleCategoriesSnapshot.docs.map((categoryDoc) => {
              const category = categoryDoc.data();
              return [
                categoryDoc.id,
                Array.isArray(category.values) ? category.values : [],
              ];
            })
          )
        );

        const snapshot = await getDoc(
          doc(clientDb, "companies", COMPANY_ID, "jobs", jobId)
        );

        if (snapshot.exists()) {
          const data = { id: snapshot.id, ...snapshot.data() };
          const allocatedForm = (data as any).jobForms?.find(
            (form: any) => (form.id || form.templateId) === instanceId
          );
          const resolvedTemplateId =
            allocatedForm?.templateId ||
            ((data as any).jobFormTemplateId === instanceId ? instanceId : formId);
          const instanceValues =
            (data as any).jobFormValuesByTemplate?.[instanceId];
          const isLegacyPrimaryInstance =
            !(data as any).jobForms?.length &&
            (data as any).jobFormTemplateId === instanceId;
          setValues(
            instanceValues !== undefined
              ? instanceValues
              : isLegacyPrimaryInstance
                ? (data as any).jobFormValues || {}
                : {}
          );
          setJob(data);
          if ((data as any).customerId) {
            const fleetSnapshot = await getDocs(
              collection(
                clientDb,
                "companies",
                COMPANY_ID,
                "customers",
                (data as any).customerId,
                "fleet"
              )
            );
            setCustomerFleet(
              fleetSnapshot.docs.map((fleetDoc) => ({
                id: fleetDoc.id,
                ...fleetDoc.data(),
              }))
            );
          } else {
            setCustomerFleet([]);
          }
          setCompleted(
            (data as any).jobFormCompletion?.[instanceId]?.completed === true
          );

          await getAuth().authStateReady();
          const currentUser = getAuth().currentUser;
          if (currentUser) {
            let userData: any = null;
            const companyUser = await getDoc(
              doc(clientDb, "companies", COMPANY_ID, "users", currentUser.uid)
            );
            if (companyUser.exists()) {
              userData = companyUser.data();
            } else {
              const globalUser = await getDoc(doc(clientDb, "users", currentUser.uid));
              if (globalUser.exists()) userData = globalUser.data();
            }
            const role = String(userData?.primaryRole || userData?.role || "").toLowerCase();
            setCanEditForm(hasPrivilegedRole(role) || hasPermission(userData?.permissions, "Edit job forms"));
          }

          const templateSnapshot =
            await getDoc(
              doc(
                clientDb,
                "companies",
                COMPANY_ID,
                "jobforms",
                resolvedTemplateId
              )
            );

          if (templateSnapshot.exists()) {
            const latestFields =
              (templateSnapshot.data().fields || []).map(
                (field: FormField) => ({
                  ...field,
                  label:
                    typeof field.label === "string"
                      ? field.label.replace(
                          /\{\{jobNumber\}\}/gi,
                          (data as any).jobNumber || jobId
                        )
                      : field.label,
                })
              );

            const currentFields =
              allocatedForm?.fields ||
              ((data as any).jobFormTemplateId === instanceId
                ? (data as any).jobFormFields || []
                : []);

            if (
              JSON.stringify(latestFields) !==
              JSON.stringify(currentFields)
            ) {
              setUpdatedTemplateFields(latestFields);
            }
          }

          const termsSnapshot = await getDocs(
            collection(clientDb, "companies", COMPANY_ID, "termsTemplates")
          );
          setTermsTemplates(
            termsSnapshot.docs
              .map((termsDoc) => ({
                id: termsDoc.id,
                ...termsDoc.data(),
              } as TermsTemplate))
              .filter((template) =>
                template.active !== false && template.linkedFormId === resolvedTemplateId
              )
          );
        }
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [jobId, formId, instanceId]);

  const allocatedFields = useMemo<FormField[]>(
    () => {
      const allocatedForm =
        job?.jobForms?.find(
          (form: any) =>
            (form.id || form.templateId) === instanceId
        );

      if (allocatedForm) {
        return allocatedForm.fields || [];
      }

      return job?.jobFormTemplateId === instanceId
        ? job?.jobFormFields || []
        : [];
    },
    [job, instanceId]
  );

  const fields = useMemo(
    () =>
      (updatedTemplateFields ?? allocatedFields).map((field) => {
        const categoryPrefix = "Vehicle Category:";
        const linkedType = String(field.linkedType || "");

        if (!linkedType.startsWith(categoryPrefix)) return field;

        const categoryId = linkedType.slice(categoryPrefix.length);
        return {
          ...field,
          options: vehicleCategoryOptions[categoryId] ?? field.options ?? [],
        };
      }),
    [updatedTemplateFields, allocatedFields, vehicleCategoryOptions]
  );

  useEffect(() => {
    if (!job || fields.length === 0) return;

    setValues((current) => {
      let changed = false;
      const next = { ...current };

      for (const field of fields) {
        if (
          field.fleetAssetRole !== "truck" ||
          !field.fleetProperty ||
          field.fleetProperty === "odometer" ||
          current[field.id] !== undefined
        ) {
          continue;
        }

        const value = jobTruckValue(field.fleetProperty);
        if (value !== "" && value !== undefined && value !== null) {
          next[field.id] = value;
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [job, fields]);

  const formName = useMemo(() => {
    const allocatedForm =
      job?.jobForms?.find(
        (form: any) =>
          (form.id || form.templateId) === instanceId
      );

    return (
      allocatedForm?.templateName ||
      allocatedForm?.name ||
      job?.jobFormTemplateName ||
      "Job Form"
    );
  }, [job, instanceId]);

  const effectiveHeights = Object.fromEntries(
    fields.map((field) => [
      field.id,
      field.linkedType === "Company Address"
        ? Math.max(
            field.height,
            String(company?.physicalAddress || "").split(/\r?\n/).length *
              ((field.fontSize ?? 11) * 1.2) + 6
          )
        : autoFieldHeights[field.id] ?? field.height,
    ])
  );
  const reflowedFields = fields.map((field) => {
    if (isJobFormFooter(field)) return field;

    const yShift = fields.reduce((shift, source) => {
      if (
        source.id === field.id ||
        source.autoAdjustHeight !== true ||
        source.y + source.height > field.y
      ) {
        return shift;
      }
      return shift + Math.max(
        0,
        (effectiveHeights[source.id] ?? source.height) - source.height
      );
    }, 0);

    const startPage = Math.floor(field.y / JOB_FORM_PAGE_STRIDE);
    const shiftedLocalY =
      field.y - startPage * JOB_FORM_PAGE_STRIDE + yShift;
    const additionalPages = Math.floor(
      shiftedLocalY / JOB_FORM_PAGE_HEIGHT
    );
    const normalizedY =
      (startPage + additionalPages) * JOB_FORM_PAGE_STRIDE +
      (shiftedLocalY % JOB_FORM_PAGE_HEIGHT);

    return {
      ...field,
      y: normalizedY,
      height: effectiveHeights[field.id] ?? field.height,
    };
  });
  const paginatedFields = moveJobFormFieldsPastFooters(reflowedFields);
  const pageCount = getJobFormPageCount(paginatedFields);
  const pageHeight = getJobFormCanvasHeight(pageCount);
  const layoutFields = buildJobFormLayoutFields(paginatedFields, pageCount);
  const visibleLayoutFields = layoutFields.filter((field) => !isLegacyDocumentHeaderField(field));

  function adjustTextareaHeight(field: FormField, textarea: HTMLTextAreaElement) {
    if (field.type !== "textarea" || field.autoAdjustHeight !== true) return;

    textarea.style.height = "0px";
    const fillableHeight = Math.max(40, textarea.scrollHeight);
    textarea.style.height = `${fillableHeight}px`;

    const labelHeight = field.showLabel === false
      ? 0
      : field.labelHeight ?? 28;
    const nextHeight = labelHeight + fillableHeight + 2;

    setAutoFieldHeights((current) =>
      current[field.id] === nextHeight
        ? current
        : { ...current, [field.id]: nextHeight }
    );
  }

  function linkedValue(linkedType?: string) {
    const links: Record<string, any> = {
      "Company Name": company?.companyName,
      "Company Phone": company?.telephone,
      "Company Email": company?.email,
      "Company Address": company?.physicalAddress,
      "Job Number": job?.jobNumber,
      "Job Status": job?.status,
      "Job Date": job?.createdAt?.toDate?.()
        ? formatDateTime24(job.createdAt.toDate())
        : "",
      "Job Type": job?.jobType,
      "Customer Name": job?.customerName,
      "Customer Contact": job?.customerContact,
      "Customer Email": job?.customerContactEmail,
      "Vehicle Reg": job?.vehicleRegNo,
      "Vehicle Make": job?.vehicleMake,
      "Vehicle Model": job?.vehicleModel,
      "Vehicle VIN": job?.vinNumber,
      "Fleet Number": job?.vehicleFleetNo,
      Odometer: "",
      "Technician Name": job?.assignedTo,
      "Completed By": job?.completedBy,
      "Trailer Reg": job?.trailerReg,
      "Trailer Fleet Number": job?.trailerFleetNo,
      "Current Date": formatDate(new Date()),
      "Current Time": formatTime24(new Date()),
    };

    return links[linkedType || ""] || "";
  }

  function setValue(key: string, value: any) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function setFieldValue(field: FormField, value: any) {
    setValues((current) => {
      const next = { ...current, [field.id]: value };

      const matchingRule = field.autoFillRules?.find(
        (rule) => rule.sourceValue === String(value)
      );
      const targetFieldIds = matchingRule?.targetFieldIds || [];

      for (const targetFieldId of targetFieldIds) {
        if (fields.some((candidate) => candidate.id === targetFieldId)) {
          next[targetFieldId] = value;
        }
      }

      return next;
    });
  }

  function fleetValue(vehicle: any, property?: FormField["fleetProperty"]) {
    if (!property) return "";
    const aliases: Record<NonNullable<FormField["fleetProperty"]>, string[]> = {
      vehicleMake: ["vehicleMake", "make"],
      vehicleModel: ["vehicleModel", "model"],
      vehicleType: ["vehicleType", "type", "assetType"],
      regNo: ["regNo", "vehicleReg", "registrationNumber", "registration"],
      fleetNo: ["fleetNo", "fleetNumber"],
      vinNumber: ["vinNumber", "vin", "chassisNumber"],
      odometer: ["odometer", "mileage"],
    };

    for (const key of aliases[property]) {
      if (vehicle?.[key] !== undefined && vehicle[key] !== null) {
        return vehicle[key];
      }
    }
    return "";
  }

  function jobTruckValue(property?: FormField["fleetProperty"]) {
    const valuesByProperty: Record<NonNullable<FormField["fleetProperty"]>, any> = {
      vehicleMake: job?.vehicleMake,
      vehicleModel: job?.vehicleModel,
      vehicleType: job?.vehicleType,
      regNo: job?.vehicleRegNo,
      fleetNo: job?.vehicleFleetNo,
      vinNumber: job?.vinNumber,
      odometer: job?.odometer,
    };
    return property ? valuesByProperty[property] ?? "" : "";
  }

  function defaultFieldValue(field: FormField) {
    if (field.fleetAssetRole === "truck" && field.fleetProperty) {
      return jobTruckValue(field.fleetProperty);
    }

    const label = String(field.label || "").trim().toLowerCase();
    if (label.includes("truck make") || label.includes("vehicle make")) {
      return job?.vehicleMake || "";
    }
    if (label.includes("truck model") || label.includes("vehicle model")) {
      return job?.vehicleModel || "";
    }
    if (label.includes("truck type") || label.includes("vehicle type")) {
      return job?.vehicleType || "";
    }

    return linkedValue(field.linkedType);
  }

  function setFleetFieldValue(field: FormField, value: any) {
    const normalizedValue = String(value || "").trim().toLowerCase();
    const isLookupField = field.fleetProperty === "regNo" || field.fleetProperty === "fleetNo";
    const matchedVehicle = isLookupField && normalizedValue
      ? customerFleet.find((vehicle) =>
          String(fleetValue(vehicle, "regNo")).trim().toLowerCase() === normalizedValue ||
          String(fleetValue(vehicle, "fleetNo")).trim().toLowerCase() === normalizedValue
        )
      : null;

    if (!matchedVehicle || !field.fleetAssetRole) {
      setFieldValue(field, value);
      return;
    }

    setValues((current) => {
      const next = { ...current, [field.id]: value };
      for (const mappedField of fields) {
        if (mappedField.fleetAssetRole === field.fleetAssetRole && mappedField.fleetProperty) {
          next[mappedField.id] = fleetValue(matchedVehicle, mappedField.fleetProperty);
        }
      }
      return next;
    });
  }

  async function syncMappedFleet(
    cleanValues: Record<string, any>,
    includeTrailers: boolean
  ) {
    if (!job?.customerId) return;

    const roles: Array<NonNullable<FormField["fleetAssetRole"]>> = [
      "truck",
      "trailer-a",
      "trailer-b",
    ];
    const fleetCollection = collection(
      clientDb,
      "companies",
      COMPANY_ID,
      "customers",
      job.customerId,
      "fleet"
    );

    for (const role of roles) {
      if (role !== "truck" && !includeTrailers) continue;

      const mappedFields = fields.filter(
        (field) =>
          field.fleetAssetRole === role &&
          field.fleetProperty &&
          field.fleetProperty !== "odometer"
      );
      if (role !== "truck" && mappedFields.length === 0) continue;

      const payload: Record<string, any> = role === "truck"
        ? {
            regNo: job.vehicleRegNo || "",
            fleetNo: job.vehicleFleetNo || "",
            vehicleMake: job.vehicleMake || "",
            vehicleModel: job.vehicleModel || "",
            vehicleType: job.vehicleType || "",
            vinNumber: job.vinNumber || "",
            driverName: job.driverName || "",
            driverContactNumber: job.driverContactNo || job.driverContactNumber || "",
          }
        : {};
      for (const field of mappedFields) {
        const savedValue = cleanValues[field.id];
        const fallbackValue = role === "truck"
          ? jobTruckValue(field.fleetProperty)
          : linkedValue(field.linkedType);
        const value = savedValue !== undefined ? savedValue : fallbackValue;
        if (value !== undefined && value !== null && String(value).trim()) {
          payload[field.fleetProperty!] = value;
        }
      }

      const regNo = String(payload.regNo || "").trim().toUpperCase();
      const fleetNo = String(payload.fleetNo || "").trim().toUpperCase();
      const invalidIdentifiers = ["NOT APPLICABLE", "N/A", "NA"];
      if ((!regNo && !fleetNo) || invalidIdentifiers.includes(regNo) || invalidIdentifiers.includes(fleetNo)) {
        continue;
      }

      payload.regNo = regNo;
      payload.fleetNo = fleetNo;
      if (payload.vinNumber) {
        payload.vin = payload.vinNumber;
        payload.chassisNumber = payload.vinNumber;
      }
      if (payload.vehicleMake) payload.make = payload.vehicleMake;
      if (payload.vehicleModel) payload.model = payload.vehicleModel;
      if (payload.vehicleType) payload.type = payload.vehicleType;
      if (payload.fleetNo) payload.fleetNumber = payload.fleetNo;
      if (payload.regNo) payload.registrationNumber = payload.regNo;
      payload.searchRegNo = regNo;
      payload.searchFleetNo = fleetNo;
      payload.assetType = role === "truck" ? "Truck" : "Trailer";
      payload.updatedAt = serverTimestamp();

      const existing = customerFleet.find((vehicle) =>
        (regNo && String(fleetValue(vehicle, "regNo")).trim().toUpperCase() === regNo) ||
        (fleetNo && String(fleetValue(vehicle, "fleetNo")).trim().toUpperCase() === fleetNo)
      );

      if (existing) {
        await updateDoc(doc(fleetCollection, existing.id), payload);
      } else {
        const created = await addDoc(fleetCollection, {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setCustomerFleet((current) => [...current, { id: created.id, ...payload }]);
      }
    }
  }

  function termsForSignature(field: FormField) {
    if (field.linkedTermsId) {
      const linked = termsTemplates.find(
        (template) => template.id === field.linkedTermsId
      );
      if (linked) return [linked];
      if (field.linkedTermsText) {
        return [{
          id: field.linkedTermsId,
          termsText: field.linkedTermsText,
          signatureType: field.signatureType === "Customer" ? "Customer" : "Employee",
          allowResign: true,
        }];
      }
    }

    const signatureDescription = String(
      field.signatureType || field.label
    ).toLowerCase();
    const requestedType = signatureDescription.includes("customer")
      ? "customer"
      : signatureDescription.includes("employee") ||
          signatureDescription.includes("driver") ||
          signatureDescription.includes("technician")
        ? "employee"
        : "";
    const matched = termsTemplates.filter((template) =>
      requestedType === String(template.signatureType || "").toLowerCase()
    );
    return matched.length > 0 ? matched : termsTemplates;
  }

  async function save(markCompleted = false) {
    if (completed && !canEditForm) {
      alert("This completed form is locked. Only an approved administrator can edit it.");
      return;
    }
    if (markCompleted) {
      const incompleteRequiredField = fields.find((field) => {
        if (field.required !== true) return false;

        if (field.type === "signature") {
          return (
            !String(values[`${field.id}:name`] || "").trim() ||
            !values[`${field.id}:signature`]
          );
        }

        if (field.type === "table") {
          const columnCount = field.options?.length || 4;
          return ![1, 2, 3].some((row) =>
            Array.from({ length: columnCount }).some((_, column) =>
              String(values[`${field.id}:${row}:${column}`] || "").trim()
            )
          );
        }

        if (field.type === "multiselect") {
          return !Array.isArray(values[field.id]) || values[field.id].length === 0;
        }

        if (field.type === "linked-job-field") {
          return !String(
            values[field.id] !== undefined
              ? values[field.id]
              : defaultFieldValue(field)
          ).trim();
        }

        return !String(values[field.id] ?? "").trim();
      });

      if (incompleteRequiredField) {
        alert(
          `Complete the required "${incompleteRequiredField.label}" field before completing the form.`
        );
        return;
      }
    }

    try {
      setSaving(true);
      const cleanValues =
        JSON.parse(JSON.stringify(values));

      const valuesByTemplate = {
        ...(job?.jobFormValuesByTemplate || {}),
        [instanceId]: cleanValues,
      };

      const completionByTemplate = {
        ...(job?.jobFormCompletion || {}),
        ...(markCompleted
          ? {
              [instanceId]: {
                completed: true,
                completedAt: new Date().toISOString(),
              },
            }
          : {}),
      };

      await updateDoc(
        doc(clientDb, "companies", COMPANY_ID, "jobs", jobId),
        {
          jobFormValues: cleanValues,
          jobFormValuesByTemplate: valuesByTemplate,
          ...(markCompleted
            ? {
                jobFormCompletion:
                  completionByTemplate,
              }
            : {}),
          jobFormUpdatedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
      );
      await syncMappedFleet(cleanValues, markCompleted);
      if (markCompleted) {
        setCompleted(true);
      }
      setJob((current: any) => ({
        ...current,
        jobFormValues: cleanValues,
        jobFormValuesByTemplate: valuesByTemplate,
        jobFormCompletion: completionByTemplate,
      }));
      alert(markCompleted ? "Job Form completed" : "Job Form saved");
    } catch (error) {
      console.error(error);
      alert("Unable to save the Job Form");
    } finally {
      setSaving(false);
    }
  }

  async function updateFromAdminTemplate() {
    if (!updatedTemplateFields) return;

    try {
      setUpdatingTemplate(true);

      const updates: Record<string, any> = {
        updatedAt: serverTimestamp(),
        jobFormTemplateUpdatedAt: serverTimestamp(),
      };

      if (Array.isArray(job?.jobForms) && job.jobForms.length) {
        updates.jobForms =
          job.jobForms.map((form: any) =>
            (form.id || form.templateId) === instanceId
              ? {
                  ...form,
                  fields: updatedTemplateFields,
                }
              : form
          );
      } else {
        updates.jobFormFields =
          updatedTemplateFields;
      }

      await updateDoc(
        doc(clientDb, "companies", COMPANY_ID, "jobs", jobId),
        updates
      );

      setJob((current: any) => ({
        ...current,
        ...updates,
      }));
      setUpdatedTemplateFields(null);
      alert(
        "The Job Form has been updated from the latest Admin template. Existing entered values were preserved."
      );
    } catch (error) {
      console.error(error);
      alert("Unable to update the Job Form template.");
    } finally {
      setUpdatingTemplate(false);
    }
  }

  function renderField(field: FormField) {
    const showLabel = field.showLabel !== false;
    const inputFontSize = field.inputFontSize ?? field.fontSize ?? 11;
    const showBorder = field.showBorder !== false;
    const fieldBorder = showBorder ? `1px solid ${documentPalette.border}` : "none";
    const labelDivider = showBorder && showLabel ? `1px solid ${documentPalette.border}` : "none";
    const textStyle = {
      fontSize: field.fontSize ?? 11,
      fontWeight: field.bold ? 700 : 400,
    };
    const commonInput =
      "box-border block h-full w-full border-0 bg-white px-2 py-0 font-semibold text-gray-900 outline-none focus:bg-blue-50";
    const singleLineControlStyle = {
      fontSize: inputFontSize,
      lineHeight: `${Math.max(12, field.height - 2)}px`,
      paddingTop: 0,
      paddingBottom: 0,
    };
    const currentFieldValue = values[field.id] ?? "";
    const hasNonNumericNumberValue =
      field.type === "number" &&
      String(currentFieldValue).trim() !== "" &&
      !Number.isFinite(Number(currentFieldValue));
    const hasFleetLookup = Boolean(
      field.fleetAssetRole &&
      (field.fleetProperty === "regNo" || field.fleetProperty === "fleetNo")
    );
    const fleetLookupId = `fleet-lookup-${field.id}`;
    const fleetLookupOptions = customerFleet.filter((vehicle) => {
      const assetKind = String(vehicle.assetType || vehicle.vehicleType || "").toLowerCase();
      if (field.fleetAssetRole === "truck") {
        return !assetKind.includes("trailer");
      }
      return !assetKind || assetKind.includes("trailer");
    });

    if (field.type === "section") {
      return (
        <div className="h-full w-full overflow-hidden rounded border border-slate-400 bg-white">
          <div className="h-8 items-center border-b px-2 font-black uppercase tracking-wider" style={{ ...textStyle, fontWeight: 900, display: showLabel ? "flex" : "none", backgroundColor: documentPalette.primary, borderColor: documentPalette.primary, color: documentPalette.primaryText }}>
            {showLabel ? field.label : ""}
          </div>
        </div>
      );
    }

    if (field.type === "title") {
      return (
        <div
          className="flex h-full items-center overflow-hidden whitespace-nowrap"
          style={textStyle}
        >
          {showLabel ? field.label : ""}
        </div>
      );
    }

    if (field.type === "info-text") {
      return (
        <div className="h-full w-full whitespace-pre-wrap p-2" style={textStyle}>
          {showLabel ? field.label : ""}
        </div>
      );
    }

    if (field.type === "image") {
      return company?.logo ? (
        <img
          src={company.logo}
          alt={company.companyName || "Company logo"}
          className="h-full w-full object-contain"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">
          Company logo not configured
        </div>
      );
    }

    if (field.type === "linked-job-field") {
      const isVehicleCategory =
        String(field.linkedType || "").startsWith("Vehicle Category:") ||
        Boolean(field.options?.length);
      const isFillableJobDetail =
        field.y >= 218 &&
        !String(field.linkedType || "").startsWith("Company ");
      const selectedLinkedValue = values[field.id] !== undefined
        ? values[field.id]
        : defaultFieldValue(field);

      return (
        <div className="flex h-full w-full text-[11px]" style={{ border: fieldBorder }}>
          <div
            className="flex shrink-0 items-center bg-slate-200"
            style={{
              width: showLabel ? field.labelWidth ?? 110 : 0,
              minWidth: 0,
              overflow: "hidden",
              display: showLabel ? "flex" : "none",
              borderRight: labelDivider,
              padding: showLabel ? "0 6px" : 0,
              ...textStyle,
            }}
          >
            {showLabel ? field.label : ""}
          </div>
          {isVehicleCategory ? (
            <details className="group relative h-full min-w-0 flex-1 bg-white">
              <summary
                className="box-border flex h-full w-full cursor-pointer list-none items-center justify-between gap-1 overflow-hidden px-2 py-0 font-semibold text-gray-900 outline-none focus:bg-blue-50 [&::-webkit-details-marker]:hidden"
                style={{ fontSize: inputFontSize }}
              >
                <span className="min-w-0 flex-1 truncate">
                  {selectedLinkedValue || `Select ${field.label}`}
                </span>
                <span className="shrink-0 text-[9px] print:hidden">▼</span>
              </summary>
              <div className="absolute left-0 top-full z-[200] max-h-48 w-full overflow-y-auto border border-gray-400 bg-white shadow-lg print:hidden">
                {selectedLinkedValue && !(field.options || []).includes(String(selectedLinkedValue)) && (
                  <button
                    type="button"
                    onClick={(event) => {
                      setFieldValue(field, selectedLinkedValue);
                      event.currentTarget.closest("details")?.removeAttribute("open");
                    }}
                    className="block w-full px-2 py-2 text-left hover:bg-blue-50"
                    style={{ fontSize: inputFontSize }}
                  >
                    {String(selectedLinkedValue)}
                  </button>
                )}
                {(field.options || []).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={(event) => {
                      setFieldValue(field, option);
                      event.currentTarget.closest("details")?.removeAttribute("open");
                    }}
                    className="block w-full px-2 py-2 text-left hover:bg-blue-50"
                    style={{ fontSize: inputFontSize }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </details>
          ) : isFillableJobDetail ? (
            <>
              <input
                value={
                  values[field.id] !== undefined
                    ? values[field.id]
                    : defaultFieldValue(field)
                }
                list={hasFleetLookup ? fleetLookupId : undefined}
                onChange={(event) => setFleetFieldValue(field, event.target.value)}
                className="box-border block h-full min-w-0 flex-1 border-0 bg-white px-2 py-0 font-semibold text-gray-900 outline-none focus:bg-blue-50"
                style={singleLineControlStyle}
                placeholder={hasFleetLookup ? `Search or enter ${field.label}` : `Enter ${field.label}`}
              />
              {hasFleetLookup && (
                <datalist id={fleetLookupId}>
                  {fleetLookupOptions.flatMap((vehicle) =>
                    [fleetValue(vehicle, "regNo"), fleetValue(vehicle, "fleetNo")]
                      .filter(Boolean)
                      .map((option) => (
                        <option key={`${vehicle.id}-${option}`} value={String(option)}>
                          {[fleetValue(vehicle, "regNo"), fleetValue(vehicle, "fleetNo")].filter(Boolean).join(" / ")}
                        </option>
                      ))
                  )}
                </datalist>
              )}
            </>
          ) : (
            <div
              className={`flex min-w-0 flex-1 px-2 font-semibold ${
                field.linkedType === "Company Address"
                  ? "items-start overflow-hidden whitespace-pre-wrap py-1 leading-tight"
                  : "items-center"
              }`}
              style={{ fontSize: inputFontSize }}
            >
              {linkedValue(field.linkedType)}
            </div>
          )}
        </div>
      );
    }

    if (field.type === "signature") {
      const linkedTerms = termsForSignature(field);
      const allowResign = linkedTerms.every(
        (template) => template.allowResign !== false
      );

      return (
        <SignaturePanel
          field={field}
          terms={linkedTerms.map((template) => template.termsText || "").filter(Boolean)}
          name={values[`${field.id}:name`] || ""}
          signature={values[`${field.id}:signature`] || ""}
          allowResign={allowResign}
          onNameChange={(name) => setValue(`${field.id}:name`, name)}
          onSignatureChange={(signature) =>
            setValue(`${field.id}:signature`, signature)
          }
        />
      );
    }

    if (field.type === "textarea") {
      return (
        <div className="flex h-full w-full flex-col border border-slate-400">
          <div className="border-b border-slate-300 bg-slate-200 px-2 py-1 font-bold text-slate-700" style={{ ...textStyle, fontWeight: 700, display: showLabel ? "block" : "none" }}>
            {showLabel ? field.label : ""}
          </div>
          <textarea
            ref={(textarea) => {
              if (textarea && field.autoAdjustHeight === true) {
                requestAnimationFrame(() => adjustTextareaHeight(field, textarea));
              }
            }}
            value={values[field.id] || ""}
            onChange={(event) => {
              setFleetFieldValue(field, event.target.value);
              adjustTextareaHeight(field, event.currentTarget);
            }}
            className={`min-h-0 flex-1 resize-none border-0 bg-white p-2 text-gray-900 outline-none focus:bg-blue-50 ${field.autoAdjustHeight === true ? "overflow-hidden" : ""}`}
            style={{ fontSize: inputFontSize }}
            placeholder={
              "Enter details"
            }
          />
        </div>
      );
    }

    if (field.type === "table") {
      const headings = field.options?.length
        ? field.options
        : ["Column 1", "Column 2", "Column 3", "Column 4"];

      return (
        <table className="h-full w-full table-fixed border-collapse text-[10px]">
          <tbody>
            {[0, 1, 2, 3].map((row) => (
              <tr key={row}>
                {headings.map((heading, column) => {
                  const key = `${field.id}:${row}:${column}`;
                  return (
                    <td key={key} className="border border-slate-300 p-0">
                      {row === 0 ? (
                        <div className="h-full px-1 py-1 font-black uppercase" style={{ backgroundColor: documentPalette.primary, color: documentPalette.primaryText }}>{heading}</div>
                      ) : (
                        <input
                          value={values[key] || ""}
                          onChange={(event) => setValue(key, event.target.value)}
                          className={`h-full w-full border-0 px-1 text-gray-900 outline-none focus:bg-blue-50 ${row % 2 === 0 ? "bg-slate-50" : "bg-white"}`}
                          placeholder="Enter"
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (field.type === "multiselect") {
      const selectedValues = Array.isArray(values[field.id])
        ? values[field.id]
        : values[field.id]
          ? [values[field.id]]
          : [];

      return (
        <div className="flex h-full w-full" style={{ border: fieldBorder }}>
          <div
            className="flex shrink-0 items-center overflow-hidden bg-slate-200 px-2 font-bold text-slate-700"
            style={{
              width: showLabel ? field.labelWidth ?? 110 : 0,
              minWidth: 0,
              display: showLabel ? "flex" : "none",
              borderRight: labelDivider,
              ...textStyle,
            }}
          >
            {showLabel ? field.label : ""}
          </div>
          <details className="group relative min-w-0 flex-1 bg-white">
            <summary
              className="flex h-full w-full cursor-pointer list-none items-center justify-between gap-2 overflow-hidden px-2 text-gray-900 outline-none [&::-webkit-details-marker]:hidden"
              style={{ fontSize: inputFontSize }}
            >
              <span className="min-w-0 flex-1 truncate">
                {selectedValues.length > 0 ? selectedValues.join(", ") : "Select"}
              </span>
              <span className="shrink-0 print:hidden">▼</span>
            </summary>
            <div className="absolute left-0 top-full z-[200] max-h-48 w-full overflow-y-auto border border-gray-400 bg-white shadow-lg print:hidden">
              {(field.options || []).map((option) => (
                <label
                  key={option}
                  className="flex cursor-pointer items-center gap-2 px-2 py-2 hover:bg-blue-50"
                  style={{ fontSize: inputFontSize }}
                >
                  <input
                    type="checkbox"
                    checked={selectedValues.includes(option)}
                    onChange={(event) => {
                      const nextValues = event.target.checked
                        ? [...selectedValues, option]
                        : selectedValues.filter((value: string) => value !== option);
                      setValue(field.id, nextValues);
                    }}
                  />
                  <span className="min-w-0 flex-1 break-words">{option}</span>
                </label>
              ))}
            </div>
          </details>
        </div>
      );
    }

    if (field.type === "select") {
      const selectedValue = String(values[field.id] || "");
      return (
        <div className="flex h-full w-full" style={{ border: fieldBorder }}>
          <div
            className="flex shrink-0 items-center bg-slate-100 px-2"
            style={{
              width: showLabel ? field.labelWidth ?? 110 : 0,
              minWidth: 0,
              overflow: "hidden",
              display: showLabel ? "flex" : "none",
              borderRight: labelDivider,
              ...textStyle,
            }}
          >
            {showLabel ? field.label : ""}
          </div>
          <details className="group relative min-w-0 flex-1 bg-white">
            <summary
              className="flex h-full w-full cursor-pointer list-none items-center justify-between gap-2 overflow-hidden px-2 text-gray-900 outline-none [&::-webkit-details-marker]:hidden"
              style={{ fontSize: inputFontSize }}
            >
              <span className="min-w-0 flex-1 truncate">
                {selectedValue || "Select"}
              </span>
              <span className="shrink-0 print:hidden">▼</span>
            </summary>
            <div className="absolute left-0 top-full z-[200] max-h-48 w-full overflow-y-auto border border-gray-400 bg-white shadow-lg print:hidden">
              {(field.options || []).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={(event) => {
                    setFieldValue(field, option);
                    event.currentTarget.closest("details")?.removeAttribute("open");
                  }}
                  className="block w-full px-2 py-2 text-left hover:bg-blue-50"
                  style={{ fontSize: inputFontSize }}
                >
                  {option}
                </button>
              ))}
            </div>
          </details>
        </div>
      );
    }

    return (
      <div className="flex h-full w-full" style={{ border: fieldBorder }}>
        <div
          className="flex shrink-0 items-center bg-slate-200 px-2 font-bold text-slate-700"
          style={{
            width: showLabel ? field.labelWidth ?? 110 : 0,
            display: showLabel ? "flex" : "none",
            borderRight: labelDivider,
            ...textStyle,
          }}
        >
          {showLabel ? field.label : ""}
        </div>
        <input
          type={field.type === "number" && !hasNonNumericNumberValue ? "number" : field.type === "date" ? "date" : "text"}
          value={currentFieldValue}
          list={hasFleetLookup ? fleetLookupId : undefined}
          onChange={(event) => setFleetFieldValue(field, event.target.value)}
          className={`${commonInput} min-w-0 flex-1`}
          style={singleLineControlStyle}
        />
        {hasFleetLookup && (
          <datalist id={fleetLookupId}>
            {fleetLookupOptions.flatMap((vehicle) =>
              [fleetValue(vehicle, "regNo"), fleetValue(vehicle, "fleetNo")]
                .filter(Boolean)
                .map((option) => (
                  <option key={`${vehicle.id}-${option}`} value={String(option)}>
                    {[fleetValue(vehicle, "regNo"), fleetValue(vehicle, "fleetNo")].filter(Boolean).join(" / ")}
                  </option>
                ))
            )}
          </datalist>
        )}
      </div>
    );
  }

  if (loading) {
    return <div className="p-10">Loading Job Form...</div>;
  }

  if (!job) {
    return <div className="p-10">Job not found.</div>;
  }

  return (
    <div className={`job-card-palette ${embeddedView ? "min-h-screen bg-white p-0" : "min-h-screen bg-slate-200 p-6 print:bg-white print:p-0"}`} style={{ "--job-card-primary": documentPalette.primary, "--job-card-primary-text": documentPalette.primaryText, "--job-card-label-bg": documentPalette.labelBackground, "--job-card-alternate": documentPalette.alternateBackground, "--job-card-border": documentPalette.border } as React.CSSProperties}>
      {!embeddedView && <div className="sticky top-0 z-[100] mx-auto mb-5 flex max-w-[1100px] items-center justify-between rounded-2xl bg-white p-4 shadow print:hidden">
        <div>
          <h1 className="text-xl font-black">
            {formName}
          </h1>
          <p className="text-sm text-gray-500">{job.jobNumber}</p>
        </div>
        <div className="flex gap-3">
          {pdfView && (
            <>
              <Link
                href={`/jobs/${jobId}/form`}
                className="rounded-xl border border-gray-300 px-4 py-2 font-semibold"
              >
                Back to Forms
              </Link>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-xl bg-blue-500 px-5 py-2 font-bold text-white hover:bg-blue-600"
              >
                Print / Save PDF
              </button>
            </>
          )}
          {!pdfView && (
            <>
          <Link
            href={`/jobs/${jobId}`}
            className="rounded-xl border border-gray-300 px-4 py-2 font-semibold"
          >
            Back to Job
          </Link>
          <button
            type="button"
            onClick={updateFromAdminTemplate}
            disabled={!updatedTemplateFields || updatingTemplate || !canEditForm}
            className={`rounded-xl px-5 py-2 font-bold ${
              updatedTemplateFields
                ? "bg-orange-500 text-white hover:bg-orange-600"
                : "bg-gray-100 text-gray-400"
            } disabled:cursor-not-allowed`}
          >
            {updatingTemplate
              ? "Updating..."
              : updatedTemplateFields
                ? "Update Form"
                : "Form Up to Date"}
          </button>
          <button
            type="button"
            disabled={saving || fields.length === 0 || (completed && !canEditForm)}
            onClick={() => save(false)}
            className="rounded-xl bg-blue-600 px-5 py-2 font-bold text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            disabled={saving || fields.length === 0 || completed}
            onClick={() => save(true)}
            className="rounded-xl bg-green-600 px-5 py-2 font-bold text-white disabled:opacity-50"
          >
            {completed ? "Completed" : "Complete Form"}
          </button>
            </>
          )}
        </div>
      </div>}

      {!pdfView && completed && (
        <div className="mx-auto mb-5 max-w-[1100px] rounded-xl border border-green-300 bg-green-50 p-4 text-sm font-semibold text-green-800">
          {canEditForm
            ? "This form is completed. You have administrator approval to edit it."
            : "This form is completed and locked. Only an approved administrator can edit it."}
        </div>
      )}

      {fields.length === 0 ? (
        <div className="mx-auto max-w-2xl rounded-2xl bg-white p-8 text-center shadow">
          <h2 className="text-xl font-bold">No Job Form Allocated</h2>
          <p className="mt-2 text-sm text-gray-500">
            Select a Job Type with a linked form on the job card.
          </p>
        </div>
      ) : (
        <div
          className="job-form-print-canvas relative mx-auto bg-white shadow-2xl print:shadow-none"
          style={{
            width: 794,
            height: pageHeight,
            ["--job-form-page-count" as string]: pageCount,
            pointerEvents: pdfView || (completed && !canEditForm) ? "none" : "auto",
          }}
        >
          <JobFormDocumentHeader
            company={company}
            formName={formName}
            job={job}
            jobNumber={job.jobNumber || jobId}
          />
          {Array.from({ length: pageCount - 1 }).map((_, page) => (
            <div
              key={`page-gap-${page}`}
              className="absolute left-0 z-40 h-8 w-full bg-slate-200 print:hidden"
              style={{ top: page * JOB_FORM_PAGE_STRIDE + JOB_FORM_PAGE_HEIGHT }}
            />
          ))}
          {visibleLayoutFields
            .slice()
            .sort((a, b) =>
              a.type === "section" && b.type !== "section" ? -1 : 0
            )
            .map((field) => (
              <div
                key={field.id}
                className={`job-form-positioned-field absolute ${field.showBorder === false ? "[&>*]:!border-transparent [&_*]:!border-transparent" : ""}`}
                style={{
                  left: field.x,
                  top: field.y,
                  ["--job-form-print-top" as string]: `${
                    field.y - Math.floor(field.y / JOB_FORM_PAGE_STRIDE) * JOB_FORM_PAGE_GAP
                  }px`,
                  width: field.width,
                  height: field.height,
                  zIndex: field.type === "section" ? 1 : 10,
                }}
              >
                {renderField(field)}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function isLegacyDocumentHeaderField(field: FormField) {
  const pageLocalY = field.y % JOB_FORM_PAGE_STRIDE;
  if (pageLocalY > 215) return false;
  const linkedType = String(field.linkedType || "").trim();
  const label = String(field.label || "").trim().toLowerCase();
  return [
    "Company Name",
    "Company Phone",
    "Company Email",
    "Company Address",
    "Customer Name",
    "Job Status",
    "Job Date",
    "Technician Name",
    "Job Number",
  ].includes(linkedType) ||
    (field.type === "image" && label.includes("company logo")) ||
    (field.type === "title" && (label.includes("job form") || label.includes("job card") || label.includes("jobnumber")));
}

function JobFormDocumentHeader({ company, formName, job, jobNumber }: { company: any; formName: string; job: any; jobNumber: string }) {
  const companyLines = [
    company?.physicalAddress,
    company?.website,
    company?.registrationNumber ? `Registration: ${company.registrationNumber}` : "",
    company?.vatNumber ? `VAT: ${company.vatNumber}` : "",
    company?.telephone ? `Contact: ${company.telephone}` : "",
    company?.email ? `Email: ${company.email}` : "",
  ].filter(Boolean);
  const employee = job?.assignedTo || (job?.assignedUsers || []).map((user: any) =>
    user.name || user.displayName || `${user.firstName || ""} ${user.surname || user.lastName || ""}`.trim()
  ).filter(Boolean).join(", ") || "—";
  const status = typeof job?.status === "object" ? job.status?.name : job?.status;
  const jobDate = job?.dateBooked || (job?.createdAt?.toDate?.() ? formatDateTime24(job.createdAt.toDate()) : "");
  const information = [
    ["Customer", job?.customerName || job?.customer || "—"],
    ["Status", status || "—"],
    ["Date", jobDate || "—"],
    ["Employee", employee],
  ];

  return (
    <header className="absolute left-[57px] top-[34px] z-30 h-[145px] w-[680px] border-b-[3px] border-blue-700 bg-white pb-3">
      <div className="flex h-[103px] justify-between gap-5">
        <div className="flex min-w-0 items-start gap-4">
          {company?.logo ? <img src={company.logo} alt={`${company.companyName || "Company"} logo`} className="h-20 w-24 shrink-0 object-contain" /> : null}
          <div className="min-w-0">
            <strong className="text-lg font-black tracking-tight text-blue-700">{company?.companyName || "Company Name"}</strong>
            <div className="mt-1 flex flex-col gap-[2px] text-[8px] text-slate-500">
              {companyLines.map((line, index) => <p key={`${line}-${index}`} className="max-w-[270px] whitespace-nowrap leading-[10px]">{line}</p>)}
            </div>
          </div>
        </div>
        <div className="grid h-fit w-[245px] shrink-0 grid-cols-[74px_1fr] overflow-hidden rounded border border-slate-400 text-[8px]">
          {information.map(([label, value]) => <div key={label} className="contents"><strong className="border-b border-r border-slate-300 bg-slate-100 px-2 py-1 last:border-b-0">{label}</strong><span className="truncate border-b border-slate-300 px-2 py-1 font-bold last:border-b-0" title={String(value)}>{value}</span></div>)}
        </div>
      </div>
      <div className="flex items-end justify-end gap-3 text-right">
        <h1 className="text-lg font-black leading-tight">{formName}:</h1>
        <p className="text-lg font-black leading-tight">{jobNumber}</p>
      </div>
    </header>
  );
}

function SignaturePanel({
  field,
  terms,
  name,
  signature,
  allowResign,
  onNameChange,
  onSignatureChange,
}: {
  field: FormField;
  terms: string[];
  name: string;
  signature: string;
  allowResign: boolean;
  onNameChange: (name: string) => void;
  onSignatureChange: (signature: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const showLabel = field.showLabel !== false;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!signature) return;

    const image = new Image();
    image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.src = signature;
  }, [signature]);

  function canvasPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
      y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
    };
  }

  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!name.trim() || (!allowResign && Boolean(signature))) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const point = canvasPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineWidth = 2;
    context.lineCap = "round";
    context.strokeStyle = "#111827";
    drawingRef.current = true;
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const point = canvasPoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();
  }

  function finishDrawing() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (canvas) onSignatureChange(canvas.toDataURL("image/png"));
  }

  function clearSignature() {
    if (!allowResign) return;
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    onSignatureChange("");
  }

  return (
    <div className="flex h-full w-full overflow-hidden border border-black bg-white text-[11px]">
      <div className="flex w-1/2 min-w-0 flex-col border-r border-black">
        {showLabel && (
          <div
            className="flex shrink-0 items-center border-b border-black px-2 py-1 font-bold"
            style={{ height: field.labelHeight ?? 28, fontSize: field.fontSize ?? 11 }}
          >
            {field.label}
          </div>
        )}
        <div className="relative min-h-0 flex-1 bg-white">
          <canvas
            ref={canvasRef}
            width={600}
            height={180}
            className="h-full w-full"
            style={{ touchAction: "none" }}
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={finishDrawing}
            onPointerCancel={finishDrawing}
            aria-label={`${field.label} signature pad`}
          />
          {!name.trim() && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/80 px-3 text-center text-gray-500 print:hidden">
              Enter name and surname below to enable signing
            </div>
          )}
          <button
            type="button"
            onClick={clearSignature}
            disabled={!signature || !allowResign}
            className="absolute right-1 top-1 rounded border border-gray-300 bg-white px-2 py-1 text-[9px] disabled:opacity-40 print:hidden"
          >
            Clear
          </button>
        </div>
        <input
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          className="h-8 w-full shrink-0 border-0 border-t border-black px-2 outline-none"
          placeholder="Driver name & surname"
          aria-label={`${field.label} name and surname`}
        />
      </div>
      <div className="flex w-1/2 min-w-0 flex-col">
        <div
          className="flex shrink-0 items-center border-b border-black px-2 py-1 font-bold"
          style={{ height: field.labelHeight ?? 28, fontSize: field.fontSize ?? 11 }}
        >
          Terms
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap p-2 text-[9px] leading-tight print:overflow-visible">
          {terms.length > 0
            ? terms.join("\n\n")
            : "No active terms are linked to this form."}
        </div>
      </div>
    </div>
  );
}
