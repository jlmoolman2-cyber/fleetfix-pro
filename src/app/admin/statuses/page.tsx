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
  clientDb,
} from "@/lib/firebaseClient";

import {
  COMPANY_ID,
} from "@/lib/company";

type Status = {

  id: string;

  name: string;

  color: string;

  sortOrder?: number;

  startTimer?: boolean;

  stopTimer?: boolean;

  closeJob?: boolean;

  active?: boolean;
};

export default function StatusesPage() {

  const [statuses, setStatuses] =
    useState<Status[]>([]);

  const [
    communicationCounts,
    setCommunicationCounts,
  ] = useState<
    Record<string, number>
  >({});

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

                const isLockedStartStatus =
                  status.name
                    .replace(
                      /[^\w\s]/gi,
                      ""
                    )
                    .trim()
                    .toLowerCase() ===
                  "job booked";

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
      ${isLockedStartStatus
                            ? "bg-green-600 text-white"
                            : status.active === false
                              ? "bg-gray-200 text-gray-700"
                              : "bg-green-600 text-white"
                          }
    `}
                      >
                        {isLockedStartStatus
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
                          onClick={() => {

                            if (isLockedStartStatus) {
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
  ${isLockedStartStatus
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
