"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";

import { COMPANY_ID } from "@/lib/company";
import { clientDb } from "@/lib/firebaseClient";

type AllocatedForm = {
  id: string;
  templateId: string;
  name: string;
  fields: any[];
  completed?: boolean;
  allowMultipleUse?: boolean;
  status?: string;
};

export default function JobFormsListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: jobId } = use(params);
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [alternativeForms, setAlternativeForms] = useState<any[]>([]);
  const [selectedAlternativeId, setSelectedAlternativeId] = useState("");
  const [showAdditionalForms, setShowAdditionalForms] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const snapshot = await getDoc(
          doc(clientDb, "companies", COMPANY_ID, "jobs", jobId)
        );

        if (snapshot.exists()) {
          const loadedJob: any = { id: snapshot.id, ...snapshot.data() };
          setJob(loadedJob);

          const templatesSnapshot = await getDocs(
            collection(clientDb, "companies", COMPANY_ID, "jobforms")
          );
          setAlternativeForms(
            templatesSnapshot.docs
              .map((templateDoc) => ({ id: templateDoc.id, ...templateDoc.data() }))
              .filter((template: any) => template.active !== false)
              .sort((a: any, b: any) =>
                String(a.name || "").localeCompare(String(b.name || ""))
              )
          );
        }

      } finally {
        setLoading(false);
      }
    }

    load();
  }, [jobId]);

  const forms = useMemo<AllocatedForm[]>(() => {
    if (!job) return [];

    if (Array.isArray(job.jobForms) && job.jobForms.length) {
      return job.jobForms.map((form: any) => ({
        id: form.id || form.templateId,
        templateId: form.templateId || form.id,
        name: form.templateName || form.name || "Job Form",
        fields: form.fields || [],
        completed:
          job.jobFormCompletion?.[form.id || form.templateId]?.completed === true,
        allowMultipleUse: form.allowMultipleUse === true,
        status: form.status || job.status || "",
      }));
    }

    if (job.jobFormTemplateId) {
      return [
        {
          id: job.jobFormTemplateId,
          templateId: job.jobFormTemplateId,
          name: job.jobFormTemplateName || "Job Form",
          fields: job.jobFormFields || [],
          completed:
            job.jobFormCompletion?.[job.jobFormTemplateId]?.completed === true,
          status: job.status || "",
        },
      ];
    }

    return [];
  }, [job]);

  const additionalFormOptions = alternativeForms.filter((template) =>
    template.allowMultipleUse === true ||
    !forms.some((form) => form.templateId === template.id)
  );

  async function addAnotherForm(form: AllocatedForm) {
    if (!job || !form.allowMultipleUse || !form.completed) return;

    const newInstance = {
      id: crypto.randomUUID(),
      templateId: form.templateId,
      templateName: form.name,
      fields: JSON.parse(JSON.stringify(form.fields)),
      allowMultipleUse: true,
      status: job.status || "",
      allocatedAt: new Date().toISOString(),
    };
    const currentForms = Array.isArray(job.jobForms) && job.jobForms.length > 0
      ? job.jobForms
      : job.jobFormTemplateId
        ? [{
            id: job.jobFormTemplateId,
            templateId: job.jobFormTemplateId,
            templateName: job.jobFormTemplateName || "Job Form",
            fields: job.jobFormFields || [],
            allowMultipleUse: false,
          }]
        : [];
    const nextForms = [...currentForms, newInstance];

    await updateDoc(
      doc(clientDb, "companies", COMPANY_ID, "jobs", jobId),
      { jobForms: nextForms, updatedAt: serverTimestamp() }
    );
    setJob((current: any) => ({ ...current, jobForms: nextForms }));
  }

  async function addAlternativeForm() {
    if (!job || !selectedAlternativeId) return;
    const template = alternativeForms.find((form) => form.id === selectedAlternativeId);
    if (!template) return;

    const currentForms = Array.isArray(job.jobForms) && job.jobForms.length > 0
      ? job.jobForms
      : job.jobFormTemplateId
        ? [{
            id: job.jobFormTemplateId,
            templateId: job.jobFormTemplateId,
            templateName: job.jobFormTemplateName || "Job Form",
            fields: job.jobFormFields || [],
            allowMultipleUse: false,
          }]
        : [];
    const alreadyUsed = currentForms.some(
      (form: any) => (form.templateId || form.id) === template.id
    );
    if (alreadyUsed && template.allowMultipleUse !== true) {
      alert("This is a single-use form and has already been added to the job.");
      return;
    }

    const instance = {
      id: crypto.randomUUID(),
      templateId: template.id,
      templateName: template.name || "Job Form",
      fields: JSON.parse(JSON.stringify((template.fields || []).map((field: any) => ({
        ...field,
        label: typeof field.label === "string"
          ? field.label.replace(/\{\{jobNumber\}\}/gi, job.jobNumber || job.id)
          : field.label,
      })))),
      allowMultipleUse: template.allowMultipleUse === true,
      status: job.status || "",
      allocatedAt: new Date().toISOString(),
      manuallyAdded: true,
    };
    const nextForms = [...currentForms, instance];
    await updateDoc(
      doc(clientDb, "companies", COMPANY_ID, "jobs", jobId),
      { jobForms: nextForms, updatedAt: serverTimestamp() }
    );
    setJob((current: any) => ({ ...current, jobForms: nextForms }));
    setSelectedAlternativeId("");
    setShowAdditionalForms(false);
  }

  if (loading) {
    return <div className="p-10">Loading Job Forms...</div>;
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
              {job?.jobNumber || "Job"}
            </div>
            <h1 className="text-3xl font-black text-gray-900">
              Job Forms
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Select an allocated form to fill out and complete.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowAdditionalForms(true)}
              className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700"
            >
              + Additional Forms
            </button>
            <Link
              href={`/jobs/${jobId}`}
              className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-black text-gray-700 hover:bg-gray-100"
            >
              Back to Job
            </Link>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          {forms.length === 0 ? (
            <div className="p-8 text-center">
              <h2 className="font-bold text-gray-900">
                No Forms Allocated
              </h2>
              <p className="mt-2 text-sm text-gray-500">
                Select a Job Type with a linked form on the job card.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {forms.map((form) => (
                <div
                  key={form.id}
                  className="flex items-center justify-between gap-4 p-5 hover:bg-blue-50"
                >
                  <Link href={`/jobs/${jobId}/form/${form.id}`} className="min-w-0 flex-1">
                    <div className="font-black text-gray-900">
                      {form.name}
                    </div>
                    <div className="mt-1 text-xs font-semibold text-gray-500">
                      {form.fields.length} fields
                    </div>
                  </Link>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-700">
                      {form.status || job?.status || "No Status"}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-black ${
                        form.completed
                          ? "bg-green-100 text-green-700"
                          : "bg-orange-100 text-orange-700"
                      }`}
                    >
                      {form.completed ? "Completed" : "To Complete"}
                    </span>
                    {form.completed && form.allowMultipleUse && (
                      <button
                        type="button"
                        onClick={() => addAnotherForm(form)}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700"
                      >
                        Add another
                      </button>
                    )}
                    <Link
                      href={`/jobs/${jobId}/form/${form.id}?pdf=1`}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-100"
                    >
                      PDF View
                    </Link>
                    <span className="font-bold text-blue-700">
                      Open Form →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showAdditionalForms && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-6">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-gray-900">Additional Forms</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Select from the active forms created under Form Templates.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAdditionalForms(false);
                  setSelectedAlternativeId("");
                }}
                className="rounded-lg border border-gray-300 px-3 py-2 font-bold text-gray-600"
              >
                Close
              </button>
            </div>

            {additionalFormOptions.length === 0 ? (
              <div className="rounded-xl bg-gray-50 p-5 text-center text-sm text-gray-600">
                All available single-use forms are already on this job.
              </div>
            ) : (
              <div className="space-y-4">
                <select
                  value={selectedAlternativeId}
                  onChange={(event) => setSelectedAlternativeId(event.target.value)}
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
                >
                  <option value="">Select a form to fill out</option>
                  {additionalFormOptions.map((form) => (
                    <option key={form.id} value={form.id}>
                      {form.name || "Unnamed Job Form"}
                      {form.allowMultipleUse === true ? " (multiple use)" : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!selectedAlternativeId}
                  onClick={addAlternativeForm}
                  className="w-full rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-50"
                >
                  Add Selected Form
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
