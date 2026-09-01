export default function AdminRolesPage() {

  const roles = [

    {
      name: "Administrator",
      users: 2,
      color:
        "bg-red-100 text-red-700",
    },

    {
      name: "Manager",
      users: 4,
      color:
        "bg-blue-100 text-blue-700",
    },

    {
      name: "Technician",
      users: 12,
      color:
        "bg-green-100 text-green-700",
    },

    {
      name: "Accounts",
      users: 3,
      color:
        "bg-yellow-100 text-yellow-700",
    },
  ];

  return (

    <div className="min-h-screen bg-[#f5f7fb] p-6">

      <div className="max-w-[1800px] mx-auto">

        {/* HEADER */}
        <div className="mb-8">

          <div className="text-xs uppercase tracking-[0.2em] text-gray-400 font-black mb-2">
            Admin
          </div>

          <h1 className="text-4xl font-black text-gray-900">
            Roles & Permissions
          </h1>

          <p className="mt-2 text-sm text-gray-500">
            Configure user access and system permissions
          </p>

        </div>

        {/* GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">

          {roles.map((role) => (

            <div
              key={role.name}
              className="
                bg-white
                rounded-3xl
                border
                border-gray-200
                p-8
                shadow-sm
              "
            >

              <div className="flex items-center justify-between mb-6">

                <div
                  className={`
                    px-4
                    py-2
                    rounded-full
                    text-sm
                    font-black
                    ${role.color}
                  `}
                >
                  {role.name}
                </div>

                <div className="text-gray-400 text-sm">
                  {role.users} users
                </div>

              </div>

              <div className="space-y-3 mb-8 text-sm text-gray-600">

                <div>
                  ✓ Dashboard Access
                </div>

                <div>
                  ✓ Jobs Module
                </div>

                <div>
                  ✓ Inventory Module
                </div>

                <div>
                  ✓ Purchasing Module
                </div>

                <div>
                  ✓ Reports Module
                </div>

              </div>

              <button
                className="
                  w-full
                  h-12
                  rounded-2xl
                  border
                  border-gray-200
                  font-bold
                  hover:border-blue-400
                  hover:text-blue-600
                  transition
                "
              >
                Edit Permissions
              </button>

            </div>

          ))}

        </div>

      </div>

    </div>
  );
}