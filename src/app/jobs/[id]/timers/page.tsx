"use client";

import { use } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
    collection,
    addDoc,
    getDocs,
    deleteDoc,
    updateDoc,
    doc,
    query,
    where,
    getDoc,
    serverTimestamp,
    Timestamp,
} from "firebase/firestore";

import { clientDb } from "@/lib/firebaseClient";
import { COMPANY_ID } from "@/lib/company";


interface PageProps {
    params: Promise<{
        id: string;
    }>;
}


export default function TimersPage({
    params,
}: PageProps) {


    const router = useRouter();

    const { id } = use(params);


    const [job, setJob] =
        useState<any>(null);

    const [technician, setTechnician] =
        useState<any>(null);

    const [users, setUsers] =
        useState<any[]>([]);

    const [timers, setTimers] =
        useState<any[]>([]);


    const [employee, setEmployee] =
        useState("");


    const [description, setDescription] =
        useState("");

    const [editingTimer, setEditingTimer] =
        useState<any>(null);


    const [showEdit, setShowEdit] =
        useState(false);


    // later replace with your user permissions
    const isAdmin = true;

    useEffect(() => {

        loadTimers();

    }, []);




    async function loadTimers() {


        const jobSnap =
            await getDoc(

                doc(
                    clientDb,
                    "companies",
                    COMPANY_ID,
                    "jobs",
                    id
                )

            );


        if (jobSnap.exists()) {


            const jobData: any = {
                id: jobSnap.id,
                ...jobSnap.data(),
            };


            setJob(jobData);

            const usersSnap =
                await getDocs(

                    collection(
                        clientDb,
                        "users"
                    )

                );


            const userList = usersSnap.docs.map(
                    (d) => ({

                        id: d.id,
                        ...d.data()

                    }));

            setUsers(userList);

            let techId =

                jobData.assignedUserId ||

                jobData.assignedTechnicianId ||

                jobData.technicianId;

            const assignedName =
                jobData.assignedTo ||
                jobData.assignedUserName ||
                jobData.assignedTechnicianName ||
                jobData.assignedTechnician ||
                jobData.technicianName ||
                jobData.technician ||
                "";

            const assignedUser = userList.find((user: any) => {
                const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim();
                return user.id === techId || user.name === assignedName || fullName === assignedName;
            });

            setTechnician(assignedUser || (assignedName ? { name: assignedName } : null));



            const snap =
                await getDocs(

                    collection(
                        clientDb,
                        "companies",
                        COMPANY_ID,
                        "jobs",
                        id,
                        "timers"
                    )

                );


            const timerList =
                await Promise.all(

                    snap.docs.map(
                        async (d) => {


                            const data: any =
                                d.data();


                            let employeeName =
                                data.employeeName || "";


                            if (
                                !employeeName &&
                                data.employeeId
                            ) {


                                const userSnap =
                                    await getDoc(

                                        doc(
                                            clientDb,
                                            "users",
                                            data.employeeId
                                        )

                                    );


                                if (userSnap.exists()) {


                                    const user: any =
                                        userSnap.data();


                                    employeeName =

                                        user.name ||

                                        `${user.firstName || ""} ${user.lastName || ""}`.trim();


                                }

                            }


                            return {

                                id: d.id,

                                ...data,

                                employeeName,

                            };


                        }

                    )

                );


            setTimers(

                timerList.sort(
                    (a: any, b: any) => {

                        const A =
                            a.startTime?.seconds || 0;


                        const B =
                            b.startTime?.seconds || 0;


                        return A - B;

                    }

                )

            );

        }
    }

    async function addTimer() {


        const timersRef =
            collection(
                clientDb,
                "companies",
                COMPANY_ID,
                "jobs",
                id,
                "timers"
            );


        // close existing running timer

        const running =
            await getDocs(

                query(
                    timersRef,
                    where(
                        "active",
                        "==",
                        true
                    )

                )

            );


        for (
            const timer of running.docs
        ) {

            await updateDoc(

                timer.ref,

                {

                    active: false,

                    endTime:
                        serverTimestamp(),

                    updatedAt:
                        serverTimestamp()

                }

            );

        }


        // create new timer

        await addDoc(

            timersRef,

            {

                employeeId:

                    job?.assignedUserId ||
                    job?.assignedTechnicianId ||
                    job?.technicianId ||
                    "",


                employeeName:

                    employee ||

                    job?.assignedTo ||
                    job?.assignedUserName ||

                    (
                        technician
                            ?
                            (
                                technician.name ||

                                `${technician.firstName || ""} ${technician.lastName || ""}`.trim()
                            )
                            :
                            ""
                    ),


                statusName:
                    description,


                startTime:
                    serverTimestamp(),


                endTime: null,


                active: true,

                visible: true,


                createdAt:
                    serverTimestamp(),

            }

        );


        setDescription("");

        window.dispatchEvent(new Event("fleetfix:changes-saved"));

        loadTimers();


    }




    async function removeTimer(
        timerId: string
    ) {


        await deleteDoc(

            doc(
                clientDb,
                "companies",
                COMPANY_ID,
                "jobs",
                id,
                "timers",
                timerId
            )

        );


        loadTimers();

    }

    function formatDuration(
        start: any,
        end: any
    ) {

        if (!start) {

            return "00:00:00";

        }


        const finish =
            end || new Date();


        const total =
            Math.floor(
                (
                    finish.getTime()
                    -
                    start.getTime()
                )
                / 1000
            );


        const hours =
            Math.floor(
                total / 3600
            );


        const minutes =
            Math.floor(
                (total % 3600) / 60
            );


        const seconds =
            total % 60;


        return (

            String(hours).padStart(2, "0")
            +
            ":"
            +
            String(minutes).padStart(2, "0")
            +
            ":"
            +
            String(seconds).padStart(2, "0")

        );

    }

    const totalSeconds =

        timers

            .filter(
                (t) =>
                    t.visible !== false
            )

            .reduce(
                (total, t) => {


                    const start =
                        t.startTime?.toDate
                            ?
                            t.startTime.toDate()
                            :
                            null;


                    const end =
                        t.endTime?.toDate
                            ?
                            t.endTime.toDate()
                            :
                            new Date();


                    if (!start) {
                        return total;
                    }


                    return (

                        total +

                        Math.floor(
                            (
                                end.getTime()
                                -
                                start.getTime()
                            )
                            / 1000
                        )

                    );


                },
                0
            );



    const totalDuration =

        String(
            Math.floor(
                totalSeconds / 3600
            )
        ).padStart(2, "0")

        +

        ":"

        +

        String(
            Math.floor(
                (totalSeconds % 3600) / 60
            )
        ).padStart(2, "0")

        +

        ":"

        +

        String(
            totalSeconds % 60
        ).padStart(2, "0");

    const totalDurationHoursMinutes =
        String(
            Math.floor(totalSeconds / 3600)
        ).padStart(2, "0")
        +
        ":"
        +
        String(
            Math.floor((totalSeconds % 3600) / 60)
        ).padStart(2, "0");

    async function repairTimers() {

        if (!job) {

            return;

        }

        // GET TECHNICIAN FROM JOB

        let techId =

            job.assignedUserId ||
            job.assignedTechnicianId ||
            job.technicianId ||
            "";


        let techName =

            job.assignedTo ||
            job.assignedUserName ||
            job.assignedTechnician ||
            job.technician ||
            "";


        if (!techId) {

            // find user

        }


        const usersSnap =
            await getDocs(

                collection(
                    clientDb,
                    "users"
                )

            );


        const allUsers =
            usersSnap.docs.map(
                d => ({
                    id: d.id,
                    ...d.data()
                })
            );


        const found: any =
            allUsers.find(
                (u: any) => {


                    const fullName =
                        `${u.firstName || ""} ${u.lastName || ""}`
                            .trim();


                    return (

                        fullName === techName ||

                        u.name === techName

                    );


                }

            );


        if (found) {

            techId =
                found.id;


            techName =

                found.name ||

                `${found.firstName || ""} ${found.lastName || ""}`.trim();


        }



        if (techId) {

            const techSnap =
                await getDoc(

                    doc(
                        clientDb,
                        "users",
                        techId
                    )

                );


            if (techSnap.exists()) {


                const user: any =
                    techSnap.data();


                techName =

                    user.name ||

                    `${user.firstName || ""} ${user.lastName || ""}`.trim();


            }

        }


        const timersRef =
            collection(
                clientDb,
                "companies",
                COMPANY_ID,
                "jobs",
                id,
                "timers"
            );


        const snap =
            await getDocs(
                timersRef
            );


        for (
            const timer of snap.docs
        ) {


            const data: any =
                timer.data();


            if (

                !data.employeeName ||

                data.employeeName === "-" ||

                String(data.employeeName).trim() === ""

            ) {


                await updateDoc(

                    timer.ref,

                    {

                        employeeId:
                            techId,


                        employeeName:
                            techName || "Unassigned",


                        updatedAt:
                            serverTimestamp()

                    }

                );


            }


        }


        loadTimers();

        alert(
            "Timers repaired"
        );


    }

    const assignedUserName =
        job?.assignedTo ||
        job?.assignedUserName ||
        job?.assignedTechnicianName ||
        job?.assignedTechnician ||
        job?.technicianName ||
        job?.technician ||
        technician?.name ||
        (technician
            ? `${technician.firstName || ""} ${technician.lastName || ""}`.trim()
            : "");

    return (

        <div className="min-h-screen bg-[#f5f7fb] p-6">


            <div className="bg-white rounded-3xl border p-6">


                <div className="flex justify-between mb-6">


                    <div>

                        <h1 className="text-3xl font-black">

                            ⏱ Timers

                        </h1>


                        <p className="text-gray-500">

                            Job:
                            {" "}
                            {job?.jobNumber || id}

                        </p>

                    </div>



                    <button

                        onClick={() =>
                            router.push(
                                `/jobs/${id}`
                            )
                        }

                        className="
                        border
                        rounded-xl
                        px-5
                        py-2
                        font-bold
                        "

                    >

                        ← Back To Job

                    </button>


                </div>

                <div className="
mb-5
rounded-xl
bg-gray-100
p-4
font-black
text-xl
">

                    Total Time:

                    {" "}

                    {totalDuration}

                </div>


                <div className="flex gap-3 mb-6">


                    <input

                        placeholder="Employee"

                        value={employee}

                        onChange={(e) =>
                            setEmployee(
                                e.target.value
                            )
                        }

                        className="border rounded-xl p-2"

                    />


                    <input

                        placeholder="Description"

                        value={description}

                        onChange={(e) =>
                            setDescription(
                                e.target.value
                            )
                        }

                        className="border rounded-xl p-2 flex-1"

                    />



                    <button

                        data-save-target="true"

                        data-wait-for-saved-event="true"

                        onClick={addTimer}

                        className="
                        bg-blue-600
                        text-white
                        rounded-xl
                        px-5
                        "

                    >

                        + Add Timer

                    </button>
                    <button

                        onClick={
                            repairTimers
                        }

                        className="
bg-orange-500
text-white
rounded-xl
px-5
"

                    >

                        Repair Timers

                    </button>

                </div>




                <table className="w-full text-sm">


                    <thead>

                        <tr className="text-left">

                            <th>
                                User
                            </th>

                            <th>
                                Status
                            </th>

                            <th>
                                Date
                            </th>

                            <th>
                                Start Time
                            </th>

                            <th>
                                End Time
                            </th>

                            <th>
                                Duration
                            </th>

                            <th>
                                Action
                            </th>

                        </tr>

                    </thead>


                    <tbody>


                        {timers

                            .filter(
                                (t) =>
                                    t.visible !== false
                            )

                            .map((t) => {

                                const start =

                                    t.startTime?.toDate
                                        ?
                                        t.startTime.toDate()

                                        :

                                        t.createdAt?.toDate
                                            ?
                                            t.createdAt.toDate()

                                            :

                                            null;


                                const end =
                                    t.endTime?.toDate
                                        ?
                                        t.endTime.toDate()
                                        : null;


                                return (

                                    <tr
                                        key={t.id}
                                        className="border-t"
                                    >


                                        <td className="py-3">

                                            {

                                                t.employeeName ||

                                                t.employee ||

                                                (
                                                    technician
                                                        ?
                                                        `${technician.firstName || ""} ${technician.lastName || ""}`.trim()
                                                        :
                                                        ""
                                                )

                                                ||

                                                "-"

                                            }

                                        </td>


                                        <td>

                                            {
                                                t.statusName ||
                                                t.description ||
                                                "-"
                                            }

                                        </td>


                                        <td>

                                            {
                                                start
                                                    ?
                                                    start.toLocaleDateString(
                                                        "en-ZA"
                                                    )
                                                    :
                                                    "-"
                                            }

                                        </td>

                                        <td>

                                            {
                                                start
                                                    ?
                                                    start.toLocaleTimeString(
                                                        "en-ZA",
                                                        {
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                            hour12: false
                                                        }
                                                    )
                                                    :
                                                    "-"
                                            }

                                        </td>


                                        <td>

                                            {
                                                end
                                                    ?
                                                    end.toLocaleTimeString(
                                                        "en-ZA",
                                                        {
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                            hour12: false
                                                        }
                                                    )
                                                    :
                                                    "Running"
                                            }

                                        </td>
                                        <td className="font-bold">

                                            {
                                                formatDuration(
                                                    start,
                                                    end
                                                )
                                            }

                                        </td>

                                        <td>


                                            {isAdmin && (

                                                <button

                                                    onClick={() => {


                                                        const start =

                                                            t.startTime?.toDate
                                                                ?
                                                                t.startTime.toDate()
                                                                :
                                                                null;



                                                        const end =

                                                            t.endTime?.toDate
                                                                ?
                                                                t.endTime.toDate()

                                                                :

                                                                null;



                                                        const formatDate =
                                                            (date: Date) => {

                                                                const y =
                                                                    date.getFullYear();


                                                                const m =
                                                                    String(
                                                                        date.getMonth() + 1
                                                                    )
                                                                        .padStart(2, "0");


                                                                const d =
                                                                    String(
                                                                        date.getDate()
                                                                    )
                                                                        .padStart(2, "0");


                                                                return `${y}-${m}-${d}`;

                                                            };



                                                        const formatTime =
                                                            (date: Date) => {

                                                                return date
                                                                    .toLocaleTimeString(
                                                                        "en-ZA",
                                                                        {
                                                                            hour: "2-digit",
                                                                            minute: "2-digit",
                                                                            hour12: false
                                                                        }

                                                                    );

                                                            };



                                                        setEditingTimer({

                                                            ...t,


                                                            active:
                                                                t.active !== false,


                                                            statusName:

                                                                t.statusName ||
                                                                t.description ||
                                                                "",


                                                            // LEFT DESCRIPTION BOX

                                                            description:

                                                                t.description ||
                                                                t.statusName ||
                                                                "",



                                                            startDate:

                                                                start
                                                                    ?
                                                                    formatDate(start)
                                                                    :
                                                                    "",



                                                            startClock:

                                                                start
                                                                    ?
                                                                    formatTime(start)
                                                                    :
                                                                    "",



                                                            endDate:

                                                                end
                                                                    ?
                                                                    formatDate(end)
                                                                    :
                                                                    (
                                                                        start
                                                                            ?
                                                                            formatDate(start)
                                                                            :
                                                                            ""
                                                                    ),



                                                            endClock:

                                                                end
                                                                    ?
                                                                    formatTime(end)
                                                                    :
                                                                    ""

                                                        });


                                                        setShowEdit(true);


                                                    }}



                                                    className="
                                            text-blue-600
                                            font-bold
                                            "

                                                >

                                                    Edit

                                                </button>

                                            )}


                                        </td>


                                    </tr>

                                )

                            })}


                    </tbody>

                    <tfoot>

                        <tr className="border-t-2 border-gray-300 bg-gray-50">

                            <td
                                colSpan={5}
                                className="py-4 pr-4 text-right font-black"
                            >
                                Total Duration
                            </td>

                            <td className="py-4 font-black">
                                {totalDurationHoursMinutes}
                            </td>

                            <td />

                        </tr>

                    </tfoot>


                </table>


            </div>

            {
                showEdit && editingTimer && (

                    <div className="
fixed
inset-0
bg-black/50
flex
items-center
justify-center
z-50
">

                        <div className="
bg-white
rounded-xl
p-6
w-[900px]
">

                            <h2 className="
text-xl
font-bold
text-blue-900
mb-6
">
                                Editing timer for {job?.jobNumber}
                            </h2>


                            <div className="grid grid-cols-2 gap-6">


                                {/* LEFT */}

                                <div>


                                    <label className="text-sm font-semibold">
                                        Employee *
                                    </label>


                                    <select

                                        value={editingTimer.employeeId || ""}


                                        onChange={(e) => {


                                            const selectedUser =
                                                users.find(
                                                    (u: any) =>
                                                        u.id === e.target.value
                                                );


                                            if (!selectedUser) {
                                                return;
                                            }


                                            setEditingTimer({

                                                ...editingTimer,


                                                employeeId:
                                                    selectedUser.id,


                                                employeeName:

                                                    (
                                                        selectedUser.name ||

                                                        `${selectedUser.firstName || ""} ${selectedUser.lastName || ""}`.trim()

                                                    )

                                            });


                                        }}

                                        className="
border
rounded
p-2
w-full
mb-4
"

                                    >


                                        <option value="">
                                            Select Employee
                                        </option>


                                        {users.map(
                                            (user: any) => (

                                                <option

                                                    key={user.id}

                                                    value={user.id}

                                                >

                                                    {
                                                        user.name ||

                                                        `${user.firstName || ""} ${user.lastName || ""}`

                                                    }

                                                </option>

                                            )

                                        )}


                                    </select>


                                    <label className="flex gap-2 mb-3">

                                        <input
                                            type="checkbox"
                                            checked={editingTimer.billable || false}
                                            onChange={(e) =>
                                                setEditingTimer({
                                                    ...editingTimer,
                                                    billable: e.target.checked
                                                })
                                            }
                                        />

                                        Invoiced

                                    </label>

                                    {editingTimer.billable && (

                                        <div className="mb-3">

                                            <label className="text-sm font-semibold">

                                                Invoice Time (HH:MM:SS)

                                            </label>


                                            <input

                                                type="time"

                                                step="1"

                                                value={
                                                    editingTimer.invoiceTime || "00:00:00"
                                                }

                                                onChange={(e) =>

                                                    setEditingTimer({

                                                        ...editingTimer,

                                                        invoiceTime:
                                                            e.target.value

                                                    })

                                                }

                                                className="
border
rounded
p-2
w-full
"

                                            />

                                        </div>

                                    )}


                                    <label className="flex gap-2 mb-3">

                                        <input
                                            type="checkbox"
                                            checked={editingTimer.overtime || false}
                                            onChange={(e) =>
                                                setEditingTimer({
                                                    ...editingTimer,
                                                    overtime: e.target.checked
                                                })
                                            }
                                        />

                                        Overtime

                                    </label>

                                    {editingTimer.overtime && (

                                        <div className="mb-3">

                                            <label className="text-sm font-semibold">

                                                Overtime (HH:MM:SS)

                                            </label>


                                            <input

                                                type="time"

                                                step="1"

                                                value={
                                                    editingTimer.overtimeTime || "00:00:00"
                                                }

                                                onChange={(e) =>

                                                    setEditingTimer({

                                                        ...editingTimer,

                                                        overtimeTime:
                                                            e.target.value

                                                    })

                                                }

                                                className="
border
rounded
p-2
w-full
"

                                            />

                                        </div>

                                    )}


                                    <label className="text-sm font-semibold">
                                        Description
                                    </label>


                                    <textarea

                                        value={
                                            editingTimer.statusName || ""
                                        }

                                        onChange={(e) =>
                                            setEditingTimer({

                                                ...editingTimer,

                                                description:
                                                    e.target.value,

                                                statusName:
                                                    e.target.value

                                            })
                                        }

                                        className="
border
rounded
p-2
w-full
h-28
"

                                    />


                                </div>



                                {/* RIGHT */}

                                <div>


                                    <label className="flex gap-2 mb-5">

                                        <input
                                            type="checkbox"
                                            checked={true}
                                            readOnly
                                        />

                                        Use Start and End Time

                                    </label>



                                    <label>
                                        Start Date *
                                    </label>

                                    <input

                                        type="date"

                                        value={
                                            editingTimer.startDate || ""
                                        }

                                        onChange={(e) =>
                                            setEditingTimer({
                                                ...editingTimer,
                                                startDate: e.target.value
                                            })
                                        }

                                        className="
border
rounded
p-2
w-full
mb-3
"

                                    />



                                    <label>
                                        Start Time
                                    </label>


                                    <input

                                        type="time"

                                        value={
                                            editingTimer.startClock || ""
                                        }

                                        onChange={(e) =>
                                            setEditingTimer({
                                                ...editingTimer,
                                                startClock: e.target.value
                                            })
                                        }

                                        className="
border
rounded
p-2
w-full
mb-3
"

                                    />



                                    <label>
                                        End Date *
                                    </label>


                                    <input

                                        type="date"

                                        value={
                                            editingTimer.endDate || ""
                                        }

                                        onChange={(e) =>
                                            setEditingTimer({
                                                ...editingTimer,
                                                endDate: e.target.value
                                            })
                                        }

                                        className="
border
rounded
p-2
w-full
mb-3
"

                                    />



                                    <label>
                                        End Time
                                    </label>


                                    <input

                                        type="time"

                                        value={
                                            editingTimer.endClock || ""
                                        }

                                        onChange={(e) =>
                                            setEditingTimer({
                                                ...editingTimer,
                                                endClock: e.target.value
                                            })
                                        }

                                        className="
border
rounded
p-2
w-full
"

                                    />



                                    <div className="
flex
justify-end
mt-8
">

                                        <label className="flex gap-3">

                                            <input

                                                type="checkbox"

                                                checked={
                                                    editingTimer.visible !== false
                                                }
                                                onChange={(e) =>
                                                    setEditingTimer({

                                                        ...editingTimer,

                                                        visible:
                                                            e.target.checked

                                                    })
                                                }

                                            />

                                            Active

                                        </label>

                                    </div>


                                </div>


                            </div>



                            <div className="
flex
justify-end
gap-3
mt-8
">


                                <button

                                    onClick={() =>
                                        setShowEdit(false)
                                    }

                                    className="
border
px-10
py-2
rounded
"

                                >
                                    Cancel
                                </button>



                                <button

                                    data-save-target="true"

                                    data-wait-for-saved-event="true"

                                    onClick={async () => {

                                        let newStart = null;


                                        if (
                                            editingTimer.startDate &&
                                            editingTimer.startClock
                                        ) {

                                            newStart =
                                                new Date(
                                                    `${editingTimer.startDate}T${editingTimer.startClock}`
                                                );

                                        }



                                        let newEnd = null;


                                        if (
                                            editingTimer.endDate &&
                                            editingTimer.endClock
                                        ) {

                                            newEnd =
                                                new Date(
                                                    `${editingTimer.endDate}T${editingTimer.endClock}`
                                                );

                                        }

                                        await updateDoc(

                                            doc(
                                                clientDb,
                                                "companies",
                                                COMPANY_ID,
                                                "jobs",
                                                id,
                                                "timers",
                                                editingTimer.id
                                            ),

                                            {

                                                employeeId:
                                                    editingTimer.employeeId,

                                                employeeName:
                                                    editingTimer.employeeName,


                                                statusName:
                                                    editingTimer.statusName,


                                                billable:
                                                    editingTimer.billable || false,


                                                invoiceTime:

                                                    editingTimer.billable
                                                        ?
                                                        editingTimer.invoiceTime
                                                        :
                                                        "",


                                                overtime:
                                                    editingTimer.overtime || false,


                                                overtimeTime:

                                                    editingTimer.overtime
                                                        ?
                                                        editingTimer.overtimeTime
                                                        :
                                                        "",

                                                slaTime:
                                                    editingTimer.slaTime || false,


                                                visible:
                                                    editingTimer.visible !== false,

                                                updatedAt:
                                                    serverTimestamp(),


                                                ...(newStart && {

                                                    startTime:
                                                        Timestamp.fromDate(
                                                            newStart
                                                        )

                                                }),


                                                endTime:

                                                    newEnd
                                                        ?
                                                        Timestamp.fromDate(
                                                            newEnd
                                                        )
                                                        :
                                                        null,

                                            }

                                        );


                                        setShowEdit(false);

                                        window.dispatchEvent(new Event("fleetfix:changes-saved"));

                                        loadTimers();


                                    }}

                                    className="
bg-blue-600
text-white
px-10
py-2
rounded
"

                                >

                                    Save

                                </button>


                            </div>


                        </div>

                    </div>

                )
            }

        </div >

    );

}
