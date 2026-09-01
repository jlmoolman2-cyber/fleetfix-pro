"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

export default function AdminJobsPage() {
  const [statuses, setStatuses] = useState<string[]>([
    "Booked",
    "Assigned",
    "In Progress",
    "Waiting Parts",
    "Completed",
    "Closed",
  ]);

  const addStatus = () => {
    const newStatus = prompt("Enter new job status");

    if (!newStatus) return;

    setStatuses((prev) => [...prev, newStatus]);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">

      <div className="max-w-6xl mx-auto">

        {/* HEADER */}
        <div className="mb-8">

          <h1 className="text-3xl font-black text-gray-900">
            Job Status Setup
          </h1>

          <p className="text-gray-500 mt-2">
            Manage FleetFox-Pro workflow statuses
          </p>

        </div>


        {/* STATUS CARD */}
        <div className="
          bg-white
          rounded-3xl
          shadow-sm
          overflow-hidden
        ">

          {/* TOP BAR */}
          <div className="
            px-8
            py-6
            flex
            justify-between
            items-center
            border-b
          ">

            <div>

              <h2 className="text-xl font-black">
                Job Workflow Status
              </h2>

              <p className="text-sm text-gray-400">
                Add or edit job progress stages
              </p>

            </div>


            <button
              onClick={addStatus}
              className="
                flex
                items-center
                gap-2
                bg-blue-600
                text-white
                px-5
                py-3
                rounded-xl
                font-bold
                hover:bg-blue-700
              "
            >

              <Plus size={18} />

              Add Status

            </button>

          </div>



          {/* STATUS LIST */}
          <div className="divide-y divide-gray-100">

            {statuses.map((status, index) => (

              <div
                key={index}
                className="
                  px-8
                  py-5
                  flex
                  items-center
                  justify-between
                  hover:bg-gray-50
                "
              >

                <div className="flex items-center gap-4">

                  <div className="
                    h-12
                    w-12
                    rounded-2xl
                    bg-blue-100
                    flex
                    items-center
                    justify-center
                    text-xl
                  ">
                    🛠️
                  </div>


                  <div>

                    <div className="font-black text-gray-900">
                      {status}
                    </div>


                    <div className="text-sm text-gray-400 mt-1">
                      Workflow status configuration
                    </div>


                  </div>


                </div>



                <button
                  onClick={() => alert(`Edit ${status}`)}
                  className="
                    px-4
                    py-2
                    rounded-xl
                    border
                    border-gray-200
                    text-sm
                    font-bold
                    hover:border-blue-400
                    hover:text-blue-600
                  "
                >

                  Edit

                </button>


              </div>

            ))}

          </div>


        </div>


      </div>


    </div>
  );
}