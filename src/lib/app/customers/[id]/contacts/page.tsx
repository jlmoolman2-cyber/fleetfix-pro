"use client";

import Link from "next/link";

import {
  useEffect,
  useState,
} from "react";

import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  getDoc,
} from "firebase/firestore";

import {
  useParams,
} from "next/navigation";

import {
  clientDb,
} from "@/lib/firebaseClient";

import {
  COMPANY_ID,
} from "@/lib/company";

export default function CustomerContactsPage() {

  const params = useParams();

  const customerId =
    params.id as string;

  const [contacts, setContacts] =
    useState<any[]>([]);

  const [customer, setCustomer] =
    useState<any>(null);

  useEffect(() => {

    async function loadContacts() {

      try {

        const customerSnap =
          await getDoc(

            doc(
              clientDb,
              "companies",
              COMPANY_ID,
              "customers",
              customerId
            )
          );

        if (customerSnap.exists()) {

          setCustomer({

            id: customerSnap.id,

            ...customerSnap.data(),
          });
        }

        const contactsSnap =
          await getDocs(

            collection(
              clientDb,
              "companies",
              COMPANY_ID,
              "customers",
              customerId,
              "contacts"
            )
          );

        const data =
          contactsSnap.docs.map((doc) => ({

            id: doc.id,

            ...doc.data(),
          }));

        setContacts(data);

      } catch (err) {

        console.error(err);
      }
    }

    loadContacts();

  }, [customerId]);
  const deleteContact = async (
    contactId: string
  ) => {

    try {

      await deleteDoc(

        doc(
          clientDb,
          "companies",
          COMPANY_ID,
          "customers",
          customerId,
          "contacts",
          contactId
        )
      );

      setContacts((prev) =>

        prev.filter(
          (item) =>
            item.id !== contactId
        )
      );

    } catch (err) {

      console.error(err);
    }
  };

  return (

    <div className="min-h-screen bg-[#f5f7fb]">

      {/* HEADER */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">

        <div className="flex items-center justify-between">

          <div>

            <div className="mb-2 text-sm text-gray-500">
              Customers
            </div>

            <h1 className="text-3xl font-black text-gray-900">
              {customer?.companyName ||
                customer?.name ||
                "Customer Contacts"}
            </h1>

          </div>

          <div className="flex items-center gap-3">

            {/* BACK */}
            <Link
              href={`/customers/${customerId}`}
              className="
                h-12
                px-6
                rounded-xl
                border
                border-gray-300
                bg-white
                hover:bg-gray-100
                flex
                items-center
                justify-center
                font-bold
              "
            >
              Back
            </Link>

            {/* ADD CONTACT */}
            <Link
              href={`/customers/${customerId}/contacts/new`}
              className="
                h-12
                px-6
                rounded-xl
                bg-blue-600
                hover:bg-blue-700
                text-white
                font-black
                flex
                items-center
                justify-center
              "
            >
              + Add Contact
            </Link>

          </div>

        </div>

      </div>

      {/* MAIN */}
      <div className="flex">

        {/* SIDEBAR */}
        <div
          className="
            w-[260px]
            min-h-screen
            border-r
            border-gray-200
            bg-white
            p-4
          "
        >

          <div className="space-y-2">

            <Link
              href={`/customers/${customerId}`}
              className="
                flex
                items-center
                w-full
                h-12
                rounded-2xl
                hover:bg-gray-100
                px-5
                font-bold
                text-gray-700
              "
            >
              ℹ️  Details
            </Link>

            <Link
              href={`/customers/${customerId}/contacts`}
              className="
                flex
                items-center
                w-full
                h-12
                rounded-2xl
                bg-blue-600
                text-white
                px-5
                font-bold
              "
            >
              🗃️ Contacts
            </Link>

            <Link
              href={`/customers/${customerId}/jobs`}
              className="
                flex
                items-center
                w-full
                h-12
                rounded-2xl
                hover:bg-gray-100
                px-5
                font-bold
                text-gray-700
              "
            >
              📋 Jobs
            </Link>

            <Link
              href={`/customers/${customerId}/system-dm`}
              className="
                flex
                items-center
                w-full
                h-12
                rounded-2xl
                hover:bg-gray-100
                px-5
                font-bold
                text-gray-700
              "
            >
              💬 System DM
            </Link>

            <Link
              href={`/customers/${customerId}/attachments`}
              className="
                flex
                items-center
                w-full
                h-12
                rounded-2xl
                hover:bg-gray-100
                px-5
                font-bold
                text-gray-700
              "
            >
              📎 Attachments
            </Link>

          </div>

        </div>

        {/* CONTENT */}
        <div className="flex-1 p-6">

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

            {/* TITLE */}
            <div className="mb-6 flex items-center justify-between">

              <div>

                <h2 className="text-2xl font-black text-gray-900">
                  Customer Contacts
                </h2>

                <p className="mt-2 text-sm text-gray-500">
                  Manage customer contact persons
                </p>

              </div>

            </div>

            {/* EMPTY STATE */}
            {contacts.length === 0 && (

              <div
                className="
                  rounded-3xl
                  border-2
                  border-dashed
                  border-gray-300
                  p-20
                  text-center
                "
              >

                <div className="mb-5 text-7xl">
                  👥
                </div>

                <h3 className="text-3xl font-black text-gray-900">
                  No Contacts Added
                </h3>

                <p className="mt-3 text-gray-500">
                  Add customer contact persons for communication and job updates
                </p>

                <Link
                  href={`/customers/${customerId}/contacts/new`}
                  className="
                    inline-flex
                    mt-8
                    rounded-2xl
                    bg-blue-600
                    px-6
                    py-4
                    text-sm
                    font-bold
                    text-white
                    hover:bg-blue-700
                  "
                >
                  + Add First Contact
                </Link>

              </div>

            )}

            {/* CONTACT LIST */}
            {contacts.length > 0 && (

              <div className="space-y-4">

                {contacts.map((contact) => (

                  <div
                    key={contact.id}
                    className="
                      flex
                      items-center
                      justify-between
                      rounded-2xl
                      border
                      border-gray-200
                      p-5
                    "
                  >

                    {/* LEFT */}
                    <div>

                      <div className="text-lg font-black text-gray-900">
                        {contact.name}
                      </div>

                      <div className="mt-1 text-sm text-gray-500">
                        {contact.position}
                      </div>

                    </div>

                    {/* RIGHT */}
                    <div className="flex items-center gap-6">

                      <div className="text-right">

                        <div className="text-sm font-semibold text-gray-700">
                          {contact.mobile}
                        </div>

                        <div className="mt-1 text-sm text-gray-500">
                          {contact.email}
                        </div>

                      </div>

                      {/* MESSAGESs */}
                      <div className="flex gap-2">

                        {/* EDIT */}
                        <Link
                          href={`/customers/${customerId}/contacts/${contact.id}`}
                          className="
                            rounded-xl
                            bg-blue-600
                            px-4
                            py-2
                            text-sm
                            font-bold
                            text-white
                            hover:bg-blue-700
                          "
                        >
                          Edit
                        </Link>

                        {/* DELETE */}
                        <button
                          onClick={() =>
                            deleteContact(contact.id)
                          }
                          className="
                            rounded-xl
                            bg-red-50
                            px-4
                            py-2
                            text-sm
                            font-bold
                            text-red-600
                            hover:bg-red-100
                          "
                        >
                          Delete
                        </button>

                      </div>

                    </div>

                  </div>

                ))}

              </div>

            )}

          </div>

        </div>

      </div>

    </div>
  );
}