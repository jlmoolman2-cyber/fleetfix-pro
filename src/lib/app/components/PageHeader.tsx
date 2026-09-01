"use client";

import {
  usePathname,
} from "next/navigation";

export default function PageHeader() {

  const pathname =
    usePathname();

  function getTitle() {

    if (
      pathname.startsWith("/jobs")
    ) {
      return "Jobs";
    }

    if (
      pathname.startsWith("/customers")
    ) {
      return "Customers";
    }

    if (
      pathname.startsWith("/inventory")
    ) {
      return "Inventory";
    }

    if (
      pathname.startsWith("/purchases")
    ) {
      return "Purchases";
    }

    if (
      pathname.startsWith("/job-locations")
    ) {
      return "Job Locations";
    }

    if (
      pathname.startsWith("/grv")
    ) {
      return "GRV";
    }

    return "FleetFix Pro";
  }

  function getSubTitle() {

    if (
      pathname.startsWith("/jobs")
    ) {
      return "JOBS";
    }

    if (
      pathname.startsWith("/customers")
    ) {
      return "CRM";
    }

    if (
      pathname.startsWith("/inventory")
    ) {
      return "STOCK CONTROL";
    }

    if (
      pathname.startsWith("/purchases")
    ) {
      return "PURCHASING";
    }

    if (
      pathname.startsWith("/job-locations")
    ) {
      return "LOCATIONS";
    }

    if (
      pathname.startsWith("/grv")
    ) {
      return "GOODS RECEIVED";
    }

    return "FLEETFIX";
  }

  return (

    <div className="mb-6">

      <div className="
        text-xs
        uppercase
        tracking-[0.2em]
        text-gray-400
        font-bold
        mb-2
      ">
        {getSubTitle()}
      </div>

      <h1 className="
        text-4xl
        font-black
        text-gray-900
      ">
        {getTitle()}
      </h1>

    </div>
  );
}