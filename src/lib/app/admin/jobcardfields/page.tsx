"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";

import {
  clientDb,
} from "@/lib/firebaseClient";

import {
  COMPANY_ID,
} from "@/lib/company";

const tabs = [
  "Job",
  "Quote",
  "Invoice",
  "Purchase Order",
];

const documentSections = {
  Job: [
    {
      title: "Customer Details",
      fields: [
        {
          id: "customerCode",
          label: "Customer Code",
          system: "System Field",
          editable: false,
        },
        {
          id: "customerName",
          label: "Customer Name",
          system: "System Field",
          editable: false,
        },
        {
          id: "contactName",
          label: "Contact Name",
          system: "System Field",
          editable: false,
        },
        {
          id: "email1",
          label: "Email1",
          system: "System Field",
          editable: false,
        },
        {
          id: "email2",
          label: "Email2",
          system: "System Field",
          editable: false,
        },
        {
          id: "email3",
          label: "Email3",
          system: "System Field",
          editable: false,
        },
        {
          id: "mobileNumber1",
          label: "Mobile Number1",
          system: "System Field",
          editable: false,
        },
        {
          id: "mobileNumber2",
          label: "Mobile Number2",
          system: "System Field",
          editable: false,
        },
        {
          id: "address",
          label: "Address",
          system: "System Field",
          editable: false,
        },
        {
          id: "addressName",
          label: "Address Name",
          system: "System Field",
          editable: false,
        },
        {
          id: "customtext1",
          label: "Custom Text Field 1",
          system: "Custom Text Field 1",
          editable: true,
        },
        {
          id: "customtext2",
          label: "Custom Text Field 2",
          system: "Custom Text Field 2",
          editable: true,
        },
        {
          id: "customtext3",
          label: "Custom Text Field 3",
          system: "Custom Text Field 3",
          editable: true,
        },
        {
          id: "customtext4",
          label: "Custom Text Field 4",
          system: "Custom Text Field 4",
          editable: true,
        },
      ],
    },

    {
      title: "Job Details",
      fields: [
        {
          id: "assignedEmployees",
          label: "Assigned employees",
          system: "System Field",
          editable: false,
        },
        {
          id: "assignedVan",
          label: "Assigned Van",
          system: "System Field",
          editable: false,
        },
        {
          id: "customerAssets",
          label: "Customer Assets",
          system: "System Field",
          editable: false,
        },
        {
          id: "customfield1",
          label: "Custom Field 1",
          system: "Custom Field 1",
          editable: true,
        },
        {
          id: "customfield2",
          label: "Custom Field 2",
          system: "Custom Field 2",
          editable: true,
        },
        {
          id: "customfield3",
          label: "Custom Field 3",
          system: "Custom Field 3",
          editable: true,
        },
        {
          id: "customfield4",
          label: "Custom Field 4",
          system: "Custom Field 4",
          editable: true,
        },
        {
          id: "customfield5",
          label: "Custom Field 5",
          system: "Custom Field 5",
          editable: true,
        },
        {
          id: "customfield6",
          label: "Custom Field 6",
          system: "Custom Field ",
          editable: true,
        },
        {
          id: "customfield7",
          label: "Custom Field 7",
          system: "Custom Field 7",
          editable: true,
        },
        {
          id: "customfield8",
          label: "Custom Field 8",
          system: "Custom Field 8",
          editable: true,
        },
        {
          id: "customfield9",
          label: "Custom Field 9",
          system: "Custom Field 9",
          editable: true,
        },
        {
          id: "customfield10",
          label: "Custom Field 10",
          system: "Custom Field 10",
          editable: true,
        },
      ],
    },

    {
      title: "Additional Details",
      fields: [
        {
          id: "materials",
          label: "Materials",
          system: "System Field",
          editable: false,
        },
        {
          id: "quotes",
          label: "Quotes",
          system: "System Field",
          editable: false,
        },
        {
          id: "invoices",
          label: "Invoices",
          system: "System Field",
          editable: false,
        },
        {
          id: "appointments",
          label: "Appointments",
          system: "System Field",
          editable: false,
        },
        {
          id: "timers",
          label: "Timers",
          system: "System Field",
          editable: false,
        },
        {
          id: "tasks",
          label: "Tasks",
          system: "System Field",
          editable: false,
        },
        {
          id: "jobSummary",
          label: "Job Summary",
          system: "System Field",
          editable: false,
        },
        {
          id: "internalComments",
          label: "Internal Comments",
          system: "System Field",
          editable: false,
        },
      ],
    },
  ],

  Quote: [
    {
      title: "Company Details",
      fields: [
        {
          id: "quotePostalAddress",
          label: "Postal Address",
          system: "System Field",
          editable: false,
        },
        {
          id: "quoteCompanyReg",
          label: "Company Registration Number",
          system: "System Field",
          editable: false,
        },
        {
          id: "quoteVat",
          label: "VAT Number",
          system: "System Field",
          editable: false,
        },
      ],
    },

    {
      title: "Customer Details",
      fields: [
        {
          id: "quotePrimaryLocation",
          label: "Primary Location",
          system: "System Field",
          editable: false,
        },
        {
          id: "quoteDelivery",
          label: "Delivery",
          system: "System Field",
          editable: false,
        },
        {
          id: "quotePostal",
          label: "Postal",
          system: "System Field",
          editable: false,
        },
        {
          id: "quoteCustomerReg",
          label: "Company Registration Number",
          system: "System Field",
          editable: false,
        },
        {
          id: "quoteVatCustomer",
          label: "VAT Number",
          system: "System Field",
          editable: false,
        },
      ],
    },

    {
      title: "Line Item",
      fields: [
        {
          id: "quoteCode",
          label: "Code",
          system: "System Field",
          editable: false,
        },
        {
          id: "quoteUnit",
          label: "Unit",
          system: "System Field",
          editable: false,
        },
        {
          id: "quoteQuantity",
          label: "Quantity",
          system: "System Field",
          editable: false,
        },
        {
          id: "quotePrice",
          label: "Price",
          system: "System Field",
          editable: false,
        },
        {
          id: "quoteDiscount",
          label: "Discount %",
          system: "System Field",
          editable: false,
        },
        {
          id: "quoteTotalEx",
          label: "Total Excluding",
          system: "System Field",
          editable: false,
        },
        {
          id: "quoteVatTotal",
          label: "VAT",
          system: "System Field",
          editable: false,
        },
        {
          id: "quoteTotal",
          label: "Total",
          system: "System Field",
          editable: false,
        },
        {
          id: "quoteDisplayImage",
          label: "Display Image",
          system: "System Field",
          editable: false,
        },
      ],
    },

    {
      title: "Additional Details",
      fields: [
        {
          id: "quoteReference",
          label: "Reference Number",
          system: "System Field",
          editable: false,
        },
        {
          id: "quoteCustomerCode",
          label: "Customer Code",
          system: "System Field",
          editable: false,
        },
        {
          id: "quoteSalesRep",
          label: "Sales Rep",
          system: "System Field",
          editable: false,
        },
        {
          id: "quotePhone",
          label: "Phone Number",
          system: "System Field",
          editable: false,
        },
        {
          id: "quoteEmail",
          label: "Email",
          system: "System Field",
          editable: false,
        },
        {
          id: "quoteLinkedItem",
          label: "Linked Item",
          system: "System Field",
          editable: false,
        },
        {
          id: "quotePayments",
          label: "Payments",
          system: "System Field",
          editable: false,
        },
        {
          id: "quoteDeposits",
          label: "Deposits",
          system: "System Field",
          editable: false,
        },
      ],
    },
  ],

  Invoice: [
    {
      title: "Company Details",
      fields: [
        {
          id: "invoicePostalAddress",
          label: "Postal Address",
          system: "System Field",
          editable: false,
        },
        {
          id: "invoiceCompanyReg",
          label: "Company Registration Number",
          system: "System Field",
          editable: false,
        },
        {
          id: "invoiceVat",
          label: "VAT Number",
          system: "System Field",
          editable: false,
        },
      ],
    },

    {
      title: "Customer Details",
      fields: [
        {
          id: "invoicePrimaryLocation",
          label: "Primary Location",
          system: "System Field",
          editable: false,
        },
        {
          id: "invoiceDelivery",
          label: "Delivery",
          system: "System Field",
          editable: false,
        },
        {
          id: "invoicePostal",
          label: "Postal",
          system: "System Field",
          editable: false,
        },
      ],
    },

    {
      title: "Line Item",
      fields: [
        {
          id: "invoiceCode",
          label: "Code",
          system: "System Field",
          editable: false,
        },
        {
          id: "invoiceUnit",
          label: "Unit",
          system: "System Field",
          editable: false,
        },
        {
          id: "invoiceQuantity",
          label: "Quantity",
          system: "System Field",
          editable: false,
        },
        {
          id: "invoicePrice",
          label: "Price",
          system: "System Field",
          editable: false,
        },
        {
          id: "invoiceDiscount",
          label: "Discount %",
          system: "System Field",
          editable: false,
        },
        {
          id: "invoiceTotalEx",
          label: "Total Excluding",
          system: "System Field",
          editable: false,
        },
        {
          id: "invoiceVatTotal",
          label: "VAT",
          system: "System Field",
          editable: false,
        },
        {
          id: "invoiceTotal",
          label: "Total",
          system: "System Field",
          editable: false,
        },
      ],
    },

    {
      title: "Additional Details",
      fields: [
        {
          id: "invoiceReference",
          label: "Reference Number",
          system: "System Field",
          editable: false,
        },
        {
          id: "invoiceCustomerCode",
          label: "Customer Code",
          system: "System Field",
          editable: false,
        },
        {
          id: "invoiceSalesRep",
          label: "Sales Rep",
          system: "System Field",
          editable: false,
        },
        {
          id: "invoicePayments",
          label: "Payments",
          system: "System Field",
          editable: false,
        },
      ],
    },
  ],

  "Purchase Order": [
    {
      title: "Company Details",
      fields: [
        {
          id: "poPostalAddress",
          label: "Postal Address",
          system: "System Field",
          editable: false,
        },
        {
          id: "poCompanyReg",
          label: "Company Registration Number",
          system: "System Field",
          editable: false,
        },
        {
          id: "poVat",
          label: "VAT Number",
          system: "System Field",
          editable: false,
        },
      ],
    },

    {
      title: "Supplier Details",
      fields: [
        {
          id: "poSupplierVat",
          label: "VAT Number",
          system: "System Field",
          editable: false,
        },
      ],
    },

    {
      title: "Line Item",
      fields: [
        {
          id: "poCode",
          label: "Code",
          system: "System Field",
          editable: false,
        },
        {
          id: "poUnit",
          label: "Unit",
          system: "System Field",
          editable: false,
        },
        {
          id: "poQuantity",
          label: "Quantity",
          system: "System Field",
          editable: false,
        },
        {
          id: "poPrice",
          label: "Price",
          system: "System Field",
          editable: false,
        },
        {
          id: "poDiscount",
          label: "Discount %",
          system: "System Field",
          editable: false,
        },
        {
          id: "poTotalEx",
          label: "Total Excluding",
          system: "System Field",
          editable: false,
        },
        {
          id: "poVatTotal",
          label: "VAT",
          system: "System Field",
          editable: false,
        },
        {
          id: "poTotal",
          label: "Total",
          system: "System Field",
          editable: false,
        },
      ],
    },

    {
      title: "Additional Details",
      fields: [
        {
          id: "poReference",
          label: "Reference Number",
          system: "System Field",
          editable: false,
        },
        {
          id: "poSalesRep",
          label: "Sales Rep",
          system: "System Field",
          editable: false,
        },
        {
          id: "poLinkedItem",
          label: "Linked Item",
          system: "System Field",
          editable: false,
        },
        {
          id: "poNotes",
          label: "Notes",
          system: "System Field",
          editable: true,
        },
      ],
    },
  ],
};

