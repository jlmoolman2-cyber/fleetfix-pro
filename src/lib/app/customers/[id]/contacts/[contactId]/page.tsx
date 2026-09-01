"use client";

import Link from "next/link";

import {
  useEffect,
  useState,
} from "react";

import {
  useParams,
  useRouter,
} from "next/navigation";

export default function EditCustomerContactPage() {

  const params = useParams();

  const router = useRouter();

  const customerId =
    params.id as string;

  const contactId =
    params.contactId as string;

  const [contact, setContact] =
    useState<any>({
      name: "",
      mobile: "",
      email: "",
      position: "",
    });

  useEffect(() => {

    const contacts =
      JSON.parse(
        localStorage.getItem(
          `customer_contacts_${customerId}`
        ) || "[]"
      );

    const foundContact =
      contacts.find(
        (item: any) =>
          String(item.id) ===
          contactId
      );

    if (foundContact) {
      setContact(foundContact);
    }

  }, [
    customerId,
    contactId,
  ]);

  const saveContact = () => {

    const contacts =
      JSON.parse(
        localStorage.getItem(
          `customer_contacts_${customerId}`
        ) || "[]"
      );

    const updatedContacts =
      contacts.map(
        (item: any) => {

          if (
            String(item.id) ===
            contactId
          ) {

            return contact;
          }

          return item;
        }
      );

    localStorage.setItem(
      `customer_contacts_${customerId}`,
      JSON.stringify(updatedContacts)
    );

    router.push(
      `/customers/${customerId}/contacts`
    );
  };

  return (

    <div className="min-h-screen bg-[#f5f7fb] p-6">

      <div className="mx-auto max-w-4xl">

        {/* HEADER */}
        <div
          className="
            mb-6
            flex
            items-center
            justify-between
            rounded-3xl
            border
            border-gray-200
            bg-white
            p-6
            shadow-sm
          "
        >

          <div>

            <h1 className="text-3xl font-black text-gray-900">
              Edit Contact
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Update customer contact information
            </p>

          </div>

          <div className="flex gap-3">

            <Link
              href={`/customers/${customerId}/contacts`}
              className="
                rounded-2xl
                border
                border-gray-300
                bg-white
                px-5
                py-3
                text-sm
                font-semibold
                text-gray-700
                hover:bg-gray-100
              "
            >
              Cancel
            </Link>

            <button
              onClick={saveContact}
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
              Save Changes
            </button>

          </div>

        </div>

        {/* FORM */}
        <div
          className="
            rounded-3xl
            border
            border-gray-200
            bg-white
            p-8
            shadow-sm
          "
        >

          <div className="grid gap-6 md:grid-cols-2">

            {/* CONTACT NAME */}
            <div>

              <label className="mb-2 block text-sm font-bold text-gray-700">
                Contact Name
              </label>

              <input
                type="text"
                value={contact.name || ""}
                onChange={(e) =>
                  setContact({
                    ...contact,
                    name: e.target.value,
                  })
                }
                className="
                  w-full
                  h-14
                  rounded-2xl
                  border-2
                  border-gray-200
                  px-5
                  outline-none
                  focus:border-blue-500
                "
              />

            </div>

            {/* MOBILE */}
            <div>

              <label className="mb-2 block text-sm font-bold text-gray-700">
                Mobile Number
              </label>

              <input
                type="text"
                value={contact.mobile || ""}
                onChange={(e) =>
                  setContact({
                    ...contact,
                    mobile: e.target.value,
                  })
                }
                className="
                  w-full
                  h-14
                  rounded-2xl
                  border-2
                  border-gray-200
                  px-5
                  outline-none
                  focus:border-blue-500
                "
              />

            </div>

            {/* EMAIL */}
            <div>

              <label className="mb-2 block text-sm font-bold text-gray-700">
                Email Address
              </label>

              <input
                type="email"
                value={contact.email || ""}
                onChange={(e) =>
                  setContact({
                    ...contact,
                    email: e.target.value,
                  })
                }
                className="
                  w-full
                  h-14
                  rounded-2xl
                  border-2
                  border-gray-200
                  px-5
                  outline-none
                  focus:border-blue-500
                "
              />

            </div>

            {/* CONTACT POSITION */}
            <div>

              <label className="mb-2 block text-sm font-bold text-gray-700">
                Contact Position
              </label>

              <select
                value={contact.position || ""}
                onChange={(e) =>
                  setContact({
                    ...contact,
                    position: e.target.value,
                  })
                }
                className="
                  w-full
                  h-14
                  rounded-2xl
                  border-2
                  border-gray-200
                  bg-white
                  px-5
                  outline-none
                  focus:border-blue-500
                "
              >

                <option value="">
                  Select Position
                </option>

                <option value="Primary">
                  Primary
                </option>

                <option value="Accounting">
                  Accounting
                </option>

                <option value="Breakdown Controller">
                  Breakdown Controller
                </option>

                <option value="Workshop">
                  Workshop
                </option>

                <option value="Group">
                  Group
                </option>

              </select>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}