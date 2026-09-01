"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addDoc, collection, doc, getDoc, getDocs, serverTimestamp, Timestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import PageHeader from "@/app/components/PageHeader";
import { creationAuditFields } from "@/lib/audit";
import { COMPANY_ID } from "@/lib/company";
import { clientDb, storage } from "@/lib/firebaseClient";

type Customer = {
  id: string;
  companyName?: string;
  customerName?: string;
  name?: string;
  email?: string;
  email1?: string;
};

type User = { id: string; name?: string; displayName?: string; firstName?: string; lastName?: string; email?: string };
type CustomQueryField = { id: string; label: string; type: "text" | "number" | "date" | "textarea"; required: boolean };

type Job = {
  id: string;
  jobNumber?: string;
  customerId?: string;
  customerName?: string;
  registrationNumber?: string;
  vehicleRegistration?: string;
};

const queryTypes = ["Breakdown", "Warranty", "Inspection", "Tyres", "Diagnostics", "General"];
const queryStatuses = ["Open", "Pending", "Awaiting Customer", "In Progress", "Closed"];

export default function NewQueryPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [jobId, setJobId] = useState("");
  const [queryType, setQueryType] = useState("General");
  const [status, setStatus] = useState("Open");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [customFields, setCustomFields] = useState<CustomQueryField[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>( {} );
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getDocs(collection(clientDb, "companies", COMPANY_ID, "customers")),
      getDocs(collection(clientDb, "companies", COMPANY_ID, "jobs")),
      getDocs(collection(clientDb, "companies", COMPANY_ID, "users")),
      getDoc(doc(clientDb, "companies", COMPANY_ID, "query_settings", "general")),
    ]).then(([customerSnapshot, jobSnapshot, userSnapshot, settingsSnapshot]) => {
      setCustomers(customerSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
      setJobs(jobSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
      setUsers(userSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
      const configuredFields = settingsSnapshot.data()?.customFields;
      if (Array.isArray(configuredFields)) setCustomFields(configuredFields.slice(0, 4));
    }).catch((error) => {
      console.error("Unable to load query details", error);
      alert("The customer and job details could not be loaded.");
    }).finally(() => setLoading(false));
  }, []);

  const availableJobs = useMemo(
    () => jobs.filter((job) => !customerId || job.customerId === customerId),
    [customerId, jobs]
  );

  async function saveQuery(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customerId || !assignedUserId || !followUpAt || !subject.trim() || !description.trim()) return;

    const customer = customers.find((entry) => entry.id === customerId);
    const job = jobs.find((entry) => entry.id === jobId);
    const assignedUser = users.find((entry) => entry.id === assignedUserId);
    const assignedUserName = assignedUser?.name || assignedUser?.displayName || `${assignedUser?.firstName || ""} ${assignedUser?.lastName || ""}`.trim() || assignedUser?.email || "User";
    const followUpDate = new Date(followUpAt);
    setSaving(true);
    try {
      const queryRef = await addDoc(collection(clientDb, "companies", COMPANY_ID, "queries"), {
        customerId,
        customerName: customer?.companyName || customer?.customerName || customer?.name || "Customer",
        jobId: job?.id || "",
        jobNumber: job?.jobNumber || "",
        queryType,
        status: status.toLowerCase(),
        statusName: status,
        assignedUserId,
        assignedUserName,
        recipientId: assignedUserId,
        recipientName: assignedUserName,
        followUpAt: Timestamp.fromDate(followUpDate),
        referenceNumber: referenceNumber.trim(),
        subject: subject.trim(),
        description: description.trim(),
        customFields: Object.fromEntries(customFields.map((field) => [field.id, { label: field.label, type: field.type, value: customFieldValues[field.id] || "" }])),
        grandTotal: 0,
        totalQty: 0,
        ...creationAuditFields(),
      });

      const uploadedAttachments = await Promise.all(files.map(async (file) => {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `companies/${COMPANY_ID}/queries/${queryRef.id}/attachments/${Date.now()}-${safeName}`;
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, file, { contentType: file.type || "application/octet-stream" });
        return { name: file.name, contentType: file.type, size: file.size, storagePath, url: await getDownloadURL(storageRef) };
      }));
      if (uploadedAttachments.length) await updateDoc(queryRef, { attachments: uploadedAttachments });

      await addDoc(collection(clientDb, "companies", COMPANY_ID, "notifications"), {
        type: "query_follow_up",
        title: `Query follow-up: ${subject.trim()}`,
        message: `Follow up ${followUpDate.toLocaleString("en-ZA")} with ${customer?.companyName || customer?.customerName || customer?.name || "Customer"}. Assigned to ${assignedUserName}.`,
        queryId: queryRef.id,
        assignedUserId,
        assignedUserName,
        followUpAt: Timestamp.fromDate(followUpDate),
        sourcePath: `/queries/${queryRef.id}`,
        status: "active",
        finalized: false,
        createdAt: serverTimestamp(),
      });

      router.push(`/queries/${queryRef.id}`);
    } catch (error) {
      console.error("Unable to create query", error);
      alert(error instanceof Error ? error.message : "The query could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] p-5 md:p-8">
      <PageHeader title="Create Query" subtitle="QUERIES" />

      <form onSubmit={saveQuery} className="mx-auto max-w-6xl rounded-[28px] border border-gray-200 bg-white p-6 shadow-sm md:p-8">
        <section className="rounded-2xl border border-slate-900 p-5">
          <h2 className="mb-5 text-lg font-black text-slate-950">Query Details</h2>

          <div className="grid gap-5 md:grid-cols-2">
            <label className="text-sm font-bold text-gray-600">
              Customer *
              <select
                required
                disabled={loading}
                value={customerId}
                onChange={(event) => {
                  setCustomerId(event.target.value);
                  setJobId("");
                }}
                className="mt-2 h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-gray-900"
              >
                <option value="">{loading ? "Loading customers..." : "Select customer"}</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.companyName || customer.customerName || customer.name || customer.id}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-bold text-gray-600">
              Linked Job
              <select value={jobId} onChange={(event) => setJobId(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-gray-900">
                <option value="">No linked job</option>
                {availableJobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.jobNumber || job.id}{(job.registrationNumber || job.vehicleRegistration) ? ` - ${job.registrationNumber || job.vehicleRegistration}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-bold text-gray-600">
              Query Type *
              <select required value={queryType} onChange={(event) => setQueryType(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-gray-900">
                {queryTypes.map((type) => <option key={type}>{type}</option>)}
              </select>
            </label>

            <label className="text-sm font-bold text-gray-600">
              Status *
              <select required value={status} onChange={(event) => setStatus(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-gray-900">
                {queryStatuses.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>

            <label className="text-sm font-bold text-gray-600">
              Assigned User *
              <select required value={assignedUserId} onChange={(event) => setAssignedUserId(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-gray-900">
                <option value="">Select user</option>
                {users.map((user) => <option key={user.id} value={user.id}>{user.name || user.displayName || `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || user.id}</option>)}
              </select>
            </label>

            <label className="text-sm font-bold text-gray-600">
              Follow-up Date and Time *
              <input required type="datetime-local" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-gray-300 px-4 text-gray-900" />
            </label>

            <label className="text-sm font-bold text-gray-600">
              Reference
              <input value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} placeholder="Enter reference number" className="mt-2 h-12 w-full rounded-xl border border-gray-300 px-4 text-gray-900" />
            </label>

            <label className="text-sm font-bold text-gray-600 md:col-span-2">
              Subject *
              <input required value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Enter query subject" className="mt-2 h-12 w-full rounded-xl border border-gray-300 px-4 text-gray-900" />
            </label>

            {customFields.map((field) => <label key={field.id} className={`text-sm font-bold text-gray-600 ${field.type === "textarea" ? "md:col-span-2" : ""}`}>
              {field.label}{field.required ? " *" : ""}
              {field.type === "textarea" ? <textarea required={field.required} rows={3} value={customFieldValues[field.id] || ""} onChange={(event) => setCustomFieldValues((current) => ({ ...current, [field.id]: event.target.value }))} data-enter-newline="true" className="mt-2 w-full rounded-xl border border-gray-300 p-4 text-gray-900" /> : <input required={field.required} type={field.type} value={customFieldValues[field.id] || ""} onChange={(event) => setCustomFieldValues((current) => ({ ...current, [field.id]: event.target.value }))} className="mt-2 h-12 w-full rounded-xl border border-gray-300 px-4 text-gray-900" />}
            </label>)}

            <label className="text-sm font-bold text-gray-600 md:col-span-2">
              Description *
              <textarea required rows={6} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Enter the query details..." data-enter-newline="true" className="mt-2 w-full rounded-xl border border-gray-300 p-4 text-gray-900" />
            </label>
          </div>
        </section>

        <section className="mt-5 rounded-2xl border border-slate-900 p-5">
          <h2 className="text-lg font-black text-slate-950">Query Attachments</h2>
          <p className="text-sm text-gray-500">These files are stored with the query and can be selected when it is emailed after creation.</p>
          <label className="mt-5 block text-sm font-bold text-gray-600">Email Attachments
            <input type="file" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} className="mt-2 block w-full rounded-xl border border-dashed border-gray-300 p-4" />
          </label>
          {files.length > 0 && <p className="mt-2 text-xs font-bold text-gray-500">{files.length} attachment{files.length === 1 ? "" : "s"} selected</p>}
        </section>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={() => router.push("/queries")} className="rounded-xl border border-gray-300 px-6 py-3 font-bold text-gray-700">Cancel</button>
          <button type="submit" disabled={saving || loading} className="rounded-xl bg-blue-600 px-8 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? "Saving..." : "Create Query"}
          </button>
        </div>
      </form>
    </main>
  );
}
