"use client";


export default function AdminSettingsPage() {
  return (
    <div className="min-h-screen bg-[#f5f7fb] p-6">

      <div className="mx-auto max-w-7xl">


        {/* CUSTOM SETTINGS */}
        <div
          className="
            mb-6
            rounded-3xl
            border
            border-gray-200
            bg-white
            p-6
            shadow-sm
          "
        >

          <div className="mb-6 flex items-center justify-between">

            <div>

              <h2 className="text-2xl font-black text-gray-900">
                Custom Settings
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Configure custom fields and operational options
              </p>

            </div>

            <button
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
              Save
            </button>

          </div>

          <div className="grid gap-6 md:grid-cols-2">

            {[
              "Job Card Custom Date 1",
              "Job Card Custom Date 2",
              "Job Card Custom Field 1",
              "Job Card Custom Field 2",
              "Job Card Custom Filter 1",
              "Job Card Custom Filter 2",
              "Job Card Custom Number 1",
              "Job Card Custom Number 2",
              "Job Field 3",
              "Job Field 4",
            ].map((field, index) => (

              <div key={index}>

                <label className="mb-2 block text-sm font-semibold text-gray-700">
                  {field}
                </label>

                <input
                  defaultValue={field}
                  className="
                    w-full
                    rounded-2xl
                    border
                    border-gray-300
                    px-4
                    py-3
                    text-sm
                    outline-none
                    focus:border-blue-500
                  "
                />

              </div>

            ))}

          </div>

        </div>

        {/* PREFERENCES */}
        <div
          className="
            mb-6
            rounded-3xl
            border
            border-gray-200
            bg-white
            p-6
            shadow-sm
          "
        >

          <h2 className="mb-5 text-2xl font-black text-gray-900">
            Job Card Preferences
          </h2>

          <label
            className="
              flex
              items-center
              gap-3
              rounded-2xl
              border
              border-gray-200
              p-4
            "
          >

            <input
              type="checkbox"
              defaultChecked
              className="h-5 w-5"
            />

            <span className="font-medium text-gray-700">
              Manually closing a job will mark materials as used
            </span>

          </label>

        </div>

        {/* NUMBERING */}
        <div
          className="
            rounded-3xl
            border
            border-gray-200
            bg-white
            p-6
            shadow-sm
          "
        >

          <div className="mb-6">

            <h2 className="text-2xl font-black text-gray-900">
              Prefix and Numbering Settings
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Control how record numbers are generated
            </p>

          </div>

          {/* HINT */}
          <div
            className="
              mb-6
              rounded-2xl
              border
              border-blue-200
              bg-blue-50
              p-5
            "
          >

            <h3 className="mb-3 font-bold text-blue-900">
              💡 Hint
            </h3>

            <ul className="space-y-2 text-sm text-blue-800">

              <li>
                • Changing number sequences may affect future records
              </li>

              <li>
                • Use leading zeros for formatted numbering
              </li>

            </ul>

          </div>

          {/* NUMBERING GRID */}
          <div className="grid gap-6 lg:grid-cols-2">

            {/* LEFT */}
            <div
              className="
                rounded-3xl
                border
                border-gray-200
                p-6
              "
            >

              <h3 className="mb-5 text-xl font-bold text-gray-900">
                Job Cards
              </h3>

              <div className="space-y-5">

                <div>

                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Prefix
                  </label>

                  <input
                    defaultValue="NJ"
                    className="
                      w-full
                      rounded-2xl
                      border
                      border-gray-300
                      px-4
                      py-3
                    "
                  />

                </div>

                <div>

                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Current Number
                  </label>

                  <input
                    defaultValue="2516073"
                    className="
                      w-full
                      rounded-2xl
                      border
                      border-gray-300
                      px-4
                      py-3
                    "
                  />

                </div>

                <div
                  className="
                    rounded-2xl
                    bg-blue-50
                    p-5
                  "
                >

                  <p className="text-sm text-blue-700">
                    Next Job Number
                  </p>

                  <p className="mt-2 text-3xl font-black text-blue-900">
                    NJ2516074
                  </p>

                </div>

              </div>

            </div>

            {/* RIGHT */}
            <div
              className="
                rounded-3xl
                border
                border-gray-200
                p-6
              "
            >

              <h3 className="mb-5 text-xl font-bold text-gray-900">
                Recurring Jobs
              </h3>

              <div className="space-y-5">

                <div>

                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Prefix
                  </label>

                  <input
                    defaultValue="RJB"
                    className="
                      w-full
                      rounded-2xl
                      border
                      border-gray-300
                      px-4
                      py-3
                    "
                  />

                </div>

                <div>

                  <label className="mb-2 block text-sm font-semibold text-gray-700">
                    Current Number
                  </label>

                  <input
                    defaultValue="10000"
                    className="
                      w-full
                      rounded-2xl
                      border
                      border-gray-300
                      px-4
                      py-3
                    "
                  />

                </div>

                <div
                  className="
                    rounded-2xl
                    bg-indigo-50
                    p-5
                  "
                >

                  <p className="text-sm text-indigo-700">
                    Next Recurring Job
                  </p>

                  <p className="mt-2 text-3xl font-black text-indigo-900">
                    RJB10001
                  </p>

                </div>

              </div>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}