"use client";

import Link from "next/link";

import {
  useEffect,
  useState,
} from "react";

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";

import {
  clientAuth,
  clientDb,
} from "@/lib/firebaseClient";

import {
  COMPANY_ID,
} from "@/lib/company";
import { adminStatusPolicy } from "@/lib/jobStatusAdmin";

type Status = {

  [field: string]: unknown;

  id: string;

  name: string;

  color: string;

  sortOrder?: number;

  startTimer?: boolean;

  stopTimer?: boolean;

  closeJob?: boolean;

  active?: boolean;

  systemKey?: unknown;
};
// ─── Temporary Phase 21D canonical reconciliation types (scheduled for removal) ───
type ReconcileClassification = {
  key: string;
  classification: string;
  existingDocumentName?: string;
  reason?: string;
};

type ReconcilePlan = {
  classifications: ReconcileClassification[];
  updates: { documentId: string; systemKey: string }[];
  creates: { name: string; systemKey: string }[];
  hasErrors: boolean;
  errorReasons: string[];
};

type ReconcileResult = {
  plan: ReconcilePlan;
  auditIds: string[];
  createdIds: string[];
  updatedIds: string[];
  noOp: boolean;
};
// ─── End temporary Phase 21D types ───


export default function StatusesPage() {

  const [statuses, setStatuses] =
    useState<Status[]>([]);

  const [
    communicationCounts,
    setCommunicationCounts,
  ] = useState<
    Record<string, number>
  >({});

  // Temporary Phase 21D reconciliation state
  const [reconcileInFlight, setReconcileInFlight] = useState(false);
  const [reconcileDispatched, setReconcileDispatched] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<ReconcileResult | null>(null);
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const [reconcileHttpStatus, setReconcileHttpStatus] = useState<number | null>(null);
  const isStaging = process.env.NEXT_PUBLIC_FLEETFIX_ENVIRONMENT === "staging";

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

          const data =
            snapshot.docs
              .map((doc) => ({

                id: doc.id,

                ...(doc.data() as any),

              }))
              .sort(
                (a: any, b: any) =>

                  (a.sortOrder || 0) -
                  (b.sortOrder || 0)
              );

          setStatuses(data);

        }
      );

    return () => unsub();

  }, []);

  useEffect(() => {

    const unsub =
      onSnapshot(

        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "communications"
        ),

        (snapshot) => {

          const counts:
            Record<string, number> = {};

          snapshot.docs.forEach((doc) => {

            const data =
              doc.data();

            const statuses =
              data.triggerStatuses || [];

            let totalMessages = 0;

            data.messages?.forEach(
              (message: any) => {

                totalMessages +=
                  message.templateIds
                    ?.length || 0;

              }
            );

            statuses.forEach(
              (statusName: string) => {

                const normalized =
                  statusName
                    .replace(
                      /[^\w\s]/gi,
                      ""
                    )
                    .trim()
                    .toLowerCase();

                counts[normalized] =
                  (counts[normalized] || 0) +
                  totalMessages;

              }
            );

          });

          setCommunicationCounts(
            counts
          );

        }
      );

    return () => unsub();

  }, []);

  async function deleteStatus(
    id: string
  ) {

    const confirmed =
      confirm(
        "Delete this status?"
      );

    if (!confirmed) {

      return;
    }

    try {

      await deleteDoc(

        doc(
          clientDb,
          "companies",
          COMPANY_ID,
          "statuses",
          id
        )
      );

    } catch (error) {

      console.error(error);

      alert(
        "Failed to delete status"
      );
    }
  }

  async function moveStatus(

    currentIndex: number,

    direction: "up" | "down"
  ) {

    const newStatuses =
      [...statuses];

    const targetIndex =

      direction === "up"

        ? currentIndex - 1

        : currentIndex + 1;

    if (
      targetIndex < 0 ||

      targetIndex >=
      newStatuses.length
    ) {

      return;
    }

    const current =
      newStatuses[currentIndex];

    const target =
      newStatuses[targetIndex];

    try {

      await updateDoc(

        doc(
          clientDb,
          "companies",
          COMPANY_ID,
          "statuses",
          current.id
        ),

        {
          sortOrder:
            targetIndex,
        }
      );

      await updateDoc(

        doc(
          clientDb,
          "companies",
          COMPANY_ID,
          "statuses",
          target.id
        ),

        {
          sortOrder:
            currentIndex,
        }
      );

    } catch (error) {

      console.error(error);

      alert(
        "Failed to reorder statuses"
      );
    }
  }
  // Temporary Phase 21D canonical reconciliation handler (scheduled for removal)
  async function handleReconcileAll() {
    const confirmed = confirm(
      "STAGING ONLY — Reconcile Canonical Statuses?\n\n" +
      "This will assign canonical system keys to existing legacy statuses " +
      "and create any missing canonical statuses.\n\n" +
      "No statuses will be deleted.\n" +
      "This action is intended to run once.\n\n" +
      "Select OK to proceed or Cancel to abort."
    );
    if (!confirmed) return;

    setReconcileInFlight(true);
    setReconcileError(null);
    setReconcileResult(null);
    setReconcileHttpStatus(null);

    try {
      await clientAuth.authStateReady();
      const user = clientAuth.currentUser;
      if (!user) {
        setReconcileError("Your FleetFix session has expired. Please sign in again.");
        setReconcileInFlight(false);
        return;
      }
      const token = await user.getIdToken();

      // Dispatch — from this point the attempt is consumed
      setReconcileDispatched(true);

      const response = await fetch("/api/admin/statuses/reconcile-all", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      setReconcileHttpStatus(response.status);
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const serverMessage =
          data && typeof data === "object" && "error" in data
            ? (data as { error?: { message?: string } }).error?.message
            : undefined;
        setReconcileError(
          serverMessage || `Reconciliation failed (HTTP ${response.status}).`
        );
        setReconcileInFlight(false);
        return;
      }

      setReconcileResult(data as ReconcileResult);
      setReconcileInFlight(false);
    } catch (error) {
      setReconcileError(
        error instanceof Error ? error.message : "Reconciliation request failed."
      );
      setReconcileInFlight(false);
    }
  }


  return (

    <div className="min-h-screen bg-[#f5f7fb] p-6">

      {/* HEADER */}
      <div className="mb-8 flex items-center justify-between">

        <div>

          <h1 className="text-3xl font-black text-gray-900">
            Job Statuses
          </h1>

          <p className="mt-2 text-sm text-gray-500">
            Manage workflow statuses and communication
          </p>

        </div>

        <Link
          href="/admin/statuses/new"
          className="
            rounded-2xl
            bg-blue-600
            px-5
            py-3
            text-sm
            font-semibold
            text-white
            hover:bg-blue-700
          "
        >
          + Add Status
        </Link>

      </div>
      {/* Temporary Phase 21D canonical reconciliation UI — scheduled for removal after verification */}
      {isStaging && (
        <div className="mb-8 rounded-2xl border border-amber-300 bg-amber-50 p-6 shadow-sm">
          <h2 className="text-lg font-black text-amber-900">
            Canonical Status Reconciliation (Staging Only)
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            Assign canonical system keys to legacy statuses and create any missing canonical statuses. No statuses will be deleted.
          </p>
          <button
            type="button"
            onClick={handleReconcileAll}
            disabled={reconcileInFlight || reconcileDispatched}
            className={`mt-4 rounded-xl px-5 py-3 text-sm font-semibold text-white ${
              reconcileInFlight || reconcileDispatched
                ? "cursor-not-allowed bg-gray-400 opacity-60"
                : "bg-amber-600 hover:bg-amber-700"
            }`}
          >
            {reconcileInFlight
              ? "Reconciling…"
              : reconcileDispatched
                ? "Reconciliation Dispatched"
                : "Reconcile Canonical Statuses"}
          </button>

          {reconcileError && (
            <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4">
              <p className="text-sm font-bold text-red-800">Reconciliation Failed</p>
              {reconcileHttpStatus && (
                <p className="mt-1 text-sm text-red-700">HTTP {reconcileHttpStatus}</p>
              )}
              <p className="mt-1 text-sm text-red-700">{reconcileError}</p>
              {reconcileDispatched && (
                <p className="mt-2 text-sm font-semibold text-red-900">
                  Request was dispatched. Stop for controlled review. Do not retry.
                </p>
              )}
              {!reconcileDispatched && (
                <p className="mt-2 text-xs text-red-600">
                  RequestDispatched=False — No reconciliation attempt has been consumed.
                </p>
              )}
            </div>
          )}

          {reconcileResult && (
            <div className="mt-4 rounded-xl border border-green-300 bg-green-50 p-4">
              <p className="text-sm font-bold text-green-800">
                {reconcileResult.noOp ? "Reconciliation Complete — No Changes Required" : "Reconciliation Complete"}
              </p>
              {reconcileHttpStatus && (
                <p className="mt-1 text-sm text-green-700">HTTP {reconcileHttpStatus}</p>
              )}
              <div className="mt-3 space-y-1 text-sm text-green-800">
                <p>No-op: {reconcileResult.noOp ? "Yes" : "No"}</p>
                <p>Plan errors: {reconcileResult.plan.hasErrors ? "Yes" : "None"}</p>
                {reconcileResult.plan.hasErrors && reconcileResult.plan.errorReasons.length > 0 && (
                  <ul className="ml-4 list-disc text-red-700">
                    {reconcileResult.plan.errorReasons.map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                )}
                <p>Legacy updates applied: {reconcileResult.plan.updates.length}</p>
                <p>Canonical statuses created: {reconcileResult.plan.creates.length}</p>
                <p>Updated document count: {reconcileResult.updatedIds.length}</p>
                <p>Created document count: {reconcileResult.createdIds.length}</p>
                <p>Audit records written: {reconcileResult.auditIds.length}</p>
              </div>
              {reconcileResult.plan.classifications.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-semibold text-green-900">Canonical Classifications:</p>
                  <table className="mt-2 w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-green-300">
                        <th className="py-1 pr-4 font-semibold text-green-900">Key</th>
                        <th className="py-1 pr-4 font-semibold text-green-900">Classification</th>
                        <th className="py-1 font-semibold text-green-900">Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reconcileResult.plan.classifications.map((c, i) => (
                        <tr key={i} className="border-b border-green-200">
                          <td className="py-1 pr-4 font-mono text-green-800">{c.key}</td>
                          <td className="py-1 pr-4 text-green-800">{c.classification}</td>
                          <td className="py-1 text-green-700">
                            {c.existingDocumentName || c.reason || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}


      {/* TABLE */}
      <div
        className="
          overflow-hidden
          rounded-3xl
          border
          border-gray-200
          bg-white
          shadow-sm
        "
      >

        <table className="w-full">

          <thead className="bg-gray-50">

            <tr>

              <th className="px-6 py-4 text-left text-sm font-bold text-gray-600">
                Status
              </th>

              <th className="px-6 py-4 text-left text-sm font-bold text-gray-600">
                Timer
              </th>

              <th className="px-6 py-4 text-left text-sm font-bold text-gray-600">
                Close Job
              </th>

              <th className="px-6 py-4 text-left text-sm font-bold text-gray-600">
                Active
              </th>

              <th className="px-6 py-4 text-left text-sm font-bold text-gray-600">
                Messages
              </th>

              <th className="px-6 py-4 text-right text-sm font-bold text-gray-600">
                Actions
              </th>

            </tr>

          </thead>

          <tbody>

            {statuses.map(
              (status, index) => {
                const policy = adminStatusPolicy(statuses, status);
                const isLockedStartStatus = policy.jobBookedWorkflowLocked;
                const identityBadge = policy.state === "SYSTEM"
                  ? "System"
                  : policy.state === "LEGACY_SYSTEM"
                    ? "Legacy System"
                    : policy.state === "AMBIGUOUS"
                      ? "Ambiguous"
                      : policy.state === "INVALID"
                        ? "Invalid"
                        : "";

                return (

                  <tr
                    key={status.id}
                    className="border-t border-gray-100"
                  >

                    <td className="px-6 py-5">

                      <span
                        className={`
                      rounded-xl
                      px-4
                      py-2
                      text-sm
                      font-medium
                      ${status.color}
                    `}
                      >
                        {status.name}

                      </span>
                      {identityBadge && (
                        <span className={`ml-2 inline-flex rounded-full px-2 py-1 text-[10px] font-black uppercase ${
                          policy.state === "AMBIGUOUS" || policy.state === "INVALID"
                            ? "bg-red-100 text-red-700"
                            : "bg-blue-100 text-blue-700"
                        }`}>
                          {identityBadge}
                          {policy.canonicalLabel ? ` · ${policy.canonicalLabel}` : ""}
                        </span>
                      )}

                    </td>

                    <td className="px-6 py-5">

                      <div className="flex gap-2">

                        <button
                          type="button"
                          onClick={async () => {

                            if (isLockedStartStatus) {
                              return;
                            }

                            try {

                              await updateDoc(

                                doc(
                                  clientDb,
                                  "companies",
                                  COMPANY_ID,
                                  "statuses",
                                  status.id
                                ),

                                {
                                  startTimer:
                                    !status.startTimer,

                                  stopTimer: false,
                                }
                              );

                            } catch (error) {

                              console.error(error);

                              alert(
                                "Failed to update timer state"
                              );

                            }

                          }}

                          className={`
        rounded-xl
        px-4
        py-2
        text-xs
        font-black
        ${isLockedStartStatus
                              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                              : status.startTimer
                                ? "bg-green-600 text-white"
                                : "bg-gray-100 text-gray-700"
                            }
      `}
                        >
                          START
                        </button>

                        <button
                          type="button"
                          onClick={async () => {

                            if (isLockedStartStatus) {
                              return;
                            }

                            try {

                              await updateDoc(

                                doc(
                                  clientDb,
                                  "companies",
                                  COMPANY_ID,
                                  "statuses",
                                  status.id
                                ),

                                {
                                  stopTimer:
                                    !status.stopTimer,

                                  startTimer: false,
                                }
                              );

                            } catch (error) {

                              console.error(error);

                              alert(
                                "Failed to update timer state"
                              );

                            }

                          }}
                          className={`
        rounded-xl
        px-4
        py-2
        text-xs
        font-black
        ${isLockedStartStatus
                              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                              : status.stopTimer
                                ? "bg-orange-500 text-white"
                                : "bg-gray-100 text-gray-700"
                            }
      `}
                        >
                          STOP
                        </button>

                      </div>

                    </td>

                    <td className="px-6 py-5">

                      <button
                        type="button"
                        disabled={status.active !== false ? !policy.canDisable : !policy.canEnable}
                        onClick={async () => {
                          if (
                            (status.active !== false && !policy.canDisable) ||
                            (status.active === false && !policy.canEnable)
                          ) {
                            return;
                          }
                          try {

                            await updateDoc(

                              doc(
                                clientDb,
                                "companies",
                                COMPANY_ID,
                                "statuses",
                                status.id
                              ),

                              {
                                closeJob:
                                  !status.closeJob,
                              }
                            );

                          } catch (error) {

                            console.error(error);

                            alert(
                              "Failed to update close job state"
                            );

                          }

                        }}
                        className={`
      rounded-xl
      px-4
      py-2
      text-xs
      font-black
      ${isLockedStartStatus
                            ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                            : status.closeJob
                              ? "bg-red-600 text-white"
                              : "bg-gray-100 text-gray-700"
                          }
    `}
                      >
                        {status.closeJob
                          ? "YES"
                          : "NO"}
                      </button>

                    </td>

                    <td className="px-6 py-5">

                      <button
                        type="button"
                        onClick={async () => {

                          if (isLockedStartStatus) {
                            return;
                          }

                          try {

                            await updateDoc(

                              doc(
                                clientDb,
                                "companies",
                                COMPANY_ID,
                                "statuses",
                                status.id
                              ),

                              {
                                active:
                                  status.active === false
                                    ? true
                                    : false,
                              }
                            );

                          } catch (error) {

                            console.error(error);

                            alert(
                              "Failed to update active state"
                            );

                          }

                        }}
                        className={`
      rounded-xl
      px-4
      py-2
      text-xs
      font-black
      ${status.active !== false && !policy.canDisable
                            ? "cursor-not-allowed bg-green-600 text-white"
                            : status.active === false
                              ? "bg-gray-200 text-gray-700"
                              : "bg-green-600 text-white"
                          }
    `}
                      >
                        {status.active !== false && !policy.canDisable
                          ? "LOCKED"
                          : status.active === false
                            ? "INACTIVE"
                            : "ACTIVE"}
                      </button>

                    </td>

                    <td className="px-6 py-5">

                      <Link
                        href="/admin/communication"
                        className="
      inline-flex
      items-center
      rounded-xl
      bg-indigo-50
      px-4
      py-2
      text-xs
      font-black
      text-indigo-700
      hover:bg-indigo-100
    "
                      >

                        Messages (
                        {
                          communicationCounts[
                          status.name
                            .replace(
                              /[^\w\s]/gi,
                              ""
                            )
                            .trim()
                            .toLowerCase()
                          ] || 0
                        }
                        )

                      </Link>

                    </td>

                    <td className="px-6 py-5">

                      <div className="flex justify-end gap-3">

                        <button
                          type="button"
                          onClick={() =>
                            moveStatus(
                              index,
                              "up"
                            )
                          }
                          className="
    rounded-xl
    border
    border-gray-300
    bg-white
    px-3
    py-2
    text-sm
    font-bold
    text-gray-700
    hover:bg-gray-100
  "
                        >
                          ↑
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            moveStatus(
                              index,
                              "down"
                            )
                          }
                          className="
    rounded-xl
    border
    border-gray-300
    bg-white
    px-3
    py-2
    text-sm
    font-bold
    text-gray-700
    hover:bg-gray-100
  "
                        >
                          ↓
                        </button>

                        <Link
                          href={`/admin/statuses/${status.id}`}
                          className="
                        rounded-xl
                        bg-blue-600
                        px-4
                        py-2
                        text-sm
                        font-semibold
                        text-white
                        hover:bg-blue-700
                      "
                        >
                          Edit
                        </Link>

                        <Link
                          href="/admin/communication"
                          className="
                        rounded-xl
                        border
                        border-gray-300
                        bg-white
                        px-4
                        py-2
                        text-sm
                        font-semibold
                        text-gray-700
                        hover:bg-gray-100
                      "
                        >
                          Messages
                        </Link>
                        <button
                          type="button"
                          disabled={!policy.canDelete}
                          onClick={() => {
                            if (!policy.canDelete) {
                              return;
                            }

                            deleteStatus(status.id);

                          }}
                          className={`
  rounded-xl
  border
  px-4
  py-2
  text-sm
  font-semibold
  ${!policy.canDelete
                              ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                              : "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                            }
`}
                        >
                          Delete
                        </button>
                      </div>

                    </td>

                  </tr>

                );
              })}

          </tbody>

        </table>

      </div>

    </div>
  );
}