export default function JobCardFieldsPage() {

  const [activeTab, setActiveTab] = useState("Job");

  const [selectedFields, setSelectedFields] =
    useState<string[]>([]);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {

    loadSettings();

  }, [activeTab]);

  async function loadSettings() {

    try {

      setLoading(true);

      const ref =
        doc(
          clientDb,
          "companies",
          COMPANY_ID,
          "jobcard_settings",
          activeTab
        );

      const snap =
        await getDoc(ref);

      if (snap.exists()) {

        const data =
          snap.data();

        setSelectedFields(
          data.selectedFields || []
        );

        setEditableLabels(
          data.editableLabels || {}
        );

      } else {

        setSelectedFields([]);

        setEditableLabels({});
      }

    } catch (err) {

      console.error(err);

    } finally {

      setLoading(false);
    }
  }

  const [editableLabels, setEditableLabels] = useState<Record<string, string>>(
    {}
  );

  const toggleField = (fieldId: string) => {

    setSelectedFields((prev) =>

      prev.includes(fieldId)

        ? prev.filter((f) => f !== fieldId)

        : [...prev, fieldId]
    );
  };

  const updateLabel = (
    fieldId: string,
    value: string
  ) => {

    setEditableLabels((prev) => ({
      ...prev,
      [fieldId]: value,
    }));
  };

  async function saveSettings() {

    try {

      await setDoc(

        doc(
          clientDb,
          "companies",
          COMPANY_ID,
          "jobcard_settings",
          activeTab
        ),

        {

          selectedFields,

          editableLabels,

          updatedAt:
            serverTimestamp(),
        },

        {
          merge: true,
        }
      );

      alert(
        "Job card settings saved successfully"
      );

    } catch (err) {

      console.error(err);

      alert(
        "Failed to save settings"
      );
    }
  }

  return (

    <div className="min-h-screen bg-[#f5f7fb] p-6">

      <div className="mx-auto max-w-[1800px]">

        {/* HEADER */}
        <div
          className="
            mb-6
            flex
            flex-col
            gap-4
            rounded-3xl
            border
            border-gray-200
            bg-white
            p-6
            shadow-sm
            lg:flex-row
            lg:items-center
            lg:justify-between
          "
        >

          <div>

            <h1 className="text-3xl font-black text-gray-900">
              Job Card Fields
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Configure printable document fields and company custom labels
            </p>

          </div>

          <div className="flex flex-wrap gap-3">

            {/* BACK */}
            <Link
              href="/admin"
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
              ← Back
            </Link>

            {/* PREVIEW */}
            <button
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
              Preview
            </button>

            {/* SAVE */}
            <button
              type="button"
              onClick={saveSettings}
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

        </div>

        {/* TABS */}
        <div
          className="
            mb-6
            flex
            overflow-x-auto
            rounded-3xl
            border
            border-gray-200
            bg-white
            p-2
            shadow-sm
          "
        >

          {tabs.map((tab) => (

            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`
                whitespace-nowrap
                rounded-2xl
                px-5
                py-3
                text-sm
                font-semibold
                transition

                ${activeTab === tab

                  ? "bg-blue-600 text-white"

                  : "text-gray-600 hover:bg-gray-100"
                }
              `}
            >
              {tab}
            </button>

          ))}

        </div>

        {/* MAIN CARD */}
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

          {/* FIELD SECTIONS */}
          <div className="grid gap-6 lg:grid-cols-4">

            {documentSections[
              activeTab as keyof typeof documentSections
            ].map((section) => (

              <div
                key={section.title}
                className="
                  rounded-3xl
                  border
                  border-gray-200
                  bg-gray-50
                  p-5
                "
              >

                <h2 className="mb-5 text-xl font-black text-gray-900">
                  {section.title}
                </h2>

                <div className="space-y-4">

                  {section.fields.map((field) => (

                    <div
                      key={field.id}
                      className="
                        rounded-2xl
                        border
                        border-gray-200
                        bg-white
                        p-3
                      "
                    >

                      <div className="flex items-start gap-3">

                        {/* CHECKBOX */}
                        <button
                          type="button"
                          onClick={() => toggleField(field.id)}
                          className={`
                            mt-1
                            flex
                            h-5
                            w-5
                            items-center
                            justify-center
                            rounded
                            border

                            ${selectedFields.includes(field.id)

                              ? "border-blue-600 bg-blue-600 text-white"

                              : "border-gray-300 bg-white"
                            }
                          `}
                        >

                          {selectedFields.includes(field.id) && "✓"}

                        </button>

                        {/* CONTENT */}
                        <div className="flex-1">

                          {/* EDITABLE */}
                          {field.editable ? (

                            <input
                              value={
                                editableLabels[field.id] ||
                                field.label
                              }
                              onChange={(e) =>
                                updateLabel(
                                  field.id,
                                  e.target.value
                                )
                              }
                              className="
                                w-full
                                rounded-xl
                                border
                                border-gray-300
                                px-3
                                py-2
                                text-sm
                                font-medium
                                text-gray-900
                                outline-none
                                focus:border-blue-500
                              "
                            />

                          ) : (

                            <div className="font-medium text-gray-900">
                              {field.label}
                            </div>

                          )}

                          <div className="mt-1 text-xs italic text-gray-400">
                            {field.system}
                          </div>

                        </div>

                      </div>

                    </div>

                  ))}

                </div>

              </div>

            ))}

          </div>

        </div>

      </div>

    </div>
  );
}