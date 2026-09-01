"use client";

import Link from "next/link";

import {
  doc,
  onSnapshot,
  updateDoc,
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

export default function JobLocationDetailsPage() {

  const params =
    useParams();

  const locationId =
    params.id as string;

  const [saving, setSaving] =
    useState(false);

  const [location, setLocation] =
    useState<any>(null);

  useEffect(() => {

    const unsub = onSnapshot(

      doc(
        clientDb,
        "companies",
        COMPANY_ID,
        "job_locations",
        locationId
      ),

      (snapshot) => {

        if (
          snapshot.exists()
        ) {

          setLocation({

            id:
              snapshot.id,

            ...snapshot.data(),
          });
        }
      }
    );

    return () => unsub();

  }, [locationId]);

  async function saveLocation() {

    try {

      setSaving(true);

      await updateDoc(

        doc(
          clientDb,
          "companies",
          COMPANY_ID,
          "job_locations",
          locationId
        ),

        {
          ...location,
        }
      );

      alert(
        "Location Updated"
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

  if (!location) {

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
              Job Locations
            </div>

            <h1 className="text-3xl font-black text-gray-900">
              {location.name}
            </h1>

          </div>

          <div className="flex items-center gap-3">

            <Link
              href="/job-locations"
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
              onClick={saveLocation}
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

      {/* CONTENT */}
      <div className="p-6">

        <div className="
          bg-white
          border
          border-gray-200
          rounded-3xl
          p-8
          shadow-sm
        ">

          <div className="
            grid
            grid-cols-1
            xl:grid-cols-2
            gap-6
          ">

            {/* LOCATION NAME */}
            <div>

              <label className="
                block
                text-sm
                font-bold
                text-gray-700
                mb-2
              ">
                Location Name
              </label>

              <input
                type="text"
                value={
                  location.name || ""
                }
                onChange={(e) =>
                  setLocation({
                    ...location,
                    name:
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

            {/* CITY */}
            <div>

              <label className="
                block
                text-sm
                font-bold
                text-gray-700
                mb-2
              ">
                City
              </label>

              <input
                type="text"
                value={
                  location.city || ""
                }
                onChange={(e) =>
                  setLocation({
                    ...location,
                    city:
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
                Address
              </label>

              <textarea
                value={
                  location.address || ""
                }
                onChange={(e) =>
                  setLocation({
                    ...location,
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

            {/* PROVINCE */}
            <div>

              <label className="
                block
                text-sm
                font-bold
                text-gray-700
                mb-2
              ">
                Province
              </label>

              <input
                type="text"
                value={
                  location.province || ""
                }
                onChange={(e) =>
                  setLocation({
                    ...location,
                    province:
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

            {/* COUNTRY */}
            <div>

              <label className="
                block
                text-sm
                font-bold
                text-gray-700
                mb-2
              ">
                Country
              </label>

              <input
                type="text"
                value={
                  location.country || ""
                }
                onChange={(e) =>
                  setLocation({
                    ...location,
                    country:
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

            {/* GPS LAT */}
            <div>

              <label className="
                block
                text-sm
                font-bold
                text-gray-700
                mb-2
              ">
                GPS Latitude
              </label>

              <input
                type="text"
                value={
                  location.gpsLat || ""
                }
                onChange={(e) =>
                  setLocation({
                    ...location,
                    gpsLat:
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

            {/* GPS LNG */}
            <div>

              <label className="
                block
                text-sm
                font-bold
                text-gray-700
                mb-2
              ">
                GPS Longitude
              </label>

              <input
                type="text"
                value={
                  location.gpsLng || ""
                }
                onChange={(e) =>
                  setLocation({
                    ...location,
                    gpsLng:
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

            {/* GOOGLE MAPS */}
            <div className="xl:col-span-2">

              <label className="
                block
                text-sm
                font-bold
                text-gray-700
                mb-2
              ">
                Google Maps Link
              </label>

              <input
                type="text"
                value={
                  location.googleMapsLink || ""
                }
                onChange={(e) =>
                  setLocation({
                    ...location,
                    googleMapsLink:
                      e.target.value,
                  })
                }
                placeholder="https://maps.google.com/..."
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
                  location.notes || ""
                }
                onChange={(e) =>
                  setLocation({
                    ...location,
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

          </div>

        </div>

      </div>

    </div>
  );
}