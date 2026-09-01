"use client";

import Link from "next/link";

import {
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

import {
  clientDb,
} from "@/lib/firebaseClient";

import {
  COMPANY_ID,
} from "@/lib/company";
import { normalizedPhoneValues } from "@/lib/whatsapp/phoneIndex";

import {
  useParams,
  useRouter,
} from "next/navigation";

import {
  useState,
} from "react";

export default function NewCustomerContactPage() {

  const params = useParams();

  const router = useRouter();

  const customerId =
    params.id as string;

  const [contact, setContact] =
    useState({

      name: "",

      mobile: "",

      email: "",

      position: "",

    });

  const saveContact = async () => {

    try {

      if (!contact.name) {

        alert(
          "Contact name required"
        );

        return;
      }

      await addDoc(

        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "customers",
          customerId,
          "contacts"
        ),

        {

          companyId: COMPANY_ID,

          normalizedPhoneNumbers: normalizedPhoneValues([contact.mobile]),

          mobileE164: normalizedPhoneValues([contact.mobile])[0] || "",

          name:
            contact.name || "",

          mobile:
            contact.mobile || "",

          email:
            contact.email || "",

          position:
            contact.position || "",

          customerId,

          createdAt:
            serverTimestamp(),
        }
      );

      router.replace(
        `/customers/${customerId}/contacts`
      );

    } catch (err) {

      console.error(err);

      alert(
        "Failed to save contact"
      );
    }
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
              Add Contact
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Create a new customer contact
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
              Save Contact
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
                value={contact.name}
                onChange={(e) =>
                  setContact({
                    ...contact,
                    name: e.target.value,
                  })
                }
                placeholder="Enter contact name"
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
                value={contact.mobile}
                onChange={(e) =>
                  setContact({
                    ...contact,
                    mobile: e.target.value,
                  })
                }
                placeholder="Enter mobile number"
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
                value={contact.email}
                onChange={(e) =>
                  setContact({
                    ...contact,
                    email: e.target.value,
                  })
                }
                placeholder="Enter email address"
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
                value={contact.position}
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
