"use client";

import Link from "next/link";
import { use } from "react";
import { useEffect, useRef, useState } from "react";

import {
  doc,
  getDoc,
  getDocs,
  collection,
  deleteDoc,
  updateDoc,
  setDoc,
  addDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  Timestamp,
  runTransaction,
  writeBatch,
} from "firebase/firestore";

import { clientDb } from "@/lib/firebaseClient";
import { getAuth } from "firebase/auth";
import { COMPANY_ID } from "@/lib/company";
import { formatDateTime24 } from "@/lib/dateTime";
import { hasPrivilegedRole } from "@/lib/accessControl";
import { recalculateActiveJobQueue } from "@/lib/jobQueue";
import { effectivePermissions, permissionsForRole } from "@/lib/permissions";
import { calculateCompanyRateTotals, CompanyRateLine } from "@/lib/companyRates";

import JobStatusSelect from "@/components/jobs/JobStatusSelect";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import UserAvatar from "@/components/shared/UserAvatar";


interface JobDetailsProps {
  params: Promise<{
    id: string;
  }>;
}

type CustomerJobField = {
  id: string;
  label: string;
  type: "text" | "number" | "date" | "textarea";
  required: boolean;
  requiredStatusIds: string[];
};

type CancellationReason = {
  id: string;
  name: string;
  linkedStatus?: string;
  linkedStatusIds?: string[];
  linkedStatusNames?: string[];
  active?: boolean;
  fieldType?: "text" | "dropdown";
  dropdownOptions?: string[];
  linkedJobType?: string;
};

function displayQueueNumber(value: unknown): string {
  const queueNumber = Number(String(value ?? "").replace(/\D/g, ""));
  return Number.isFinite(queueNumber) && queueNumber > 0 ? String(queueNumber) : "";
}

function statusIsOnRoute(value: unknown) {
  return /on\s*route|en\s*route|travell?ing|dispatched/i.test(String(value || ""));
}

