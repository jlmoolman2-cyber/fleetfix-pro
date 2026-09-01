"use client";

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { collection, deleteDoc, doc, onSnapshot } from "firebase/firestore";

import { clientDb } from "@/lib/firebaseClient";
import ConfigurableModuleTable, { ModuleColumn } from "@/components/shared/ConfigurableModuleTable";
import ModuleSearchField from "@/components/ModuleSearchField";
import PageHeader from "@/app/components/PageHeader";

import { useEffect, useState } from "react";

interface Supplier {
  id: string;

  supplierCode?: string;

  supplierName?: string;

  address?: string;

  contactName?: string;

  contactSurname?: string;

  cellNumber?: string;

  email?: string;
}

export default function SuppliersPage() {
  const router = useRouter();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(
      collection(clientDb, "companies", "comp_001", "suppliers"),

      (snapshot) => {
        setSuppliers(
          snapshot.docs.map((doc) => ({
            id: doc.id,
            ...(doc.data() as any),
          })),
        );
      },
    );

    return () => unsub();
  }, []);

  async function removeSupplier(supplier: Supplier) {
    if (
      !confirm(
        `Remove supplier ${supplier.supplierName || supplier.supplierCode}?`,
      )
    )
      return;
    try {
      await deleteDoc(
        doc(clientDb, "companies", "comp_001", "suppliers", supplier.id),
      );
    } catch (error) {
      console.error(error);
      alert("Unable to remove supplier.");
    }
  }

  const filteredSuppliers = suppliers.filter((supplier) =>
    [
      supplier.supplierCode,
      supplier.supplierName,
      supplier.contactName,
      supplier.contactSurname,
      supplier.cellNumber,
      supplier.email,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const supplierColumns: ModuleColumn<Supplier>[] = [
    { id: "code", label: "Supplier Code", render: (supplier) => <span className="font-black text-blue-600">{supplier.supplierCode}</span> },
    { id: "name", label: "Supplier Name", render: (supplier) => <span className="font-black text-blue-600">{supplier.supplierName}</span> },
    { id: "contact", label: "Contact Person", render: (supplier) => `${supplier.contactName || ""} ${supplier.contactSurname || ""}`.trim() },
    { id: "cell", label: "Cell Number", render: (supplier) => supplier.cellNumber },
    { id: "email", label: "Email Address", render: (supplier) => supplier.email },
    { id: "actions", label: "Actions", align: "right", render: (supplier) => <div className="flex justify-end gap-2"><Link onClick={(event) => event.stopPropagation()} href={`/suppliers/${supplier.id}`} className="rounded-lg bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">Edit</Link><button onClick={(event) => { event.stopPropagation(); void removeSupplier(supplier); }} className="rounded-lg bg-red-50 px-3 py-1 text-xs font-bold text-red-700">Remove</button></div> },
  ];

  return (
    <div className="module-list-page relative bg-[#f5f7fb] p-6">
      <PageHeader title="Suppliers" subtitle="PURCHASES" />
      <div className="module-list-content w-full">

        <ConfigurableModuleTable rows={filteredSuppliers} columns={supplierColumns} storageKey="fleetfix_supplier_columns_v1" onRowClick={(supplier) => router.push(`/suppliers/${supplier.id}`)} headerActions={<><ModuleSearchField value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search suppliers..." className="w-full md:w-[420px]" /><Link href="/suppliers/new" className="inline-flex h-11 flex-col items-center justify-center rounded-2xl bg-blue-600 px-6 text-center text-sm font-black leading-tight text-white hover:bg-blue-700"><span>+ Add</span><span>Supplier</span></Link></>} />
      </div>
    </div>
  );
}
