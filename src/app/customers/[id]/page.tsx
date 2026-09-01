"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

import {
  useEffect,
  useState,
} from "react";

import {
  useParams,
} from "next/navigation";

import {
  clientDb,
} from "@/lib/firebaseClient";

import {
  COMPANY_ID,
} from "@/lib/company";
import { normalizedPhoneValues } from "@/lib/whatsapp/phoneIndex";


export default function CustomerDetailsPage() {

  const params = useParams();

  const customerId =
    params.id as string;

  const [saving, setSaving] =
    useState(false);

  const pathname = usePathname();

  const [customer, setCustomer] =
    useState<any>(null);
  const [customFieldDefinitions, setCustomFieldDefinitions] = useState<any[]>([]);

  useEffect(() => {

    const unsub = onSnapshot(

      doc(
        clientDb,
        "companies",
        COMPANY_ID,
        "customers",
        customerId
      ),

      (snapshot) => {

        if (snapshot.exists()) {

          setCustomer({

            id: snapshot.id,

            ...snapshot.data(),
          });
        }
      }
    );

    return () => unsub();

  }, [customerId]);

  useEffect(() => {
    getDoc(doc(clientDb, "companies", COMPANY_ID, "settings", "customerFields"))
      .then((snapshot) => {
        if (!snapshot.exists()) return;
        setCustomFieldDefinitions((snapshot.data().fields || []).filter((field: any) => field.isCustom === true));
      })
      .catch(console.error);
  }, []);

  async function saveCustomer() {

    const missingCustomField = customFieldDefinitions.find(
      (field) => field.required && String(customer.customFields?.[field.id] ?? "").trim() === ""
    );
    if (missingCustomField) {
      alert(`${missingCustomField.label} is required.`);
      return;
    }

    try {

      setSaving(true);

      const settingsRef = doc(clientDb, "companies", COMPANY_ID, "settings", "customerFields");
      const customerRef = doc(clientDb, "companies", COMPANY_ID, "customers", customerId);
      await runTransaction(clientDb, async (transaction) => {
        const snapshot = await transaction.get(settingsRef);
        const data = snapshot.exists() ? snapshot.data() : {};
        const fields = (data.fields || []).map((field: any) => {
          const enteredValue = String(customer.customFields?.[field.id] ?? "").trim();
          if (field.isCustom !== true || field.type === "text" || !enteredValue) return field;
          const options = Array.isArray(field.options) ? field.options : [];
          return options.some((option: string) => option.toLowerCase() === enteredValue.toLowerCase())
            ? field
            : { ...field, options: [...options, enteredValue] };
        });
        const manualCode = String(customer.customerCode || "").trim();
        const numbering = data.customerNumbering || {};
        const prefix = String(numbering.prefix ?? "CUS-").trim();
        const nextNumber = Math.max(1, Number(numbering.nextNumber || 1));
        const padding = Math.min(10, Math.max(1, Number(numbering.padding || 5)));
        const customerCode = manualCode || `${prefix}${String(nextNumber).padStart(padding, "0")}`;
        const { id: _customerId, ...customerData } = customer;

        transaction.set(settingsRef, {
          fields: fields.length ? fields : data.fields || [],
          ...(manualCode ? {} : { customerNumbering: { prefix, padding, nextNumber: nextNumber + 1 } }),
          updatedAt: serverTimestamp(),
        }, { merge: true });
        const normalizedPhoneNumbers = normalizedPhoneValues([customerData.primaryContactNumber, customerData.whatsappNumberE164]);
        transaction.set(customerRef, {
          ...customerData,
          customerCode,
          normalizedPhoneNumbers,
          primaryContactNumberE164: normalizedPhoneValues([customerData.primaryContactNumber])[0] || "",
          updatedAt: serverTimestamp(),
        }, { merge: true });
      });

      alert(
        "Customer Updated"
      );

    } catch (error) {

      console.error(error);

      alert(
        "Failed to update"
      );

    } finally {

      setSaving(false);

    }
  }

  if (!customer) {

    return (
      <div className="p-10">
        Loading...
      </div>
    );
  }

  return (

    <div className="min-h-screen bg-[#f5f7fb]">

      {/* HEADER */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">

        <div className="flex items-center justify-between">

          <div>

            <div className="text-sm text-gray-500 mb-2">
              Customers
            </div>

            <h1 className="text-3xl font-black text-gray-900">

              {
                customer.customerType ===
                  "individual"

                  ? customer.customerName

                  : customer.companyName
              }

            </h1>

          </div>

          <div className="flex items-center gap-3">

            <Link
              href="/customers"
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
              Cancel
            </Link>

            <button
              onClick={saveCustomer}
              disabled={saving}
              className="
                h-12
                px-6
                rounded-xl
                bg-blue-600
                hover:bg-blue-700
                text-white
                font-black
              "
            >
              {
                saving
                  ? "Saving..."
                  : "Save"
              }
            </button>

          </div>

        </div>

      </div>

      {/* MAIN LAYOUT */}
      <div className="flex">

        {/* SIDEBAR */}
        <div className="
          w-[260px]
          min-h-screen
          border-r
          border-gray-200
          bg-white
          p-4
        ">

          <div className="space-y-2">

            <Link
              href={`/customers/${customerId}`}
              className="
      flex
      items-center
      w-full
      h-12
      rounded-2xl
      bg-blue-600
      text-white
      font-bold
      px-5
    "
            >
              ℹ️ Details
            </Link>

            <Link
              href={`/customers/${customerId}/contacts`}
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

            <Link href={`/customers/${customerId}/recurring-jobs`} className="flex h-12 w-full items-center rounded-2xl px-5 font-bold text-gray-700 hover:bg-gray-100">🔁 Recurring Jobs</Link>

            <Link
              href={`/customers/${customerId}/fleetlist`}
              className={`
    flex
    items-center
    rounded-2xl
    px-5
    py-3
    text-sm
    font-bold
    transition
    ${pathname === "/customers/fleetlist"
                  ? "bg-blue-600 text-white"
                  : "text-gray-700 hover:bg-gray-100"
                }
  `}
            >

              🚛 Fleet List

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

        {/* MAIN CONTENT */}
        <div className="flex-1 p-6">

          <div className="
            bg-white
            border
            border-gray-200
            rounded-3xl
            p-8
            shadow-sm
          ">

            {/* CUSTOMER TYPE */}
            <div className="mb-8">

              <label className="
                block
                text-sm
                font-bold
                text-gray-700
                mb-3
              ">
                Customer Type
              </label>

              <div className="flex items-center gap-4">

                <button
                  type="button"
                  onClick={() =>
                    setCustomer({
                      ...customer,
                      customerType:
                        "company",
                    })
                  }
                  className={`
                    h-12
                    px-6
                    rounded-2xl
                    font-bold
                    transition

                    ${customer.customerType ===
                      "company"

                      ? "bg-blue-600 text-white"

                      : "bg-gray-100 text-gray-700"
                    }
                  `}
                >
                  Company
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setCustomer({
                      ...customer,
                      customerType:
                        "individual",
                    })
                  }
                  className={`
                    h-12
                    px-6
                    rounded-2xl
                    font-bold
                    transition

                    ${customer.customerType ===
                      "individual"

                      ? "bg-blue-600 text-white"

                      : "bg-gray-100 text-gray-700"
                    }
                  `}
                >
                  Individual
                </button>

              </div>

            </div>

            {/* FORM */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

              {/* NAME */}
              <div>

                <label className="
                  block
                  text-sm
                  font-bold
                  text-gray-700
                  mb-2
                ">

                  {
                    customer.customerType ===
                      "individual"

                      ? "Customer Name"

                      : "Company Name"
                  }

                </label>

                  <input
                    type="text"
                  value={
                    customer.customerType === "individual"
                      ? customer.customerName || ""
                      : customer.companyName || ""
                  }
                  onChange={(e) =>

                    setCustomer({

                      ...customer,

                      ...(customer.customerType === "individual"

                        ? {
                          customerName:
                            e.target.value,
                        }

                        : {
                          companyName:
                            e.target.value,
                        }),
                    })
                  }
                  className="
                    w-full
                    h-14
                    rounded-2xl
                    border-2
                    border-gray-200
                    px-5
                  "
                />

              </div>

              {/* CUSTOMER CODE */}
              <div>

                <label className="
                  block
                  text-sm
                  font-bold
                  text-gray-700
                  mb-2
                ">
                  Customer Code
                </label>

                  <input
                    type="text"
                    value={
                      customer.customerCode || ""
                    }
                    placeholder="Leave blank to assign automatically"
                  onChange={(e) =>
                    setCustomer({
                      ...customer,
                      customerCode:
                        e.target.value,
                    })
                  }
                  className="
                    w-full
                    h-14
                    rounded-2xl
                    border-2
                    border-gray-200
                    px-5
                  "
                />

              </div>

              {/* VAT */}
              <div>

                <label className="
                  block
                  text-sm
                  font-bold
                  text-gray-700
                  mb-2
                ">
                  VAT Number
                </label>

                <input
                  type="text"
                  value={
                    customer.vatNumber || ""
                  }
                  onChange={(e) =>
                    setCustomer({
                      ...customer,
                      vatNumber:
                        e.target.value,
                    })
                  }
                  className="
                    w-full
                    h-14
                    rounded-2xl
                    border-2
                    border-gray-200
                    px-5
                  "
                />

              </div>

              {/* ADDRESS */}
              <div className="xl:col-span-2">

                <label className="
                  block
                  text-sm
                  font-bold
                  text-gray-700
                  mb-2
                ">
                  Billing Address
                </label>

                <textarea
                  value={
                    customer.address || ""
                  }
                  onChange={(e) =>
                    setCustomer({
                      ...customer,
                      address:
                        e.target.value,
                    })
                  }
                  className="
                    w-full
                    h-32
                    rounded-2xl
                    border-2
                    border-gray-200
                    p-5
                  "
                />

              </div>

              {/* NOTES */}
              <div className="xl:col-span-2">

                <label className="
                  block
                  text-sm
                  font-bold
                  text-gray-700
                  mb-2
                ">
                  Notes
                </label>

                <textarea
                  value={
                    customer.notes || ""
                  }
                  onChange={(e) =>
                    setCustomer({
                      ...customer,
                      notes:
                        e.target.value,
                    })
                  }
                  className="
                    w-full
                    h-40
                    rounded-2xl
                    border-2
                    border-gray-200
                    p-5
                  "
                />

              </div>

              {customFieldDefinitions.map((field) => <div key={field.id}>
                <label className="mb-2 block text-sm font-bold text-gray-700">{field.label}{field.required && <span className="text-red-500"> *</span>}</label>
                <input {...(field.type === "text" ? {} : { list: `customer-field-${field.id}` })} value={customer.customFields?.[field.id] ?? ""} onChange={(event) => setCustomer({ ...customer, customFields: { ...(customer.customFields || {}), [field.id]: event.target.value } })} placeholder={field.type === "text" ? `Enter ${field.label}` : `Select or enter ${field.label}`} className="h-14 w-full rounded-2xl border-2 border-gray-200 bg-white px-5" />
                {field.type !== "text" && <><datalist id={`customer-field-${field.id}`}>{(field.options || []).map((option: string) => <option key={option} value={option} />)}</datalist><p className="mt-1 text-xs text-gray-500">Select an existing value or enter a new one. New values are added to this dropdown.</p></>}
              </div>)}

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
