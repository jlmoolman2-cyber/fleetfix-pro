"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { collection, onSnapshot, serverTimestamp, updateDoc, doc } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

import { COMPANY_ID } from "@/lib/company";
import { clientDb } from "@/lib/firebaseClient";

type JobTask = {
  id: string;
  name?: string;
  assignedTo?: string;
  completed?: boolean;
  autoAllocated?: boolean;
  templateId?: string;
  templateName?: string;
};

export default function JobTasksPage() {
  const params = useParams();
  const jobId = String(params.id);
  const [tasks, setTasks] = useState<JobTask[]>([]);

  const tasksRef = useMemo(
    () => collection(clientDb, "companies", COMPANY_ID, "jobs", jobId, "tasks"),
    [jobId]
  );

  useEffect(() => {
    return onSnapshot(tasksRef, (snapshot) => {
      setTasks(
        snapshot.docs.map((taskDoc) => ({
          id: taskDoc.id,
          ...(taskDoc.data() as Omit<JobTask, "id">),
        }))
        .filter(
          (task) =>
            task.autoAllocated === true ||
            Boolean(task.templateId)
        )
      );
    });
  }, [tasksRef]);

  async function toggleTask(task: JobTask) {
    await updateDoc(
      doc(clientDb, "companies", COMPANY_ID, "jobs", jobId, "tasks", task.id),
      {
        completed: !task.completed,
        updatedAt: serverTimestamp(),
      }
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
              Job Tasks
            </div>
            <h1 className="text-3xl font-black text-gray-900">Tasks</h1>
            <p className="mt-2 text-sm text-gray-500">
              Complete the tasks allocated by this job&apos;s Job Type.
            </p>
          </div>

          <Link
            href={`/jobs/${jobId}`}
            className="rounded-xl bg-blue-500 px-4 py-3 text-sm font-black text-white hover:bg-blue-600"
          >
            Back to Job
          </Link>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          {tasks.length === 0 ? (
            <div className="p-6 text-sm font-semibold text-gray-500">No tasks added yet.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {tasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => toggleTask(task)}
                  className="flex w-full items-center justify-between gap-4 p-5 text-left hover:bg-gray-50"
                >
                  <div>
                    <div className="font-black text-gray-900">{task.name || "Untitled task"}</div>
                    <div className="mt-1 text-xs font-semibold text-gray-500">
                      Template: {task.templateName || "Linked Task Template"}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black ${
                      task.completed ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
                    }`}
                  >
                    {task.completed ? "Done" : "Pending"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
