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
import {
  coordinatesFromGoogleMapsLink,
  googleMapsLinkFromCoordinates,
  resolveGoogleMapsCoordinates,
} from "@/lib/googleMapsCoordinates";

export default function JobLocationDetailsPage() {

  const params =
    useParams();

  const locationId =
    params.id as string;

  const [saving, setSaving] =
    useState(false);

  const [showSavedConfirmation, setShowSavedConfirmation] =
    useState(false);

  const [updatingCoordinates, setUpdatingCoordinates] =
    useState(false);

  const [locationSyncSource, setLocationSyncSource] =
    useState<"link" | "coordinates">("link");

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

  useEffect(() => {
    const link = String(location?.googleMapsLink || "");
    if (!link || (location?.gpsLat && location?.gpsLng)) return;

    void resolveAndApplyGoogleMapsLink(link);
  }, [location?.googleMapsLink, location?.gpsLat, location?.gpsLng]);

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

      window.dispatchEvent(new Event("fleetfix:changes-saved"));

      setShowSavedConfirmation(true);

    } catch (error) {

      console.error(error);

      alert(
        "Failed to update"
      );

    } finally {

      setSaving(false);

    }
  }

  function closeSavedConfirmation() {
    window.dispatchEvent(new Event("fleetfix:changes-saved"));
    setShowSavedConfirmation(false);
  }

  function updateCoordinates(field: "gpsLat" | "gpsLng", value: string) {
    setLocationSyncSource("coordinates");
    setLocation((current: any) => {
      const updated = { ...current, [field]: value };
      const googleMapsLink = googleMapsLinkFromCoordinates(updated.gpsLat || "", updated.gpsLng || "");
      return googleMapsLink ? { ...updated, googleMapsLink } : updated;
    });
  }

  function updateGoogleMapsLink(value: string) {
    setLocationSyncSource("link");
    const coordinates = coordinatesFromGoogleMapsLink(value);
    setLocation((current: any) => ({
      ...current,
      googleMapsLink: value,
      ...(coordinates ? { gpsLat: coordinates.latitude, gpsLng: coordinates.longitude } : {}),
    }));
  }

  async function resolveAndApplyGoogleMapsLink(value: string) {
    const coordinates = await resolveGoogleMapsCoordinates(value);
    if (!coordinates) return false;

    setLocation((current: any) => current?.googleMapsLink === value
      ? { ...current, gpsLat: coordinates.latitude, gpsLng: coordinates.longitude }
      : current);
    return true;
  }

  async function updateGpsAndGoogleMapsLink() {
    setUpdatingCoordinates(true);

    try {
      if (locationSyncSource === "coordinates") {
        const googleMapsLink = googleMapsLinkFromCoordinates(
          String(location.gpsLat || ""),
          String(location.gpsLng || "")
        );

        if (!googleMapsLink) {
          alert("Enter a valid GPS latitude and longitude first.");
          return;
        }

        setLocation((current: any) => ({ ...current, googleMapsLink }));
        setLocationSyncSource("link");
        return;
      }

      const link = String(location.googleMapsLink || "").trim();
      if (!link) {
        const googleMapsLink = googleMapsLinkFromCoordinates(
          String(location.gpsLat || ""),
          String(location.gpsLng || "")
        );

        if (!googleMapsLink) {
          alert("Enter a Google Maps link or valid GPS coordinates first.");
          return;
        }

        setLocation((current: any) => ({ ...current, googleMapsLink }));
        return;
      }

      const updated = await resolveAndApplyGoogleMapsLink(link);
      if (!updated) {
        alert("Coordinates could not be found in this Google Maps link. Check the link and try again.");
      }
    } finally {
      setUpdatingCoordinates(false);
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
              data-save-target="true"
              data-wait-for-saved-event="true"
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
            xl:grid-cols-6
            gap-6
          ">

            {/* LOCATION TYPE */}
            <div className="xl:col-span-3">

              <label className="
                block
                text-sm
                font-bold
                text-gray-700
                mb-2
              ">
                Location Type
              </label>

              <select
                value={location.locationType || ""}
                onChange={(e) =>
                  setLocation({
                    ...location,
                    locationType:
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
              >
                <option value="">Select location type</option>
                <option value="Parking">Parking</option>
                <option value="Depot">Depot</option>
                <option value="Roadside">Roadside</option>
                <option value="Place">Place</option>
              </select>

            </div>

            {/* LOCATION NAME */}
            <div className="xl:col-span-3">

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

            {location.locationType === "Roadside" && (
              <div className="grid grid-cols-1 gap-6 xl:col-span-6 xl:grid-cols-2">
                <div className="xl:col-span-2">
                  <label className="block text-sm font-bold text-gray-700 mb-2">Roadside Position</label>
                  <select value={location.roadsidePosition || ""} onChange={(e) => setLocation({ ...location, roadsidePosition: e.target.value })} className="w-full h-14 rounded-2xl border-2 border-gray-200 px-5">
                    <option value="">Select roadside position</option>
                    <option value="between">Standing between Point A and Point B</option>
                    <option value="near">Standing near a Point</option>
                  </select>
                </div>
                {location.roadsidePosition === "between" && <>
                  <div><label className="block text-sm font-bold text-gray-700 mb-2">Point A</label><input value={location.pointA || ""} onChange={(e) => setLocation({ ...location, pointA: e.target.value })} className="w-full h-14 rounded-2xl border-2 border-gray-200 px-5" /></div>
                  <div><label className="block text-sm font-bold text-gray-700 mb-2">Point B</label><input value={location.pointB || ""} onChange={(e) => setLocation({ ...location, pointB: e.target.value })} className="w-full h-14 rounded-2xl border-2 border-gray-200 px-5" /></div>
                </>}
                {location.roadsidePosition === "near" && <div className="xl:col-span-2"><label className="block text-sm font-bold text-gray-700 mb-2">Near Point</label><input value={location.nearPoint || ""} onChange={(e) => setLocation({ ...location, nearPoint: e.target.value })} className="w-full h-14 rounded-2xl border-2 border-gray-200 px-5" /></div>}
              </div>
            )}

            {/* ADDRESS */}
            {location.locationType !== "Roadside" && <div className="xl:col-span-6">

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

            </div>}

            {/* CITY */}
            {location.locationType !== "Roadside" && <div className="xl:col-span-2">

              <label className="block text-sm font-bold text-gray-700 mb-2">City</label>

              <input
                type="text"
                value={location.city || ""}
                onChange={(e) => setLocation({ ...location, city: e.target.value })}
                className="w-full h-14 rounded-2xl border-2 border-gray-200 px-5"
              />

            </div>}

            {/* PROVINCE */}
            <div className={location.locationType === "Roadside" ? "xl:col-span-3" : "xl:col-span-2"}>

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
            <div className={location.locationType === "Roadside" ? "xl:col-span-3" : "xl:col-span-2"}>

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
            <div className="xl:col-span-3">

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
                onChange={(e) => updateCoordinates("gpsLat", e.target.value)}
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
            <div className="xl:col-span-3">

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
                onChange={(e) => updateCoordinates("gpsLng", e.target.value)}
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
            <div className="xl:col-span-6">

              <label className="
                block
                text-sm
                font-bold
                text-gray-700
                mb-2
              ">
                Google Maps Link
              </label>

              <div className="flex flex-col gap-3 md:flex-row">
                <input
                  type="text"
                  value={
                    location.googleMapsLink || ""
                  }
                  onChange={(e) => updateGoogleMapsLink(e.target.value)}
                  placeholder="https://maps.google.com/..."
                  className="
                    h-14
                    min-w-0
                    flex-1
                    rounded-2xl
                    border-2
                    border-gray-200
                    px-5
                  "
                />

                <button
                  type="button"
                  onClick={updateGpsAndGoogleMapsLink}
                  disabled={updatingCoordinates}
                  className="h-14 shrink-0 rounded-2xl bg-blue-600 px-6 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {updatingCoordinates ? "Updating..." : "Update GPS / Maps Link"}
                </button>
              </div>

            </div>

            {/* NOTES */}
            <div className="xl:col-span-6">

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

      {showSavedConfirmation && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="location-saved-title">
          <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-7 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" stroke="currentColor" strokeWidth="2.5"><path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
            <h2 id="location-saved-title" className="mt-4 text-2xl font-black text-gray-900">Location updated</h2>
            <p className="mt-2 text-sm text-gray-500">Your job location changes were saved successfully.</p>
            <button type="button" autoFocus onClick={closeSavedConfirmation} className="mt-6 inline-flex h-11 min-w-28 items-center justify-center rounded-2xl bg-blue-600 px-6 text-sm font-black text-white hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200">Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
