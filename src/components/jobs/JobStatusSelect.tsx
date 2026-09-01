"use client";

import {
  useEffect,
  useState,
} from "react";


import {
  collection,
  onSnapshot,
} from "firebase/firestore";


import {
  clientDb,
} from "@/lib/firebaseClient";


import {
  COMPANY_ID,
} from "@/lib/company";



interface JobStatusSelectProps {

  jobId: string;

  currentStatus: string;

  currentStatusId?: string;

  disabled?: boolean;

  onChange:
  (status: string) => void;

}



export default function JobStatusSelect({

  currentStatus,

  currentStatusId,

  disabled = false,

  onChange,

}: JobStatusSelectProps) {



  const [statuses, setStatuses] =
    useState<any[]>([]);



  const [selected, setSelected] =
    useState(
      currentStatusId || currentStatus
    );



  useEffect(() => {

    setSelected(
      currentStatusId || currentStatus
    );

  }, [
    currentStatus,
    currentStatusId
  ]);




  useEffect(() => {


    const unsub =
      onSnapshot(

        collection(
          clientDb,
          "companies",
          COMPANY_ID,
          "statuses"
        ),


        (snapshot) => {


          const list =
            snapshot.docs

              .map((d) => ({

                id: d.id,

                ...d.data(),

              }))


              .filter(
                (s: any) =>
                  s.active !== false
              )


              .sort(
                (a: any, b: any) =>

                  (a.sortOrder || 0)
                  -
                  (b.sortOrder || 0)

              );


          setStatuses(list);


        }

      );



    return () => unsub();


  }, []);





  function changeStatus(
    newStatus: string
  ) {


    // send back to Job page
    onChange(
      newStatus
    );


  }

  const selectedStatus = statuses.find(
    (status) => status.id === selected
  );

  const statusColor =
    selectedStatus?.color || "bg-gray-200";

  const statusTextColor =
    selectedStatus?.textColor ||
    (statusColor.includes("yellow") ||
    statusColor.includes("gray-200") ||
    statusColor.includes("gray-300") ||
    statusColor.includes("gray-400")
      ? "text-gray-900"
      : "text-white");





  return (

    <select

      disabled={disabled}

      value={selected}

      onChange={(e) =>

        changeStatus(
          e.target.value
        )

      }

      className={`
rounded-2xl
border-2 border-transparent
px-6
py-4
font-bold
${statusColor}
${statusTextColor}
disabled:cursor-not-allowed disabled:opacity-60
`}

    >


      {statuses.map(
        (status) => (

          <option

            key={status.id}

            value={status.id}

          >

            {status.name}

          </option>

        )

      )}


    </select>


  );


}
