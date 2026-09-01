"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  addDoc,
  collection,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";

import {
  clientDb,
} from "@/lib/firebaseClient";

import {
  COMPANY_ID,
} from "@/lib/company";

import PageHeader from "@/app/components/PageHeader";

export default function JobLocationsPage() {

  const [locations, setLocations] =
    useState<any[]>([]);

  const [showAdd, setShowAdd] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [form, setForm] =
    useState({

      name: "",

      address: "",

      city: "",

      province: "",

      country: "",

      googleMapsLink: "",

      notes: "",

      gpsLat: "",

      gpsLng: "",
    });

  useEffect(() => {

    const unsub = onSnapshot(

      collection(
        clientDb,
        "companies",
        COMPANY_ID,
        "job_locations"
      ),

      (snapshot) => {

        setLocations(

          snapshot.docs.map(
            (doc) => ({

              id: doc.id,

              ...doc.data(),
            })
          )
        );
      }
    );

    return () => unsub();

  }, []);

  async function saveLocation() {

    try {

      setSaving(true);

      await addDoc(

        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "job_locations"
        ),

        {
          ...form,

          active: true,

          createdAt:
            serverTimestamp(),
        }
      );

      setShowAdd(false);

      setForm({

        name: "",

        address: "",

        city: "",

        province: "",

        country: "",

        googleMapsLink: "",

        notes: "",

        gpsLat: "",

        gpsLng: "",
      });

    } catch (error) {

      console.error(error);

      alert(
        "Failed to save location"
      );

    } finally {

      setSaving(false);

    }
  }

  return (

    <div className="min-h-screen bg-[#f5f7fb]">

      <div className="p-6">

        <PageHeader />

        <div className="max-w-[1800px] mx-auto">

          {/* ACTION BAR */}
          <div className="
            flex
            items-center
            justify-between
            mb-6
          ">

            <div />

            <button
              onClick={() =>
                setShowAdd(true)
              }
              className="
                bg-blue-600
                hover:bg-blue-700
                text-white
                px-6
                h-14
                rounded-2xl
                font-black
              "
            >
              + Add Location
            </button>

          </div>

          {/* LIST */}
          <div className="
            bg-white
            border
            border-gray-200
            rounded-3xl
            overflow-hidden
            shadow-sm
          ">

            <div className="overflow-x-auto">

              <table className="w-full">

                <thead>

                  <tr className="
                    bg-gray-50
                    border-b
                    border-gray-200
                    text-left
                    text-xs
                    uppercase
                    tracking-wider
                    text-gray-500
                  ">

                    <th className="px-5 py-4">
                      Location Name
                    </th>

                    <th className="px-5 py-4">
                      Address
                    </th>

                    <th className="px-5 py-4">
                      City
                    </th>

                    <th className="px-5 py-4">
                      Province
                    </th>

                    <th className="px-5 py-4">
                      Country
                    </th>

                    <th className="px-5 py-4">
                      Google Maps
                    </th>

                  </tr>

                </thead>

                <tbody>

                  {locations.map(
                    (location) => (

                      <tr
                        key={location.id}

                        onClick={() =>
                          window.location.href =
                          `/job-locations/${location.id}`
                        }

                        className="
                          border-b
                          border-gray-100
                          hover:bg-blue-50
                          transition
                          cursor-pointer
                        "
                      >

                        <td className="
                          px-5
                          py-4
                          font-black
                          text-blue-600
                        ">
                          {location.name}
                        </td>

                        <td className="px-5 py-4">
                          {location.address}
                        </td>

                        <td className="px-5 py-4">
                          {location.city}
                        </td>

                        <td className="px-5 py-4">
                          {location.province}
                        </td>

                        <td className="px-5 py-4">
                          {location.country}
                        </td>

                        <td className="px-5 py-4">

                          {location.googleMapsLink && (

                            <a
                              href={
                                location.googleMapsLink
                              }
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) =>
                                e.stopPropagation()
                              }
                              className="
                                text-blue-600
                                font-bold
                              "
                            >
                              Open Map
                            </a>
                          )}

                        </td>

                      </tr>
                    )
                  )}

                </tbody>

              </table>

            </div>

          </div>

        </div>

      </div>

      {/* ADD MODAL */}
      {showAdd && (

        <div className="
          fixed
          inset-0
          bg-black/40
          z-50
          flex
          items-center
          justify-center
          p-6
        ">

          <div className="
            bg-white
            rounded-3xl
            w-full
            max-w-4xl
            p-8
            max-h-[90vh]
            overflow-y-auto
          ">

            <div className="
              flex
              items-center
              justify-between
              mb-8
            ">

              <h2 className="
                text-3xl
                font-black
              ">
                Add Job Location
              </h2>

              <button
                onClick={() =>
                  setShowAdd(false)
                }
                className="
                  text-2xl
                  font-bold
                "
              >
                ×
              </button>

            </div>

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
                  mb-2
                ">
                  Location Name
                </label>

                <input
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    setForm({
                      ...form,
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
                  mb-2
                ">
                  City
                </label>

                <input
                  type="text"
                  value={form.city}
                  onChange={(e) =>
                    setForm({
                      ...form,
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
                  mb-2
                ">
                  Address
                </label>

                <textarea
                  value={form.address}
                  onChange={(e) =>
                    setForm({
                      ...form,
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
                  mb-2
                ">
                  Province
                </label>

                <input
                  type="text"
                  value={form.province}
                  onChange={(e) =>
                    setForm({
                      ...form,
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
                  mb-2
                ">
                  Country
                </label>

                <input
                  type="text"
                  value={form.country}
                  onChange={(e) =>
                    setForm({
                      ...form,
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
                  mb-2
                ">
                  GPS Latitude
                </label>

                <input
                  type="text"
                  value={form.gpsLat}
                  onChange={(e) =>
                    setForm({
                      ...form,
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
                  mb-2
                ">
                  GPS Longitude
                </label>

                <input
                  type="text"
                  value={form.gpsLng}
                  onChange={(e) =>
                    setForm({
                      ...form,
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
                  mb-2
                ">
                  Google Maps Link
                </label>

                <input
                  type="text"
                  value={
                    form.googleMapsLink
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
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
                  mb-2
                ">
                  Notes
                </label>

                <textarea
                  value={form.notes}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      notes:
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

            </div>

            {/* FOOTER */}
            <div className="
              flex
              justify-end
              gap-4
              mt-10
            ">

              <button
                onClick={() =>
                  setShowAdd(false)
                }
                className="
                  h-14
                  px-8
                  rounded-2xl
                  bg-gray-200
                  hover:bg-gray-300
                  font-bold
                "
              >
                Cancel
              </button>

              <button
                onClick={saveLocation}
                disabled={saving}
                className="
                  h-14
                  px-8
                  rounded-2xl
                  bg-blue-600
                  hover:bg-blue-700
                  text-white
                  font-black
                "
              >
                {
                  saving
                    ? "Saving..."
                    : "Save Location"
                }
              </button>

            </div>

          </div>

        </div>
      )}

    </div>
  );
}