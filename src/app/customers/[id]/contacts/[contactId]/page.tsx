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
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { clientDb } from "@/lib/firebaseClient";
import { COMPANY_ID } from "@/lib/company";
import { normalizedPhoneValues } from "@/lib/whatsapp/phoneIndex";

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {

    async function loadContact() {
      try {
        setLoading(true);
        const snapshot = await getDoc(doc(clientDb, "companies", COMPANY_ID, "customers", customerId, "contacts", contactId));
        if (!snapshot.exists()) {
          setLoadError("Contact not found.");
          return;
        }
        setContact({ id: snapshot.id, ...snapshot.data() });
      } catch (error) {
        console.error(error);
        setLoadError("Unable to load this contact.");
      } finally {
        setLoading(false);
      }
    }

    loadContact();

  }, [
    customerId,
    contactId,
  ]);

  const saveContact = async () => {
    if (!contact.name?.trim()) return alert("Contact name required");
    try {
      setSaving(true);
      await updateDoc(doc(clientDb, "companies", COMPANY_ID, "customers", customerId, "contacts", contactId), {
        name: contact.name.trim(),
        mobile: contact.mobile || "",
        email: contact.email || "",
        position: contact.position || "",
        companyId: COMPANY_ID,
        normalizedPhoneNumbers: normalizedPhoneValues([contact.mobile, contact.whatsappNumberE164]),
        mobileE164: normalizedPhoneValues([contact.mobile])[0] || "",
        updatedAt: serverTimestamp(),
      });
      router.replace(`/customers/${customerId}/contacts`);
    } catch (error) {
      console.error(error);
      alert("Failed to update contact");
    } finally {
      setSaving(false);
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
              disabled={saving || loading || Boolean(loadError)}
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
              {saving ? "Saving..." : "Save Changes"}
            </button>

          </div>

        </div>

        {loading && <div className="rounded-3xl border bg-white p-10 text-center text-gray-500">Loading contact...</div>}
        {loadError && <div className="rounded-3xl border border-red-200 bg-red-50 p-10 text-center font-bold text-red-700">{loadError}</div>}

        {/* FORM */}
        {!loading && !loadError && (
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
        )}

      </div>

    </div>
  );
}
