"use client";

import Link from "next/link";

import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { clientDb } from "@/lib/firebaseClient";

import {
  useEffect,
  useState,
} from "react";

import {
  onSnapshot,
} from "firebase/firestore";

interface DropdownItem {
  id: string;
  name: string;
}

export default function NewInventoryPage() {

  const [saving, setSaving] =
    useState(false);

  const [categories, setCategories] =
    useState<DropdownItem[]>([]);

  const [brands, setBrands] =
    useState<DropdownItem[]>([]);

  const [units, setUnits] =
    useState<DropdownItem[]>([]);

  const [form, setForm] =
    useState({

      partNumber: "",

      stockItemType: "Parts",

      markupPercent: 0,

      description: "",

      category: "",

      brand: "",

      unit: "",

      barcode: "",

      rrStandardTime: "",

      costPrice: 0.00,

      sellPrice: 0.00,

      quantityTracking: true,

      warehouseStock: {
        MAIN: 0,
        "001_NVTS_L": 0,
        "002_NVTS_L": 0,
        "003_NVTS_L": 0,
        "005_NVTS_L": 0,
        GRB_004_COMBINED: 0,
        POWERSTAR: 0,
      },
    });

  useEffect(() => {

    const unsubCategories =
      onSnapshot(

        collection(
          clientDb,
          "companies",
          "comp_001",
          "inventory_categories"
        ),

        (snapshot) => {

          setCategories(
            snapshot.docs.map((doc) => ({
              id: doc.id,
              name:
                doc.data().name || "",
            }))
          );
        }
      );

    const unsubBrands =
      onSnapshot(

        collection(
          clientDb,
          "companies",
          "comp_001",
          "inventory_brands"
        ),

        (snapshot) => {

          setBrands(
            snapshot.docs.map((doc) => ({
              id: doc.id,
              name:
                doc.data().name || "",
            }))
          );
        }
      );

    const unsubUnits =
      onSnapshot(

        collection(
          clientDb,
          "companies",
          "comp_001",
          "inventory_units"
        ),

        (snapshot) => {

          setUnits(
            snapshot.docs.map((doc) => ({
              id: doc.id,
              name:
                doc.data().name || "",
            }))
          );
        }
      );

    return () => {
      unsubCategories();
      unsubBrands();
      unsubUnits();
    };

  }, []);

  async function createCategory(
    categoryName: string
  ) {

    await setDoc(

      doc(
        clientDb,
        "companies",
        "comp_001",
        "inventory_categories",
        categoryName
      ),

      {
        name: categoryName,
        active: true,
      }
    );
  }

  async function createBrand(
    brandName: string
  ) {

    await setDoc(

      doc(
        clientDb,
        "companies",
        "comp_001",
        "inventory_brands",
        brandName
      ),

      {
        name: brandName,
        active: true,
      }
    );
  }

  async function createUnit(
    unitName: string
  ) {

    await setDoc(

      doc(
        clientDb,
        "companies",
        "comp_001",
        "inventory_units",
        unitName
      ),

      {
        name: unitName,
        active: true,
      }
    );
  }

  async function saveInventory() {

    try {

      setSaving(true);

      const warehouseTotal =
        form.warehouseStock.MAIN;

      const vanTotal =
        form.warehouseStock[
        "001_NVTS_L"
        ] +

        form.warehouseStock[
        "002_NVTS_L"
        ] +

        form.warehouseStock[
        "003_NVTS_L"
        ] +

        form.warehouseStock[
        "005_NVTS_L"
        ] +

        form.warehouseStock[
        "GRB_004_COMBINED"
        ] +

        form.warehouseStock[
        "POWERSTAR"
        ];

      const grandTotal =
        warehouseTotal + vanTotal;

      await addDoc(

        collection(
          clientDb,
          "companies",
          "comp_001",
          "inventory"
        ),

        {
          ...form,

          warehouseTotal,

          vanTotal,

          grandTotal,

          imageUrl:
            "https://placehold.co/300x300/png",

          qrCodeUrl:
            `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${form.partNumber}`,

          isActive: true,

          createdAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),
        }
      );

      alert(
        "Inventory item created"
      );

      location.href =
        "/inventory";

    } catch (error) {

      console.error(error);

      alert(
        "Failed to save inventory"
      );

    } finally {

      setSaving(false);

    }
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-6">

      <div className="max-w-[1400px] mx-auto">

        {/* HEADER */}
        <div className="flex items-center justify-between mb-6">

          <div>

            <div className="text-xs uppercase tracking-[0.2em] text-gray-400 font-bold mb-2">
              Inventory
            </div>

            <h1 className="text-4xl font-black text-gray-900">
              Add Inventory Item
            </h1>

          </div>

          <Link
            href="/inventory"
            className="
              bg-gray-200
              hover:bg-gray-300
              px-5
              h-12
              rounded-2xl
              inline-flex
              items-center
              text-sm
              font-bold
            "
          >
            Back
          </Link>

        </div>

        {/* FORM */}
        <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-sm">

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* PART NUMBER */}
            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Part Number
              </label>

              <input
                type="text"
                value={form.partNumber}
                onChange={(e) =>
                  setForm({
                    ...form,
                    partNumber:
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
                  outline-none
                  focus:border-blue-500
                "
              />

            </div>

            {/* STOCK ITEM TYPE */}
            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Stock Item Type *
              </label>

              <select
                value={form.stockItemType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    stockItemType:
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
                  outline-none
                  focus:border-blue-500
                "
              >

                <option value="Parts">
                  Parts
                </option>

                <option value="Product">
                  Product
                </option>

                <option value="Service">
                  Service
                </option>

              </select>

            </div>

            {/* DESCRIPTION */}
            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Description
              </label>

              <input
                type="text"
                value={form.description}
                onChange={(e) =>
                  setForm({
                    ...form,
                    description:
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
                  outline-none
                  focus:border-blue-500
                "
              />

            </div>

            {/* CATEGORY */}
            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Category
              </label>

              <select
                value={form.category}
                onChange={async (e) => {

                  if (
                    e.target.value ===
                    "ADD_NEW"
                  ) {

                    const newCategory =
                      prompt(
                        "Enter new category"
                      );

                    if (newCategory) {

                      await createCategory(
                        newCategory
                      );

                      setForm({
                        ...form,
                        category:
                          newCategory,
                      });
                    }

                    return;
                  }

                  setForm({
                    ...form,
                    category:
                      e.target.value,
                  });

                }}
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
              >

                <option value="">
                  Select Category
                </option>

                <option value="ADD_NEW">
                  + Add New Category
                </option>

                {categories.map(
                  (category) => (

                    <option
                      key={
                        category.id
                      }
                      value={
                        category.name
                      }
                    >
                      {category.name}
                    </option>
                  )
                )}

              </select>

            </div>

            {/* BRAND */}
            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Brand
              </label>

              <select
                value={form.brand}
                onChange={async (e) => {

                  if (
                    e.target.value ===
                    "ADD_NEW"
                  ) {

                    const newBrand =
                      prompt(
                        "Enter new brand"
                      );

                    if (newBrand) {

                      await createBrand(
                        newBrand
                      );

                      setForm({
                        ...form,
                        brand:
                          newBrand,
                      });
                    }

                    return;
                  }

                  setForm({
                    ...form,
                    brand:
                      e.target.value,
                  });

                }}
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
              >

                <option value="">
                  Select Brand
                </option>

                <option value="ADD_NEW">
                  + Add New Brand
                </option>

                {brands.map(
                  (brand) => (

                    <option
                      key={
                        brand.id
                      }
                      value={
                        brand.name
                      }
                    >
                      {brand.name}
                    </option>
                  )
                )}

              </select>

            </div>

            {/* UNIT */}
            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Unit
              </label>

              <select
                value={form.unit}
                onChange={async (e) => {

                  if (
                    e.target.value ===
                    "ADD_NEW"
                  ) {

                    const newUnit =
                      prompt(
                        "Enter new unit"
                      );

                    if (newUnit) {

                      await createUnit(
                        newUnit
                      );

                      setForm({
                        ...form,
                        unit:
                          newUnit,
                      });
                    }

                    return;
                  }

                  setForm({
                    ...form,
                    unit:
                      e.target.value,
                  });

                }}
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
              >

                <option value="">
                  Select Unit
                </option>

                <option value="ADD_NEW">
                  + Add New Unit
                </option>

                {units.map(
                  (unit) => (

                    <option
                      key={
                        unit.id
                      }
                      value={
                        unit.name
                      }
                    >
                      {unit.name}
                    </option>
                  )
                )}

              </select>

            </div>

            {/* BARCODE */}
            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Barcode
              </label>

              <input
                type="text"
                value={form.barcode}
                onChange={(e) =>
                  setForm({
                    ...form,
                    barcode:
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
                  outline-none
                  focus:border-blue-500
                "
              />

            </div>

            {/* COST PRICE */}
            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Cost Price
              </label>

              <input
                type="number"
                step="0.01"
                value={form.costPrice}
                onChange={(e) =>
                  setForm({
                    ...form,
                    costPrice:
                      Number(
                        e.target.value
                      ),
                  })
                }
                className="
                  appearance-none
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

              <div className="text-xs text-gray-400 mt-2">
                Excluding 15% VAT
              </div>

            </div>

            {/* MARKUP */}
            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Markup %
              </label>

              <input
                type="number"
                step="0.01"
                value={form.markupPercent}
                onChange={(e) => {

                  const markup =
                    Number(e.target.value);

                  const sellPrice =

                    form.costPrice +

                    (
                      form.costPrice *
                      (markup / 100)
                    );

                  setForm({
                    ...form,

                    markupPercent:
                      markup,

                    sellPrice:
                      Number(
                        sellPrice.toFixed(2)
                      ),
                  });
                }}
                className="
                  appearance-none
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

            {/* SELL PRICE */}
            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Sell Price
              </label>

              <input
                type="number"
                step="0.01"
                value={form.sellPrice}
                onChange={(e) =>
                  setForm({
                    ...form,
                    sellPrice:
                      Number(
                        e.target.value
                      ),
                  })
                }
                className="
                  appearance-none
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

              <div className="text-xs text-gray-400 mt-2">
                Excluding 15% VAT
              </div>

            </div>

            {/* RR */}
            <div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                R&R Standard Time
              </label>

              <input
                type="text"
                value={
                  form.rrStandardTime
                }
                onChange={(e) =>
                  setForm({
                    ...form,
                    rrStandardTime:
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
                  outline-none
                  focus:border-blue-500
                "
              />

            </div>

          </div>

          {/* STOCK NOTICE */}
          <div className="mt-10">

            <div className="
    bg-amber-50
    border
    border-amber-200
    rounded-3xl
    p-6
  ">

              <div className="text-lg font-black text-amber-900 mb-3">
                Stock Control
              </div>

              <div className="space-y-2 text-sm text-amber-800">

                <div>
                  • New inventory items start with ZERO stock.
                </div>

                <div>
                  • Stock quantities can ONLY change via:
                </div>

                <div className="pl-4">
                  - GRV (Goods Received Voucher)
                </div>

                <div className="pl-4">
                  - Stock Adjustment
                </div>

                <div className="pl-4">
                  - Job Material Usage
                </div>

              </div>

            </div>

          </div>

          {/* SAVE */}

          {/* SAVE */}
          <div className="flex justify-end mt-10">

            <button
              onClick={saveInventory}
              disabled={saving}
              className="
                bg-blue-600
                hover:bg-blue-700
                disabled:opacity-50
                text-white
                px-8
                h-14
                rounded-2xl
                text-sm
                font-black
                transition
              "
            >
              {saving
                ? "Saving..."
                : "Save Inventory"}
            </button>

          </div>

        </div>

      </div>

    </div>
  );
}