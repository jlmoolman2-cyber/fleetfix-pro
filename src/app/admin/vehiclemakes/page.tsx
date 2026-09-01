"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { COMPANY_ID } from "@/lib/company";
import { clientDb } from "@/lib/firebaseClient";

type VehicleCategory = { id: string; name: string; values: string[] };

export default function VehicleMakesPage() {
  const [categories, setCategories] = useState<VehicleCategory[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [newValues, setNewValues] = useState<Record<string, string>>({});

  useEffect(() => onSnapshot(
    collection(clientDb, "companies", COMPANY_ID, "vehicleFieldCategories"),
    (snapshot) => setCategories(snapshot.docs.map((item) => ({
      id: item.id,
      name: String(item.data().name || ""),
      values: Array.isArray(item.data().values) ? item.data().values : [],
    })).sort((a, b) => a.name.localeCompare(b.name)))
  ), []);

  async function addCategory() {
    const name = newCategory.trim();
    if (!name) return;
    if (categories.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      alert("This category already exists.");
      return;
    }
    await addDoc(collection(clientDb, "companies", COMPANY_ID, "vehicleFieldCategories"), {
      name, values: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    setNewCategory("");
  }

  async function addValue(category: VehicleCategory) {
    const value = String(newValues[category.id] || "").trim();
    if (!value) return;
    if (category.values.some((item) => item.toLowerCase() === value.toLowerCase())) {
      alert("This value already exists in the category.");
      return;
    }
    await updateDoc(doc(clientDb, "companies", COMPANY_ID, "vehicleFieldCategories", category.id), {
      values: [...category.values, value], updatedAt: serverTimestamp(),
    });
    setNewValues((current) => ({ ...current, [category.id]: "" }));
  }

  async function removeValue(category: VehicleCategory, value: string) {
    await updateDoc(doc(clientDb, "companies", COMPANY_ID, "vehicleFieldCategories", category.id), {
      values: category.values.filter((item) => item !== value), updatedAt: serverTimestamp(),
    });
  }

  async function removeCategory(category: VehicleCategory) {
    if (!window.confirm(`Delete “${category.name}” and all its values?`)) return;
    await deleteDoc(doc(clientDb, "companies", COMPANY_ID, "vehicleFieldCategories", category.id));
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-black text-gray-900">Vehicle Makes & Models</h1>
            <p className="mt-2 text-sm text-gray-500">Create categories and add the choices available in each category.</p>
          </div>
          <Link href="/admin" className="rounded-xl border border-gray-300 bg-white px-4 py-3 font-bold text-gray-700 hover:bg-gray-100">Back to Admin</Link>
        </header>

        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-gray-900">Add Category</h2>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCategory()} placeholder="Example: Truck Makes" className="min-w-0 flex-1 rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-blue-500" />
            <button type="button" disabled={!newCategory.trim()} onClick={addCategory} className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white disabled:opacity-50">Add Category</button>
          </div>
        </section>

        {categories.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-gray-300 bg-white p-12 text-center text-gray-500">No vehicle categories created yet.</div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {categories.map((category) => (
              <section key={category.id} className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-5 py-4">
                  <div><h2 className="text-xl font-black text-gray-900">{category.name}</h2><p className="text-xs font-semibold text-gray-500">{category.values.length} value(s)</p></div>
                  <button type="button" onClick={() => removeCategory(category)} className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-600">Delete Category</button>
                </div>
                <div className="p-5">
                  <div className="flex gap-2">
                    <input value={newValues[category.id] || ""} onChange={(e) => setNewValues((current) => ({ ...current, [category.id]: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && addValue(category)} placeholder={category.name.toLowerCase().includes("type") ? "Example: Truck Tractor 6x4" : "Example: Scania"} className="min-w-0 flex-1 rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-blue-500" />
                    <button type="button" onClick={() => addValue(category)} className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">Add</button>
                  </div>
                  <div className="mt-4 space-y-2">
                    {category.values.length === 0 ? <div className="rounded-xl bg-gray-50 p-4 text-center text-sm text-gray-500">No values added.</div> : category.values.map((value) => (
                      <div key={value} className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3"><span className="font-semibold text-gray-800">{value}</span><button type="button" onClick={() => removeValue(category, value)} className="text-sm font-bold text-red-600">Remove</button></div>
                    ))}
                  </div>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