function statusIsOnSite(value: unknown) {
  return /on\s*site|arriv|start\s*work|work\s*(?:in\s*)?progress|working|repair\s*(?:in\s*)?progress/i.test(String(value || ""));
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
  const autoAdvanceRunningRef = useRef(false);

  const [customer, setCustomer] =
    useState<any>(null);
  const [companyDetails, setCompanyDetails] =
    useState<any>(null);
  const [companyRates, setCompanyRates] = useState<CompanyRateLine[]>([]);
  const [rateTimers, setRateTimers] = useState<any[]>([]);
  const [selectedCustomerContact, setSelectedCustomerContact] = useState<any>(null);

  const [saving, setSaving] =
    useState(false);

  const [hasUnsavedAmendments, setHasUnsavedAmendments] =
    useState(false);

  const [selectedTechnician, setSelectedTechnician] =
    useState("");

  const [managementOpen, setManagementOpen] =
    useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellationReasons, setCancellationReasons] = useState<CancellationReason[]>([]);
  const [selectedCancellationReasonId, setSelectedCancellationReasonId] = useState("");
  const [cancellingJob, setCancellingJob] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [showJobCardSignatureModal, setShowJobCardSignatureModal] = useState(false);
  const [jobCardTerms, setJobCardTerms] = useState<any[]>([]);
  const [selectedReopenReasonId, setSelectedReopenReasonId] = useState("");
  const [reopenReasonValue, setReopenReasonValue] = useState("");
  const [reopenAssignedUserIds, setReopenAssignedUserIds] = useState<string[]>([]);
  const [reopeningJob, setReopeningJob] = useState(false);

  const [customers, setCustomers] =
    useState<any[]>([]);

  const [vehicles, setVehicles] =
    useState<any[]>([]);

  const [locations, setLocations] =
    useState<any[]>([]);

  const [loading, setLoading] = useState(true);

  const [showTechnicianModal, setShowTechnicianModal] = useState(false);
  const [assignedUsersOpen, setAssignedUsersOpen] = useState(false);

  const [technicians, setTechnicians] =
    useState<any[]>([]);

  const [showCustomerModal, setShowCustomerModal] =
    useState(false);

  const [showVehicleModal, setShowVehicleModal] =
    useState(false);

  const [showLocationModal, setShowLocationModal] =
    useState(false);

  const [showPriorityModal, setShowPriorityModal] = useState(false);
  const [showJobTypeModal, setShowJobTypeModal] = useState(false);
  const [showExternalSupplierModal, setShowExternalSupplierModal] = useState(false);
  const [externalSuppliers, setExternalSuppliers] = useState<any[]>([]);
  const [convertingExternal, setConvertingExternal] = useState(false);
  const [allocatingJobType, setAllocatingJobType] = useState(false);
  const [jobTypes, setJobTypes] = useState<any[]>([]);

  const [selectedFields, setSelectedFields] =
    useState<string[]>([]);
  const [customerJobFields, setCustomerJobFields] = useState<CustomerJobField[]>([]);
  const [customerJobFieldValues, setCustomerJobFieldValues] = useState<Record<string, string>>({});

  const [activatedStatusFieldIds, setActivatedStatusFieldIds] =
    useState<string[]>([]);

  const [editableLabels, setEditableLabels] =
    useState<Record<string, string>>({});

  const [editableFields, setEditableFields] =
    useState<any>({});
  const [directlyEditedFieldIds, setDirectlyEditedFieldIds] = useState<string[]>([]);
  const [adminKmDrafts, setAdminKmDrafts] = useState<Record<string, string>>({});

  const [showAttachments, setShowAttachments] =
    useState(false);

  const [showCommunication, setShowCommunication] =
    useState(false);

  const [showSummary, setShowSummary] =
    useState(false);

  const [pendingStatus, setPendingStatus] =
    useState<any>(null);
  const [pendingPartsRequestStatus, setPendingPartsRequestStatus] = useState<any>(null);
  const [sendingPartsRequest, setSendingPartsRequest] = useState(false);

  const [showStatusModal, setShowStatusModal] =
    useState(false);

  const [statusFormValues, setStatusFormValues] =
    useState<any>({});



  const [attachments, setAttachments] =
    useState<any[]>([]);

  const [communications, setCommunications] =
    useState<any[]>([]);

  const [messageTemplates, setMessageTemplates] = useState<any[]>([]);
  const [selectedMessageTemplate, setSelectedMessageTemplate] = useState("");
  const [communicationRecipient, setCommunicationRecipient] = useState("customer");
  const [quickMessage, setQuickMessage] = useState("");
  const [sendingCommunication, setSendingCommunication] = useState(false);

  const [isAdmin, setIsAdmin] = useState(false);
  const [canOpenClosedJobs, setCanOpenClosedJobs] = useState(false);
  const [canCorrectUsedMaterials, setCanCorrectUsedMaterials] = useState(false);
  const [canViewJobPricing, setCanViewJobPricing] = useState(false);
  const [canChangeJobStatus, setCanChangeJobStatus] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [closedJobEditing, setClosedJobEditing] = useState(false);

  const [materials, setMaterials] =
    useState<any[]>([]);
  const [returnMaterialIds, setReturnMaterialIds] = useState<string[]>([]);
  const [creatingDerequisition, setCreatingDerequisition] = useState(false);
  const [showDerequisitionAction, setShowDerequisitionAction] = useState(false);
  const [pendingUnusedPartsStatus, setPendingUnusedPartsStatus] = useState<any>(null);
  const [unusedPartsDecisionStatus, setUnusedPartsDecisionStatus] = useState<any>(null);

  const [showPartsModal, setShowPartsModal] =
    useState(false);
  const [serialSelectionItem, setSerialSelectionItem] = useState<any>(null);
  const [availableSerials, setAvailableSerials] = useState<any[]>([]);
  const [loadingSerials, setLoadingSerials] = useState(false);
  const [pendingInventoryLocation, setPendingInventoryLocation] = useState<any>(null);
  const [selectedInventoryLocationId, setSelectedInventoryLocationId] = useState("");


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
  const [selectedLinkedItem, setSelectedLinkedItem] = useState<any>(null);
  const [showLinkQuoteModal, setShowLinkQuoteModal] = useState(false);
  const [availableQuotes, setAvailableQuotes] = useState<any[]>([]);
  const [linkingQuoteId, setLinkingQuoteId] = useState("");


  const [newNote, setNewNote] =
    useState("");
  const [editingNoteId, setEditingNoteId] = useState("");
  const [editingNoteText, setEditingNoteText] = useState("");
  const [savingNoteEdit, setSavingNoteEdit] = useState(false);
  const [noteVisibility, setNoteVisibility] = useState<"internal" | "public">("internal");
  const [emailNoteToCustomer, setEmailNoteToCustomer] = useState(false);
  const [emailNoteToUsers, setEmailNoteToUsers] = useState(false);
  const [selectedNoteTemplate, setSelectedNoteTemplate] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const [newTask, setNewTask] =
    useState("");

  const [newMaterial, setNewMaterial] =
    useState<any>({});

  const [jobCardOutputType, setJobCardOutputType] = useState("internal");
  const [jobCardOutputProfiles, setJobCardOutputProfiles] = useState<Array<{ id: string; name: string }>>([
    { id: "internal", name: "Internal Job Card" },
    { id: "customer", name: "Customer Job Card" },
  ]);

  useEffect(() => {
    getDocs(collection(clientDb, "companies", COMPANY_ID, "jobCardOutputSettings")).then((snapshot) => {
      const configured = snapshot.docs.map((item) => ({ id: item.id, name: item.data().profileName || item.data().documentTitle || item.id }));
      setJobCardOutputProfiles((current) => Array.from(new Map([...current, ...configured].map((profile) => [profile.id, profile])).values()));
    }).catch((error) => console.error("Unable to load job card profiles", error));
  }, []);

  useEffect(() => {

    loadJob();

    loadJobCollections();

    loadInventory();

    loadStockLocations();

  }, []);

  useEffect(() => onSnapshot(
    doc(clientDb, "companies", COMPANY_ID, "jobcard_settings", "Job"),
    (snapshot) => {
      if (!snapshot.exists()) return;
      const settings = snapshot.data();
      setSelectedFields(Array.isArray(settings.screenFields) ? settings.screenFields : (settings.viewFields || settings.selectedFields || []));
      setActivatedStatusFieldIds(
        settings.statusFields || settings.viewFields || settings.selectedFields || []
      );
      setEditableLabels(settings.editableLabels || {});
    }
  ), []);

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedAmendments) return;
      event.preventDefault();
      event.returnValue = "";
    };

    const warnBeforeLinkNavigation = (event: MouseEvent) => {
      if (!hasUnsavedAmendments) return;
      const link = (event.target as HTMLElement | null)?.closest("a");
      if (!link || !link.href) return;
      const leaveWithoutSaving = window.confirm(
        "This job card has unsaved amendments. Select Cancel and use Save Amendments before leaving, or OK to discard the amendments."
      );
      if (!leaveWithoutSaving) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", warnBeforeLeaving);
    document.addEventListener("click", warnBeforeLinkNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeLeaving);
      document.removeEventListener("click", warnBeforeLinkNavigation, true);
    };
  }, [hasUnsavedAmendments]);

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

  useEffect(() => onSnapshot(
    collection(clientDb, "companies", COMPANY_ID, "suppliers"),
    (snapshot) => setExternalSuppliers(snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() } as any))
      .sort((left, right) => String(left.supplierName || "").localeCompare(String(right.supplierName || ""))))
  ), []);

  useEffect(() => onSnapshot(
    collection(clientDb, "companies", COMPANY_ID, "reasonFields"),
    (snapshot) => setCancellationReasons(snapshot.docs
      .map((item) => ({ id: item.id, ...(item.data() as any) } as CancellationReason))
      .filter((reason) => reason.active !== false)
      .sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""))))
  ), []);

  useEffect(() => onSnapshot(
    collection(clientDb, "companies", COMPANY_ID, "termsTemplates"),
    (snapshot) => setJobCardTerms(snapshot.docs
      .map((item) => ({ id: item.id, ...(item.data() as any) }))
      .filter((template: any) =>
        template.active !== false &&
        (template.directJobCard === true || template.linkedFormId === "__direct_job_card__") &&
        String(template.signatureType || "Customer").toLowerCase() === "customer"
      )
    )
  ), []);

  useEffect(() => onSnapshot(
    doc(clientDb, "companies", COMPANY_ID),
    (snapshot) => setCompanyDetails(snapshot.exists() ? snapshot.data() : null)
  ), []);

  useEffect(() => onSnapshot(
    doc(clientDb, "companies", COMPANY_ID, "companyRates", "settings"),
    (snapshot) => setCompanyRates(snapshot.exists() && Array.isArray(snapshot.data().rates) ? snapshot.data().rates : [])
  ), []);

  useEffect(() => onSnapshot(
    collection(clientDb, "companies", COMPANY_ID, "jobs", id, "timers"),
    (snapshot) => setRateTimers(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })))
  ), [id]);

  useEffect(() => {
    let active = true;
    async function loadCurrentUserRole() {
      const roleAuth = getAuth();
      await roleAuth.authStateReady();
      const user = roleAuth.currentUser;
      let userData: any = null;
      if (user) {
        const companyUser = await getDoc(
          doc(clientDb, "companies", COMPANY_ID, "users", user.uid)
        );
        if (companyUser.exists()) userData = companyUser.data();
        else {
          const globalUser = await getDoc(doc(clientDb, "users", user.uid));
          if (globalUser.exists()) userData = globalUser.data();
        }
      }
      const role = String(userData?.primaryRole || userData?.role || "").toLowerCase();
      if (active) {
        const privileged = hasPrivilegedRole(role);
        const permissions = userData?.permissions as Record<string, boolean> | undefined;
        const rolePermissions = permissionsForRole(String(userData?.primaryRole || userData?.role || ""));
        setIsAdmin(privileged);
        setCanOpenClosedJobs(
          permissions && Object.prototype.hasOwnProperty.call(permissions, "Open closed jobs")
            ? permissions["Open closed jobs"] === true
            : rolePermissions["Open closed jobs"] === true
        );
        setCanCorrectUsedMaterials(
          permissions && Object.prototype.hasOwnProperty.call(permissions, "Correct used job materials")
            ? permissions["Correct used job materials"] === true
            : rolePermissions["Correct used job materials"] === true
        );
        setCanViewJobPricing(
          permissions && Object.prototype.hasOwnProperty.call(permissions, "View job pricing")
            ? permissions["View job pricing"] === true
            : rolePermissions["View job pricing"] === true
        );
        setCanChangeJobStatus(
          permissions && Object.prototype.hasOwnProperty.call(permissions, "Change job status")
            ? permissions["Change job status"] === true
            : rolePermissions["Change job status"] === true
        );
        setAuthChecked(true);
      }
    }
    loadCurrentUserRole();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const historyQuery = query(
      collection(clientDb, "companies", COMPANY_ID, "jobs", id, "communications")
    );
    const unsubscribeHistory = onSnapshot(historyQuery, (snapshot) => {
      setCommunications(
        snapshot.docs
          .map((communicationDoc) => ({
            id: communicationDoc.id,
            ...communicationDoc.data(),
          } as any))
          .sort((left: any, right: any) => {
            const leftTime = left.createdAt?.toMillis?.() || 0;
            const rightTime = right.createdAt?.toMillis?.() || 0;
            return rightTime - leftTime;
          })
      );
    });

    const unsubscribeTemplates = onSnapshot(
      collection(clientDb, "companies", COMPANY_ID, "messageTemplates"),
      (snapshot) => {
        setMessageTemplates(
          snapshot.docs
            .map((templateDoc) => ({ id: templateDoc.id, ...templateDoc.data() } as any))
            .sort((left: any, right: any) =>
              String(left.name || "").localeCompare(String(right.name || ""))
            )
        );
      }
    );

    return () => {
      unsubscribeHistory();
      unsubscribeTemplates();
    };
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

    if (!status?.startTimer && !status?.stopTimer) {

      return;

    }

    const timersRef =
      collection(
        clientDb,
        "companies",
        COMPANY_ID,
        "jobs",
        job.id,
        "timers"
      );


    // Starting a timer closes the current timer first. A stop-only status
    // closes it without creating a replacement.

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



    // A timer belongs to the authenticated user who selected the status,
    // not to whichever users happen to be assigned to the job.
    const statusUser = getAuth().currentUser;
    const timerUserId = statusUser?.uid || "";
    let timerUserName = statusUser?.displayName || statusUser?.email || "";

    if (timerUserId) {

      const techSnap =
        await getDoc(

          doc(
            clientDb,
            "users",
            timerUserId
          )

        );


      if (techSnap.exists()) {


        const user: any =
          techSnap.data();


        timerUserName =

          user.name ||

          `${user.firstName || ""} ${user.surname || user.lastName || ""}`.trim() ||
          user.email ||
          timerUserName;


      }

    }


    // FINAL SAFETY

    if (!timerUserName) {

      timerUserName = "Unknown User";

    }


    // START NEW TIMER

    await addDoc(

      timersRef,

      {

        employeeId:
          timerUserId,


        employeeName:
          timerUserName,


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

  async function triggerStatusCommunications(status: any, extraReplacements: Record<string, string> = {}) {

    const [communicationSnap, templateSnap, userSnap] = await Promise.all([
      getDocs(collection(clientDb, "companies", COMPANY_ID, "communications")),
      getDocs(collection(clientDb, "companies", COMPANY_ID, "messageTemplates")),
      getDocs(collection(clientDb, "companies", COMPANY_ID, "users")),
    ]);
    const templates = templateSnap.docs.map((templateDoc) => ({
      id: templateDoc.id,
      ...(templateDoc.data() as any),
    }));

    const matchingRules = communicationSnap.docs
      .map((communicationDoc) => ({
        id: communicationDoc.id,
        ...(communicationDoc.data() as any),
      }))
      .filter((rule: any) => {
        const matchesStatus =
          rule.triggerStatusIds?.includes(status.id) ||
          rule.triggerStatuses?.includes(status.name);
        const matchesJobType =
          rule.allJobTypes !== false ||
          rule.selectedJobTypes?.includes(job.jobType) ||
          rule.selectedJobTypes?.includes(job.jobTypeName);

        return (
          rule.active !== false &&
          rule.ruleType === "Job Status Change" &&
          matchesStatus &&
          matchesJobType
        );
      });

    const notificationRecipients = userSnap.docs
      .map((userDocument) => ({ id: userDocument.id, ...userDocument.data() } as any))
      .filter((user) => user.active !== false)
      .filter((user) => effectivePermissions(user)["View notifications"] === true)
      .filter((user) => user.notificationPreferences?.job_status !== false);
    await Promise.all(notificationRecipients.map((recipient) => addDoc(
      collection(clientDb, "companies", COMPANY_ID, "notifications"),
      {
        type: "job_status",
        title: `Job ${job.jobNumber || job.id} status changed to ${status.name}`,
        message: extraReplacements.notes || extraReplacements.comment || `Status changed to ${status.name}.`,
        recipientId: recipient.id,
        recipientName: recipient.name || recipient.displayName || `${recipient.firstName || ""} ${recipient.lastName || ""}`.trim() || recipient.email || "FleetFix User",
        jobId: job.id,
        jobNumber: job.jobNumber || "",
        statusId: status.id || "",
        statusName: status.name || "",
        sourcePath: `/jobs/${job.id}`,
        createdById: currentUser?.uid || "",
        createdByName: currentUser?.displayName || currentUser?.email || "System",
        status: "active",
        finalized: false,
        createdAt: serverTimestamp(),
      }
    )));

    for (const rule of matchingRules) {
      for (const message of rule.messages || []) {
        for (const templateId of message.templateIds || []) {
          const template = templates.find(
            (item: any) => item.id === templateId || item.name === templateId
          );
          const subject = applyMessageTags(
            template?.subject || template?.name || rule.name || "Job update",
            { jobStatus: status.name || "", status: status.name || "", ...extraReplacements }
          );
          const body = applyMessageTags(
            template?.htmlBody || "",
            { jobStatus: status.name || "", status: status.name || "", ...extraReplacements }
          );
          await addDoc(
            collection(
              clientDb,
              "companies",
              COMPANY_ID,
              "communicationQueue"
            ),
            {
              communicationId: rule.id,
              communicationName: rule.name || "",
              jobId: job.id,
              jobNumber: job.jobNumber || "",
              statusId: status.id,
              statusName: status.name,
              templateId,
              templateName: template?.name || String(templateId),
              subject,
              body,
              notificationType: message.notificationType || "",
              sendEmail: message.sendEmail === true,
              attachJobCard: message.attachJobCard === true,
              attachCustomerJobCard:
                message.attachCustomerJobCard === true,
              state: "pending",
              createdAt: serverTimestamp(),
            }
          );

          await addDoc(
            collection(clientDb, "companies", COMPANY_ID, "jobs", job.id, "communications"),
            {
              source: "status",
              communicationName: rule.name || "Status message",
              templateId,
              templateName: template?.name || String(templateId),
              subject,
              body,
              recipientType: message.notificationType || "",
              statusName: status.name,
              state: "queued",
              createdById: currentUser?.uid || "",
              createdByName: currentUser?.displayName || currentUser?.email || "System",
              createdAt: serverTimestamp(),
            }
          );
        }
      }
    }

    if (job.supplierId) {
      const supplierSnapshot = await getDoc(doc(clientDb, "companies", COMPANY_ID, "suppliers", job.supplierId));
      if (supplierSnapshot.exists()) {
        const supplier = { id: supplierSnapshot.id, ...supplierSnapshot.data() } as any;
        const timedMessages = supplier.sendOrderUpdates === true && Array.isArray(supplier.orderDeliveryUpdateMessages)
          ? supplier.orderDeliveryUpdateMessages.filter((message: any) => message.statusId === status.id || message.statusName === status.name)
          : [];
        for (const message of timedMessages) {
          const template = templates.find((item: any) => item.id === message.templateId);
          if (!template || !supplier.email) continue;
          const multiplier = message.delayUnit === "days" ? 1440 : message.delayUnit === "hours" ? 60 : 1;
          const delayMinutes = Math.max(0, Number(message.delayValue) || 0) * multiplier;
          const scheduledDate = new Date(Date.now() + delayMinutes * 60_000);
          const jobLink = `${window.location.origin}/jobs/${job.id}`;
          const jobCardLink = `${window.location.origin}/jobs/${job.id}/jobcard?type=customer`;
          const replacements = { supplierName: supplier.supplierName || "", supplierCode: supplier.supplierCode || "", jobStatus: status.name || "", status: status.name || "", jobLink, jobCardLink, link: jobLink };
          const subject = applyMessageTags(template.subject || template.name || "Order and delivery update", replacements);
          const body = applyMessageTags(template.htmlBody || "", replacements);
          const historyRef = await addDoc(collection(clientDb, "companies", COMPANY_ID, "jobs", job.id, "communications"), {
            source: "supplier-timed-status-message",
            supplierId: supplier.id,
            templateId: template.id,
            templateName: template.name || "Order and delivery update",
            recipientType: "Supplier",
            recipientId: supplier.id,
            recipientName: supplier.supplierName || "Supplier",
            recipientEmail: supplier.email,
            statusId: status.id,
            statusName: status.name,
            subject,
            body,
            delayMinutes,
            scheduledAt: Timestamp.fromDate(scheduledDate),
            state: delayMinutes > 0 ? "scheduled" : "queued",
            createdById: currentUser?.uid || "",
            createdByName: currentUser?.displayName || currentUser?.email || "System",
            createdAt: serverTimestamp(),
          });
          await addDoc(collection(clientDb, "companies", COMPANY_ID, "communicationQueue"), {
            jobId: job.id,
            jobNumber: job.jobNumber || "",
            historyId: historyRef.id,
            supplierId: supplier.id,
            recipientId: supplier.id,
            recipientName: supplier.supplierName || "Supplier",
            recipientEmail: supplier.email,
            notificationType: "Supplier",
            templateId: template.id,
            templateName: template.name || "Order and delivery update",
            communicationName: "Timed supplier order and delivery update",
            triggerStatusId: status.id,
            triggerStatusName: status.name,
            subject,
            body,
            sendEmail: true,
            sendSms: false,
            delayMinutes,
            scheduledAt: Timestamp.fromDate(scheduledDate),
            state: "pending",
            createdAt: serverTimestamp(),
          });
        }
      }
    }
  }

  async function markJobMaterialsUsed(statusConfig: any) {
    if (statusConfig?.markMaterialsUsed !== true) return;
    const inventorySettingsSnapshot = await getDoc(
      doc(clientDb, "companies", COMPANY_ID, "inventory_settings", "setup")
    );
    const allowNegativeStock = inventorySettingsSnapshot.exists()
      && inventorySettingsSnapshot.data().allowNegativeStock === true;
    const materialSnapshot = await getDocs(
      collection(clientDb, "companies", COMPANY_ID, "jobs", job.id, "materials")
    );
    const unusedMaterials = materialSnapshot.docs.filter(
      (materialDocument) => materialDocument.data().used !== true
    );
    const usageFields = {
      used: true,
      materialStatus: "used",
      usedAt: serverTimestamp(),
      usedLocationId: job.locationId || "",
      usedLocationName: job.locationDetails?.name || job.locationName || (typeof job.location === "string" ? job.location : job.location?.name) || "",
      usedJobId: job.id,
      usedJobNumber: job.jobNumber || job.id,
      usedById: currentUser?.uid || "",
      usedByName: currentUser?.displayName || currentUser?.email || "Unknown User",
      usedByStatusId: statusConfig.id || "",
      usedByStatusName: statusConfig.name || "",
      updatedAt: serverTimestamp(),
    };
    await Promise.all(unusedMaterials.map(async (materialDocument) => {
      const material = materialDocument.data();
      if (material.stockIssued === true) {
        await updateDoc(materialDocument.ref, usageFields);
        return;
      }
      if (!material.inventoryId) {
        await updateDoc(materialDocument.ref, usageFields);
        return;
      }
      const inventoryRef = doc(clientDb, "companies", COMPANY_ID, "inventory", material.inventoryId);
      const serialRef = material.serialId ? doc(clientDb, "companies", COMPANY_ID, "inventory_serials", material.serialId) : null;
      const movementRef = doc(collection(clientDb, "companies", COMPANY_ID, "inventory_transactions"));
      await runTransaction(clientDb, async (transaction) => {
        const [inventorySnapshot, serialSnapshot] = await Promise.all([
          transaction.get(inventoryRef),
          serialRef ? transaction.get(serialRef) : Promise.resolve(null),
        ]);
        if (!inventorySnapshot.exists()) throw new Error(`Inventory item ${material.partNumber || ""} was not found.`);
        if (serialRef && (!serialSnapshot?.exists() || serialSnapshot.data().status === "used")) throw new Error(`Serial number ${material.serialNumber || ""} is unavailable or already used.`);
        const inventoryData = inventorySnapshot.data();
        const locationId = material.sourceId || serialSnapshot?.data()?.locationId || "MAIN";
        const location = stockLocations.find((entry: any) => entry.id === locationId);
        const beforeQty = Number(inventoryData.warehouseStock?.[locationId] || 0);
        const usedQty = Math.max(1, Number(material.qty || 1));
        if (!allowNegativeStock && beforeQty < usedQty) {
          throw new Error(`Insufficient stock for ${material.partNumber || material.description || "inventory item"}. Available: ${beforeQty.toFixed(2)}, required: ${usedQty.toFixed(2)}.`);
        }
        const warehouseStock = { ...(inventoryData.warehouseStock || {}), [locationId]: beforeQty - usedQty };
        const locationType = String(location?.type || "").toLowerCase();
        const isWarehouse = locationId === "MAIN" || locationType === "warehouse";
        const isVan = locationType === "rav";
        const warehouseTotal = isWarehouse
          ? Number(inventoryData.warehouseTotal || 0) - usedQty
          : Number(inventoryData.warehouseTotal || 0);
        const vanTotal = isVan
          ? Number(inventoryData.vanTotal || 0) - usedQty
          : Number(inventoryData.vanTotal || 0);
        const grandTotal = Number(inventoryData.grandTotal || 0) - usedQty;
        const materialUsage = { ...usageFields, usedLocationId: locationId, usedLocationName: material.sourceName || location?.name || locationId };
        transaction.update(materialDocument.ref, materialUsage);
        transaction.update(inventoryRef, { warehouseStock, warehouseTotal, vanTotal, grandTotal, updatedAt: serverTimestamp() });
        transaction.set(movementRef, { inventoryId: material.inventoryId, partNumber: material.partNumber || "", description: material.description || "", type: "OUT", qty: usedQty, beforeQty, afterQty: beforeQty - usedQty, locationId, locationName: materialUsage.usedLocationName, referenceType: "JOB", documentNumber: job.jobNumber || job.id, referenceNumber: job.jobNumber || job.id, jobId: job.id, userId: currentUser?.uid || "", userName: currentUser?.displayName || currentUser?.email || "Unknown User", createdAt: serverTimestamp() });
        if (serialRef) transaction.update(serialRef, { status: "used", usedAt: serverTimestamp(), usedLocationId: locationId, usedLocationName: materialUsage.usedLocationName, usedJobId: job.id, usedJobNumber: job.jobNumber || job.id, usedById: currentUser?.uid || "", usedByName: currentUser?.displayName || currentUser?.email || "Unknown User", updatedAt: serverTimestamp() });
      });
    }));
    const replenishmentGroups = new Map<string, { rav: any; items: any[] }>();
    unusedMaterials.forEach((materialDocument) => {
      const material = materialDocument.data();
      const sourceId = String(material.sourceId || "");
      const rav = stockLocations.find((location: any) => location.id === sourceId && location.type === "rav" && location.autoReplenishment === true);
      if (!rav || !material.inventoryId) return;
      const current = replenishmentGroups.get(sourceId) || { rav, items: [] };
      current.items.push({ materialId: materialDocument.id, inventoryId: material.inventoryId, partNumber: material.partNumber || "", description: material.description || "", serialNumber: material.serialNumber || "", qty: Math.max(1, Number(material.qty || material.issuedQty || 1)) });
      replenishmentGroups.set(sourceId, current);
    });
    for (const { rav, items } of replenishmentGroups.values()) {
      const replenishmentNumber = await allocateStockFormNumber("replenishment");
      const replenishmentRef = await addDoc(collection(clientDb, "companies", COMPANY_ID, "ravReplenishments"), {
        replenishmentNumber,
        ravId: rav.id,
        ravName: rav.name || rav.id,
        assignedUserId: rav.assignedUserId || "",
        assignedUserName: rav.assignedUserName || "",
        jobId: job.id,
        jobNumber: job.jobNumber || job.id,
        status: "open",
        items,
        totalQty: items.reduce((sum: number, item: any) => sum + Number(item.qty || 0), 0),
        createdById: currentUser?.uid || "",
        createdByName: currentUser?.displayName || currentUser?.email || "Unknown User",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await Promise.all(items.map((item: any) => updateDoc(doc(clientDb, "companies", COMPANY_ID, "jobs", job.id, "materials", item.materialId), { ravReplenishmentId: replenishmentRef.id, ravReplenishmentNumber: replenishmentNumber, updatedAt: serverTimestamp() })));
      if (rav.assignedUserId) await addDoc(collection(clientDb, "companies", COMPANY_ID, "notifications"), { type: "rav-replenishment", title: `RAV replenishment ${replenishmentNumber}`, message: `${rav.name || "RAV"} requires ${items.length} stock line${items.length === 1 ? "" : "s"} to be replenished after job ${job.jobNumber || job.id}.`, recipientId: rav.assignedUserId, recipientName: rav.assignedUserName || "FleetFix User", createdById: currentUser?.uid || "", createdByName: currentUser?.displayName || currentUser?.email || "System", sourcePath: "/purchases?tab=replenishments", jobId: job.id, jobNumber: job.jobNumber || "", ravReplenishmentId: replenishmentRef.id, status: "active", finalized: false, createdAt: serverTimestamp() });
    }
    if (unusedMaterials.length > 0) {
      setMaterials((current) => current.map((material) => ({
        ...material,
        used: true,
        materialStatus: "used",
        usedByStatusId: statusConfig.id || "",
        usedByStatusName: statusConfig.name || "",
      })));
    }
  }

  function applyMessageTags(value: string, extraReplacements: Record<string, string> = {}) {
    const assignedUser = technicians.find((technician: any) =>
      (job.assignedUserIds || []).includes(technician.id) ||
      technician.id === job.technicianId ||
      technician.id === job.assignedUserId
    );
    const linkedSupplier = externalSuppliers.find((supplier: any) =>
      supplier.id === job.supplierId
    );
    const jobLink = typeof window !== "undefined"
      ? `${window.location.origin}/jobs/${job.id}`
      : `/jobs/${job.id}`;
    const jobCardLink = `${jobLink}/jobcard?type=customer`;
    const arrivalEstimate = job.estimatedArrivalAt || job.estimatedDispatchAt;
    const estimatedDispatchTime = job.edtPaused === true || /on\s*hold|hold/.test(String(job.status || "").toLowerCase())
      ? ""
      : arrivalEstimate?.toDate?.()
        ? formatDateTime24(arrivalEstimate.toDate())
        : arrivalEstimate
          ? formatDateTime24(new Date(arrivalEstimate))
          : "";
    const linkedBranch = (companyDetails?.branches || []).find((branch: any) =>
      branch.id === job.travelBranchId || branch.name === job.travelBranchName
    );
    const linkedJobLocation = locations.find((location: any) =>
      location.id === job.locationId
      || String(location.name || "").toLowerCase() === String(
        job.locationDetails?.name || job.locationName || (typeof job.location === "string" ? job.location : "")
      ).toLowerCase()
    );
    const jobLocationGoogleMapsLink = job.locationDetails?.googleMapsLink
      || job.locationDetails?.googleMaps
      || linkedJobLocation?.googleMapsLink
      || linkedJobLocation?.googleMaps
      || job.googleMapsLink
      || "";
    const replacements: Record<string, string> = {
      companyName: companyDetails?.companyName || companyDetails?.name || "FleetFix Pro - NVTS",
      companyPhone: companyDetails?.telephone || companyDetails?.phone || "",
      companyEmail: companyDetails?.email || "",
      customerName: customer?.companyName || customer?.name || job.customerName || "",
      customerEmail: customer?.email1 || customer?.email || "",
      customerPhone: customer?.phone1 || customer?.phone || customer?.mobile || "",
      jobNumber: job.jobNumber || job.id || "",
      jobStatus: job.status || "",
      jobType: job.jobType || job.jobTypeName || "",
      jobDate: job.jobDate || job.date || "",
      jobTime: job.jobTime || job.time || "",
      jobDescription: job.description || "",
      queueNumber: displayQueueNumber(job.queueNumber),
      queuePosition: String(job.queuePosition || job.queuePositionAtBooking || ""),
      estimatedDispatchTime,
      estimatedRepairMinutes: job.estimatedRepairMinutes ? String(job.estimatedRepairMinutes) : "",
      link: jobCardLink,
      jobLink,
      jobCardLink,
      supplierName: job.supplierName || linkedSupplier?.supplierName || "",
      supplierCode: job.supplierCode || linkedSupplier?.supplierCode || "",
      vehicleReg:
        job.vehicleRegNo || job.vehicleRegistration || job.registration || job.regNo || "",
      fleetNo:
        job.vehicleFleetNo || job.fleetNumber || job.fleetNo || "",
      vehicleMake: job.vehicleMake || "",
      vehicleModel: job.vehicleModel || "",
      vehicleVin: job.vinNumber || job.vehicleVin || "",
      vehicleMileage: String(job.vehicleMileage || job.mileage || ""),
      driverName: job.driverName || job.vehicle?.driverName || "",
      driverContact: job.driverContactNo || job.driverContactNumber || job.vehicle?.driverContactNumber || "",
      driverContactNumber: job.driverContactNo || job.driverContactNumber || job.vehicle?.driverContactNumber || "",
      technicianName: assignedUser?.name || assignedUser?.displayName || job.technician || "",
      technicianPhone: assignedUser?.phone || assignedUser?.mobile || "",
      employeeName: assignedUser?.name || assignedUser?.displayName || "",
      branchName: job.travelBranchName || linkedBranch?.name || companyDetails?.primaryBranchName || "",
      branchPhone: linkedBranch?.telephone || linkedBranch?.phone || companyDetails?.telephone || "",
      branchEmail: linkedBranch?.email || companyDetails?.email || "",
      breakdownLocation: job.breakdownLocation || job.locationName || job.locationDetails?.name || (typeof job.location === "string" ? job.location : job.location?.name) || "",
      googleMapsLink: jobLocationGoogleMapsLink,
      LINKS: jobLocationGoogleMapsLink,
      quoteNumber: job.quoteNumber || "",
      quoteAmount: String(job.quoteAmount || job.quotedAmount || ""),
      invoiceNumber: job.invoiceNumber || "",
      invoiceAmount: String(job.invoiceAmount || ""),
      eta: estimatedDispatchTime,
      arrivalTime: estimatedDispatchTime,
      notes: extraReplacements.notes || "",
      comment: extraReplacements.comment || extraReplacements.notes || "",
      ...extraReplacements,
    };

    const normalizedReplacements = Object.fromEntries(
      Object.entries(replacements).map(([key, replacement]) => [
        key.replace(/[^a-z0-9]/gi, "").toLowerCase(),
        replacement,
      ])
    );
    return String(value || "").replace(
      /\{\{?\s*([a-z0-9_]+)\s*\}\}?/gi,
      (match, key) => normalizedReplacements[
        String(key).replace(/[^a-z0-9]/gi, "").toLowerCase()
      ] ?? match
    );
  }

  function renderCommunicationBody(value: string) {
    let resolvedValue = applyMessageTags(value);
    const currentGoogleMapsLink = job.locationDetails?.googleMapsLink
      || job.locationDetails?.googleMaps
      || job.googleMapsLink
      || "";

    if (
      currentGoogleMapsLink
      && !resolvedValue.includes(currentGoogleMapsLink)
      && resolvedValue.includes("📌")
    ) {
      resolvedValue = resolvedValue.replace("📌", `📌 ${currentGoogleMapsLink}`);
    }

    const plainText = resolvedValue.replace(/<[^>]*>/g, " ");
    return plainText.split(/(https?:\/\/[^\s]+)/g).map((part, index) =>
      /^https?:\/\//.test(part) ? (
        <a
          key={`${part}-${index}`}
          href={part}
          target="_blank"
          rel="noreferrer"
          className="font-bold text-blue-600 underline hover:text-blue-800"
        >
          {/google\.(?:com|co\.[a-z]{2})\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(part)
            ? "Open Google Maps"
            : "View Job Card"}
        </a>
      ) : part
    );
  }

  function createStatusHistoryEntry(statusConfig: any) {
    const changedAt = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      statusId: statusConfig.id || "",
      statusName: statusConfig.name || "Unknown status",
      enteredAt: changedAt,
      createdAt: changedAt,
      updatedAt: changedAt,
      updatedById: currentUser?.uid || "",
      updatedByName:
        currentUser?.displayName || currentUser?.email || "Unknown User",
    };
  }

  async function sendJobCommunication() {
    const template = messageTemplates.find(
      (item: any) => item.id === selectedMessageTemplate
    );
    const trimmedQuickMessage = quickMessage.trim();
    if (!template && !trimmedQuickMessage) {
      alert("Select an admin message template or enter a quick message.");
      return;
    }

    const recipientUser = communicationRecipient.startsWith("user:")
      ? technicians.find((item: any) => item.id === communicationRecipient.slice(5))
      : null;
    const recipientName = communicationRecipient === "customer"
      ? customer?.companyName || customer?.name || job.customerName || "Customer"
      : recipientUser?.name || recipientUser?.displayName || recipientUser?.email || "User";
    const recipientEmail = communicationRecipient === "customer"
      ? customer?.email1 || customer?.email || ""
      : recipientUser?.email || "";
    const recipientPhone = communicationRecipient === "customer"
      ? customer?.phone1 || customer?.phone || customer?.mobile || ""
      : recipientUser?.phone || recipientUser?.mobile || "";
    const body = template
      ? applyMessageTags(template.htmlBody || "")
      : trimmedQuickMessage;
    const subject = template
      ? applyMessageTags(template.subject || template.name || "Job communication")
      : `Job ${job.jobNumber || job.id} update`;

    try {
      setSendingCommunication(true);
      const historyRef = await addDoc(
        collection(clientDb, "companies", COMPANY_ID, "jobs", job.id, "communications"),
        {
          source: template ? "template" : "quick-message",
          templateId: template?.id || "",
          templateName: template?.name || "Quick message",
          recipientType: communicationRecipient === "customer" ? "Customer" : "User",
          recipientId: recipientUser?.id || job.customerId || "",
          recipientName,
          recipientEmail,
          recipientPhone,
          subject,
          body,
          state: "queued",
          createdById: currentUser?.uid || "",
          createdByName: currentUser?.displayName || currentUser?.email || "Unknown User",
          createdAt: serverTimestamp(),
        }
      );

      await addDoc(
        collection(clientDb, "companies", COMPANY_ID, "communicationQueue"),
        {
          jobId: job.id,
          jobNumber: job.jobNumber || "",
          historyId: historyRef.id,
          templateId: template?.id || "",
          communicationName: template?.name || "Quick message",
          notificationType: communicationRecipient === "customer" ? "Customer" : "Assigned Employees",
          recipientId: recipientUser?.id || job.customerId || "",
          recipientName,
          recipientEmail,
          recipientPhone,
          subject,
          body,
          sendEmail: Boolean(recipientEmail),
          sendSms: false,
          state: "pending",
          createdAt: serverTimestamp(),
        }
      );

      setSelectedMessageTemplate("");
      setQuickMessage("");
    } catch (error) {
      console.error(error);
      alert("Unable to queue this communication. Please try again.");
    } finally {
      setSendingCommunication(false);
    }
  }

  async function convertToExternalServiceProvider(supplier: any) {
    if (!supplier?.email || !supplier?.externalJobStatusId || !supplier?.externalJobMessageTemplateId) {
      alert("This supplier requires an email address, linked external job status, and linked booking message template.");
      return;
    }
    if (!confirm(`Convert job ${job.jobNumber || job.id} to external service provider ${supplier.supplierName}?`)) return;

    try {
      setConvertingExternal(true);
      const [statusSnapshot, templateSnapshot] = await Promise.all([
        getDoc(doc(clientDb, "companies", COMPANY_ID, "statuses", supplier.externalJobStatusId)),
        getDoc(doc(clientDb, "companies", COMPANY_ID, "messageTemplates", supplier.externalJobMessageTemplateId)),
      ]);
      if (!statusSnapshot.exists() || !templateSnapshot.exists()) throw new Error("The linked status or message template no longer exists.");
      const status = { id: statusSnapshot.id, ...statusSnapshot.data() } as any;
      const template = { id: templateSnapshot.id, ...templateSnapshot.data() } as any;
      const supplierInformation = `${supplier.supplierName || ""}${supplier.supplierCode ? ` (${supplier.supplierCode})` : ""}`;

      await updateDoc(doc(clientDb, "companies", COMPANY_ID, "jobs", job.id), {
        externalServiceProvider: true,
        supplierId: supplier.id,
        supplierName: supplier.supplierName || "",
        supplierEmail: supplier.email,
        supplierInformation,
        status: status.name,
        statusId: status.id,
        statusHistory: arrayUnion(createStatusHistoryEntry(status)),
        estimatedRepairMinutes: 0,
        travelTimeMinutes: 0,
        travelDistanceKm: 0,
        travelBranchName: "",
        estimatedDispatchAt: null,
        edtPaused: true,
        edtMethod: "external-service-provider",
        updatedById: currentUser?.uid || "",
        updatedByName: currentUser?.displayName || currentUser?.email || "Unknown User",
        updatedAt: serverTimestamp(),
      });

      const jobLink = `${window.location.origin}/jobs/${job.id}`;
      const jobCardLink = `${window.location.origin}/jobs/${job.id}/jobcard?type=customer`;
      const replacements = {
        supplierName: supplier.supplierName || "",
        supplierCode: supplier.supplierCode || "",
        jobStatus: status.name || "",
        status: status.name || "",
        jobLink,
        jobCardLink,
        link: jobLink,
      };
      const subject = applyMessageTags(template.subject || template.name || "External job booking", replacements);
      const body = applyMessageTags(template.htmlBody || "", replacements);
      const historyRef = await addDoc(collection(clientDb, "companies", COMPANY_ID, "jobs", job.id, "communications"), {
        source: "external-service-provider",
        templateId: template.id,
        templateName: template.name || "External service provider booking",
        recipientType: "Supplier",
        recipientId: supplier.id,
        recipientName: supplier.supplierName || "Supplier",
        recipientEmail: supplier.email,
        subject,
        body,
        state: "queued",
        createdById: currentUser?.uid || "",
        createdByName: currentUser?.displayName || currentUser?.email || "Unknown User",
        createdAt: serverTimestamp(),
      });
      await addDoc(collection(clientDb, "companies", COMPANY_ID, "communicationQueue"), {
        jobId: job.id,
        jobNumber: job.jobNumber || "",
        historyId: historyRef.id,
        supplierId: supplier.id,
        recipientId: supplier.id,
        recipientName: supplier.supplierName || "Supplier",
        recipientEmail: supplier.email,
        notificationType: "Supplier",
        templateId: template.id,
        templateName: template.name || "External service provider booking",
        communicationName: template.name || "External service provider booking",
        subject,
        body,
        sendEmail: true,
        sendSms: false,
        attachJobCard: template.attachJobCard === true,
        attachCustomerJobCard: template.attachCustomerJobCard === true,
        state: "pending",
        createdAt: serverTimestamp(),
      });

      setJob((current: any) => ({ ...current, externalServiceProvider: true, supplierId: supplier.id, supplierName: supplier.supplierName || "", supplierEmail: supplier.email, supplierInformation, status: status.name, statusId: status.id, estimatedRepairMinutes: 0, travelTimeMinutes: 0, travelDistanceKm: 0, estimatedDispatchAt: null, edtPaused: true }));
      setShowExternalSupplierModal(false);
      alert("Job converted and supplier email queued successfully.");
    } catch (error: any) {
      console.error(error);
      alert(error?.message || "Unable to convert this job.");
    } finally {
      setConvertingExternal(false);
    }
  }

  async function allocateStockFormNumber(type: "requisition" | "derequisition" | "replenishment") {
    const settingsRef = doc(clientDb, "companies", COMPANY_ID, "inventory_settings", "setup");
    return runTransaction(clientDb, async (transaction) => {
      const snapshot = await transaction.get(settingsRef);
      const settings = snapshot.exists() ? snapshot.data() : {};
      const prefixKey = type === "requisition" ? "requisitionPrefix" : type === "derequisition" ? "derequisitionPrefix" : "replenishmentPrefix";
      const counterKey = type === "requisition" ? "requisitionCurrentNumber" : type === "derequisition" ? "derequisitionCurrentNumber" : "replenishmentCurrentNumber";
      const prefix = String(settings[prefixKey] || (type === "requisition" ? "REQ-" : type === "derequisition" ? "DREQ-" : "RPL-"));
      const next = Number(settings[counterKey] || 0) + 1;
      transaction.set(settingsRef, { [prefixKey]: prefix, [counterKey]: next, updatedAt: serverTimestamp() }, { merge: true });
      return `${prefix}${String(next).padStart(4, "0")}`;
    });
  }

  async function sendPartsRequest() {
    if (!pendingPartsRequestStatus) return;

    try {
      setSendingPartsRequest(true);
      const previousRequestsSnapshot = await getDocs(query(collection(clientDb, "companies", COMPANY_ID, "partsRequests"), where("jobId", "==", job.id)));
      const previouslyRequestedMaterialIds = new Set<string>();
      previousRequestsSnapshot.docs.forEach((requestDocument) => {
        const requestData = requestDocument.data();
        (Array.isArray(requestData.items) ? requestData.items : []).forEach((item: any) => {
          if (item.materialId) previouslyRequestedMaterialIds.add(String(item.materialId));
        });
      });
      const newMaterials = materials.filter((item: any) => !item.partsRequestId && item.stockIssued !== true && !previouslyRequestedMaterialIds.has(String(item.id)));
      if (newMaterials.length === 0) {
        alert("There are no newly added inventory items to requisition. Previously requested items will not be included again.");
        return;
      }
      if (newMaterials.some((item: any) => !item.sourceId)) {
        alert("Select the Used From location for every new requisition line before sending.");
        document.getElementById("job-parts-services")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if (!window.confirm(`Send a new parts requisition for ${newMaterials.length} newly added line${newMaterials.length === 1 ? "" : "s"}? Previously requested items will be excluded.`)) return;

      const requestedItems = newMaterials.map((item: any) => ({
        materialId: item.id,
        inventoryId: item.inventoryId || "",
        partNumber: item.partNumber || "",
        description: item.description || "",
        serialNumber: item.serialNumber || "",
        sellPrice: Number(item.sellPrice || 0),
        requestedQty: Math.max(1, Number(item.qty || 1)),
        sourceId: item.sourceId || "",
        sourceName: item.sourceName || "",
        sourceType: item.sourceType || "",
        pickedQty: 0,
        issuedQty: 0,
      }));
      const requisitionNumber = await allocateStockFormNumber("requisition");
      const requestRef = doc(collection(clientDb, "companies", COMPANY_ID, "partsRequests"));
      const batch = writeBatch(clientDb);
      batch.set(requestRef, {
        requisitionNumber,
        jobId: job.id,
        jobNumber: job.jobNumber || job.id,
        customerName: job.customerName || "",
        status: "requested",
        statusId: pendingPartsRequestStatus.id || "",
        statusName: pendingPartsRequestStatus.name || "Parts Requisition",
        items: requestedItems,
        requestedById: currentUser?.uid || "",
        requestedByName: currentUser?.displayName || currentUser?.email || "Unknown User",
        requestedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      newMaterials.forEach((item: any) => batch.update(doc(clientDb, "companies", COMPANY_ID, "jobs", job.id, "materials", item.id), {
        partsRequestId: requestRef.id,
        partsRequestStatus: "requested",
        requisitionNumber,
        requestedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }));
      batch.update(doc(clientDb, "companies", COMPANY_ID, "jobs", job.id), {
        activePartsRequestId: requestRef.id,
        partsRequestStatus: "requested",
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      setLinkedItems((current: any[]) => [...current, { id: requestRef.id, documentType: "parts_requisition", requisitionNumber, jobId: job.id, status: "requested" }]);
      const stockPickers = technicians.filter((user: any) => {
        const permissions = user.permissions || {};
        return user.active !== false && (permissions["Pick and issue requested stock"] === true || hasPrivilegedRole(user.primaryRole || user.role));
      });
      await Promise.all(stockPickers.map((user: any) => addDoc(collection(clientDb, "companies", COMPANY_ID, "notifications"), {
        type: "parts-request",
        title: `Parts requisition ${requisitionNumber} for job ${job.jobNumber || job.id}`,
        message: `${requestedItems.length} parts/service line${requestedItems.length === 1 ? "" : "s"} require picking and issue sign-off.`,
        recipientId: user.id,
        recipientName: user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "FleetFix User",
        createdById: currentUser?.uid || "",
        createdByName: currentUser?.displayName || currentUser?.email || "System",
        sourcePath: `/stock-picking/${requestRef.id}`,
        jobId: job.id,
        jobNumber: job.jobNumber || "",
        partsRequestId: requestRef.id,
        status: "active",
        finalized: false,
        createdAt: serverTimestamp(),
      })));
      const nextStatus = pendingPartsRequestStatus;
      setPendingPartsRequestStatus(null);
      alert(`Parts requisition sent to ${stockPickers.length} authorized stock-picking user${stockPickers.length === 1 ? "" : "s"}.`);
      if (nextStatus.id) await requestStatusChange(nextStatus.id, true);
    } catch (error) {
      console.error("Unable to send parts requisition", error);
      alert("Unable to send the parts requisition. Please try again.");
    } finally {
      setSendingPartsRequest(false);
    }
  }

  async function createDerequisitionSlip() {
    const returnedMaterials = materials.filter((item: any) => returnMaterialIds.includes(item.id) && item.stockIssued === true);
    if (returnedMaterials.length === 0) return alert("Select at least one issued but unused material to return.");
    if (!window.confirm(`Create a derequisition slip for ${returnedMaterials.length} returned material line${returnedMaterials.length === 1 ? "" : "s"}?`)) return;
    try {
      setCreatingDerequisition(true);
      const derequisitionNumber = await allocateStockFormNumber("derequisition");
      const returnRef = await addDoc(collection(clientDb, "companies", COMPANY_ID, "partsReturns"), {
        derequisitionNumber,
        jobId: job.id, jobNumber: job.jobNumber || job.id, customerName: job.customerName || "", status: "awaiting_return",
        items: returnedMaterials.map((item: any) => ({ materialId: item.id, inventoryId: item.inventoryId || "", partNumber: item.partNumber || "", description: item.description || "", serialId: item.serialId || "", serialNumber: item.serialNumber || "", returnQty: Math.max(1, Number(item.issuedQty || item.qty || 1)), sourceId: item.sourceId || "MAIN", sourceName: item.sourceName || "", sourceType: item.sourceType || "" })),
        requestedById: currentUser?.uid || "", requestedByName: currentUser?.displayName || currentUser?.email || "Unknown User", requestedAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      setLinkedItems((current: any[]) => [...current, { id: returnRef.id, documentType: "parts_derequisition", derequisitionNumber, jobId: job.id, status: "awaiting_return" }]);
      const stockPickers = technicians.filter((user: any) => user.active !== false && (user.permissions?.["Pick and issue requested stock"] === true || hasPrivilegedRole(user.primaryRole || user.role)));
      await Promise.all(stockPickers.map((user: any) => addDoc(collection(clientDb, "companies", COMPANY_ID, "notifications"), { type: "parts-derequisition", title: `Parts derequisition ${derequisitionNumber} for job ${job.jobNumber || job.id}`, message: `${returnedMaterials.length} unused material line${returnedMaterials.length === 1 ? " is" : "s are"} awaiting return completion.`, recipientId: user.id, recipientName: user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "FleetFix User", createdById: currentUser?.uid || "", createdByName: currentUser?.displayName || currentUser?.email || "System", sourcePath: `/stock-returns/${returnRef.id}`, jobId: job.id, jobNumber: job.jobNumber || "", partsReturnId: returnRef.id, status: "active", finalized: false, createdAt: serverTimestamp() })));
      await updateDoc(doc(clientDb, "companies", COMPANY_ID, "jobs", job.id), { activePartsReturnId: returnRef.id, partsReturnStatus: "awaiting_return", unusedPartsDeclaration: "derequisition", unusedPartsConfirmedAt: serverTimestamp(), unusedPartsConfirmedById: currentUser?.uid || "", unusedPartsConfirmedByName: currentUser?.displayName || currentUser?.email || "Unknown User", updatedAt: serverTimestamp() });
      setReturnMaterialIds([]);
      setShowDerequisitionAction(false);
      alert(`Derequisition slip created and sent to ${stockPickers.length} authorized stock-picking user${stockPickers.length === 1 ? "" : "s"}.`);
      const nextStatus = pendingUnusedPartsStatus;
      setPendingUnusedPartsStatus(null);
      if (nextStatus?.id) await requestStatusChange(nextStatus.id, true, true);
    } catch (error) { console.error("Unable to create derequisition slip", error); alert("Unable to create the derequisition slip."); }
    finally { setCreatingDerequisition(false); }
  }

  function beginUnusedPartsDerequisition() {
    setPendingUnusedPartsStatus(unusedPartsDecisionStatus);
    setUnusedPartsDecisionStatus(null);
    setShowDerequisitionAction(true);
    setReturnMaterialIds([]);
    setTimeout(() => document.getElementById("job-parts-services")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function confirmNoUnusedParts() {
    const nextStatus = unusedPartsDecisionStatus;
    if (!nextStatus) return;
    await updateDoc(doc(clientDb, "companies", COMPANY_ID, "jobs", job.id), {
      unusedPartsDeclaration: "none",
      unusedPartsConfirmedAt: serverTimestamp(),
      unusedPartsConfirmedById: currentUser?.uid || "",
      unusedPartsConfirmedByName: currentUser?.displayName || currentUser?.email || "Unknown User",
      updatedAt: serverTimestamp(),
    });
    setUnusedPartsDecisionStatus(null);
    await requestStatusChange(nextStatus.id, true, true);
  }

  async function currentStatusIsComplete(statusConfig: any) {
    const latestJobSnapshot = await getDoc(doc(clientDb, "companies", COMPANY_ID, "jobs", job.id));
    const latestJob: any = latestJobSnapshot.exists() ? latestJobSnapshot.data() : job;
    const completionFields = Array.isArray(statusConfig.fields)
      ? statusConfig.fields.filter((field: any) =>
          field.required === true &&
          (!field.linkedJobType || field.linkedJobType === latestJob.jobType || field.linkedJobType === latestJob.jobTypeName)
        )
      : [];
    const fieldsComplete = completionFields.every((field: any) => {
      const reading = (latestJob.statusFieldReadings || []).find((entry: any) =>
        entry.fieldId === field.id && entry.statusId === statusConfig.id && String(entry.value ?? "").trim() !== ""
      );
      return Boolean(reading) || String(latestJob.statusFieldValues?.[field.id] ?? latestJob.dynamicFields?.[field.id] ?? "").trim() !== "";
    });
    if (!fieldsComplete) return false;

    if (statusConfig.requireFormsComplete === true) {
      const forms = Array.isArray(latestJob.jobForms) && latestJob.jobForms.length
        ? latestJob.jobForms
        : latestJob.jobFormTemplateId ? [{ id: latestJob.jobFormTemplateId }] : [];
      if (forms.some((form: any) => latestJob.jobFormCompletion?.[form.id || form.templateId]?.completed !== true)) return false;
    }
    if (statusConfig.requireTasksComplete === true) {
      const tasks = await getDocs(collection(clientDb, "companies", COMPANY_ID, "jobs", job.id, "tasks"));
      if (tasks.docs.some((entry) => entry.data().completed !== true)) return false;
    }
    if (statusConfig.requirePartsServicesBooked === true) {
      const bookedParts = await getDocs(collection(clientDb, "companies", COMPANY_ID, "jobs", job.id, "materials"));
      if (bookedParts.empty && latestJob.noPartsUsed !== true) return false;
    }
    if (statusConfig.requirePhotoAlbumComplete === true) {
      const [albumSnapshot, photoSnapshot] = await Promise.all([
        getDocs(collection(clientDb, "companies", COMPANY_ID, "photoAlbumTemplates")),
        getDocs(collection(clientDb, "companies", COMPANY_ID, "jobs", job.id, "photoAlbumPhotos")),
      ]);
      const configuredAlbumId = String(statusConfig.requiredPhotoAlbumId || "");
      const categoryIds = Array.isArray(statusConfig.requiredPhotoCategoryIds) ? statusConfig.requiredPhotoCategoryIds.map(String) : [];
      const allAlbums = configuredAlbumId === "__all_photo_albums__";
      const allCategories = categoryIds.includes("__all_photo_categories__");
      const albums = albumSnapshot.docs.map((entry) => ({ id: entry.id, ...(entry.data() as any) })).filter((album: any) =>
        album.active !== false && (allAlbums || !configuredAlbumId || album.id === configuredAlbumId)
      );
      if (!albums.length) return false;
      const photos = photoSnapshot.docs.map((entry) => entry.data() as any);
      const incomplete = albums.some((album: any) => (album.categories || [])
        .filter((category: any) => allCategories || categoryIds.length === 0 || categoryIds.includes(String(category.id)))
        .some((category: any) => (category.photoItems || []).some((photoItem: any) =>
          photoItem.required === true && photos.filter((photo: any) => photo.templateId === album.id && photo.categoryId === category.id && photo.photoItemId === photoItem.id).length < Math.max(1, Number(photoItem.minimumPhotos) || 1)
        ))
      );
      if (incomplete) return false;
    }
    return true;
  }

  async function attemptAutomaticStatusAdvance() {
    if (!job || autoAdvanceRunningRef.current) return;
    const orderedStatuses = statuses.filter((item: any) => item.active !== false).sort((left: any, right: any) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0));
    const currentIndex = orderedStatuses.findIndex((item: any) => item.id === job.statusId || item.name === job.status);
    const currentStatus = orderedStatuses[currentIndex];
    const nextStatus = currentStatus?.nextStatusId
      ? orderedStatuses.find((item: any) => item.id === currentStatus.nextStatusId)
      : orderedStatuses[currentIndex + 1];
    if (!currentStatus?.autoAdvance || !nextStatus || currentStatus.closeJob === true) return;
    autoAdvanceRunningRef.current = true;
    try {
      if (await currentStatusIsComplete(currentStatus)) await requestStatusChange(nextStatus.id);
    } catch (error) {
      console.error("Unable to automatically advance the job status", error);
    } finally {
      autoAdvanceRunningRef.current = false;
    }
  }

  async function requestStatusChange(
    newStatusId: string,
    skipPartsRequestPrompt = false,
    skipUnusedPartsPrompt = false,
  ) {

    const statusConfig = statuses.find(
      (status: any) =>
        status.id === newStatusId
    );

    if (!statusConfig) {
      alert("The selected job status no longer exists.");
      return;
    }

    const requiredCustomerFields = customerJobFields.filter(
      (field) =>
        field.required ||
        field.requiredStatusIds.includes(statusConfig.id) ||
        field.requiredStatusIds.includes(statusConfig.name)
    );
    const missingCustomerFields = requiredCustomerFields.filter(
      (field) => !String(customerJobFieldValues[field.id] ?? "").trim()
    );
    if (missingCustomerFields.length > 0) {
      alert(
        `Status cannot be changed to ${statusConfig.name}. Complete these Customer Information fields first:\n\n${missingCustomerFields
          .map((field) => `• ${field.label}`)
          .join("\n")}`
      );
      document.getElementById("job-customer-information")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      return;
    }

    if (statusConfig.partsRequestWorkflow === true && !skipPartsRequestPrompt) {
      const partsRequired = window.confirm(
        "Are parts required for this job?\n\nSelect OK for Yes, or Cancel for No."
      );
      if (partsRequired) {
        setPendingPartsRequestStatus(statusConfig);
        setTimeout(() => document.getElementById("job-parts-services")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
        return;
      }
    }

    if (statusConfig.requireUnusedPartsConfirmation === true && !skipUnusedPartsPrompt) {
      setUnusedPartsDecisionStatus(statusConfig);
      return;
    }

    // Requirements belong to the destination status. The job may only enter
    // the selected status after all requirements configured on it are met.

    const outstandingRequirements: string[] = [];

    if (statusConfig.requirePhotoAlbumComplete === true) {
      const [albumSnapshot, photoSnapshot] = await Promise.all([
      getDocs(collection(clientDb, "companies", COMPANY_ID, "photoAlbumTemplates")),
      getDocs(collection(clientDb, "companies", COMPANY_ID, "jobs", job.id, "photoAlbumPhotos")),
      ]);
      const configuredAlbumId = String(statusConfig.requiredPhotoAlbumId || "");
      const configuredCategoryIds = Array.isArray(statusConfig.requiredPhotoCategoryIds)
        ? statusConfig.requiredPhotoCategoryIds.map(String)
        : statusConfig.requiredPhotoCategoryId
          ? [String(statusConfig.requiredPhotoCategoryId)]
          : [];
      const allPhotoAlbumsSelected = configuredAlbumId === "__all_photo_albums__";
      const allPhotoCategoriesSelected = configuredCategoryIds.includes("__all_photo_categories__");
      const activeAlbums = albumSnapshot.docs
        .map((albumDocument) => ({ id: albumDocument.id, ...(albumDocument.data() as any) }))
        .filter((album: any) => album.active !== false);
      const albumMatchesJobType = (album: any) => {
        const jobTypeIds = Array.isArray(album.jobTypeIds) && album.jobTypeIds.length
          ? album.jobTypeIds
          : album.jobTypeId ? [album.jobTypeId] : [];
        const jobTypeNames = Array.isArray(album.jobTypeNames) && album.jobTypeNames.length
          ? album.jobTypeNames
          : album.jobTypeName ? [album.jobTypeName] : [];
        return (
          jobTypeIds.includes(job.jobTypeId || "") ||
          jobTypeNames.includes(job.jobType || "") ||
          jobTypeNames.includes(job.jobTypeName || "")
        );
      };
      const linkedAlbums = allPhotoAlbumsSelected
        ? activeAlbums.filter(albumMatchesJobType)
        : configuredAlbumId
          ? activeAlbums.filter((album: any) => album.id === configuredAlbumId)
          : activeAlbums.filter(albumMatchesJobType).slice(0, 1);

      if (linkedAlbums.length > 0) {
        const photos = photoSnapshot.docs.map((photoDocument) => photoDocument.data() as any);
        const incompletePhotoItems = linkedAlbums.flatMap((linkedAlbum: any) => {
          const categoriesToCheck = allPhotoCategoriesSelected || configuredCategoryIds.length === 0
            ? linkedAlbum.categories || []
            : (linkedAlbum.categories || []).filter(
                (category: any) => configuredCategoryIds.includes(String(category.id))
              );

          if (!allPhotoCategoriesSelected) {
            const missingCategoryIds = configuredCategoryIds.filter(
              (categoryId: string) => !categoriesToCheck.some(
                (category: any) => String(category.id) === categoryId
              )
            );
            if (missingCategoryIds.length > 0) {
              outstandingRequirements.push(
                `Photo categories are no longer available in ${linkedAlbum.name}: ${missingCategoryIds.join(", ")}`
              );
            }
          }

          return categoriesToCheck.flatMap((category: any) =>
            (category.photoItems || []).map((photoItem: any) => ({ linkedAlbum, category, photoItem }))
          ).filter(({ linkedAlbum, category, photoItem }: any) => {
            if (photoItem.required !== true) return false;
            const uploadedCount = photos.filter((photo: any) =>
              photo.templateId === linkedAlbum.id &&
              photo.categoryId === category.id &&
              photo.photoItemId === photoItem.id
            ).length;
            return uploadedCount < Math.max(1, Number(photoItem.minimumPhotos) || 1);
          });
        });

        if (incompletePhotoItems.length > 0) {
          outstandingRequirements.push(
            `Required photos: ${incompletePhotoItems
              .map(({ linkedAlbum, category, photoItem }: any) => `${linkedAlbum.name} / ${category.name} - ${photoItem.name}`)
              .join(", ")}`
          );
        }
      } else {
        outstandingRequirements.push(
          configuredAlbumId && !allPhotoAlbumsSelected
            ? `Photo Album "${statusConfig.requiredPhotoAlbumName || configuredAlbumId}" is not available for this requirement`
            : "No active Photo Album is linked to this job type"
        );
      }
    }

    if (statusConfig.requireFormsComplete === true) {
      const latestJobSnapshot = await getDoc(
        doc(clientDb, "companies", COMPANY_ID, "jobs", job.id)
      );
      const latestJob = latestJobSnapshot.exists() ? latestJobSnapshot.data() : job;
      const allocatedForms = Array.isArray(latestJob.jobForms) && latestJob.jobForms.length > 0
        ? latestJob.jobForms
        : latestJob.jobFormTemplateId
          ? [{
              id: latestJob.jobFormTemplateId,
              templateId: latestJob.jobFormTemplateId,
              name: latestJob.jobFormTemplateName,
            }]
          : [];
      const incompleteForms = allocatedForms.filter((form: any) => {
        const allocatedFormId = form.id || form.templateId;
        return latestJob.jobFormCompletion?.[allocatedFormId]?.completed !== true;
      });

      if (incompleteForms.length > 0) {
        outstandingRequirements.push(
          `Job Forms: ${incompleteForms
            .map((form: any) => form.templateName || form.name || "Unnamed Job Form")
            .join(", ")}`
        );
      }
    }

    if (statusConfig.requireTasksComplete === true) {
      const taskSnapshot = await getDocs(
        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "jobs",
          job.id,
          "tasks"
        )
      );
      const incompleteTasks = taskSnapshot.docs.filter(
        (taskDocument) => taskDocument.data().completed !== true
      );
      if (incompleteTasks.length > 0) {
        outstandingRequirements.push(
          `Job Tasks: ${incompleteTasks
            .map((taskDocument) => taskDocument.data().name || taskDocument.data().title || "Unnamed task")
            .join(", ")}`
        );
      }
    }

    if (statusConfig.requirePartsServicesBooked === true) {
      const materialSnapshot = await getDocs(
        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "jobs",
          job.id,
          "materials"
        )
      );

      if (materialSnapshot.empty && job.noPartsUsed !== true) {
        outstandingRequirements.push("Book at least one Part / Service");
      }
    }

    if (outstandingRequirements.length > 0) {
      alert(
        `Status cannot be changed. Complete these requirements before entering ${statusConfig.name}:\n\n${outstandingRequirements
          .map((requirement) => `• ${requirement}`)
          .join("\n")}`
      );
      return;
    }

    const applicableStatusFields = (statusConfig.fields || []).filter(
      (field: any, index: number, fields: any[]) =>
        (field.required === true || activatedStatusFieldIds.includes(field.id)) &&
        (!field.linkedJobType || field.linkedJobType === job.jobType || field.linkedJobType === job.jobTypeName) &&
        index === fields.findIndex((candidate: any) => candidate.id === field.id)
    );

    if (applicableStatusFields.length > 0) {

      setPendingStatus({ ...statusConfig, fields: applicableStatusFields });

      setStatusFormValues({});

      setShowStatusModal(true);

      return;
    }


    try {
      await markJobMaterialsUsed(statusConfig);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "The job materials could not be marked as used. Please check the available stock and try again.";
      if (message.startsWith("Insufficient stock for ")) {
        console.warn(message);
      } else {
        console.error("Unable to mark job materials as used:", error);
      }
      alert(
        message
      );
      return;
    }

    const formAllocationUpdates = await allocateStatusForm(statusConfig);
    const formsForStatus = Array.isArray(formAllocationUpdates.jobForms)
      ? formAllocationUpdates.jobForms
      : Array.isArray(job.jobForms)
        ? job.jobForms
        : null;
    const syncedFormUpdates = formsForStatus
      ? {
          ...formAllocationUpdates,
          jobForms: formsForStatus.map((form: any) => ({
            ...form,
            status: statusConfig.name,
            statusId: statusConfig.id,
          })),
        }
      : formAllocationUpdates;

    await handleStatusTimer(
      statusConfig
    );

    const statusHistoryEntry = createStatusHistoryEntry(statusConfig);


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

        statusHistory:
          arrayUnion(statusHistoryEntry),

        customerJobFieldValues,

        isClosed:
          statusConfig.closeJob === true,

        closedAt:
          statusConfig.closeJob === true ? serverTimestamp() : null,

        ...(statusConfig.jobCompleted === true ? {
          isCompleted: true,
          completedAt: serverTimestamp(),
          workStartedAt: null,
          estimatedArrivalAt: null,
          estimatedDispatchAt: null,
        } : {}),

        ...(statusIsOnSite(statusConfig.name) ? {
          workStartedAt: serverTimestamp(),
          estimatedArrivalAt: null,
          estimatedDispatchAt: null,
        } : statusIsOnRoute(statusConfig.name) ? { workStartedAt: null } : {}),

        archived: false,
        archivedAt: null,

        ...(statusConfig.clearNoPartsUsed === true ? {
          noPartsUsed: false,
          noPartsUsedUpdatedAt: serverTimestamp(),
          noPartsUsedUpdatedById: currentUser?.uid || "",
          noPartsUsedUpdatedByName: currentUser?.displayName || currentUser?.email || "Unknown User",
        } : {}),

        updatedById: currentUser?.uid || "",
        updatedByName: currentUser?.displayName || currentUser?.email || "Unknown User",

        ...syncedFormUpdates,

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

      statusHistory: [
        ...(job.statusHistory || []),
        statusHistoryEntry,
      ],

      customerJobFieldValues,

      isClosed: statusConfig.closeJob === true,
      closedAt: statusConfig.closeJob === true ? new Date() : null,
      isCompleted: statusConfig.jobCompleted === true ? true : job.isCompleted === true,
      completedAt: statusConfig.jobCompleted === true ? new Date() : job.completedAt || null,
      workStartedAt: statusConfig.jobCompleted === true ? null : statusIsOnSite(statusConfig.name) ? new Date() : statusIsOnRoute(statusConfig.name) ? null : job.workStartedAt || null,
      estimatedArrivalAt: statusConfig.jobCompleted === true || statusIsOnSite(statusConfig.name) ? null : job.estimatedArrivalAt,
      estimatedDispatchAt: statusConfig.jobCompleted === true || statusIsOnSite(statusConfig.name) ? null : job.estimatedDispatchAt,
      archived: false,
      noPartsUsed: statusConfig.clearNoPartsUsed === true ? false : job.noPartsUsed === true,

      ...syncedFormUpdates,

    });

    await recalculateActiveJobQueue();
    await triggerStatusCommunications(statusConfig);


  }

  useEffect(() => {
    if (loading || !job || statuses.length === 0 || showStatusModal || pendingStatus) return;
    const timer = window.setTimeout(() => { void attemptAutomaticStatusAdvance(); }, 500);
    return () => window.clearTimeout(timer);
  }, [loading, job?.statusId, job?.status, job?.statusFieldReadings, job?.jobFormCompletion, statuses, showStatusModal, pendingStatus]);

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
        jobTypeSnap,
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
            "users"
          )
        ),

        getDocs(
          collection(
            clientDb,
            "companies",
            COMPANY_ID,
            "jobTypes"
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

        const [customerContactsSnapshot, customerFleetSnapshot] = await Promise.all([
          getDocs(collection(clientDb, "companies", COMPANY_ID, "customers", data.customerId, "contacts")),
          getDocs(collection(clientDb, "companies", COMPANY_ID, "customers", data.customerId, "fleet")),
        ]);
        const matchedContact = customerContactsSnapshot.docs
          .map((contactDocument) => ({ id: contactDocument.id, ...contactDocument.data() } as any))
          .find((contact: any) =>
            (data.customerContactId && contact.id === data.customerContactId) ||
            String(contact.name || "").trim().toLowerCase() === String(data.customerContact || "").trim().toLowerCase()
          );
        setSelectedCustomerContact(matchedContact || null);

        const normalizeVehicle = (vehicleId: string, vehicleData: any) => ({
          ...vehicleData,
          id: vehicleId,
          regNo: vehicleData.regNo || vehicleData.vehicleReg || vehicleData.registrationNumber || vehicleData.registration || "",
          fleetNo: vehicleData.fleetNo || vehicleData.fleetNumber || "",
          vehicleMake: vehicleData.vehicleMake || vehicleData.make || "",
          vehicleModel: vehicleData.vehicleModel || vehicleData.model || "",
          vehicleType: vehicleData.vehicleType || vehicleData.type || "",
          vinNumber: vehicleData.vinNumber || vehicleData.vin || vehicleData.chassisNumber || "",
          driverName: vehicleData.driverName || vehicleData.driver || "",
          driverContactNumber: vehicleData.driverContactNumber || vehicleData.driverContactNo || vehicleData.driverPhone || "",
        });
        const linkedCompanyVehicles = vehicleSnap.docs
          .filter((vehicleDocument) => {
            const vehicleData = vehicleDocument.data();
            return vehicleData.customerId === data.customerId || vehicleData.customer?.id === data.customerId;
          })
          .map((vehicleDocument) => normalizeVehicle(vehicleDocument.id, vehicleDocument.data()));
        const customerFleetVehicles = customerFleetSnapshot.docs.map((vehicleDocument) =>
          normalizeVehicle(vehicleDocument.id, vehicleDocument.data())
        );
        const mergedVehicles = new Map<string, any>();
        [...linkedCompanyVehicles, ...customerFleetVehicles].forEach((vehicle) => {
          const identity = String(vehicle.regNo || vehicle.vinNumber || vehicle.fleetNo || vehicle.id)
            .trim()
            .toLowerCase();
          mergedVehicles.set(identity, vehicle);
        });
        setVehicles(Array.from(mergedVehicles.values()));
      } else {
        setVehicles([]);
      }

      const linkedLocationDocument = locationSnap.docs.find((locationDocument) =>
        locationDocument.id === data.locationId
        || String(locationDocument.data().name || "").toLowerCase() === String(
          data.locationDetails?.name || data.locationName || (typeof data.location === "string" ? data.location : "")
        ).toLowerCase()
      );
      const linkedLocationData = linkedLocationDocument?.data() as any;
      const linkedGoogleMapsLink = data.locationDetails?.googleMapsLink
        || data.locationDetails?.googleMaps
        || linkedLocationData?.googleMapsLink
        || linkedLocationData?.googleMaps
        || data.googleMapsLink
        || "";

      setJob({
        id: jobSnap.id,
        ...data,
        locationDetails: {
          ...(data.locationDetails || {}),
          googleMapsLink: linkedGoogleMapsLink,
          googleMaps: linkedGoogleMapsLink,
        },
      });

      setEditableFields(
        data.dynamicFields || {}
      );
      setCustomerJobFieldValues(data.customerJobFieldValues || {});

      if (settingsSnap.exists()) {

        const settings =
          settingsSnap.data();


        setSelectedFields(
          Array.isArray(settings.screenFields) ? settings.screenFields : (settings.viewFields || settings.selectedFields || [])
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

      setJobTypes(
        jobTypeSnap.docs.map(
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

    const [linkedSnap, linkedPurchaseOrdersSnap, linkedQuotesSnap, linkedInvoicesSnap, partsRequestsSnap, partsReturnsSnap] = await Promise.all([
      getDocs(collection(clientDb, "companies", COMPANY_ID, "jobs", id, "linkedItems")),
      getDocs(collection(clientDb, "companies", COMPANY_ID, "purchase_orders")),
      getDocs(collection(clientDb, "companies", COMPANY_ID, "quotes")),
      getDocs(query(
        collection(clientDb, "companies", COMPANY_ID, "invoices"),
        where("jobId", "==", id)
      )),
      getDocs(query(collection(clientDb, "companies", COMPANY_ID, "partsRequests"), where("jobId", "==", id))),
      getDocs(query(collection(clientDb, "companies", COMPANY_ID, "partsReturns"), where("jobId", "==", id))),
    ]);


    setLinkedItems(

      [
        ...linkedSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        ...linkedPurchaseOrdersSnap.docs
          .map((d, index) => ({
            id: d.id,
            documentType: "purchase_order",
            purchaseOrderListNumber: `PO${String(index + 1).padStart(6, "0")}`,
            ...d.data(),
          }))
          .filter((purchaseOrder: any) => purchaseOrder.jobId === id),
        ...linkedQuotesSnap.docs
          .map((d, index) => ({
            id: d.id,
            documentType: "quote",
            quoteListNumber: `QT${String(index + 1).padStart(6, "0")}`,
            ...d.data(),
          }))
          .filter((quote: any) => quote.jobId === id),
        ...linkedInvoicesSnap.docs.map((d) => ({
          id: d.id,
          documentType: "invoice",
          ...d.data(),
        })),
        ...partsRequestsSnap.docs.map((d) => ({ id: d.id, documentType: "parts_requisition", ...d.data() })),
        ...partsReturnsSnap.docs.map((d) => ({ id: d.id, documentType: "parts_derequisition", ...d.data() })),
      ]

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

    const shouldEmail = emailNoteToCustomer || emailNoteToUsers;
    const noteTemplate = messageTemplates.find((template: any) => template.id === selectedNoteTemplate);
    if (shouldEmail && !noteTemplate) {
      alert("Select a message template before emailing this comment.");
      return;
    }

    const fullUserName = (user: any) =>
      `${user?.firstName || ""} ${user?.surname || user?.lastName || ""}`.trim() ||
      user?.name || user?.displayName || user?.email || "";
    const signedInTechnician = technicians.find((user: any) => user.id === currentUser?.uid);
    const assignedUserName = (job.assignedUsers || []).map(fullUserName).find(Boolean) || job.assignedTo || "";
    const noteAuthorName = currentUser?.displayName || fullUserName(signedInTechnician) || assignedUserName || currentUser?.email || "System";


    try {
      setSavingNote(true);
      const noteRef = await addDoc(
        collection(clientDb, "companies", COMPANY_ID, "jobs", job.id, "notes"),
        {
          comment: newNote.trim(),
          visibility: noteVisibility,
          public: noteVisibility === "public",
          emailedToCustomer: emailNoteToCustomer,
          emailedToUsers: emailNoteToUsers,
          templateId: noteTemplate?.id || "",
          templateName: noteTemplate?.name || "",
          createdById: currentUser?.uid || "",
          createdByName: noteAuthorName,
          createdAt: serverTimestamp(),
        }

      );

      await addDoc(collection(clientDb, "companies", COMPANY_ID, "notifications"), {
        type: noteVisibility === "public" ? "customer_job_comment" : "user_job_comment",
        title: noteVisibility === "public" ? "Customer note / comment on job" : "User note / comment on job",
        message: newNote.trim(), jobId: job.id, jobNumber: job.jobNumber || "", noteId: noteRef.id,
        sourcePath: `/jobs/${job.id}`, createdById: currentUser?.uid || "", createdByName: noteAuthorName,
        status: "active", finalized: false, createdAt: serverTimestamp(),
      });

      if (shouldEmail) {
        const composeUrl = new URLSearchParams({
          module: "JobCard",
          documentId: job.id,
          jobId: job.id,
          templateId: noteTemplate?.id || "",
          notes: newNote.trim(),
          comment: newNote.trim(),
          subject: noteTemplate ? "" : `Job ${job.jobNumber || job.id} comment`,
          body: newNote.trim(),
        });
        setNewNote("");
        setEmailNoteToCustomer(false);
        setEmailNoteToUsers(false);
        setSelectedNoteTemplate("");
        router.push(`/messages/compose?${composeUrl.toString()}`);
        return;
      }

      const recipients: Array<{ id: string; name: string; email: string; type: "Customer" | "User" }> = [];
      if (emailNoteToCustomer) {
        const email = job.customerContactEmail || customer?.email1 || customer?.email || customer?.primaryContactEmail || "";
        if (email) recipients.push({ id: job.customerId || "", name: job.customerContact || customer?.companyName || job.customerName || "Customer", email, type: "Customer" });
      }
      if (emailNoteToUsers) {
        const assignedIds = new Set([...(job.assignedUserIds || []), ...(job.assignedUsers || []).map((user: any) => user.id).filter(Boolean)]);
        technicians.forEach((user: any) => {
          if (!assignedIds.has(user.id) || !user.email) return;
          recipients.push({ id: user.id, name: fullUserName(user), email: user.email, type: "User" });
        });
        (job.assignedUsers || []).forEach((user: any) => {
          if (!user.email || recipients.some((recipient) => recipient.email === user.email)) return;
          recipients.push({ id: user.id || "", name: fullUserName(user), email: user.email, type: "User" });
        });
      }

      await Promise.all(recipients.map(async (recipient) => {
        const subject = applyMessageTags(noteTemplate?.subject || noteTemplate?.name || `Job ${job.jobNumber || job.id} comment`, { notes: newNote.trim() });
        const body = applyMessageTags(noteTemplate?.htmlBody || "{{notes}}", { notes: newNote.trim() });
        const historyRef = await addDoc(
          collection(clientDb, "companies", COMPANY_ID, "jobs", job.id, "communications"),
          {
            source: "job-note",
            noteId: noteRef.id,
            communicationName: "Job note / comment",
            templateId: noteTemplate?.id || "",
            templateName: noteTemplate?.name || "",
            recipientType: recipient.type,
            recipientId: recipient.id,
            recipientName: recipient.name,
            recipientEmail: recipient.email,
            subject,
            body,
            state: "queued",
            createdById: currentUser?.uid || "",
            createdByName: noteAuthorName,
            createdAt: serverTimestamp(),
          }
        );
        await addDoc(
          collection(clientDb, "companies", COMPANY_ID, "communicationQueue"),
          {
            jobId: job.id, jobNumber: job.jobNumber || "", noteId: noteRef.id, historyId: historyRef.id,
            communicationName: "Job note / comment", messageType: "Email",
            notificationType: recipient.type === "Customer" ? "Customer" : "Assigned Employees",
            recipientType: recipient.type, recipientId: recipient.id, recipientName: recipient.name,
            recipientEmail: recipient.email,
            templateId: noteTemplate?.id || "", templateName: noteTemplate?.name || "",
            subject, body, sendEmail: true, sendSms: false, state: "pending",
            createdAt: serverTimestamp(),
          }
        );
      }));

      if ((emailNoteToCustomer || emailNoteToUsers) && recipients.length === 0) {
        alert("The comment was saved, but no email address was available for the selected recipients.");
      }
      setNewNote("");
      setNoteVisibility("internal");
      setEmailNoteToCustomer(false);
      setEmailNoteToUsers(false);
      setSelectedNoteTemplate("");
      await loadJobCollections();
    } catch (error) {
      console.error(error);
      alert("Unable to save or send the job comment.");
    } finally {
      setSavingNote(false);
    }


  }

  async function saveJobFields() {

    const missingCustomerFields = customerJobFields.filter(
      (field) => field.required && !String(customerJobFieldValues[field.id] ?? "").trim()
    );
    if (missingCustomerFields.length > 0) {
      alert(
        `Complete the required Customer Information fields:\n\n${missingCustomerFields
          .map((field) => `• ${field.label}`)
          .join("\n")}`
      );
      return;
    }

    try {

      setSaving(true);

      const recordedAt = new Date().toISOString();
      const directFieldEntries = directlyEditedFieldIds.flatMap((fieldId) => {
        const newValue = String(editableFields[fieldId] ?? "").trim();
        if (!newValue) return [];
        const previousValue = String(
          job.statusFieldValues?.[fieldId] ?? job.dynamicFields?.[fieldId] ?? ""
        ).trim();
        const hasHistory = (job.statusFieldReadings || []).some(
          (reading: any) => reading.fieldId === fieldId
        );
        const baseEntry = {
          fieldId,
          label: editableLabels[fieldId] || fieldDefinitions[fieldId]?.label || fieldId,
          statusId: job.statusId || "",
          statusName: job.status || "Manual update",
          recordedById: currentUser?.uid || "",
          recordedByName: currentUser?.displayName || currentUser?.email || "Unknown User",
        };
        return [
          ...(!hasHistory && previousValue && previousValue !== newValue ? [{
            ...baseEntry,
            value: previousValue,
            recordedAt: "0000-00-00T00:00:00.000Z",
          }] : []),
          { ...baseEntry, value: newValue, recordedAt },
        ];
      });
      const latestStatusFieldValues = {
        ...(job.statusFieldValues || {}),
        ...Object.fromEntries(
          directlyEditedFieldIds.map((fieldId) => [fieldId, editableFields[fieldId] ?? ""])
        ),
      };
      let nextStatusFieldReadings = [...(job.statusFieldReadings || [])];
      Object.entries(adminKmDrafts).forEach(([fieldId, draft]) => {
        const values = draft.split("#").map((value) => value.trim()).filter(Boolean);
        const existingEntries = nextStatusFieldReadings
          .filter((reading: any) => reading.fieldId === fieldId)
          .sort((left: any, right: any) =>
            String(left.recordedAt || "").localeCompare(String(right.recordedAt || ""))
          );
        nextStatusFieldReadings = nextStatusFieldReadings.filter(
          (reading: any) => reading.fieldId !== fieldId
        );
        nextStatusFieldReadings.push(...values.map((value, index) => ({
          ...(existingEntries[index] || {}),
          fieldId,
          label: existingEntries[index]?.label || (fieldId === "startKm" ? "Start KM Reading" : "End KM Reading"),
          value,
          statusId: existingEntries[index]?.statusId || job.statusId || "",
          statusName: existingEntries[index]?.statusName || job.status || "Admin correction",
          recordedAt: existingEntries[index]?.recordedAt || new Date(Date.now() + index).toISOString(),
          recordedById: currentUser?.uid || "",
          recordedByName: currentUser?.displayName || currentUser?.email || "Administrator",
          correctedByAdmin: true,
          correctedAt: recordedAt,
        })));
        latestStatusFieldValues[fieldId] = values.at(-1) || "";
      });
      nextStatusFieldReadings.push(...directFieldEntries);

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

          referenceNumber:
            editableFields.referenceNumber ?? job.referenceNumber ?? job.customerReference ?? "",

          customerOrderNumber:
            editableFields.customerOrderNumber ?? job.customerOrderNumber ?? job.purchaseOrderNumber ?? job.customerPoNumber ?? "",

          invoiceNumber:
            editableFields.invoiceNumber ?? job.invoiceNumber ?? "",

          dynamicFields:
            editableFields,

          customerJobFieldValues,

          statusFieldValues:
            latestStatusFieldValues,

          statusFieldReadings: nextStatusFieldReadings,

          updatedAt:
            serverTimestamp(),
        }
      );

      alert(
        "Job updated successfully"
      );

      setJob({
        ...job,
        referenceNumber: editableFields.referenceNumber ?? job.referenceNumber ?? job.customerReference ?? "",
        customerOrderNumber: editableFields.customerOrderNumber ?? job.customerOrderNumber ?? job.purchaseOrderNumber ?? job.customerPoNumber ?? "",
        invoiceNumber: editableFields.invoiceNumber ?? job.invoiceNumber ?? "",
        dynamicFields: editableFields,
        customerJobFieldValues,
        statusFieldValues: latestStatusFieldValues,
        statusFieldReadings: nextStatusFieldReadings,
      });

      setHasUnsavedAmendments(false);
      setDirectlyEditedFieldIds([]);
      setAdminKmDrafts({});

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

          isClosed: true,
          archived: false,
          archivedAt: null,

          closedAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),
        }
      );

      await recalculateActiveJobQueue();

      setJob({
        ...job,
        status: "closed",
        isClosed: true,
        archived: false,
      });

      setManagementOpen(false);

    } catch (err) {

      console.error(err);
    }
  }

  function openClosedJob() {
    if (!canOpenClosedJobs || !isRestrictedJob) return;
    if (!window.confirm("Enable editing for this closed job? Its information and current status will remain unchanged.")) return;
    setClosedJobEditing(true);
    setManagementOpen(false);
  }

  async function cancelJob() {
    const reason = cancellationReasons.find((item) => item.id === selectedCancellationReasonId);
    if (!reason) {
      alert("Select a cancellation reason.");
      return;
    }

    try {
      setCancellingJob(true);
      const cancelledAt = new Date().toISOString();
      const historyEntry = {
        id: crypto.randomUUID(),
        statusId: "cancelled",
        statusName: "Cancelled",
        reasonId: reason.id,
        reasonName: reason.name,
        enteredAt: cancelledAt,
        createdAt: cancelledAt,
        updatedById: currentUser?.uid || "",
        updatedByName: currentUser?.displayName || currentUser?.email || "Unknown User",
      };

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

          cancellationReasonId: reason.id,
          cancellationReason: reason.name,
          statusHistory: arrayUnion(historyEntry),

          cancelledAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),
        }
      );

      setJob({
        ...job,
        status: "cancelled",
        cancellationReasonId: reason.id,
        cancellationReason: reason.name,
        statusHistory: [...(job.statusHistory || []), historyEntry],
      });

      await recalculateActiveJobQueue();
      setManagementOpen(false);
      setShowCancelModal(false);
      setSelectedCancellationReasonId("");

      const compose = new URLSearchParams({
        module: "JobCard",
        documentId: job.id,
        jobId: job.id,
        notes: `Job cancelled: ${reason.name}`,
        comment: reason.name,
        recipients: "customer,assigned-users",
      });
      router.push(`/messages/compose?${compose.toString()}`);

    } catch (err) {

      console.error(err);
      alert("Unable to cancel the job.");
    } finally {
      setCancellingJob(false);
    }
  }

  function openReopenJob() {
    if (!isRestrictedJob) {
      alert("Only a closed or archived job can be re-opened.");
      setManagementOpen(false);
      return;
    }
    const currentIds: string[] = job.assignedUserIds?.length
      ? job.assignedUserIds
      : [job.assignedUserId || job.assignedTechnicianId || job.technicianId].filter(Boolean);
    setReopenAssignedUserIds(currentIds);
    setSelectedReopenReasonId("");
    setReopenReasonValue("");
    setManagementOpen(false);
    setShowReopenModal(true);
  }

  async function reopenJob() {
    const reopenedStatus = statuses.find((status: any) =>
      String(status.name || "").replace(/[^a-z0-9]/gi, "").toLowerCase() === "reopened"
    );
    const reason = cancellationReasons.find((item) => item.id === selectedReopenReasonId);
    const reasonValue = reopenReasonValue.trim();
    if (!reopenedStatus) {
      alert('Create an active status named "Re-opened" before reopening a job.');
      return;
    }
    if (!reason || !reasonValue) {
      alert("Select and complete a configured re-open reason.");
      return;
    }
    if (reopenAssignedUserIds.length === 0) {
      alert("Assign at least one user to the re-opened job.");
      return;
    }

    try {
      setReopeningJob(true);
      const assignedUsers = technicians
        .filter((user: any) => reopenAssignedUserIds.includes(user.id))
        .map((user: any) => ({
          id: user.id,
          name: user.name || user.displayName || `${user.firstName || ""} ${user.lastName || user.surname || ""}`.trim(),
          email: user.email || "",
          mobile: user.mobile || user.phone || "",
        }));
      const primaryUser = assignedUsers[0];
      const reopenedAt = new Date().toISOString();
      const historyEntry = {
        id: crypto.randomUUID(),
        statusId: reopenedStatus.id,
        statusName: reopenedStatus.name,
        reasonId: reason.id,
        reasonName: reason.name,
        reasonValue,
        assignedUserIds: reopenAssignedUserIds,
        assignedUserNames: assignedUsers.map((user: any) => user.name),
        enteredAt: reopenedAt,
        createdAt: reopenedAt,
        updatedAt: reopenedAt,
        updatedById: currentUser?.uid || "",
        updatedByName: currentUser?.displayName || currentUser?.email || "Unknown User",
      };
      const updates = {
        status: reopenedStatus.name,
        statusId: reopenedStatus.id,
        isClosed: false,
        isCompleted: false,
        archived: false,
        closedAt: null,
        archivedAt: null,
        completedAt: null,
        reopenedAt: serverTimestamp(),
        reopenedById: currentUser?.uid || "",
        reopenedByName: currentUser?.displayName || currentUser?.email || "Unknown User",
        reopenReasonId: reason.id,
        reopenReasonName: reason.name,
        reopenReason: reasonValue,
        assignedUserIds: reopenAssignedUserIds,
        assignedUsers,
        assignedUserId: primaryUser?.id || "",
        assignedTo: assignedUsers.map((user: any) => user.name).join(", "),
        technicianId: primaryUser?.id || "",
        assignedTechnicianId: primaryUser?.id || "",
        technician: primaryUser?.name || "",
        assignedTechnician: primaryUser?.name || "",
        statusHistory: arrayUnion(historyEntry),
        updatedAt: serverTimestamp(),
      };
      await updateDoc(doc(clientDb, "companies", COMPANY_ID, "jobs", job.id), updates);
      const nextJob = { ...job, ...updates, statusHistory: [...(job.statusHistory || []), historyEntry] };
      setJob(nextJob);
      setClosedJobEditing(false);
      await recalculateActiveJobQueue();
      await triggerStatusCommunications(reopenedStatus, {
        notes: reasonValue,
        comment: reasonValue,
        technicianName: primaryUser?.name || "",
        employeeName: primaryUser?.name || "",
      });
      setShowReopenModal(false);
      setSelectedReopenReasonId("");
      setReopenReasonValue("");
      alert("Job re-opened successfully.");
    } catch (error) {
      console.error(error);
      alert("Unable to re-open the job.");
    } finally {
      setReopeningJob(false);
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

    const displayName = tech.name || `${tech.firstName || ""} ${tech.surname || tech.lastName || ""}`.trim();
    const currentIds: string[] = job.assignedUserIds?.length
      ? job.assignedUserIds
      : [job.assignedUserId || job.assignedTechnicianId || job.technicianId].filter(Boolean);
    const isSelected = currentIds.includes(tech.id);
    const nextIds = isSelected
      ? currentIds.filter((userId: string) => userId !== tech.id)
      : [...currentIds, tech.id];
    const nextUsers = technicians
      .filter((user: any) => nextIds.includes(user.id))
      .map((user: any) => ({
        id: user.id,
        name: user.name || `${user.firstName || ""} ${user.surname || user.lastName || ""}`.trim(),
      }));
    const primaryUser = nextUsers[0];

    await updateDoc(

      doc(
        clientDb,
        "companies",
        COMPANY_ID,
        "jobs",
        job.id
      ),

      {
        assignedUserIds: nextIds,
        assignedUsers: nextUsers,
        assignedUserId: primaryUser?.id || "",
        assignedTo: nextUsers.map((user: any) => user.name).join(", "),
        technicianId: primaryUser?.id || "",
        assignedTechnicianId: primaryUser?.id || "",
        technician: primaryUser?.name || "",
        assignedTechnician: primaryUser?.name || "",

        updatedAt:
          serverTimestamp(),
      }

    );


    setJob({

      ...job,
      assignedUserIds: nextIds,
      assignedUsers: nextUsers,
      assignedUserId: primaryUser?.id || "",
      assignedTo: nextUsers.map((user: any) => user.name).join(", "),
      technicianId: primaryUser?.id || "",
      assignedTechnicianId: primaryUser?.id || "",
      technician: primaryUser?.name || "",
      assignedTechnician: primaryUser?.name || "",

    });


  }

  async function saveEditedJobNote(note: any) {
    const comment = editingNoteText.trim();
    if (!comment) return alert("Enter a note or comment.");
    setSavingNoteEdit(true);
    try {
      const editorName = currentUser?.displayName || currentUser?.email || "FleetFix User";
      const noteRef = doc(clientDb, "companies", COMPANY_ID, "jobs", job.id, "notes", note.id);
      await updateDoc(noteRef, { comment, editedAt: serverTimestamp(), editedById: currentUser?.uid || "", editedByName: editorName });
      await addDoc(collection(noteRef, "history"), { action: "edited", previousComment: note.comment || note.text || "", comment, editedById: currentUser?.uid || "", editedByName: editorName, createdAt: serverTimestamp() });
      const notificationSnapshot = await getDocs(query(collection(clientDb, "companies", COMPANY_ID, "notifications"), where("noteId", "==", note.id)));
      await Promise.all(notificationSnapshot.docs.map((notification) => updateDoc(notification.ref, { message: comment, sourceEditedAt: serverTimestamp(), sourceEditedByName: editorName })));
      setJobNotes((current) => current.map((entry) => entry.id === note.id ? { ...entry, comment, editedAt: new Date(), editedByName: editorName } : entry));
      setEditingNoteId("");
      setEditingNoteText("");
    } catch (error) {
      console.error("Unable to edit job note", error);
      alert("Unable to save the edited note.");
    } finally { setSavingNoteEdit(false); }
  }

  async function openLinkQuoteModal() {
    setManagementOpen(false);
    setShowLinkQuoteModal(true);
    const snapshot = await getDocs(
      collection(clientDb, "companies", COMPANY_ID, "quotes")
    );
    setAvailableQuotes(
      snapshot.docs
        .map((quoteDocument, index) => ({
          id: quoteDocument.id,
          quoteListNumber: `QT${String(index + 1).padStart(6, "0")}`,
          ...quoteDocument.data(),
        }))
        .filter((quote: any) => !String(quote.jobId || "").trim())
    );
  }

  async function linkExistingQuote(quote: any) {
    try {
      setLinkingQuoteId(quote.id);
      await updateDoc(
        doc(clientDb, "companies", COMPANY_ID, "quotes", quote.id),
        {
          jobId: job.id,
          jobNumber: job.jobNumber || job.id,
          updatedAt: serverTimestamp(),
        }
      );
      setLinkedItems((current) => [
        ...current.filter((item: any) => item.id !== quote.id),
        { ...quote, documentType: "quote", jobId: job.id, jobNumber: job.jobNumber || job.id },
      ]);
      setAvailableQuotes((current) => current.filter((item) => item.id !== quote.id));
      setShowLinkQuoteModal(false);
    } catch (error) {
      console.error(error);
      alert("Unable to link this quote to the job.");
    } finally {
      setLinkingQuoteId("");
    }
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

  async function updateJobManagementField(
    field: "priority" | "jobType",
    value: string
  ) {
    try {
      setAllocatingJobType(true);

      let linkedFormUpdates: Record<string, any> = {};
      let allocatedTasks: any[] | null = null;

      if (field === "jobType") {
        const selectedJobType =
          jobTypes.find(
            (jobType) =>
              jobType.name === value
          );

        if (!selectedJobType) {
          alert("The selected Job Type no longer exists.");
          return;
        }

        linkedFormUpdates = {
          jobTypeId: selectedJobType.id,
        };

        const formTemplatesSnapshot = await getDocs(
          collection(clientDb, "companies", COMPANY_ID, "jobforms")
        );
        const formTemplates = formTemplatesSnapshot.docs.map((templateDoc) => ({
          id: templateDoc.id,
          ...templateDoc.data(),
        } as any));
        const currentForms = Array.isArray(job.jobForms) && job.jobForms.length > 0
          ? [...job.jobForms]
          : job.jobFormTemplateId
            ? [{
                id: job.jobFormTemplateId,
                templateId: job.jobFormTemplateId,
                templateName: job.jobFormTemplateName || "Job Form",
                fields: job.jobFormFields || [],
                allowMultipleUse: false,
              }]
            : [];
        const previousJobTypeId = job.jobTypeId || jobTypes.find(
          (jobType: any) => jobType.name === job.jobType
        )?.id;
        const valuesByForm = job.jobFormValuesByTemplate || {};
        const completionByForm = job.jobFormCompletion || {};
        const previousTypeTemplateIds = new Set(
          formTemplates
            .filter((template: any) =>
              Array.isArray(template.linkedJobTypeIds) &&
              template.linkedJobTypeIds.includes(previousJobTypeId)
            )
            .map((template: any) => template.id)
        );
        const relevantStatusIds = new Set<string>(
          currentForms.flatMap((form: any) => {
            const template = formTemplates.find(
              (candidate: any) => candidate.id === (form.templateId || form.id)
            );
            return [
              form.statusId,
              ...(Array.isArray(template?.autoAddStatusIds)
                ? template.autoAddStatusIds
                : []),
            ].filter(Boolean);
          })
        );
        if (job.statusId) relevantStatusIds.add(job.statusId);

        const retainedForms = currentForms.filter((form: any) => {
          const instanceId = form.id || form.templateId;
          const templateId = form.templateId || form.id;
          const hasSavedValues = Object.prototype.hasOwnProperty.call(
            valuesByForm,
            instanceId
          ) || (
            Boolean(job.jobFormUpdatedAt) &&
            templateId === job.jobFormTemplateId
          );
          const isCompleted = completionByForm?.[instanceId]?.completed === true;
          const isPreviousTypeForm = previousTypeTemplateIds.has(templateId);

          return !isPreviousTypeForm || hasSavedValues || isCompleted;
        });
        const linkedNewTypeTemplates = formTemplates.filter((template: any) =>
          template.active !== false &&
          Array.isArray(template.linkedJobTypeIds) &&
          template.linkedJobTypeIds.includes(selectedJobType.id)
        );
        let newTypeTemplates = linkedNewTypeTemplates.filter((template: any) =>
          Array.isArray(template.autoAddStatusIds) &&
          template.autoAddStatusIds.some((statusId: string) =>
            relevantStatusIds.has(statusId)
          )
        );
        if (newTypeTemplates.length === 0 && linkedNewTypeTemplates.length === 1) {
          newTypeTemplates = linkedNewTypeTemplates;
        }

        const nextForms = [...retainedForms];
        newTypeTemplates.forEach((template: any) => {
          const alreadyAllocated = nextForms.some(
            (form: any) => (form.templateId || form.id) === template.id
          );
          if (alreadyAllocated && template.allowMultipleUse !== true) return;

          const allocatedFields = JSON.parse(JSON.stringify(
            (template.fields || []).map((formField: any) => ({
              ...formField,
              label: typeof formField.label === "string"
                ? formField.label.replace(/\{\{jobNumber\}\}/gi, job.jobNumber || job.id)
                : formField.label,
            }))
          ));
          nextForms.push({
            id: crypto.randomUUID(),
            templateId: template.id,
            templateName: template.name || "Job Form",
            fields: allocatedFields,
            allowMultipleUse: template.allowMultipleUse === true,
            status: job.status || "",
            statusId: job.statusId || "",
            allocatedAt: new Date().toISOString(),
            allocatedByJobTypeId: selectedJobType.id,
            allocatedByJobTypeName: selectedJobType.name || value,
          });
        });

        linkedFormUpdates.jobForms = nextForms;
        const primaryNewForm = nextForms.find(
          (form: any) => newTypeTemplates.some(
            (template: any) => template.id === (form.templateId || form.id)
          )
        );
        if (primaryNewForm) {
          linkedFormUpdates.jobFormTemplateId = primaryNewForm.templateId;
          linkedFormUpdates.jobFormTemplateName = primaryNewForm.templateName;
          linkedFormUpdates.jobFormFields = primaryNewForm.fields;
          linkedFormUpdates.jobFormAllocatedAt = serverTimestamp();
        }

        const taskTemplates =
          (
            await Promise.all(
              (
                selectedJobType.linkedTaskTemplateIds || []
              ).map(async (templateId: string) => {
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

        allocatedTasks =
          taskTemplates.flatMap(
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
                  autoAllocated: true,
                  templateId: template.id,
                  templateName:
                    template.name || "Task Template",
                  templateItemId: item.id || "",
                  taskType: item.type || "Text",
                  options: item.options || [],
                }))
          );

        linkedFormUpdates.jobTaskTemplateIds =
          selectedJobType.linkedTaskTemplateIds || [];
        linkedFormUpdates.jobTaskTemplates =
          taskTemplates;
      }

      await updateDoc(
        doc(clientDb, "companies", COMPANY_ID, "jobs", job.id),
        {
          [field]: value,
          ...linkedFormUpdates,
          updatedAt: serverTimestamp(),
        }
      );

      if (allocatedTasks) {
        const tasksCollection =
          collection(
            clientDb,
            "companies",
            COMPANY_ID,
            "jobs",
            job.id,
            "tasks"
          );

        const existingTasks =
          await getDocs(tasksCollection);

        await Promise.all(
          existingTasks.docs
            .filter(
              (taskDoc) =>
                taskDoc.data().autoAllocated === true
            )
            .map((taskDoc) =>
              deleteDoc(taskDoc.ref)
            )
        );

        await Promise.all(
          allocatedTasks.map((task) =>
            addDoc(tasksCollection, {
              ...task,
              createdAt: serverTimestamp(),
            })
          )
        );

        const refreshedTasks =
          await getDocs(tasksCollection);

        setJobTasks(
          refreshedTasks.docs.map(
            (taskDoc) => ({
              id: taskDoc.id,
              ...taskDoc.data(),
            })
          )
        );
      }

      setJob({
        ...job,
        [field]: value,
        ...linkedFormUpdates,
      });
      setShowPriorityModal(false);
      setShowJobTypeModal(false);
    } catch (err) {
      console.error(err);
      alert("Unable to update the job. Please try again.");
    } finally {
      setAllocatingJobType(false);
    }
  }

  async function allocateStatusForm(statusConfig: any) {
    const selectedJobType = jobTypes.find(
      (jobType: any) => jobType.id === job.jobTypeId || jobType.name === job.jobType
    );
    if (!selectedJobType) return {};

    const templatesSnapshot = await getDocs(
      collection(clientDb, "companies", COMPANY_ID, "jobforms")
    );
    const matchingTemplates = templatesSnapshot.docs
      .map((templateDoc) => ({ id: templateDoc.id, ...templateDoc.data() } as any))
      .filter((template) =>
        template.active !== false &&
        template.autoAddStatusIds?.includes(statusConfig.id) &&
        template.linkedJobTypeIds?.includes(selectedJobType.id)
      );
    if (matchingTemplates.length === 0) return {};

    const currentForms = Array.isArray(job.jobForms)
      ? [...job.jobForms]
      : job.jobFormTemplateId
        ? [{
            id: job.jobFormTemplateId,
            templateId: job.jobFormTemplateId,
            templateName: job.jobFormTemplateName || "Job Form",
            fields: job.jobFormFields || [],
            allowMultipleUse: false,
          }]
        : [];

    const nextForms = [...currentForms];
    matchingTemplates.forEach((template) => {
      const alreadyAllocated = nextForms.some(
        (form: any) => (form.templateId || form.id) === template.id
      );
      if (alreadyAllocated && template.allowMultipleUse !== true) return;

      const allocatedFields = JSON.parse(JSON.stringify(
        (template.fields || []).map((field: any) => ({
          ...field,
          label: typeof field.label === "string"
            ? field.label.replace(/\{\{jobNumber\}\}/gi, job.jobNumber || job.id)
            : field.label,
        }))
      ));
      nextForms.push({
        id: crypto.randomUUID(),
        templateId: template.id,
        templateName: template.name || "Job Form",
        fields: allocatedFields,
        allowMultipleUse: template.allowMultipleUse === true,
        allocatedByStatusId: statusConfig.id,
        allocatedByStatusName: statusConfig.name,
        allocatedAt: new Date().toISOString(),
      });
    });

    return {
      jobForms: nextForms,
    };
  }

  async function addInventoryToJob(
    item: any,
    selectedSerial?: any,
    selectedLocation?: any,
  ) {

    if (item.serialNumberTracking === true && !selectedSerial) {
      setLoadingSerials(true);
      const snapshot = await getDocs(query(
        collection(clientDb, "companies", COMPANY_ID, "inventory_serials"),
        where("inventoryId", "==", item.id)
      ));
      setAvailableSerials(snapshot.docs
        .map((serialDocument) => ({ id: serialDocument.id, ...serialDocument.data() } as any))
        .filter((serial) => serial.status === "available"));
      setSerialSelectionItem(item);
      setLoadingSerials(false);
      return;
    }

    if (!selectedLocation) {
      const serialLocationId = String(selectedSerial?.locationId || "");
      setSerialSelectionItem(null);
      setPendingInventoryLocation(null);
      setSelectedInventoryLocationId("");
      setShowPartsModal(false);
      setSelectedInventoryLocationId(serialLocationId);
      setPendingInventoryLocation({ item, selectedSerial: selectedSerial || null });
      return;
    }


    const qtyUsed = 1;


    const sellPrice =
      Number(
        item.sellPrice || 0
      );

    const costPrice = Number(item.costPrice ?? item.unitCost ?? item.cost ?? 0);

    if (selectedSerial) {
      const serialRef = doc(clientDb, "companies", COMPANY_ID, "inventory_serials", selectedSerial.id);
      const materialRef = doc(collection(clientDb, "companies", COMPANY_ID, "jobs", job.id, "materials"));
      await runTransaction(clientDb, async (transaction) => {
        const serialSnapshot = await transaction.get(serialRef);
        if (!serialSnapshot.exists() || serialSnapshot.data().status !== "available") throw new Error("This serial number is no longer available.");
        transaction.set(materialRef, { inventoryId: item.id, partNumber: item.partNumber || "", description: item.description || "", category: item.category || "", brand: item.brand || "", qty: 1, costPrice, sellPrice, total: sellPrice, serialId: selectedSerial.id, serialNumber: selectedSerial.serialNumber, serialStatus: "allocated", sourceId: selectedLocation.id, sourceType: selectedLocation.type || "", sourceName: selectedLocation.name || selectedLocation.id, used: false, createdById: currentUser?.uid || "", createdByName: currentUser?.displayName || currentUser?.email || "Unknown User", createdAt: serverTimestamp() });
        transaction.update(serialRef, { status: "allocated", jobId: job.id, jobNumber: job.jobNumber || job.id, allocatedAt: serverTimestamp(), allocatedById: currentUser?.uid || "", allocatedByName: currentUser?.displayName || currentUser?.email || "Unknown User" });
      });
      setSerialSelectionItem(null);
      setShowPartsModal(false);
      await loadJobCollections();
      await loadInventory();
      return;
    }


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

        costPrice,


        total:
          sellPrice * qtyUsed,

        sourceId: selectedLocation.id,

        sourceType: selectedLocation.type || "",

        sourceName: selectedLocation.name || selectedLocation.id,


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



    setPendingInventoryLocation(null);
    setSelectedInventoryLocationId("");
    setShowPartsModal(false);


    await loadJobCollections();


    await loadInventory();


  }

  async function updateNoPartsUsed(checked: boolean) {
    const previousValue = job.noPartsUsed === true;
    setJob((current: any) => ({ ...current, noPartsUsed: checked }));
    try {
      await updateDoc(
        doc(clientDb, "companies", COMPANY_ID, "jobs", job.id),
        {
          noPartsUsed: checked,
          noPartsUsedUpdatedAt: serverTimestamp(),
          noPartsUsedUpdatedById: currentUser?.uid || "",
          noPartsUsedUpdatedByName: currentUser?.displayName || currentUser?.email || "Unknown User",
          updatedAt: serverTimestamp(),
        }
      );
      window.dispatchEvent(new Event("fleetfix:changes-saved"));
    } catch (error) {
      console.error("Unable to update No Parts Used:", error);
      setJob((current: any) => ({ ...current, noPartsUsed: previousValue }));
      alert("Unable to update the No Parts Used option.");
    }
  }

  async function deleteMaterialLine(material: any) {
    if (material.used === true && !canCorrectUsedMaterials) {
      alert("You do not have permission to delete used inventory lines.");
      return;
    }
    const label = material.partNumber || material.description || "this item";
    if (!window.confirm(`Delete ${label} from this job?`)) return;

    try {
      const materialRef = doc(
        clientDb,
        "companies",
        COMPANY_ID,
        "jobs",
        job.id,
        "materials",
        material.id
      );
      if (material.used === true && material.inventoryId) {
        const inventoryRef = doc(clientDb, "companies", COMPANY_ID, "inventory", material.inventoryId);
        const serialRef = material.serialId
          ? doc(clientDb, "companies", COMPANY_ID, "inventory_serials", material.serialId)
          : null;
        const reversalRef = doc(collection(clientDb, "companies", COMPANY_ID, "inventory_transactions"));
        await runTransaction(clientDb, async (transaction) => {
          const inventorySnapshot = await transaction.get(inventoryRef);
          if (!inventorySnapshot.exists()) throw new Error("The linked inventory item no longer exists.");
          if (serialRef) await transaction.get(serialRef);
          const inventoryData = inventorySnapshot.data();
          const locationId = material.usedLocationId || material.sourceId || "MAIN";
          const location = stockLocations.find((entry: any) => entry.id === locationId);
          const quantity = Math.max(1, Number(material.qty || 1));
          const beforeQty = Number(inventoryData.warehouseStock?.[locationId] || 0);
          const warehouseStock = { ...(inventoryData.warehouseStock || {}), [locationId]: beforeQty + quantity };
          const locationType = String(location?.type || material.sourceType || "").toLowerCase();
          const isWarehouse = locationId === "MAIN" || locationType === "warehouse";
          const isVan = locationType === "rav";
          transaction.update(inventoryRef, {
            warehouseStock,
            warehouseTotal: Number(inventoryData.warehouseTotal || 0) + (isWarehouse ? quantity : 0),
            vanTotal: Number(inventoryData.vanTotal || 0) + (isVan ? quantity : 0),
            grandTotal: Number(inventoryData.grandTotal || 0) + quantity,
            updatedAt: serverTimestamp(),
          });
          if (serialRef) transaction.update(serialRef, {
            status: "available",
            jobId: "",
            jobNumber: "",
            usedAt: null,
            usedLocationId: "",
            usedLocationName: "",
            usedJobId: "",
            usedJobNumber: "",
            usedById: "",
            usedByName: "",
            updatedAt: serverTimestamp(),
          });
          transaction.set(reversalRef, {
            inventoryId: material.inventoryId,
            partNumber: material.partNumber || "",
            description: material.description || "",
            type: "REVERSAL",
            qty: quantity,
            beforeQty,
            afterQty: beforeQty + quantity,
            locationId,
            locationName: material.usedLocationName || material.sourceName || location?.name || locationId,
            referenceType: "JOB MATERIAL CORRECTION",
            documentNumber: job.jobNumber || job.id,
            referenceNumber: job.jobNumber || job.id,
            jobId: job.id,
            reason: "Used job material line deleted",
            userId: currentUser?.uid || "",
            userName: currentUser?.displayName || currentUser?.email || "Unknown User",
            createdAt: serverTimestamp(),
          });
          transaction.delete(materialRef);
        });
      } else if (material.serialId) {
        const serialRef = doc(
          clientDb,
          "companies",
          COMPANY_ID,
          "inventory_serials",
          material.serialId
        );
        await runTransaction(clientDb, async (transaction) => {
          const serialSnapshot = await transaction.get(serialRef);
          if (serialSnapshot.exists() && serialSnapshot.data().status === "allocated") {
            transaction.update(serialRef, {
              status: "available",
              jobId: "",
              jobNumber: "",
              allocatedAt: null,
              allocatedById: "",
              allocatedByName: "",
              updatedAt: serverTimestamp(),
            });
          }
          transaction.delete(materialRef);
        });
      } else {
        await deleteDoc(materialRef);
      }
      setMaterials((current) => current.filter((item) => item.id !== material.id));
    } catch (error) {
      console.error("Unable to delete the inventory line:", error);
      alert("Unable to delete this inventory line.");
    }
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

    if (current.used === true && !canCorrectUsedMaterials) {
      alert("You do not have permission to change used inventory lines.");
      return;
    }

    if (current.used === true && field === "qty" && current.serialId) {
      alert("The quantity of a serialized used item cannot be changed.");
      return;
    }

    if (current.used === true && field === "qty" && current.inventoryId) {
      const oldQty = Math.max(1, Number(current.qty || 1));
      const newQty = Math.max(1, Number(value || 1));
      const stockDifference = oldQty - newQty;
      if (stockDifference === 0) return;
      const inventoryRef = doc(clientDb, "companies", COMPANY_ID, "inventory", current.inventoryId);
      const materialRef = doc(clientDb, "companies", COMPANY_ID, "jobs", job.id, "materials", materialId);
      const correctionRef = doc(collection(clientDb, "companies", COMPANY_ID, "inventory_transactions"));
      try {
        await runTransaction(clientDb, async (transaction) => {
          const inventorySnapshot = await transaction.get(inventoryRef);
          if (!inventorySnapshot.exists()) throw new Error("The linked inventory item no longer exists.");
          const inventoryData = inventorySnapshot.data();
          const locationId = current.usedLocationId || current.sourceId || "MAIN";
          const location = stockLocations.find((entry: any) => entry.id === locationId);
          const beforeQty = Number(inventoryData.warehouseStock?.[locationId] || 0);
          const afterQty = beforeQty + stockDifference;
          const warehouseStock = { ...(inventoryData.warehouseStock || {}), [locationId]: afterQty };
          const locationType = String(location?.type || current.sourceType || "").toLowerCase();
          const isWarehouse = locationId === "MAIN" || locationType === "warehouse";
          const isVan = locationType === "rav";
          transaction.update(inventoryRef, {
            warehouseStock,
            warehouseTotal: Number(inventoryData.warehouseTotal || 0) + (isWarehouse ? stockDifference : 0),
            vanTotal: Number(inventoryData.vanTotal || 0) + (isVan ? stockDifference : 0),
            grandTotal: Number(inventoryData.grandTotal || 0) + stockDifference,
            updatedAt: serverTimestamp(),
          });
          transaction.update(materialRef, {
            qty: newQty,
            total: newQty * Number(current.sellPrice || 0),
            correctedAt: serverTimestamp(),
            correctedById: currentUser?.uid || "",
            correctedByName: currentUser?.displayName || currentUser?.email || "Unknown User",
            updatedAt: serverTimestamp(),
          });
          transaction.set(correctionRef, {
            inventoryId: current.inventoryId,
            partNumber: current.partNumber || "",
            description: current.description || "",
            type: "CORRECTION",
            qty: Math.abs(stockDifference),
            beforeQty,
            afterQty,
            locationId,
            locationName: current.usedLocationName || current.sourceName || location?.name || locationId,
            referenceType: "JOB MATERIAL CORRECTION",
            documentNumber: job.jobNumber || job.id,
            referenceNumber: job.jobNumber || job.id,
            jobId: job.id,
            reason: `Used quantity corrected from ${oldQty} to ${newQty}`,
            userId: currentUser?.uid || "",
            userName: currentUser?.displayName || currentUser?.email || "Unknown User",
            createdAt: serverTimestamp(),
          });
        });
        await loadJobCollections();
      } catch (error) {
        console.error("Unable to correct the used quantity:", error);
        alert("Unable to correct the used quantity.");
      }
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

  async function updateUsedMaterialSource(material: any, nextLocation: any) {
    if (!canCorrectUsedMaterials) {
      alert("You do not have permission to change used inventory lines.");
      return;
    }
    if (!material.inventoryId || !nextLocation || nextLocation.id === (material.usedLocationId || material.sourceId)) return;
    const inventoryRef = doc(clientDb, "companies", COMPANY_ID, "inventory", material.inventoryId);
    const materialRef = doc(clientDb, "companies", COMPANY_ID, "jobs", job.id, "materials", material.id);
    const serialRef = material.serialId
      ? doc(clientDb, "companies", COMPANY_ID, "inventory_serials", material.serialId)
      : null;
    const correctionRef = doc(collection(clientDb, "companies", COMPANY_ID, "inventory_transactions"));
    try {
      await runTransaction(clientDb, async (transaction) => {
        const inventorySnapshot = await transaction.get(inventoryRef);
        if (!inventorySnapshot.exists()) throw new Error("The linked inventory item no longer exists.");
        if (serialRef) await transaction.get(serialRef);
        const inventoryData = inventorySnapshot.data();
        const oldLocationId = material.usedLocationId || material.sourceId || "MAIN";
        const oldLocation = stockLocations.find((entry: any) => entry.id === oldLocationId);
        const quantity = Math.max(1, Number(material.qty || 1));
        const oldBeforeQty = Number(inventoryData.warehouseStock?.[oldLocationId] || 0);
        const newBeforeQty = Number(inventoryData.warehouseStock?.[nextLocation.id] || 0);
        const warehouseStock = {
          ...(inventoryData.warehouseStock || {}),
          [oldLocationId]: oldBeforeQty + quantity,
          [nextLocation.id]: newBeforeQty - quantity,
        };
        const oldType = String(oldLocation?.type || material.sourceType || "").toLowerCase();
        const newType = String(nextLocation.type || "").toLowerCase();
        const oldWarehouse = oldLocationId === "MAIN" || oldType === "warehouse";
        const newWarehouse = nextLocation.id === "MAIN" || newType === "warehouse";
        const oldVan = oldType === "rav";
        const newVan = newType === "rav";
        transaction.update(inventoryRef, {
          warehouseStock,
          warehouseTotal: Number(inventoryData.warehouseTotal || 0) + (oldWarehouse ? quantity : 0) - (newWarehouse ? quantity : 0),
          vanTotal: Number(inventoryData.vanTotal || 0) + (oldVan ? quantity : 0) - (newVan ? quantity : 0),
          updatedAt: serverTimestamp(),
        });
        transaction.update(materialRef, {
          sourceId: nextLocation.id,
          sourceName: nextLocation.name || "",
          sourceType: nextLocation.type || "",
          usedLocationId: nextLocation.id,
          usedLocationName: nextLocation.name || "",
          correctedAt: serverTimestamp(),
          correctedById: currentUser?.uid || "",
          correctedByName: currentUser?.displayName || currentUser?.email || "Unknown User",
          updatedAt: serverTimestamp(),
        });
        if (serialRef) transaction.update(serialRef, {
          usedLocationId: nextLocation.id,
          usedLocationName: nextLocation.name || "",
          updatedAt: serverTimestamp(),
        });
        transaction.set(correctionRef, {
          inventoryId: material.inventoryId,
          partNumber: material.partNumber || "",
          description: material.description || "",
          type: "LOCATION CORRECTION",
          qty: quantity,
          fromLocationId: oldLocationId,
          fromLocationName: material.usedLocationName || material.sourceName || oldLocation?.name || oldLocationId,
          toLocationId: nextLocation.id,
          toLocationName: nextLocation.name || nextLocation.id,
          referenceType: "JOB MATERIAL CORRECTION",
          documentNumber: job.jobNumber || job.id,
          referenceNumber: job.jobNumber || job.id,
          jobId: job.id,
          reason: "Used stock source corrected",
          userId: currentUser?.uid || "",
          userName: currentUser?.displayName || currentUser?.email || "Unknown User",
          createdAt: serverTimestamp(),
        });
      });
      await loadJobCollections();
    } catch (error) {
      console.error("Unable to correct the used stock location:", error);
      alert("Unable to correct the used stock location.");
    }
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
          d.data().name,

        autoReplenishment:
          d.data().autoReplenishment === true,

        assignedUserId:
          d.data().assignedUserId || "",

        assignedUserName:
          d.data().assignedUserName || ""

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
          d.data().name,

        autoReplenishment:
          d.data().autoReplenishment === true,

        assignedUserId:
          d.data().assignedUserId || "",

        assignedUserName:
          d.data().assignedUserName || ""

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

  const configuredJobStatus = statuses.find(
    (status: any) => status.id === job.statusId || status.name === job.status
  );
  const onRoute = statusIsOnRoute(job.status);
  const workHasStarted = !onRoute && (
    statusIsOnSite(job.status) || Boolean(job.workStartedAt)
  );
  const jobFinished =
    job.isCompleted === true ||
    job.isClosed === true ||
    configuredJobStatus?.jobCompleted === true ||
    configuredJobStatus?.closeJob === true ||
    /completed|closed/i.test(String(job.status || ""));
  const etaDisplay = jobFinished
    ? "Job completed"
    : job.edtPaused === true || /on\s*hold|hold/.test(String(job.status || "").toLowerCase())
      ? "Paused — Job On Hold"
    : workHasStarted
      ? "On site — Work in progress"
      : (job.estimatedArrivalAt || job.estimatedDispatchAt)?.toDate?.()
        ? formatDateTime24((job.estimatedArrivalAt || job.estimatedDispatchAt).toDate())
        : (job.estimatedArrivalAt || job.estimatedDispatchAt)
          ? formatDateTime24(new Date(job.estimatedArrivalAt || job.estimatedDispatchAt))
          : "Not estimated";
  const isRestrictedJob =
    job.archived === true ||
    job.isClosed === true ||
    configuredJobStatus?.closeJob === true ||
    ["closed", "job closed"].includes(String(job.status || "").trim().toLowerCase());
  const isJobReadOnly = isRestrictedJob && !closedJobEditing;

  if (isRestrictedJob && !authChecked) {
    return <div className="p-10">Loading closed job…</div>;
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
      value: customer?.contactPerson || job.customerContact,
    },

    email1: {
      label: "Email",
      value: customer?.contactEmail || job.customerContactEmail,
    },

    mobileNumber1: {
      label: "Mobile Number",
      value: job.customerContactNumber || selectedCustomerContact?.mobile || selectedCustomerContact?.phone || customer?.contactNumber,
    },

    customerVatNumber: { label: "Customer VAT Number", value: customer?.vatNumber || job.customerVatNumber },
    customerAddress: { label: "Customer Address", value: customer?.address || customer?.physicalAddress || job.customerAddress },
    contactTelephone: { label: "Contact Telephone", value: job.customerContactNumber || selectedCustomerContact?.mobile || selectedCustomerContact?.phone || customer?.contactNumber },
    contactEmail: { label: "Contact Email", value: customer?.contactEmail || job.customerContactEmail },
    driverName: { label: "Driver Name", value: job.driverName },
    driverContact: { label: "Driver Contact Number", value: job.driverContactNo || job.driverContactNumber },

    address: {
      label: "Address",
      value: customer?.address || customer?.physicalAddress || job.locationDetails?.address,
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

  const configuredPendingStatusFields = pendingStatus?.fields
    ? pendingStatus.fields.filter(
        (field: any, index: number, fields: any[]) =>
          (field.required === true || activatedStatusFieldIds.includes(field.id)) &&
          (!field.linkedJobType || field.linkedJobType === job.jobType || field.linkedJobType === job.jobTypeName) &&
          index === fields.findIndex((candidate: any) => candidate.id === field.id)
      )
    : [];

  const toHistoryDate = (value: any): Date | null => {
    if (!value) return null;
    if (typeof value?.toDate === "function") return value.toDate();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const customerInformationFieldIds = new Set([
    "customerCode", "customerName", "contactName", "email1", "email2", "email3",
    "mobileNumber1", "mobileNumber2", "address", "addressName",
    "customerVatNumber", "customerAddress", "contactTelephone", "contactEmail", "driverName", "driverContact",
    "customerOrderNumber", "referenceNumber", "invoiceNumber",
    "customtext1", "customtext2", "customtext3", "customtext4",
  ]);
  const isHoldReasonField = (fieldId: string) =>
    String(editableLabels[fieldId] || "").replace(/[^a-z0-9]/gi, "").toLowerCase() === "holdreason";
  const isStatusReasonOrNote = (value: unknown) =>
    /reason|note|comment|travel(?:ed|led)?\s*for/i.test(String(value || ""));
  const isStatusReasonOrNoteField = (fieldId: string) =>
    isStatusReasonOrNote(fieldId) ||
    isStatusReasonOrNote(editableLabels[fieldId]) ||
    isStatusReasonOrNote(fieldDefinitions[fieldId]?.label);
  const configuredCustomerFields = selectedFields.filter((fieldId, index, fields) =>
    customerInformationFieldIds.has(fieldId) && !isHoldReasonField(fieldId) && index === fields.indexOf(fieldId)
  );
  const fixedCustomerInformationLabels: Record<string, string> = {
    referenceNumber: "Reference Number",
    customerOrderNumber: "Customer Order Number",
    invoiceNumber: "Invoice Number",
  };
  const jobInformationFieldIds = new Set([
    "assignedEmployees", "assignedVan", "customerAssets",
    "traveledFor",
    "customfield1", "customfield2", "customfield3", "customfield4", "customfield5",
    "customfield6", "customfield7", "customfield8", "customfield9", "customfield10",
  ]);
  const configuredJobInformationFields = selectedFields.filter((fieldId, index, fields) =>
    (jobInformationFieldIds.has(fieldId) || isHoldReasonField(fieldId)) &&
    !isStatusReasonOrNoteField(fieldId) &&
    index === fields.indexOf(fieldId)
  );
  const statusFieldHistoryValue = (fieldId: string, fallback: unknown = "") => {
    const readings = (Array.isArray(job.statusFieldReadings) ? job.statusFieldReadings : [])
      .filter((reading: any) =>
        reading.fieldId === fieldId && String(reading.value ?? "").trim() !== ""
      )
      .sort((a: any, b: any) =>
        String(a.recordedAt || "").localeCompare(String(b.recordedAt || ""))
      )
      .map((reading: any) => String(reading.value).trim());

    if (readings.length > 0) return readings.join(" # ");
    return String(fallback || job.statusFieldValues?.[fieldId] || "");
  };
  const statusReasonAndNoteEntries = [
    ...(Array.isArray(job.statusFieldReadings) ? job.statusFieldReadings : [])
      .filter((reading: any) =>
        String(reading.value ?? "").trim() !== "" &&
        (isStatusReasonOrNote(reading.fieldId) || isStatusReasonOrNote(reading.label))
      )
      .map((reading: any) => ({
        key: reading.id || `${reading.fieldId}-${reading.recordedAt}-${reading.value}`,
        label: reading.label || editableLabels[reading.fieldId] || "Status reason / note",
        value: String(reading.value).trim(),
        statusName: reading.statusName || "",
        recordedAt: reading.recordedAt || reading.createdAt || "",
        recordedByName: reading.recordedByName || "",
      })),
    ...(Array.isArray(job.statusHistory) ? job.statusHistory : []).flatMap((entry: any, index: number) =>
      [
        { label: "Status reason", value: entry.reason || entry.statusReason || entry.reasonName },
        { label: "Status note", value: entry.note || entry.statusNote || entry.comment },
      ]
        .filter((item) => String(item.value || "").trim() !== "")
        .map((item) => ({
          key: `${entry.id || index}-${item.label}`,
          label: item.label,
          value: String(item.value).trim(),
          statusName: entry.statusName || entry.status || "",
          recordedAt: entry.enteredAt || entry.createdAt || entry.updatedAt || "",
          recordedByName: entry.updatedByName || entry.createdByName || "",
        }))
    ),
    ...[
      { key: "legacy-status-reason", label: "Status reason", value: job.statusReason || job.reason, statusName: job.status || "", recordedAt: job.updatedAt || "", recordedByName: job.updatedByName || "" },
      { key: "legacy-status-note", label: "Status note", value: job.statusNote, statusName: job.status || "", recordedAt: job.updatedAt || "", recordedByName: job.updatedByName || "" },
    ].filter((entry) => String(entry.value || "").trim() !== ""),
  ]
    .filter((entry, index, entries) =>
      index === entries.findIndex((candidate) =>
        candidate.label === entry.label &&
        candidate.value === entry.value &&
        candidate.statusName === entry.statusName &&
        String(candidate.recordedAt || "") === String(entry.recordedAt || "")
      )
    )
    .sort((left, right) => String(right.recordedAt || "").localeCompare(String(left.recordedAt || "")));
  const numericStatusFieldReadings = (fieldId: string): number[] => {
    const recordedValues = (Array.isArray(job.statusFieldReadings) ? job.statusFieldReadings : [])
      .filter((reading: any) =>
        reading.fieldId === fieldId && String(reading.value ?? "").trim() !== ""
      )
      .sort((a: any, b: any) =>
        String(a.recordedAt || "").localeCompare(String(b.recordedAt || ""))
      )
      .map((reading: any) => Number(String(reading.value).replace(/[^0-9.-]/g, "")))
      .filter((value: number) => Number.isFinite(value));

    if (recordedValues.length > 0) return recordedValues;

    return String(job.statusFieldValues?.[fieldId] || "")
      .split("#")
      .map((value) => Number(value.trim().replace(/[^0-9.-]/g, "")))
      .filter((value) => Number.isFinite(value));
  };
  const startKmReadings = numericStatusFieldReadings("startKm");
  const endKmReadings = numericStatusFieldReadings("endKm");
  const completedTravelEntries = Math.min(startKmReadings.length, endKmReadings.length);
  const totalTravellingKm = startKmReadings.slice(0, completedTravelEntries).reduce(
    (total: number, startKm, index) => total + Math.max(0, endKmReadings[index] - startKm),
    0
  );
  const configuredRateTotals = calculateCompanyRateTotals(companyRates, rateTimers, totalTravellingKm);
  const hasConfiguredCompanyRates = companyRates.some((rate) => rate.active !== false);
  const bookedPartsCostTotal = materials.reduce((total: number, material: any) => {
    const inventoryItem = inventory.find((item: any) =>
      item.id === material.inventoryId ||
      (material.partNumber && item.partNumber === material.partNumber)
    );
    const quantity = Math.max(0, Number(material.qty ?? material.quantity ?? 0));
    const unitCost = Number(
      material.costPrice ?? material.unitCost ?? material.cost ??
      inventoryItem?.costPrice ?? inventoryItem?.unitCost ?? inventoryItem?.cost ?? 0
    );
    return total + quantity * unitCost;
  }, 0);
  const bookedPartsSellingTotal = materials.reduce((total: number, material: any) => {
    const quantity = Math.max(0, Number(material.qty ?? material.quantity ?? 0));
    const lineTotal = Number(material.total);
    return total + (Number.isFinite(lineTotal) && lineTotal > 0
      ? lineTotal
      : quantity * Number(material.sellPrice ?? material.price ?? 0));
  }, 0);
  const displayedLabourTotal = hasConfiguredCompanyRates ? configuredRateTotals.labour : Number(job.labourTotal || 0);
  const displayedTravelTotal = hasConfiguredCompanyRates ? configuredRateTotals.travel : Number(job.travelTotal || 0);
  const displayedJobTotal = bookedPartsSellingTotal + displayedLabourTotal + displayedTravelTotal;
  const customerInformationValue = (fieldId: string) => {
    const standardValues: Record<string, any> = {
      customerCode: customer?.customerCode,
      customerName: customer?.companyName || job.customerName,
      contactName: customer?.contactPerson || job.customerContact,
      email1: customer?.contactEmail || job.customerContactEmail,
      email2: customer?.email2,
      email3: customer?.email3,
      mobileNumber1: job.customerContactNumber || selectedCustomerContact?.mobile || selectedCustomerContact?.phone || customer?.contactNumber,
      mobileNumber2: customer?.mobileNumber2,
      address: customer?.address || customer?.physicalAddress,
      addressName: customer?.addressName,
      customerVatNumber: customer?.vatNumber || job.customerVatNumber,
      customerAddress: customer?.address || customer?.physicalAddress || job.customerAddress,
      contactTelephone: job.customerContactNumber || selectedCustomerContact?.mobile || selectedCustomerContact?.phone || customer?.contactNumber,
      contactEmail: customer?.contactEmail || job.customerContactEmail,
      customerOrderNumber: job.customerOrderNumber || job.purchaseOrderNumber || job.customerPoNumber || job.dynamicFields?.customerOrderNumber,
      referenceNumber: job.referenceNumber || job.customerReference || job.dynamicFields?.referenceNumber,
      invoiceNumber: job.invoiceNumber || job.dynamicFields?.invoiceNumber,
      driverName: job.driverName,
      driverContact: job.driverContactNo || job.driverContactNumber,
    };
    return standardValues[fieldId] ?? customer?.customFields?.[fieldId] ?? customer?.[fieldId] ?? editableFields[fieldId] ?? "";
  };

  const storedStatusHistory = Array.isArray(job.statusHistory)
    ? job.statusHistory.map((entry: any) => ({
        ...entry,
        statusName: entry.statusName || entry.status || "Unknown status",
        enteredDate: toHistoryDate(entry.enteredAt || entry.createdAt || entry.updatedAt),
      }))
    : [];

  const communicationStatusHistory = communications
    .filter((entry: any) => entry.source === "status" && entry.statusName)
    .map((entry: any) => ({
      id: entry.id,
      statusId: entry.statusId || "",
      statusName: entry.statusName,
      enteredDate: toHistoryDate(entry.createdAt),
      updatedByName: entry.createdByName || "System",
    }))
    .filter((entry: any) => entry.enteredDate)
    .sort((left: any, right: any) => left.enteredDate.getTime() - right.enteredDate.getTime())
    .filter((entry: any, index: number, entries: any[]) =>
      index === 0 || entries[index - 1].statusName !== entry.statusName
    );

  let jobStatusSummaryRows = (storedStatusHistory.length
    ? storedStatusHistory
    : communicationStatusHistory
  ).filter((entry: any) => entry.enteredDate);

  if (!storedStatusHistory.length) {
    const jobCreatedDate = toHistoryDate(job.createdAt);
    const startStatus = statuses.find((status: any) => status.startStatus === true);
    const firstStatusName = startStatus?.name || "Job Booked";
    if (
      jobCreatedDate &&
      (!jobStatusSummaryRows.length || jobStatusSummaryRows[0].statusName !== firstStatusName)
    ) {
      jobStatusSummaryRows = [{
        id: "initial-status",
        statusId: startStatus?.id || "",
        statusName: firstStatusName,
        enteredDate: jobCreatedDate,
        updatedByName: job.createdByName || job.createdBy || "System",
      }, ...jobStatusSummaryRows];
    }
  }

  if (!jobStatusSummaryRows.length) {
    jobStatusSummaryRows = [{
      id: "current-status",
      statusId: job.statusId || "",
      statusName: job.status || "Unknown status",
      enteredDate: toHistoryDate(job.createdAt || job.updatedAt) || new Date(),
      updatedByName: job.updatedByName || job.updatedBy || "System",
    }];
  }

  jobStatusSummaryRows = jobStatusSummaryRows
    .sort((left: any, right: any) => left.enteredDate.getTime() - right.enteredDate.getTime())
    .map((entry: any, index: number, entries: any[]) => ({
      ...entry,
      exitedDate:
        entries[index + 1]?.enteredDate || new Date(),
    }));

  const assignedUserIds: string[] = job.assignedUserIds?.length
    ? job.assignedUserIds
    : [job.assignedUserId || job.assignedTechnicianId || job.technicianId].filter(Boolean);

  const assignedTechnicians = technicians.filter((user: any) =>
    assignedUserIds.includes(user.id)
  );

  const assignedTechnician = assignedTechnicians[0] ||
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

  const assignedUserName = (user: any) =>
    `${user?.firstName || ""} ${user?.surname || user?.lastName || ""}`.trim() || user?.name || "Unnamed User";
  const assignedUserInitials = (user: any) => {
    const parts = assignedUserName(user).split(/\s+/).filter(Boolean);
    return `${parts[0]?.charAt(0) || ""}${parts[1]?.charAt(0) || ""}`.toUpperCase();
  };
  const assignedUserColor = (user: any) =>
    user?.colour || user?.color || user?.profileColor || user?.userColor || "#2563eb";

  const linkedDocumentGroups = [
    { key: "purchase", fieldId: "linkedPurchaseOrder", label: "Purchase Orders", documents: Array.isArray(job.purchaseOrders) ? job.purchaseOrders : [] },
    { key: "quote", fieldId: "linkedQuote", label: "Quotes", documents: Array.isArray(job.quotes) ? job.quotes : [] },
    { key: "invoice", fieldId: "linkedInvoice", label: "Invoices", documents: Array.isArray(job.invoices) ? job.invoices : [] },
    { key: "requisition", fieldId: "linkedPartsRequisition", label: "Parts Requisitions", documents: [] },
    { key: "derequisition", fieldId: "linkedPartsDerequisition", label: "Parts Derequisitions", documents: [] },
  ].map((group) => {
    const collectionItems = linkedItems.filter((item: any) => {
      const type = String(item.documentType || item.type || item.category || item.module || "").toLowerCase();
      if (group.key === "purchase") return type.includes("purchase") || type === "po";
      if (group.key === "requisition") return type === "parts_requisition";
      if (group.key === "derequisition") return type === "parts_derequisition";
      return type.includes(group.key);
    });
    const documents = [...collectionItems, ...group.documents]
      .filter((item: any) => {
        const identity = item.id || item.purchaseOrderNumber || item.referenceNumber || item.documentNumber || item.number;
        return group.key !== "purchase" || collectionItems.length === 0 || Boolean(identity);
      })
      .filter((item, index, items) => {
      const identity = item.id || item.referenceNumber || item.documentNumber || item.number;
      return index === items.findIndex((candidate) =>
        (candidate.id || candidate.referenceNumber || candidate.documentNumber || candidate.number) === identity
      );

      });
    return { ...group, documents };
  }).filter((group) => selectedFields.includes(group.fieldId));
  const linkedDocumentNumber = (document: any, groupKey: string, index: number) => {
    const configuredNumber =
      document.purchaseOrderListNumber ||
      document.quoteListNumber ||
      document.purchaseOrderNumber ||
      document.quoteNumber ||
      document.invoiceNumber ||
      document.requisitionNumber ||
      document.derequisitionNumber ||
      document.referenceNumber ||
      document.documentNumber ||
      document.number ||
      document.code;
    if (configuredNumber) return String(configuredNumber);

    const prefix = groupKey === "purchase" ? "PO" : groupKey === "quote" ? "QT" : groupKey === "invoice" ? "INV" : groupKey === "requisition" ? "REQ" : "DREQ";
    return document.id
      ? `${prefix}-${String(document.id).slice(0, 8).toUpperCase()}`
      : `${prefix}-${String(index + 1).padStart(6, "0")}`;
  };
  const linkedDocumentHref = (groupKey: string, documentId: string) =>
    groupKey === "purchase"
      ? `/purchase-orders/${documentId}`
      : groupKey === "quote"
        ? `/quotes/${documentId}`
        : groupKey === "invoice"
          ? `/invoices/${documentId}`
          : groupKey === "requisition"
            ? `/stock-picking/${documentId}`
            : `/stock-returns/${documentId}`;

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

    <div
      className="min-h-screen bg-[#f5f7fb] p-3"
      onClickCapture={(event) => {
        if (!isJobReadOnly) return;
        const target = event.target as HTMLElement;
        const interactive = target.closest("button, a");
        if (!interactive) return;
        const href = interactive instanceof HTMLAnchorElement ? interactive.getAttribute("href") || "" : "";
        const allowed = interactive.getAttribute("data-closed-job-allowed") === "true" || href === "/jobs" || href.startsWith(`/jobs/${job.id}/jobcard`);
        if (allowed) return;
        event.preventDefault();
        event.stopPropagation();
        alert("Closed jobs are read-only. No changes or amendments are allowed.");
      }}
      onChangeCapture={(event) => {
        if (!isJobReadOnly) return;
        const target = event.target as HTMLElement;
        if (target.getAttribute("data-closed-job-allowed") === "true") return;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {isJobReadOnly && <div className="mx-auto mb-3 max-w-[1700px] rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">Closed job — read-only. An approved user can enable editing without changing its current status.</div>}
      {isRestrictedJob && closedJobEditing && <div className="mx-auto mb-3 max-w-[1700px] rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900">Editing enabled. The job information and status remain unchanged until you explicitly save a change.</div>}

      <div className="mx-auto max-w-[1700px]">

        {/* HEADER */}
        <div className="overflow-visible rounded-3xl border border-gray-200 bg-white shadow-sm">

          <div className="border-b border-gray-200 px-5 py-4">

            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">

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

                  currentStatusId={job.statusId}

                  disabled={!canChangeJobStatus}

                  onChange={
                    requestStatusChange
                  }

                />

              </div>

              <div className="flex flex-wrap items-center gap-3">

                <Link href="/jobs" className="rounded-xl border border-gray-300 bg-white px-5 py-2 text-sm font-bold text-gray-800 hover:bg-gray-50">
                  Back
                </Link>

                <button
                  type="button"
                  onClick={saveJobFields}
                  disabled={saving || !hasUnsavedAmendments}
                  className={`rounded-xl px-5 py-2 text-sm font-bold text-white transition ${hasUnsavedAmendments ? "bg-green-600 hover:bg-green-700" : "cursor-not-allowed bg-gray-300"}`}
                >
                  {saving ? "Saving..." : "Save Job"}
                </button>

                <select
                  data-closed-job-allowed="true"
                  value={jobCardOutputType}
                  onChange={(event) => setJobCardOutputType(event.target.value)}
                  aria-label="Job card type"
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold"
                >
                  {jobCardOutputProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
                </select>

                <Link
                  href={`/jobs/${job.id}/jobcard?type=${jobCardOutputType}`}
                  className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                  title={`View ${jobCardOutputType} job card`}
                >
                  👁 View Job Card
                </Link>

                <Link
                  href={`/jobs/${job.id}/jobcard?type=${jobCardOutputType}&print=1`}
                  className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                  title={`Print ${jobCardOutputType} job card`}
                >
                  🖨 Print Job Card
                </Link>

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

                {!((job.customerSignature || job.jobCardCustomerSignature) && jobCardTerms.some((template: any) => template.hideAfterSigned === true)) && <button
                  type="button"
                  onClick={() => {
                    if (jobCardTerms.length === 0) {
                      alert("No active Customer terms are linked to Direct Job Card in Admin / Terms.");
                      return;
                    }
                    if ((job.customerSignature || job.jobCardCustomerSignature) && !jobCardTerms.every((template: any) => template.allowResign !== false)) {
                      alert("This signed job card cannot be re-signed because re-signing is disabled in Admin / Terms.");
                      return;
                    }
                    setShowJobCardSignatureModal(true);
                  }}
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
                >
                  ✍ {job.customerSignature || job.jobCardCustomerSignature ? "Re-sign Job Card" : "Sign Job Card"}
                </button>}

                <Link
                  href={`/jobs/${job.id}/tasks`}
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
                  ✅ Job Tasks
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
                    data-closed-job-allowed={isRestrictedJob && canOpenClosedJobs ? "true" : undefined}
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
      text-sm
      shadow-2xl
    "
                    >

                      {/* DOCUMENTS */}
                      <div className="border-b border-gray-200 px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-400">

                        Documents

                      </div>

                      <Link
                        href={`/purchase-orders?jobId=${job.id}`}
                        className="block px-5 py-3 text-sm hover:bg-gray-50"
                      >
                        Create Purchase Order
                      </Link>

                      <Link
                        href={`/quotes/new?jobId=${job.id}`}
                        className="block px-5 py-3 text-sm hover:bg-gray-50"
                      >
                        Create Quote
                      </Link>

                      <button
                        type="button"
                        onClick={openLinkQuoteModal}
                        className="block w-full px-5 py-3 text-left text-sm hover:bg-gray-50"
                      >
                        Link Existing Quote
                      </button>

                      <Link
                        href={`/invoices/new?jobId=${job.id}`}
                        className="block px-5 py-3 text-sm hover:bg-gray-50"
                      >
                        Create Invoice
                      </Link>

                      <div className="border-b border-t border-gray-200 px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-400">Stock Forms</div>
                      <button type="button" onClick={() => { setManagementOpen(false); setPendingPartsRequestStatus(statuses.find((status: any) => status.partsRequestWorkflow === true) || { name: "Parts Requisition" }); setTimeout(() => document.getElementById("job-parts-services")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); }} className="block w-full px-5 py-3 text-left text-sm hover:bg-gray-50">Create Parts Requisition</button>
                      <button type="button" onClick={() => { setManagementOpen(false); setShowDerequisitionAction(true); setTimeout(() => document.getElementById("job-parts-services")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); }} className="block w-full px-5 py-3 text-left text-sm hover:bg-gray-50">Create Parts Derequisition</button>
                      {job.activePartsRequestId && <Link href={`/stock-picking/${job.activePartsRequestId}`} className="block px-5 py-3 text-sm font-bold text-blue-700 hover:bg-blue-50">Open Active Parts Requisition</Link>}
                      {job.activePartsReturnId && <Link href={`/stock-returns/${job.activePartsReturnId}`} className="block px-5 py-3 text-sm font-bold text-blue-700 hover:bg-blue-50">Open Active Parts Derequisition</Link>}

                      {/* MANAGEMENT */}
                      <div className="border-b border-t border-gray-200 px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-400">

                        Job Management

                      </div>

                      <button
                        onClick={() => {
                          setManagementOpen(false);
                          setShowCustomerModal(true);
                        }}
                        className="w-full px-5 py-3 text-left text-sm hover:bg-gray-50"
                      >
                        Change Customer
                      </button>

                      <button
                        onClick={() => {
                          setManagementOpen(false);
                          setShowVehicleModal(true);
                        }}
                        className="w-full px-5 py-3 text-left text-sm hover:bg-gray-50"
                      >
                        Change Vehicle
                      </button>

                      <button
                        onClick={() => {
                          setManagementOpen(false);
                          setShowLocationModal(true);
                        }}
                        className="w-full px-5 py-3 text-left text-sm hover:bg-gray-50"
                      >
                        Change Location
                      </button>

                      <button
                        onClick={() => {
                          setManagementOpen(false);
                          setShowPriorityModal(true);
                        }}
                        className="w-full px-5 py-3 text-left text-sm hover:bg-gray-50"
                      >
                        Change Priority
                      </button>

                      <button
                        onClick={() => {
                          setManagementOpen(false);
                          setShowExternalSupplierModal(true);
                        }}
                        className="w-full px-5 py-3 text-left text-sm font-bold text-orange-700 hover:bg-orange-50"
                      >
                        {job.externalServiceProvider
                          ? "Change External Service Provider"
                          : "Convert to External Service Provider"}
                      </button>

                      {/* ACTIONS */}
                      <div className="border-b border-t border-gray-200 px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-400">

                        Actions

                      </div>

                      <button
                        onClick={openReopenJob}
                        className="
    w-full
    px-5
    py-3
    text-left
    text-sm
    hover:bg-gray-50
  "
                      >
                        Re-open Job
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
                        onClick={() => { setManagementOpen(false); setShowCancelModal(true); }}
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

                      {isRestrictedJob && !closedJobEditing && canOpenClosedJobs && <button
                        type="button"
                        data-closed-job-allowed="true"
                        onClick={() => void openClosedJob()}
                        disabled={saving}
                        className="w-full bg-emerald-50 px-5 py-3 text-left text-sm font-black text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        Open Job
                      </button>}

                    </div>

                  )}

                </div>

              </div>

            </div>

          </div>

        </div>

        {/* BODY */}
        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,2fr)_360px]">

          {/* LEFT */}
          <div className="space-y-3">

            {/* CUSTOMER */}
            <div id="job-customer-information" className="scroll-mt-28 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">

              <h2 className="mb-5 text-xl font-bold text-gray-900">
                Customer Information
              </h2>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 text-sm">

                {configuredCustomerFields.map((fieldId) => {
                  const editableJobReferenceField = ["referenceNumber", "customerOrderNumber", "invoiceNumber"].includes(fieldId);
                  return <div key={fieldId}>
                    <div className="mb-1 text-gray-500">
                      {fixedCustomerInformationLabels[fieldId] || editableLabels[fieldId] || fieldDefinitions[fieldId]?.label || fieldId.replace(/([A-Z])/g, " $1")}
                    </div>
                    {editableJobReferenceField ? <input
                      type="text"
                      disabled={isRestrictedJob}
                      value={
                        directlyEditedFieldIds.includes(fieldId)
                          ? editableFields[fieldId] ?? ""
                          : editableFields[fieldId] ?? customerInformationValue(fieldId) ?? ""
                      }
                      onChange={(event) => {
                        setEditableFields({ ...editableFields, [fieldId]: event.target.value });
                        setDirectlyEditedFieldIds((current) => current.includes(fieldId) ? current : [...current, fieldId]);
                        setHasUnsavedAmendments(true);
                      }}
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 font-semibold text-gray-900 outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                    /> : <div className="font-semibold text-gray-900">
                      {String(customerInformationValue(fieldId) || "-")}
                    </div>}
                  </div>;
                })}

                {customerJobFields.map((field) => {
                  const requiredNow =
                    field.required ||
                    field.requiredStatusIds.includes(job.statusId) ||
                    field.requiredStatusIds.includes(job.status);
                  const sharedClass = `w-full rounded-xl border px-3 py-2 font-semibold outline-none focus:border-blue-500 ${
                    requiredNow && !String(customerJobFieldValues[field.id] ?? "").trim()
                      ? "border-amber-400 bg-amber-50"
                      : "border-gray-300 bg-white"
                  }`;

                  return (
                    <label key={field.id} className={field.type === "textarea" ? "md:col-span-2" : ""}>
                      <span className="mb-1 block text-gray-500">
                        {field.label}
                        {requiredNow && <span className="ml-1 font-black text-red-500">*</span>}
                      </span>
                      {field.type === "textarea" ? (
                        <textarea
                          value={customerJobFieldValues[field.id] ?? ""}
                          onChange={(event) => {
                            setCustomerJobFieldValues((current) => ({ ...current, [field.id]: event.target.value }));
                            setHasUnsavedAmendments(true);
                          }}
                          className={`${sharedClass} min-h-24 resize-y`}
                        />
                      ) : (
                        <input
                          type={field.type}
                          value={customerJobFieldValues[field.id] ?? ""}
                          onChange={(event) => {
                            setCustomerJobFieldValues((current) => ({ ...current, [field.id]: event.target.value }));
                            setHasUnsavedAmendments(true);
                          }}
                          className={`${sharedClass} h-11`}
                        />
                      )}
                      {field.requiredStatusIds.length > 0 && !field.required && (
                        <span className="mt-1 block text-[11px] text-gray-400">
                          Required for: {statuses
                            .filter((status: any) => field.requiredStatusIds.includes(status.id))
                            .map((status: any) => status.name)
                            .join(", ")}
                        </span>
                      )}
                    </label>
                  );
                })}

                {configuredCustomerFields.length === 0 && customerJobFields.length === 0 && (
                  <div className="text-gray-500">No customer information fields are enabled in Job Card Manager.</div>
                )}

              </div>

            </div>

            {/* VEHICLE */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">

              <h2 className="mb-3 text-lg font-bold text-gray-900">
                Vehicle Details
              </h2>


              <div className="
grid
grid-cols-1
gap-3
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
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">

              <h2 className="mb-3 text-lg font-bold text-gray-900">
                Job Description
              </h2>

              <div className="mb-3">
                <label className="mb-2 block text-sm font-bold text-gray-700">
                  Job Type *
                </label>

                <select
                  value={job.jobType || ""}
                  disabled={allocatingJobType}
                  onChange={(event) =>
                    updateJobManagementField(
                      "jobType",
                      event.target.value
                    )
                  }
                  className="h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold outline-none focus:border-blue-500 disabled:cursor-wait disabled:bg-gray-100"
                >
                  <option value="" disabled>
                    Select a Job Type
                  </option>

                  {job.jobType &&
                    !jobTypes.some(
                      (jobType) =>
                        jobType.name === job.jobType
                    ) && (
                      <option value={job.jobType}>
                        {job.jobType} (not configured)
                      </option>
                    )}

                  {jobTypes
                    .filter(
                      (jobType) =>
                        jobType.active !== false
                    )
                    .sort((a, b) =>
                      (a.name || "").localeCompare(
                        b.name || ""
                      )
                    )
                    .map((jobType) => (
                      <option
                        key={jobType.id}
                        value={jobType.name || ""}
                      >
                        {jobType.name}
                      </option>
                    ))}
                </select>

                {allocatingJobType && (
                  <p className="mt-2 text-xs font-semibold text-gray-500">
                    Allocating the linked form and tasks...
                  </p>
                )}
              </div>

              <textarea
                value={job.description || ""}
                onChange={(e) =>
                  {
                    setJob({
                      ...job,
                      description:
                        e.target.value,
                    });
                    setHasUnsavedAmendments(true);
                  }
                }
                className="
                  min-h-[110px]
                  w-full
                  rounded-2xl
                  border
                  border-gray-300
                  bg-white
                  px-4
                  py-3
                  text-sm
                  outline-none
                  focus:border-blue-500
                "
                placeholder="Enter job description..."
              />

            </div>


            {/* ADDITIONAL INFORMATION */}
            <div className="mt-3 rounded-xl border bg-white p-4">

              <div className="mb-3 flex min-h-10 flex-wrap items-center justify-between gap-3">
                <h2 className="m-0 text-lg font-bold leading-none">
                  Job Information
                </h2>
                {selectedFields.includes("previousJobNumber") && <label className="flex w-full max-w-md items-center gap-3 text-sm font-semibold text-gray-700">
                  <span className="shrink-0">Previous Job Number</span>
                  <input
                    type="text"
                    value={
                      directlyEditedFieldIds.includes("previousJobNumber")
                        ? editableFields.previousJobNumber ?? ""
                        : editableFields.previousJobNumber ?? job.previousJobNumber ?? job.statusFieldValues?.previousJobNumber ?? ""
                    }
                    onChange={(event) => {
                      setEditableFields({ ...editableFields, previousJobNumber: event.target.value });
                      setDirectlyEditedFieldIds((current) => current.includes("previousJobNumber") ? current : [...current, "previousJobNumber"]);
                      setHasUnsavedAmendments(true);
                    }}
                    placeholder="Enter previous job number"
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal outline-none focus:border-blue-500"
                  />
                </label>}
              </div>


              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">

                <div className="rounded-xl border bg-gray-50 p-3">
                  <div className="text-xs font-black uppercase text-gray-500">Queue Number</div>
                  <div className="mt-1 text-lg font-black text-black">{displayQueueNumber(job.queueNumber) || "Not allocated"}{job.queuePosition ? ` · Position #${job.queuePosition}` : ""}</div>
                </div>

                <div className="rounded-xl border bg-gray-50 p-3">
                  <div className="text-xs font-black uppercase text-gray-500">ETA — Estimated Arrival Time</div>
                  <div className="mt-1 text-sm font-bold text-gray-900">{etaDisplay}</div>
                  {job.estimatedRepairMinutes && <div className="mt-1 text-xs text-gray-500">Includes queued jobs’ repair and round-trip travel, this job’s one-way travel, and a 20-minute dispatch allowance.</div>}
                </div>


                {statusReasonAndNoteEntries.length > 0 && <section className="rounded-xl border border-amber-200 bg-amber-50 p-3 md:col-span-2">
                  <h3 className="text-xs font-black uppercase tracking-wide text-amber-900">Status Reasons and Status Notes</h3>
                  <div className="mt-2 overflow-x-auto rounded-lg border border-amber-200 bg-white">
                    <div className="min-w-[850px]">
                      <div className="grid grid-cols-[0.9fr_1.15fr_2fr_1.15fr_1.25fr] gap-3 border-b border-amber-200 bg-amber-100/70 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-amber-900">
                        <span>Status</span><span>Field</span><span>Details</span><span>Date / Time</span><span>Recorded By</span>
                      </div>
                      {statusReasonAndNoteEntries.map((entry) => {
                        const recordedDate = toHistoryDate(entry.recordedAt);
                        return <div key={entry.key} className="grid grid-cols-[0.9fr_1.15fr_2fr_1.15fr_1.25fr] items-center gap-3 border-b border-amber-100 px-3 py-1.5 text-xs last:border-b-0">
                          <span className="truncate font-bold text-amber-800" title={entry.statusName || "Status update"}>{entry.statusName || "Status update"}</span>
                          <strong className="truncate text-gray-900" title={entry.label}>{entry.label}</strong>
                          <span className="truncate text-gray-800" title={entry.value}>{entry.value}</span>
                          <span className="whitespace-nowrap text-gray-500">{recordedDate ? recordedDate.toLocaleString("en-ZA") : "—"}</span>
                          <span className="truncate text-gray-500" title={entry.recordedByName || ""}>{entry.recordedByName || "—"}</span>
                        </div>;
                      })}
                    </div>
                  </div>
                </section>}

                {/* LOCKED START KM */}
                <div className={selectedFields.includes("startKm") ? "" : "hidden"}>

                  <label className="text-sm font-semibold text-gray-700">
                    🏪 Start KM Reading
                  </label>

                  <input
                    type="text"
                    readOnly={!isAdmin}

                    value={
                      adminKmDrafts.startKm ?? statusFieldHistoryValue("startKm")
                    }
                    onChange={(event) => {
                      if (!isAdmin) return;
                      setAdminKmDrafts((current) => ({ ...current, startKm: event.target.value }));
                      setHasUnsavedAmendments(true);
                    }}
                    title={isAdmin ? "Edit readings separated by #" : "Administrator access is required to edit kilometre readings"}

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
                <div className={selectedFields.includes("endKm") ? "" : "hidden"}>

                  <label className="text-sm font-semibold text-gray-700">
                    🏁 End KM Reading
                  </label>

                  <input
                    type="text"
                    readOnly={!isAdmin}

                    value={
                      adminKmDrafts.endKm ?? statusFieldHistoryValue("endKm")
                    }
                    onChange={(event) => {
                      if (!isAdmin) return;
                      setAdminKmDrafts((current) => ({ ...current, endKm: event.target.value }));
                      setHasUnsavedAmendments(true);
                    }}
                    title={isAdmin ? "Edit readings separated by #" : "Administrator access is required to edit kilometre readings"}

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
                {configuredJobInformationFields

                  .map((fieldId: string) => (


                    <div key={fieldId}>


                      <label className="text-sm font-semibold text-gray-700">

                        {
                          editableLabels[fieldId] ||
                          fieldDefinitions[fieldId]?.label ||
                          fieldId.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (character: string) => character.toUpperCase())
                        }

                      </label>


                      <input

                        value={
                          directlyEditedFieldIds.includes(fieldId)
                            ? editableFields[fieldId] ?? ""
                            : statusFieldHistoryValue(
                                fieldId,
                                editableFields[fieldId] ?? job.statusFieldValues?.[fieldId] ?? fieldDefinitions[fieldId]?.value ?? ""
                              )
                        }

                        onChange={(e) => {

                          setEditableFields({

                            ...editableFields,

                            [fieldId]:
                              e.target.value,

                          });
                          setDirectlyEditedFieldIds((current) =>
                            current.includes(fieldId) ? current : [...current, fieldId]
                          );
                          setHasUnsavedAmendments(true);

                        }}

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
                {false && statusFields

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


                        onChange={(e) => {

                          setJob({

                            ...job,

                            statusFieldValues: {

                              ...(job.statusFieldValues || {}),

                              [field.id]:
                                e.target.value,

                            },

                          });
                          setHasUnsavedAmendments(true);

                        }}


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
            <div id="job-parts-services" className={`scroll-mt-24 rounded-2xl border bg-white p-6 shadow-sm ${pendingPartsRequestStatus ? "border-blue-500 ring-2 ring-blue-100" : showDerequisitionAction ? "border-indigo-500 ring-2 ring-indigo-100" : "border-gray-200"}`}>

              {pendingPartsRequestStatus && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
                <div><p className="font-black text-blue-950">Parts required for {pendingPartsRequestStatus.name}</p><p className="mt-1 text-sm text-blue-700">Add every required part or service below, then send the picking request.</p></div>
                <div className="flex gap-2"><button type="button" onClick={() => setPendingPartsRequestStatus(null)} className="rounded-xl border border-blue-300 bg-white px-4 py-2 font-bold text-blue-800">Cancel</button><button type="button" disabled={sendingPartsRequest || materials.length === 0} onClick={() => void sendPartsRequest()} className="rounded-xl bg-blue-600 px-4 py-2 font-black text-white disabled:opacity-40">{sendingPartsRequest ? "Sending…" : "Send Parts Requisition"}</button></div>
              </div>}

              {showDerequisitionAction && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4"><div><p className="font-black text-indigo-950">Parts Derequisition{pendingUnusedPartsStatus ? ` required for ${pendingUnusedPartsStatus.name}` : ""}</p><p className="mt-1 text-sm text-indigo-700">Mark every unused issued material in the Return column, then create the derequisition.</p>{!materials.some((item: any) => item.stockIssued === true) && <p className="mt-2 font-bold text-amber-700">The inventory is shown below, but no lines have been issued by the stock picker yet. Issued stock must be signed off before it can be returned.</p>}</div><div className="flex gap-2"><button type="button" onClick={() => { setShowDerequisitionAction(false); setPendingUnusedPartsStatus(null); setReturnMaterialIds([]); }} className="rounded-xl border border-indigo-300 bg-white px-4 py-2 font-bold text-indigo-800">Cancel</button><button type="button" disabled={creatingDerequisition || returnMaterialIds.length === 0} onClick={() => void createDerequisitionSlip()} className="rounded-xl bg-indigo-600 px-4 py-2 font-black text-white disabled:opacity-40">{creatingDerequisition ? "Creating…" : "Parts Derequisition"}</button></div></div>}

              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-bold">
                  📦 Inventory (Parts & Services)
                </h2>
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-bold text-gray-800">
                  <input
                    type="checkbox"
                    data-ignore-dirty="true"
                    checked={job.noPartsUsed === true}
                    onChange={(event) => void updateNoPartsUsed(event.target.checked)}
                    className="h-5 w-5 rounded border-gray-300 accent-blue-600"
                  />
                  No Parts Used
                </label>
              </div>


              <table className="w-full text-sm">

                <colgroup>
                  <col className="w-[11%]" />
                  <col className="w-[31%]" />
                  <col className="w-[9%]" />
                  <col className="w-[12%]" />
                  <col className="w-[11%]" />
                  <col className="w-[16%]" />
                  <col className="w-[6%]" />
                  <col className="w-[4%]" />
                </colgroup>

                <thead>

                  <tr className="border-b text-left text-gray-500">

                    <th>Part Number</th>

                    <th>Description</th>

                    <th>Qty</th>

                    <th>Sell Price</th>

                    <th>Total</th>

                    <th>Used From</th>

                    <th className="text-center">Return</th>

                    <th className="w-12 text-right">Action</th>

                  </tr>

                </thead>


                <tbody>

                  {materials.map(
                    (item: any) => (

                      <tr
                        key={item.id}
                        className={`border-b ${item.used ? "bg-gray-100 text-gray-400 opacity-70" : ""}`}
                      >


                        {/* PART NUMBER */}
                        <td className="py-2">

                          {item.partNumber}

                        </td>



                        {/* DESCRIPTION */}
                        <td className="py-2 pr-4 align-top">

                          <div>{item.description}</div>
                          {item.serialNumber && <div className="mt-0.5 font-mono text-[10px] font-semibold leading-tight text-gray-500">Serial: {item.serialNumber}</div>}
                          {item.used && <span className="mt-1 inline-block rounded bg-gray-300 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-600">Used</span>}

                        </td>



                        {/* QTY EDITABLE */}
                        <td>

                          <input

                            type="number"

                            disabled={item.used && (!canCorrectUsedMaterials || Boolean(item.serialId))}

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

                            disabled={item.used && !canCorrectUsedMaterials}

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

                            disabled={item.used && !canCorrectUsedMaterials}

                            value={
                              item.sourceId || ""
                            }

                            onChange={(e) => {


                              const selected =
                                stockLocations.find(
                                  x => x.id === e.target.value
                                );


                              if (!selected) return;
                              if (item.used) {
                                void updateUsedMaterialSource(item, selected);
                              } else {
                                updateMaterial(item.id, "sourceId", selected.id);
                                updateMaterial(item.id, "sourceName", selected.name);
                                updateMaterial(item.id, "sourceType", selected.type);
                              }


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

                        <td className="text-center">
                          {item.stockIssued === true ? <input type="checkbox" checked={returnMaterialIds.includes(item.id)} onChange={(event) => setReturnMaterialIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} className="h-5 w-5 rounded accent-blue-600" title="Mark this issued item as unused and return it" /> : <span className="text-gray-300" title="This item has not been issued by the stock picker">—</span>}
                        </td>

                        <td className="py-2 text-right">
                          <button
                            type="button"
                            onClick={() => void deleteMaterialLine(item)}
                            disabled={item.used === true && !canCorrectUsedMaterials}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-gray-300"
                            title={item.used && !canCorrectUsedMaterials ? "Permission required to delete a used line" : "Delete line"}
                            aria-label={`Delete ${item.partNumber || item.description || "inventory"} line`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
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

                data-enter-newline="true"
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  event.stopPropagation();
                  const field = event.currentTarget;
                  const start = field.selectionStart;
                  const end = field.selectionEnd;
                  setNewNote((current) => `${current.slice(0, start)}\n${current.slice(end)}`);
                  window.requestAnimationFrame(() => field.setSelectionRange(start + 1, start + 1));
                }}

                placeholder="Enter Job Note..."

                className="
w-full
border
rounded-xl
p-4
min-h-[120px]
"

              />

              <div className="mt-3 grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-2">
                <div>
                  <div className="mb-2 text-sm font-bold text-gray-700">Comment visibility</div>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm"><input type="radio" name="noteVisibility" checked={noteVisibility === "internal"} onChange={() => setNoteVisibility("internal")} />Internal</label>
                    <label className="flex items-center gap-2 text-sm"><input type="radio" name="noteVisibility" checked={noteVisibility === "public"} onChange={() => setNoteVisibility("public")} />Public</label>
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-sm font-bold text-gray-700">Email this message</div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={emailNoteToCustomer} onChange={(event) => setEmailNoteToCustomer(event.target.checked)} />Customer contact</label>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={emailNoteToUsers} onChange={(event) => setEmailNoteToUsers(event.target.checked)} />Assigned users</label>
                  </div>
                </div>
                {(emailNoteToCustomer || emailNoteToUsers) && <label className="md:col-span-2 text-sm font-bold text-gray-700">
                  Message template
                  <select value={selectedNoteTemplate} onChange={(event) => setSelectedNoteTemplate(event.target.value)} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal">
                    <option value="">Select an Admin Messages template</option>
                    {messageTemplates.filter((template: any) => !template.module || template.module === "JobCard").map((template: any) => <option key={template.id} value={template.id}>{template.name}</option>)}
                  </select>
                  <span className="mt-1 block text-xs font-normal text-gray-500">Use {"{{notes}}"} or {"{{comment}}"} in the template to insert this comment.</span>
                </label>}
              </div>


              <button

                onClick={saveJobNote}

                disabled={savingNote}

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


                {[...jobNotes].sort((left, right) => (toHistoryDate(right.createdAt)?.getTime() || 0) - (toHistoryDate(left.createdAt)?.getTime() || 0)).map(note => {
                  const createdDate = note.createdAt?.toDate?.();
                  const isEditing = editingNoteId === note.id;
                  return <div key={note.id} className="grid grid-cols-[minmax(110px,0.7fr)_minmax(0,2.8fr)_auto_auto] items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs">
                    <span className="truncate font-black text-gray-900" title={note.createdByName || "System"}>{note.createdByName || "System"}</span>
                    {isEditing ? <textarea autoFocus rows={2} data-enter-newline="true" value={editingNoteText} onChange={(event) => setEditingNoteText(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { setEditingNoteId(""); setEditingNoteText(""); return; } if (event.key !== "Enter") return; event.preventDefault(); event.stopPropagation(); const field = event.currentTarget; const start = field.selectionStart; const end = field.selectionEnd; setEditingNoteText((current) => `${current.slice(0, start)}\n${current.slice(end)}`); window.requestAnimationFrame(() => field.setSelectionRange(start + 1, start + 1)); }} className="min-h-12 min-w-0 resize-y rounded-md border bg-white px-2 py-1 text-xs" /> : <span className="truncate text-gray-700" title={note.comment || note.text || ""}>{note.comment || note.text || "—"}{note.editedAt && <em className="ml-1 text-[9px] text-gray-400">(edited)</em>}</span>}
                    <span className="whitespace-nowrap text-[10px] font-bold text-gray-400">{createdDate ? formatDateTime24(createdDate) : "Pending"}</span>
                    <span className="flex gap-1">{isEditing ? <><button type="button" disabled={savingNoteEdit} onClick={() => void saveEditedJobNote(note)} className="rounded-md bg-blue-600 px-2 py-1 font-black text-white disabled:opacity-40">Save</button><button type="button" disabled={savingNoteEdit} onClick={() => { setEditingNoteId(""); setEditingNoteText(""); }} className="rounded-md border px-2 py-1 font-bold">Cancel</button></> : <button type="button" onClick={() => { setEditingNoteId(note.id); setEditingNoteText(note.comment || note.text || ""); }} className="rounded-md border px-2 py-1 font-bold text-blue-700">Edit</button>}</span>
                  </div>;
                })}


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
          <div className="space-y-3">


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
            <div className="relative rounded-xl border border-gray-200 bg-white p-3 shadow-sm">

              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-base font-bold text-gray-900">Assigned Users</h2>
                <button
                  type="button"
                  onClick={() => setAssignedUsersOpen((current) => !current)}
                  aria-label="Select assigned users"
                  aria-expanded={assignedUsersOpen}
                  className="flex size-7 items-center justify-center rounded-lg border border-gray-300 bg-white text-xs font-black text-gray-700 hover:bg-gray-50"
                >
                  {assignedUsersOpen ? "▲" : "▼"}
                </button>
              </div>

              {assignedUsersOpen && <div className="absolute left-3 right-3 top-12 z-50 max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
                {technicians.map((tech: any) => {
                  const selected = assignedUserIds.includes(tech.id);
                  return <button
                    key={tech.id}
                    type="button"
                    onClick={() => void changeTechnician(tech)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-gray-50 ${selected ? "bg-blue-50" : ""}`}
                  >
                    <input type="checkbox" checked={selected} readOnly className="size-4" />
                    <UserAvatar user={tech} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-gray-900">{assignedUserName(tech)}</span>
                  </button>;
                })}
                {technicians.length === 0 && <div className="p-3 text-xs text-gray-400">No users available.</div>}
              </div>}

              {assignedTechnician ? (

                <>

                <div className="flex items-center rounded-lg bg-gray-50 px-2 py-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <UserAvatar user={assignedTechnician} size="sm" />
                    <span className="truncate text-xs font-bold text-gray-900">{assignedUserName(assignedTechnician)}</span>
                  </div>
                </div>

                {assignedTechnicians.slice(1).map((user: any) => (
                  <div key={user.id} className="mt-1 flex items-center rounded-lg bg-gray-50 px-2 py-1.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <UserAvatar user={user} size="sm" />
                      <span className="truncate text-xs font-bold text-gray-900">{assignedUserName(user)}</span>
                    </div>
                  </div>
                ))}

                </>

              ) : (

                <div className="text-sm text-gray-400">
                  No Users Assigned
                </div>

              )}

            </div>

            {/* LINKED ITEMS */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">


              <h2 className="text-xl font-bold mb-5">

                🔗 Linked Items

              </h2>


              <div className="space-y-4">
                {linkedDocumentGroups.map((group) => (
                  <section key={group.key}>
                    <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-gray-500">{group.label}</h3>
                    <div className="space-y-2">
                      {group.documents.map((document: any, index: number) => {
                        const number = linkedDocumentNumber(document, group.key, index);
                        if (document.id) {
                          return <Link key={document.id} href={linkedDocumentHref(group.key, document.id)} className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-left hover:border-blue-300 hover:bg-blue-50">
                            <span className="text-sm font-bold text-gray-900">{group.label.slice(0, -1)}: <span className="text-blue-600 underline">{number}</span></span>
                            <span className="text-xs font-bold text-blue-600">Open</span>
                          </Link>;
                        }
                        return <button key={document.id || `${group.key}-${number}-${index}`} type="button" onClick={() => setSelectedLinkedItem({ ...document, groupLabel: group.label, displayNumber: number })} className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-left hover:border-blue-300 hover:bg-blue-50">
                          <span className="text-sm font-bold text-gray-900">{group.label.slice(0, -1)}: {number}</span>
                          <span className="text-xs font-bold text-blue-600">Open</span>
                        </button>;
                      })}
                      {group.documents.length === 0 && <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-gray-400">None linked</div>}
                    </div>
                  </section>
                ))}
              </div>


            </div>

            {/* STANDARD PARTS COST SUMMARY — CONTROLLED BY JOBCARD MANAGER VIEW */}
            {selectedFields.includes("jobCosting") && <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-5 text-xl font-bold">💰 Job Summary / Costing</h2>
              <div className="space-y-3 text-sm">
                <div>Parts Cost Total: R {bookedPartsCostTotal.toFixed(2)}</div>
                <div>Travelling Cost (CPK): R {configuredRateTotals.travellingCost.toFixed(2)}</div>
                <div>Total Travelling: {totalTravellingKm.toLocaleString()} km</div>
                <hr />
                <div className="font-black">Total Cost: R {(bookedPartsCostTotal + configuredRateTotals.travellingCost).toFixed(2)}</div>
              </div>
            </div>}

            {/* JOB PRICING SUMMARY — PERMISSION CONTROLLED */}
            {canViewJobPricing && selectedFields.includes("jobPricing") && <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">


              <h2 className="text-xl font-bold mb-5">

                💰 Job Summary / Job Pricing

              </h2>


              <div className="space-y-3 text-sm">


                <div>
                  Parts Total:
                  R {bookedPartsSellingTotal.toFixed(2)}
                </div>


                <div>
                  Labour:
                  R {displayedLabourTotal.toFixed(2)}
                </div>


                <div>
                  Travel:
                  R {displayedTravelTotal.toFixed(2)}
                </div>

                {hasConfiguredCompanyRates && <div className="ml-3 space-y-1 text-xs text-gray-500">
                  <div>Travel time: R {configuredRateTotals.travelTime.toFixed(2)}</div>
                  <div>Travelling distance: R {configuredRateTotals.travelling.toFixed(2)}</div>
                </div>}

                <div className="font-bold">
                  Total Travelling:
                  {" "}{totalTravellingKm.toLocaleString()} km
                </div>


                <hr />


                <div className="font-black">

                  Total:
                  R {(hasConfiguredCompanyRates ? displayedJobTotal : Number(job.total || 0)).toFixed(2)}

                </div>


              </div>


            </div>}

          </div>
          {/* END RIGHT */}


        </div>
        {/* END BODY GRID */}


      </div>
      {/* END MAIN CONTAINER */}


      {/* CUSTOMER MODAL */}
      {showLinkQuoteModal && (
        <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowLinkQuoteModal(false)}>
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-wide text-blue-600">Job {job.jobNumber || job.id}</div>
                <h2 className="text-2xl font-black text-gray-900">Link Existing Quote</h2>
              </div>
              <button type="button" onClick={() => setShowLinkQuoteModal(false)} className="rounded-lg px-3 py-2 text-xl font-bold text-gray-500 hover:bg-gray-100">×</button>
            </div>

            <div className="max-h-[60vh] space-y-3 overflow-y-auto">
              {availableQuotes.map((quote: any) => {
                const quoteNumber = quote.quoteNumber || quote.referenceNumber || quote.documentNumber || quote.quoteListNumber;
                return (
                  <button
                    key={quote.id}
                    type="button"
                    disabled={linkingQuoteId === quote.id}
                    onClick={() => linkExistingQuote(quote)}
                    className="flex w-full items-center justify-between rounded-2xl border border-gray-200 p-4 text-left hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
                  >
                    <span>
                      <span className="block font-black text-blue-700">{quoteNumber}</span>
                      <span className="mt-1 block text-sm text-gray-600">{quote.customerName || "No customer"}</span>
                      {quote.description && <span className="mt-1 block text-xs text-gray-400">{quote.description}</span>}
                    </span>
                    <span className="text-sm font-bold text-blue-600">{linkingQuoteId === quote.id ? "Linking…" : "Link"}</span>
                  </button>
                );
              })}
              {availableQuotes.length === 0 && (
                <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-gray-500">
                  No unlinked quotes are available.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedLinkedItem && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedLinkedItem(null)}>
          <div className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <div className="text-xs font-black uppercase tracking-wide text-blue-600">{selectedLinkedItem.groupLabel}</div>
                <h2 className="text-2xl font-black text-gray-900">{selectedLinkedItem.displayNumber}</h2>
              </div>
              <button type="button" onClick={() => setSelectedLinkedItem(null)} className="rounded-lg px-3 py-2 text-xl font-bold text-gray-500 hover:bg-gray-100">×</button>
            </div>
            <div className="max-h-[calc(85vh-76px)] overflow-y-auto p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {Object.entries(selectedLinkedItem)
                  .filter(([key, value]) => !["id", "groupLabel", "displayNumber", "lines", "items"].includes(key) && value !== null && value !== undefined && typeof value !== "object")
                  .map(([key, value]) => <div key={key} className="rounded-xl border bg-gray-50 p-3"><div className="text-xs font-bold uppercase text-gray-500">{key.replace(/([A-Z])/g, " $1")}</div><div className="mt-1 font-semibold text-gray-900">{String(value)}</div></div>)}
              </div>
              {(selectedLinkedItem.lines || selectedLinkedItem.items)?.length > 0 && (
                <div className="mt-5 overflow-x-auto rounded-xl border">
                  <table className="w-full text-left text-sm"><thead className="bg-gray-50"><tr><th className="p-3">Description</th><th className="p-3">Quantity</th><th className="p-3">Price</th><th className="p-3">Total</th></tr></thead><tbody>{(selectedLinkedItem.lines || selectedLinkedItem.items).map((line: any, index: number) => <tr key={line.id || index} className="border-t"><td className="p-3">{line.description || line.name || line.item || "-"}</td><td className="p-3">{line.quantity ?? "-"}</td><td className="p-3">{line.price ?? line.unitPrice ?? "-"}</td><td className="p-3">{line.total ?? line.lineTotal ?? "-"}</td></tr>)}</tbody></table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showJobCardSignatureModal && <DirectJobCardSignatureModal
        terms={jobCardTerms}
        signatureLabel={String(jobCardTerms.find((template: any) => String(template.name || "").trim())?.name || "Customer Name and Surname")}
        initialSignature={job.customerSignature || job.jobCardCustomerSignature || ""}
        allowResign={jobCardTerms.every((template: any) => template.allowResign !== false)}
        onClose={() => setShowJobCardSignatureModal(false)}
        onSave={async ({ name, signature }) => {
          const acceptedTerms = jobCardTerms.map((template: any) => template.termsText || "").filter(Boolean).join("\n\n");
          const signedAt = new Date().toISOString();
          await updateDoc(doc(clientDb, "companies", COMPANY_ID, "jobs", job.id), {
            customerSignatory: name,
            customerSignature: signature,
            jobCardCustomerSignature: signature,
            jobCardCustomerSignatureTerms: acceptedTerms,
            jobCardCustomerSignatureTermsIds: jobCardTerms.map((template: any) => template.id),
            jobCardCustomerSignedAt: signedAt,
            jobCardCustomerSignatureMethod: "direct-job-card",
            updatedAt: serverTimestamp(),
          });
          setJob({
            ...job,
            customerSignatory: name,
            customerSignature: signature,
            jobCardCustomerSignature: signature,
            jobCardCustomerSignatureTerms: acceptedTerms,
            jobCardCustomerSignedAt: signedAt,
            jobCardCustomerSignatureMethod: "direct-job-card",
          });
          setShowJobCardSignatureModal(false);
        }}
      />}

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

                {vehicles.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm font-semibold text-gray-500">
                    No vehicles are linked to this customer.
                  </div>
                )}

                {vehicles.map((vehicle) => (

                  <button
                    key={vehicle.id}
                    onClick={() =>
                      changeVehicle(vehicle)
                    }
                    className="mb-3 w-full rounded-2xl border border-gray-200 p-5 text-left hover:bg-gray-50"
                  >

                    <div className="font-bold">
                      {vehicle.regNo || vehicle.vehicleReg || "Registration not set"}
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
                Select Assigned Users
              </h2>

              {technicians.map((tech: any) => (

                <button
                  key={tech.id}
                  onClick={() => changeTechnician(tech)}
                  className={`
w-full
flex
items-center
gap-3
p-3
rounded-xl
hover:bg-gray-100
${assignedUserIds.includes(tech.id) ? "bg-blue-50 ring-2 ring-blue-500" : ""}
`}
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
      {showCancelModal && (() => {
        const cancelledStatus = statuses.find((status: any) => /cancelled|canceled/i.test(String(status.name || "")));
        const compatibleReasons = cancellationReasons.filter((reason) => {
          const linked = String(reason.linkedStatus || "").trim().toLowerCase();
          const ids = Array.isArray(reason.linkedStatusIds) ? reason.linkedStatusIds.map(String) : [];
          const names = Array.isArray(reason.linkedStatusNames) ? reason.linkedStatusNames.map((name) => String(name).toLowerCase()) : [];
          return (!linked && ids.length === 0 && names.length === 0) || ids.includes(String(cancelledStatus?.id || "")) || names.some((name) => /cancelled|canceled/.test(name)) || linked === String(cancelledStatus?.id || "").toLowerCase() || /cancelled|canceled/.test(linked);
        });
        return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
            <h2 className="text-2xl font-black text-gray-950">Cancel Job</h2>
            <p className="mt-2 text-sm text-gray-600">Select the cancellation reason. The next screen will let you choose a message template and send it to the customer and assigned users.</p>
            <label className="mt-6 block text-sm font-black text-gray-700">Cancellation reason
              <select value={selectedCancellationReasonId} onChange={(event) => setSelectedCancellationReasonId(event.target.value)} className="mt-2 h-12 w-full rounded-xl border-2 border-gray-200 bg-white px-4">
                <option value="">Select a reason</option>
                {compatibleReasons.map((reason) => <option key={reason.id} value={reason.id}>{reason.name}</option>)}
              </select>
            </label>
            {compatibleReasons.length === 0 && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800">No active cancellation reasons are configured in Admin / Reasons.</p>}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" disabled={cancellingJob} onClick={() => { setShowCancelModal(false); setSelectedCancellationReasonId(""); }} className="rounded-xl border px-5 py-3 font-bold">Keep Job Open</button>
              <button type="button" disabled={cancellingJob || !selectedCancellationReasonId} onClick={() => void cancelJob()} className="rounded-xl bg-red-600 px-5 py-3 font-black text-white disabled:opacity-40">{cancellingJob ? "Cancelling…" : "Continue to Message"}</button>
            </div>
          </div>
        </div>;
      })()}

      {showReopenModal && (() => {
        const reopenedStatus = statuses.find((status: any) =>
          String(status.name || "").replace(/[^a-z0-9]/gi, "").toLowerCase() === "reopened"
        );
        const compatibleReasons = cancellationReasons.filter((reason) => {
          const linked = String(reason.linkedStatus || "").trim().toLowerCase();
          const ids = Array.isArray(reason.linkedStatusIds) ? reason.linkedStatusIds.map(String) : [];
          const names = Array.isArray(reason.linkedStatusNames) ? reason.linkedStatusNames.map((name) => String(name).replace(/[^a-z0-9]/gi, "").toLowerCase()) : [];
          const jobTypeMatches = !reason.linkedJobType || reason.linkedJobType === job.jobType || reason.linkedJobType === job.jobTypeName;
          return jobTypeMatches && (
            ids.includes(String(reopenedStatus?.id || "")) ||
            names.includes("reopened") ||
            linked === String(reopenedStatus?.id || "").toLowerCase() ||
            linked.replace(/[^a-z0-9]/gi, "") === "reopened"
          );
        });
        const selectedReason = compatibleReasons.find((reason) => reason.id === selectedReopenReasonId);
        return <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/55 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <h2 className="text-2xl font-black text-gray-950">Re-open Job</h2>
            <p className="mt-2 text-sm text-gray-600">Select the configured reason and confirm who must be assigned. Saving changes the job status to Re-opened and runs its configured status messages.</p>

            {!reopenedStatus && <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-800">No active “Re-opened” status exists. Create it in Admin → Statuses first.</p>}

            <label className="mt-5 block text-sm font-black text-gray-700">Re-open reason setup
              <select
                value={selectedReopenReasonId}
                onChange={(event) => { setSelectedReopenReasonId(event.target.value); setReopenReasonValue(""); }}
                className="mt-2 h-12 w-full rounded-xl border-2 border-gray-200 bg-white px-4"
              >
                <option value="">Select a configured reason</option>
                {compatibleReasons.map((reason) => <option key={reason.id} value={reason.id}>{reason.name}</option>)}
              </select>
            </label>
            {reopenedStatus && compatibleReasons.length === 0 && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-800">No active Status Reason is linked to Re-opened for this job type. Configure one in Admin → Status Reasons.</p>}

            {selectedReason && <label className="mt-5 block text-sm font-black text-gray-700">{selectedReason.name} *
              {selectedReason.fieldType === "dropdown" ? <select
                value={reopenReasonValue}
                onChange={(event) => setReopenReasonValue(event.target.value)}
                className="mt-2 h-12 w-full rounded-xl border-2 border-gray-200 bg-white px-4"
              >
                <option value="">Select reason</option>
                {(selectedReason.dropdownOptions || []).map((option) => <option key={option} value={option}>{option}</option>)}
              </select> : <textarea
                value={reopenReasonValue}
                onChange={(event) => setReopenReasonValue(event.target.value)}
                rows={3}
                placeholder="Enter the reason for re-opening this job"
                className="mt-2 w-full rounded-xl border-2 border-gray-200 p-4"
              />}
            </label>}

            <div className="mt-6">
              <p className="text-sm font-black text-gray-700">Assigned users *</p>
              <p className="mt-1 text-xs text-gray-500">The current users are preselected. Keep them or assign different users.</p>
              <div className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-xl border p-2">
                {technicians.map((tech: any) => {
                  const name = tech.name || tech.displayName || `${tech.firstName || ""} ${tech.lastName || tech.surname || ""}`.trim() || tech.email;
                  const checked = reopenAssignedUserIds.includes(tech.id);
                  return <label key={tech.id} className={`flex cursor-pointer items-center gap-3 rounded-xl p-3 ${checked ? "bg-blue-50 ring-1 ring-blue-400" : "hover:bg-gray-50"}`}>
                    <input type="checkbox" checked={checked} onChange={(event) => setReopenAssignedUserIds((current) => event.target.checked ? [...current, tech.id] : current.filter((id) => id !== tech.id))} className="size-5 accent-blue-600" />
                    <span><strong className="block">{name}</strong><small className="text-gray-500">{tech.primaryRole || tech.role || tech.email}</small></span>
                  </label>;
                })}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t pt-5">
              <button type="button" disabled={reopeningJob} onClick={() => setShowReopenModal(false)} className="rounded-xl border px-5 py-3 font-bold">Cancel</button>
              <button type="button" disabled={reopeningJob || !reopenedStatus || !selectedReason || !reopenReasonValue.trim() || reopenAssignedUserIds.length === 0} onClick={() => void reopenJob()} className="rounded-xl bg-blue-600 px-5 py-3 font-black text-white disabled:opacity-40">{reopeningJob ? "Re-opening…" : "Re-open Job"}</button>
            </div>
          </div>
        </div>;
      })()}

      {showPriorityModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-3xl bg-white p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-2xl font-black">Change Priority</h2>
              <button onClick={() => setShowPriorityModal(false)}>×</button>
            </div>
            <div className="space-y-2">
              {["Low", "Normal", "High", "Urgent"].map((priority) => (
                <button
                  key={priority}
                  onClick={() => updateJobManagementField("priority", priority)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-left font-semibold hover:bg-gray-50"
                >
                  {priority}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showExternalSupplierModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black">Convert to External Service Provider</h2>
                <p className="mt-1 text-sm text-gray-500">Repair time, travel time and ETA will be disabled. The supplier-linked status and message template will be used.</p>
              </div>
              <button onClick={() => setShowExternalSupplierModal(false)} disabled={convertingExternal}>×</button>
            </div>
            <div className="max-h-[500px] space-y-2 overflow-y-auto">
              {externalSuppliers.map((supplier) => {
                const configured = Boolean(supplier.email && supplier.externalJobStatusId && supplier.externalJobMessageTemplateId);
                return <button key={supplier.id} disabled={!configured || convertingExternal} onClick={() => convertToExternalServiceProvider(supplier)} className="w-full rounded-xl border border-gray-200 px-4 py-3 text-left hover:bg-orange-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400">
                  <span className="block font-bold">{supplier.supplierCode ? `${supplier.supplierCode} - ` : ""}{supplier.supplierName}</span>
                  <span className="mt-1 block text-xs">{configured ? `${supplier.externalJobStatusName || "Linked status"} · ${supplier.email}` : "Configure supplier email, external status and message template first"}</span>
                </button>;
              })}
              {!externalSuppliers.length && <p className="py-8 text-center text-sm text-gray-500">No suppliers have been configured.</p>}
            </div>
          </div>
        </div>
      )}

      {showJobTypeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-2xl font-black">Change Job Type</h2>
              <button onClick={() => setShowJobTypeModal(false)}>×</button>
            </div>
            <div className="max-h-[500px] space-y-2 overflow-y-auto">
              {jobTypes.length ? jobTypes
                .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
                .map((jobType) => (
                  <button
                    key={jobType.id}
                    onClick={() => updateJobManagementField("jobType", jobType.name || "")}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-left font-semibold hover:bg-gray-50"
                  >
                    {jobType.name}
                  </button>
                )) : (
                <p className="py-8 text-center text-sm text-gray-500">No job types have been configured yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

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


              {configuredPendingStatusFields.map(
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

                  if (fixedField.id === "assignedUsers") {
                    const assignedNames = (job.assignedUsers || [])
                      .map((user: any) => `${user.firstName || ""} ${user.surname || user.lastName || ""}`.trim() || user.name || user.displayName || user.email)
                      .filter(Boolean)
                      .join(", ") || job.assignedTo || "No users assigned";
                    return <div key={fixedField.id} className="mb-4 rounded-xl border bg-gray-50 p-3"><div className="font-semibold">{fixedField.label}{fixedField.required && <span className="text-red-500"> *</span>}</div><div className="mt-1 text-sm text-gray-600">{assignedNames}</div></div>;
                  }


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


                      {fixedField.type === "select" || fixedField.type === "dropdown" ? (
                        <select
                          value={statusFormValues[fixedField.id] || ""}
                          onChange={(event) => setStatusFormValues({
                            ...statusFormValues,
                            [fixedField.id]: event.target.value,
                          })}
                          className="mt-2 w-full rounded-xl border bg-white p-3"
                        >
                          <option value="">Select {fixedField.label}</option>
                          {(fixedField.options || []).map((option: string) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={fixedField.type === "number" ? "number" : "text"}
                          value={statusFormValues[fixedField.id] || ""}
                          onChange={(event) => setStatusFormValues({
                            ...statusFormValues,
                            [fixedField.id]: event.target.value,
                          })}
                          className="mt-2 w-full rounded-xl border p-3"
                        />
                      )}

                    </div>

                  );

                }
              )}

              <button

                onClick={async () => {


                  const missingFields =
                    configuredPendingStatusFields.filter(
                      (f: any) =>
                        f.required &&
                        (f.id === "assignedUsers"
                          ? !(job.assignedUserIds?.length || job.assignedUsers?.length || job.assignedUserId || job.assignedTo)
                          : String(statusFormValues[f.id] ?? "").trim() === "")
                    );

                  const outstandingStatusFields = [
                    ...missingFields.map((field: any) => field.label || field.id),
                  ];

                  if (outstandingStatusFields.length > 0) {
                    alert(
                      `Complete all required fields before changing status:\n\n${outstandingStatusFields
                        .map((fieldLabel) => `• ${fieldLabel}`)
                        .join("\n")}`
                    );
                    return;
                  }

                  try {
                    await markJobMaterialsUsed(pendingStatus);
                  } catch (error) {
                    const message = error instanceof Error
                      ? error.message
                      : "The job materials could not be marked as used. Please check the available stock and try again.";
                    if (message.startsWith("Insufficient stock for ")) {
                      console.warn(message);
                    } else {
                      console.error("Unable to mark job materials as used:", error);
                    }
                    alert(
                      message
                    );
                    return;
                  }

                  await handleStatusTimer(
                    pendingStatus
                  );

                  const formAllocationUpdates =
                    await allocateStatusForm(pendingStatus);
                  const formsForStatus = Array.isArray(formAllocationUpdates.jobForms)
                    ? formAllocationUpdates.jobForms
                    : Array.isArray(job.jobForms)
                      ? job.jobForms
                      : null;
                  const syncedFormUpdates = formsForStatus
                    ? {
                        ...formAllocationUpdates,
                        jobForms: formsForStatus.map((form: any) => ({
                          ...form,
                          status: pendingStatus.name,
                          statusId: pendingStatus.id,
                        })),
                      }
                    : formAllocationUpdates;

                  const recordedAt = new Date().toISOString();
                  const readingEntries = configuredPendingStatusFields
                    .filter((field: any) => String(statusFormValues[field.id] ?? "").trim() !== "")
                    .map((field: any) => ({
                      fieldId: field.id,
                      label: field.label || field.id,
                      value: String(statusFormValues[field.id]).trim(),
                      statusId: pendingStatus.id,
                      statusName: pendingStatus.name,
                      recordedAt,
                      recordedById: currentUser?.uid || "",
                      recordedByName: currentUser?.displayName || currentUser?.email || "Unknown User",
                    }));
                  const legacyFieldEntries = readingEntries.flatMap((entry: any) => {
                    const alreadyRecorded = (job.statusFieldReadings || []).some(
                      (reading: any) => reading.fieldId === entry.fieldId
                    );
                    const legacyValue = String(
                      job.statusFieldValues?.[entry.fieldId] ?? editableFields[entry.fieldId] ?? ""
                    ).trim();
                    if (alreadyRecorded || !legacyValue || legacyValue === entry.value) return [];
                    return [{
                      ...entry,
                      value: legacyValue,
                      statusId: job.statusId || "",
                      statusName: job.status || "Previous status",
                      recordedAt: "0000-00-00T00:00:00.000Z",
                    }];
                  });
                  const persistedReadingEntries = [
                    ...legacyFieldEntries,
                    ...readingEntries,
                  ];
                  const latestStatusFieldValues = { ...(job.statusFieldValues || {}), ...statusFormValues };
                  const latestDynamicFields = { ...editableFields, ...statusFormValues };
                  const statusHistoryEntry = {
                    ...createStatusHistoryEntry(pendingStatus),
                  };

                  const updateData: any = {

                    status:
                      pendingStatus.name,

                    statusId:
                      pendingStatus.id,

                    edtPaused:
                      typeof pendingStatus.calculateEdt === "boolean"
                        ? !pendingStatus.calculateEdt
                        : /on\s*hold|hold/.test(String(pendingStatus.name || "").toLowerCase()),

                    statusHistory:
                      arrayUnion(statusHistoryEntry),

                    isClosed:
                      pendingStatus.closeJob === true,

                    closedAt:
                      pendingStatus.closeJob === true ? serverTimestamp() : null,

                    ...(pendingStatus.jobCompleted === true ? {
                      isCompleted: true,
                      completedAt: serverTimestamp(),
                      workStartedAt: null,
                      estimatedArrivalAt: null,
                      estimatedDispatchAt: null,
                    } : {}),

                    ...(statusIsOnSite(pendingStatus.name) ? {
                      workStartedAt: serverTimestamp(),
                      estimatedArrivalAt: null,
                      estimatedDispatchAt: null,
                    } : statusIsOnRoute(pendingStatus.name) ? { workStartedAt: null } : {}),

                    archived: false,
                    archivedAt: null,

                    ...(pendingStatus.clearNoPartsUsed === true ? {
                      noPartsUsed: false,
                      noPartsUsedUpdatedAt: serverTimestamp(),
                      noPartsUsedUpdatedById: currentUser?.uid || "",
                      noPartsUsedUpdatedByName: currentUser?.displayName || currentUser?.email || "Unknown User",
                    } : {}),

                    updatedById: currentUser?.uid || "",
                    updatedByName: currentUser?.displayName || currentUser?.email || "Unknown User",

                    statusFieldValues:
                      latestStatusFieldValues,

                    dynamicFields:
                      latestDynamicFields,

                    customerJobFieldValues,

                    statusFieldReadings: [
                      ...(job.statusFieldReadings || []),
                      ...persistedReadingEntries,
                    ],

                    updatedAt:
                      serverTimestamp(),

                    ...syncedFormUpdates,

                  };


                  if (persistedReadingEntries.length > 0) {
                    updateData.statusFieldReadings = arrayUnion(...persistedReadingEntries);
                  }

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

                    edtPaused:
                      typeof pendingStatus.calculateEdt === "boolean"
                        ? !pendingStatus.calculateEdt
                        : /on\s*hold|hold/.test(String(pendingStatus.name || "").toLowerCase()),

                    ...syncedFormUpdates,

                    statusFieldValues:
                      latestStatusFieldValues,

                    customerJobFieldValues,

                    statusHistory: [
                      ...(job.statusHistory || []),
                      statusHistoryEntry,
                    ],

                    statusFieldReadings: [
                      ...(job.statusFieldReadings || []),
                      ...persistedReadingEntries,
                    ],

                    isClosed: pendingStatus.closeJob === true,
                    closedAt: pendingStatus.closeJob === true ? new Date() : null,
                    isCompleted: pendingStatus.jobCompleted === true ? true : job.isCompleted === true,
                    completedAt: pendingStatus.jobCompleted === true ? new Date() : job.completedAt || null,
                    workStartedAt: pendingStatus.jobCompleted === true ? null : statusIsOnSite(pendingStatus.name) ? new Date() : statusIsOnRoute(pendingStatus.name) ? null : job.workStartedAt || null,
                    estimatedArrivalAt: pendingStatus.jobCompleted === true || statusIsOnSite(pendingStatus.name) ? null : job.estimatedArrivalAt,
                    estimatedDispatchAt: pendingStatus.jobCompleted === true || statusIsOnSite(pendingStatus.name) ? null : job.estimatedDispatchAt,
                    archived: false,
                    noPartsUsed: pendingStatus.clearNoPartsUsed === true ? false : job.noPartsUsed === true,

                  });

                  setEditableFields(latestDynamicFields);

                  await recalculateActiveJobQueue();

                  await triggerStatusCommunications(
                    pendingStatus
                  );


                  setShowStatusModal(false);

                  setPendingStatus(null);

                  setStatusFormValues({});


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

      {showSummary && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5">
              <div>
                <h2 className="text-2xl font-black text-gray-900">Job Status Summary</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Job {job.jobNumber || job.id} status history
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSummary(false)}
                className="rounded-xl border border-gray-200 px-4 py-2 font-bold hover:bg-gray-50"
              >
                Close
              </button>

            </div>

            <div className="max-h-[calc(90vh-82px)] overflow-auto p-6">
              <div className="min-w-[850px] overflow-hidden rounded-2xl border border-gray-200">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Days in status</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3">Updated</th>
                      <th className="px-4 py-3">Updated by</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {jobStatusSummaryRows.map((entry: any) => {
                      const statusConfig = statuses.find(
                        (status: any) =>
                          status.id === entry.statusId || status.name === entry.statusName
                      );
                      const elapsedDays = Math.max(
                        0,
                        Math.floor(
                          (entry.exitedDate.getTime() - entry.enteredDate.getTime()) /
                          86400000
                        )
                      );
                      return (
                        <tr key={entry.id || `${entry.statusName}-${entry.enteredDate.toISOString()}`} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-bold ${statusConfig?.color || "bg-gray-200 text-gray-800"}`}>
                              {entry.statusName}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-semibold text-gray-700">{elapsedDays}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                            {formatDateTime24(entry.enteredDate)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                            {formatDateTime24(entry.exitedDate)}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {entry.updatedByName || "System"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCommunication && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5">
              <div>
                <h2 className="text-2xl font-black text-gray-900">Job Communication</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Job {job?.jobNumber || job?.id} · messages to the customer and assigned users
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCommunication(false)}
                className="rounded-xl border border-gray-200 px-4 py-2 font-bold hover:bg-gray-50"
                aria-label="Close job communication"
              >
                Close
              </button>
            </div>

            <div className="grid min-h-0 flex-1 lg:grid-cols-[380px_1fr]">
              <div className="overflow-y-auto border-b border-gray-200 bg-gray-50 p-6 lg:border-b-0 lg:border-r">
                <h3 className="font-black text-gray-900">Create communication</h3>

                <label className="mt-5 block text-sm font-bold text-gray-700">Send to</label>
                <select
                  value={communicationRecipient}
                  onChange={(event) => setCommunicationRecipient(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-gray-300 bg-white p-3 outline-none focus:border-blue-500"
                >
                  <option value="customer">Customer — {customer?.companyName || job?.customerName || "Customer"}</option>
                  {technicians
                    .filter((user: any) =>
                      (job?.assignedUserIds || []).includes(user.id) ||
                      user.id === job?.technicianId ||
                      user.id === job?.assignedUserId
                    )
                    .map((user: any) => (
                      <option key={user.id} value={`user:${user.id}`}>
                        User — {user.name || user.displayName || user.email}
                      </option>
                    ))}
                </select>

                <label className="mt-5 block text-sm font-bold text-gray-700">Admin message template</label>
                <select
                  value={selectedMessageTemplate}
                  onChange={(event) => {
                    setSelectedMessageTemplate(event.target.value);
                    if (event.target.value) setQuickMessage("");
                  }}
                  className="mt-2 w-full rounded-xl border border-gray-300 bg-white p-3 outline-none focus:border-blue-500"
                >
                  <option value="">Select a template</option>
                  {messageTemplates.map((template: any) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>

                <div className="my-4 flex items-center gap-3 text-xs font-bold uppercase tracking-wide text-gray-400">
                  <span className="h-px flex-1 bg-gray-200" />or<span className="h-px flex-1 bg-gray-200" />
                </div>

                <label className="block text-sm font-bold text-gray-700">Quick short message</label>
                <textarea
                  value={quickMessage}
                  onChange={(event) => {
                    setQuickMessage(event.target.value);
                    if (event.target.value) setSelectedMessageTemplate("");
                  }}
                  rows={5}
                  maxLength={500}
                  placeholder="Type a short job update…"
                  className="mt-2 w-full resize-none rounded-xl border border-gray-300 bg-white p-3 outline-none focus:border-blue-500"
                />
                <div className="mt-1 text-right text-xs text-gray-400">{quickMessage.length}/500</div>

                {selectedMessageTemplate && (() => {
                  const preview = messageTemplates.find((item: any) => item.id === selectedMessageTemplate);
                  return preview ? (
                    <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm">
                      <div className="font-bold text-blue-900">{applyMessageTags(preview.subject || preview.name)}</div>
                      <div className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-blue-800">
                        {renderCommunicationBody(preview.htmlBody || "No message body")}
                      </div>
                    </div>
                  ) : null;
                })()}

                <button
                  type="button"
                  onClick={() => {
                    const composeParams = new URLSearchParams({
                      module: "JobCard",
                      documentId: job.id,
                      jobId: job.id,
                      templateId: selectedMessageTemplate,
                      notes: quickMessage.trim(),
                      comment: quickMessage.trim(),
                      subject: selectedMessageTemplate ? "" : `Job ${job.jobNumber || job.id} update`,
                      body: quickMessage.trim(),
                    });
                    router.push(`/messages/compose?${composeParams.toString()}`);
                  }}
                  disabled={sendingCommunication}
                  className="mt-5 w-full rounded-xl bg-blue-600 p-3 font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Open Compose Message
                </button>
                <p className="mt-2 text-xs text-gray-500">
                  Select recipients and a template, or write a once-off message before sending.
                </p>
              </div>

              <div className="min-h-0 overflow-y-auto p-6">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h3 className="font-black text-gray-900">Communication history</h3>
                    <p className="text-sm text-gray-500">All status, template, and quick messages for this job</p>
                  </div>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-bold text-gray-600">
                    {communications.length}
                  </span>
                </div>

                {communications.length === 0 ? (
                  <div className="rounded-2xl border-2 border-dashed border-gray-200 p-14 text-center">
                    <div className="text-4xl">✉</div>
                    <h4 className="mt-3 font-black text-gray-900">No communication yet</h4>
                    <p className="mt-1 text-sm text-gray-500">Status messages and manually created messages will appear here.</p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-gray-200">
                    {communications.map((item: any) => {
                      // Older communication rules stored the template name in
                      // `templateIds`; newer rules store the Firestore document ID.
                      const linkedTemplate = messageTemplates.find(
                        (template: any) =>
                          template.id === item.templateId ||
                          template.name === item.templateId ||
                          template.name === item.templateName
                      );
                      const createdDate = item.createdAt?.toDate?.();
                      return (
                        <details key={item.id} className="group border-b border-gray-200 last:border-b-0 open:bg-gray-50">
                          <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 hover:bg-gray-50">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="text-xs text-gray-400 transition-transform group-open:rotate-90">▶</span>
                              <span className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900">
                                {applyMessageTags(item.subject || linkedTemplate?.subject || item.templateName || linkedTemplate?.name || item.communicationName || "Job update")}
                              </span>
                              <span className="hidden truncate text-xs text-gray-500 sm:block">
                                To {item.recipientName || item.recipientType || "recipient"}
                              </span>
                              <span className="hidden rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold capitalize text-amber-800 md:inline">
                                {item.state || "queued"}
                              </span>
                            </div>
                            <span className="whitespace-nowrap text-xs text-gray-400">
                              {createdDate ? formatDateTime24(createdDate) : "Pending"}
                            </span>
                          </summary>

                          <div className="border-t border-gray-200 px-10 py-4">
                            <div className="mb-4">
                              <div className="text-xs font-bold uppercase tracking-wide text-gray-400">Subject</div>
                              <div className="mt-1 font-bold text-gray-900">
                                {applyMessageTags(item.subject || linkedTemplate?.subject || item.templateName || linkedTemplate?.name || item.communicationName || "Job update")}
                              </div>
                            </div>
                            <div className="grid gap-3 text-sm sm:grid-cols-2">
                              <div>
                                <span className="font-bold text-gray-500">Recipient: </span>
                                <span className="text-gray-800">{item.recipientName || item.recipientType || "Recipient not recorded"}</span>
                              </div>
                              <div>
                                <span className="font-bold text-gray-500">Type: </span>
                                <span className="text-gray-800">{item.recipientType || item.source || "Communication"}</span>
                              </div>
                              {item.recipientEmail && <div><span className="font-bold text-gray-500">Email: </span>{item.recipientEmail}</div>}
                              {item.recipientPhone && <div><span className="font-bold text-gray-500">Phone: </span>{item.recipientPhone}</div>}
                            </div>
                            {(item.body || linkedTemplate?.htmlBody) && (
                              <div className="mt-4">
                                <div className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-400">Message body</div>
                                <p className="whitespace-pre-wrap rounded-xl bg-white p-3 text-sm text-gray-700">
                                {renderCommunicationBody(item.body || linkedTemplate?.htmlBody)}
                                </p>
                              </div>
                            )}
                            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
                              <span>Status: <strong className="capitalize">{item.state || "queued"}</strong></span>
                              {item.statusName && <span>Triggered by status: <strong>{item.statusName}</strong></span>}
                              {item.createdByName && <span>Created by <strong>{item.createdByName}</strong></span>}
                              <span>{createdDate ? formatDateTime24(createdDate) : "Timestamp pending"}</span>
                            </div>
                          </div>
                        </details>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {unusedPartsDecisionStatus && <div className="fixed inset-0 z-[440] flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-labelledby="unused-parts-title">
        <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
          <h2 id="unused-parts-title" className="text-2xl font-black text-gray-950">Unused Parts Confirmation</h2>
          <p className="mt-2 text-gray-600">Before changing the status to <strong>{unusedPartsDecisionStatus.name}</strong>, confirm whether issued parts must be returned.</p>
          <div className="mt-6 grid gap-3"><button type="button" onClick={beginUnusedPartsDerequisition} className="rounded-xl bg-indigo-600 px-5 py-3 text-left font-black text-white"><span className="block">Unused Parts</span><span className="mt-1 block text-xs font-semibold text-indigo-100">Select returned items and create a derequisition slip.</span></button><button type="button" onClick={() => void confirmNoUnusedParts()} className="rounded-xl bg-blue-600 px-5 py-3 text-left font-black text-white"><span className="block">No Unused Parts</span><span className="mt-1 block text-xs font-semibold text-blue-100">Record the declaration and continue the status change.</span></button><button type="button" onClick={() => setUnusedPartsDecisionStatus(null)} className="rounded-xl border px-5 py-3 font-bold">Cancel Status Change</button></div>
        </div>
            </div>}

      {serialSelectionItem && <div className="fixed inset-0 z-[420] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
        <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
          <h2 className="text-2xl font-black">Select Serial Number</h2>
          <p className="mt-1 text-sm text-gray-500">{serialSelectionItem.partNumber} - {serialSelectionItem.description}</p>
          <div className="mt-5 max-h-[55vh] space-y-2 overflow-auto">
            {loadingSerials ? <div className="p-8 text-center">Loading serial numbers...</div> : availableSerials.length === 0 ? <div className="rounded-2xl bg-gray-50 p-8 text-center text-gray-500">No available serial numbers.</div> : availableSerials.map((serial) => <button key={serial.id} type="button" onClick={() => void addInventoryToJob(serialSelectionItem, serial)} className="grid w-full grid-cols-[1fr_auto] gap-3 rounded-xl border p-3 text-left hover:border-blue-400 hover:bg-blue-50">
              <span className="font-black text-blue-700">{serial.serialNumber}</span>
              <span className="text-xs font-bold text-gray-500">{serial.locationName || serial.locationId || "Unknown location"}</span>
              <span className="text-xs text-gray-500">Document: {serial.documentNumber || "-"}</span>
              <span className="text-xs text-gray-500">Received: {serial.receivedAt?.toDate?.()?.toLocaleString?.("en-ZA") || "-"}</span>
            </button>)}
          </div>
          <button type="button" onClick={() => setSerialSelectionItem(null)} className="mt-5 w-full rounded-xl border p-3 font-bold">Cancel</button>
        </div>
      </div>}

      {pendingInventoryLocation && <div className="fixed inset-0 z-[430] flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-labelledby="used-from-location-title">
        <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
          <h2 id="used-from-location-title" className="text-2xl font-black text-gray-950">Select Used From Location</h2>
          <p className="mt-2 text-sm text-gray-600">Choose the stock location for <strong>{pendingInventoryLocation.item.partNumber || pendingInventoryLocation.item.itemCode} - {pendingInventoryLocation.item.description}</strong>. This is required before the item can be added.</p>
          {pendingInventoryLocation.selectedSerial && <p className="mt-3 rounded-xl bg-blue-50 p-3 text-sm font-bold text-blue-800">Serial number: {pendingInventoryLocation.selectedSerial.serialNumber}<br />Current location: {pendingInventoryLocation.selectedSerial.locationName || pendingInventoryLocation.selectedSerial.locationId || "Not recorded"}</p>}
          <label className="mt-5 block text-sm font-black text-gray-800">Used From *</label>
          <select autoFocus value={selectedInventoryLocationId} onChange={(event) => setSelectedInventoryLocationId(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-gray-300 bg-white px-4 font-bold outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
            <option value="">Select stock location</option>
            {pendingInventoryLocation.selectedSerial?.locationId && !stockLocations.some((location: any) => String(location.id) === String(pendingInventoryLocation.selectedSerial.locationId)) && <option value={String(pendingInventoryLocation.selectedSerial.locationId)}>{pendingInventoryLocation.selectedSerial.locationName || pendingInventoryLocation.selectedSerial.locationId} (recorded serial location)</option>}
            {stockLocations.map((location: any) => <option key={location.id} value={location.id}>{location.name}{location.type ? ` (${location.type})` : ""}</option>)}
          </select>
          <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => { setPendingInventoryLocation(null); setSelectedInventoryLocationId(""); setShowPartsModal(true); }} className="rounded-xl border px-5 py-3 font-bold">Cancel</button><button type="button" onClick={() => {
            const serialLocationId = String(pendingInventoryLocation.selectedSerial?.locationId || "");
            const selectedLocation = stockLocations.find((location: any) => String(location.id) === selectedInventoryLocationId) || (serialLocationId && serialLocationId === selectedInventoryLocationId ? { id: serialLocationId, name: pendingInventoryLocation.selectedSerial?.locationName || serialLocationId, type: pendingInventoryLocation.selectedSerial?.locationType || "warehouse" } : null);
            if (!selectedLocation) return alert("Select the Used From location before continuing.");
            if (serialLocationId && serialLocationId !== selectedLocation.id) return alert("The selected serial number is stored at a different location. Select its recorded stock location.");
            void addInventoryToJob(pendingInventoryLocation.item, pendingInventoryLocation.selectedSerial, selectedLocation);
          }} className="rounded-xl bg-blue-600 px-5 py-3 font-black text-white">Add Item</button></div>
        </div>
      </div>}

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

                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  const entered = partSearch.trim().toLowerCase();
                  const item = inventory.find((entry: any) => String(entry.partNumber || entry.itemCode || "").trim().toLowerCase() === entered);
                  if (!item) return;
                  event.preventDefault();
                  event.stopPropagation();
                  void addInventoryToJob(item);
                }}

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
p-2.5
mb-1.5
text-left
text-sm
hover:bg-gray-50
"

                  >


                    <div className="font-bold">

                      {[item.partNumber || item.itemCode, item.description]
                        .map((value) => String(value || "").trim())
                        .filter(Boolean)
                        .join(" - ")}

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

function DirectJobCardSignatureModal({ terms, signatureLabel, initialSignature, allowResign, onClose, onSave }: {
  terms: any[];
  signatureLabel: string;
  initialSignature: string;
  allowResign: boolean;
  onClose: () => void;
  onSave: (value: { name: string; signature: string }) => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [name, setName] = useState("");
  const [signature, setSignature] = useState(initialSignature);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!signature) return;
    const image = new Image();
    image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.src = signature;
  }, [signature]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * (event.currentTarget.width / bounds.width),
      y: (event.clientY - bounds.top) * (event.currentTarget.height / bounds.height),
    };
  };
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!name.trim() || (!allowResign && Boolean(initialSignature))) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const position = point(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    context.beginPath();
    context.moveTo(position.x, position.y);
    context.lineWidth = 2;
    context.lineCap = "round";
    context.strokeStyle = "#111827";
    drawingRef.current = true;
  };
  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const position = point(event);
    context.lineTo(position.x, position.y);
    context.stroke();
  };
  const finish = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (canvasRef.current) setSignature(canvasRef.current.toDataURL("image/png"));
  };

  return <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/55 p-4">
    <div className="w-full max-w-5xl rounded-3xl bg-white p-6 shadow-2xl">
      <div className="flex items-center justify-between gap-4"><div><h2 className="text-2xl font-black">Sign Job Card</h2><p className="mt-1 text-sm text-gray-500">Customer acceptance of the job card and linked Terms & Conditions.</p></div><button type="button" onClick={onClose} className="rounded-xl border px-4 py-2 font-bold">Cancel</button></div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <label className="text-sm font-bold text-gray-700">{signatureLabel}<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" className="mt-2 w-full rounded-xl border px-4 py-3 font-normal" /></label>
          <div className="relative mt-4 h-56 overflow-hidden rounded-xl border-2 bg-white">
            <canvas ref={canvasRef} width={900} height={300} className="h-full w-full" style={{ touchAction: "none" }} onPointerDown={start} onPointerMove={draw} onPointerUp={finish} onPointerCancel={finish} aria-label="Customer job card signature pad" />
            {!name.trim() && <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/80 text-gray-500">Enter the customer name to enable signing.</div>}
          </div>
          <button type="button" disabled={!allowResign && Boolean(initialSignature)} onClick={() => { canvasRef.current?.getContext("2d")?.clearRect(0, 0, 900, 300); setSignature(""); }} className="mt-2 rounded-lg border px-3 py-2 text-sm font-bold disabled:opacity-40">Clear Signature</button>
        </div>
        <section className="max-h-[430px] overflow-y-auto rounded-xl border bg-gray-50 p-4"><h3 className="font-black">Terms & Conditions</h3><div className="mt-3 space-y-5 whitespace-pre-wrap text-sm text-gray-700">{terms.map((template) => <div key={template.id}><strong className="mb-1 block text-gray-900">{template.name}</strong>{template.termsText}</div>)}</div></section>
      </div>
      <label className="mt-5 flex items-start gap-3 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-900"><input type="checkbox" required className="mt-0.5 size-4" id="job-card-terms-accepted" />I confirm that I have read and accept the Terms & Conditions shown above.</label>
      <div className="mt-5 flex justify-end"><button type="button" disabled={saving || !name.trim() || !signature} onClick={async () => { const accepted = document.querySelector<HTMLInputElement>("#job-card-terms-accepted")?.checked === true; if (!accepted) return alert("The customer must accept the Terms & Conditions before signing."); setSaving(true); try { await onSave({ name: name.trim(), signature }); } finally { setSaving(false); } }} className="rounded-xl bg-emerald-600 px-6 py-3 font-black text-white disabled:opacity-40">{saving ? "Saving Signature…" : "Accept and Save Signature"}</button></div>
    </div>
  </div>;
}
