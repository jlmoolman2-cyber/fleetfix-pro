"use client";

import Link from "next/link";
import { use } from "react";
import {
    useEffect,
    useState,
} from "react";

import {
    collection,
    addDoc,
    getDocs,
    deleteDoc,
    doc,
    getDoc,
    serverTimestamp,
    orderBy,
    query,
} from "firebase/firestore";

import {
    ref,
    uploadBytes,
    getDownloadURL,
    deleteObject,
} from "firebase/storage";


import {
    clientDb,
    storage,
} from "@/lib/firebaseClient";


import {
    COMPANY_ID,
} from "@/lib/company";



interface PageProps {

    params: Promise<{
        id: string;
    }>;

}



const attachmentTypes = [

    "Other",
    "Quote",
    "Invoice",
    "POP",
    "POD",
    "Image",
    "Audio",
    "Contract",
    "Logo",
    "Job Card",
    "Purchase Order",

];




export default function JobAttachmentsPage({
    params,
}: PageProps) {


    const { id } = use(params);


    const [job, setJob] =
        useState<any>(null);


    const [attachments, setAttachments] =
        useState<any[]>([]);


    const [search, setSearch] =
        useState("");


    const [type, setType] =
        useState("Other");


    const [uploading, setUploading] =
        useState(false);



    useEffect(() => {

        loadData();

    }, []);





    async function loadData() {


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

            setJob({
                id: jobSnap.id,
                ...jobSnap.data(),
            });

        }



        const q =
            query(

                collection(
                    clientDb,
                    "companies",
                    COMPANY_ID,
                    "jobs",
                    id,
                    "attachments"
                ),

                orderBy(
                    "createdAt",
                    "desc"
                )

            );



        const snap =
            await getDocs(q);



        setAttachments(

            snap.docs.map(d => ({

                id: d.id,
                ...d.data(),

            }))

        );



    }






    async function uploadAttachment(
        files: FileList | null
    ) {


        if (!files) return;


        try {


            setUploading(true);



            for (
                const file of Array.from(files)
            ) {



                const path =

                    `companies/${COMPANY_ID}/jobs/${id}/attachments/${Date.now()}-${file.name}`;



                const fileRef =
                    ref(
                        storage,
                        path
                    );



                await uploadBytes(
                    fileRef,
                    file
                );



                const url =
                    await getDownloadURL(
                        fileRef
                    );



                await addDoc(

                    collection(
                        clientDb,
                        "companies",
                        COMPANY_ID,
                        "jobs",
                        id,
                        "attachments"
                    ),

                    {

                        name:
                            file.name,


                        type,


                        url,


                        path,


                        size:
                            file.size,


                        createdAt:
                            serverTimestamp(),


                    }

                );


            }



            await loadData();



        } catch (err) {

            console.error(err);

            alert(
                "Attachment upload failed"
            );

        }

        finally {

            setUploading(false);

        }



    }






    async function removeAttachment(
        file: any
    ) {


        if (
            !confirm(
                "Delete attachment?"
            )
        )
            return;



        try {


            if (file.path) {


                await deleteObject(

                    ref(
                        storage,
                        file.path
                    )

                );


            }



            await deleteDoc(

                doc(
                    clientDb,
                    "companies",
                    COMPANY_ID,
                    "jobs",
                    id,
                    "attachments",
                    file.id
                )

            );


            await loadData();



        } catch (err) {

            console.error(err);

        }


    }






    const filtered =

        attachments.filter(a =>

            String(a.name)

                .toLowerCase()

                .includes(
                    search.toLowerCase()
                )

        );






    return (

        <div className="min-h-screen bg-[#f5f7fb] p-6">


            <div className="mx-auto max-w-[1600px]">



                {/* HEADER */}

                <div className="
bg-white
rounded-3xl
border
p-6
mb-6
flex
items-center
justify-between
">


                    <div>


                        <h1 className="
text-4xl
font-black
">

                            📎 Attachments

                        </h1>



                        <p className="text-gray-500 mt-1">

                            Job:
                            {" "}
                            {job?.jobNumber || id}

                        </p>


                    </div>



                    <Link

                        href={`/jobs/${id}`}

                        className="
border
rounded-xl
px-5
py-2
font-bold
hover:bg-gray-50
"

                    >

                        ← Back To Job

                    </Link>


                </div>







                {/* TOOLBAR */}

                <div className="
bg-white
rounded-2xl
border
p-5
mb-5
flex
gap-4
items-center
">



                    <input

                        placeholder="Search"

                        value={search}

                        onChange={(e) =>
                            setSearch(
                                e.target.value
                            )
                        }

                        className="
border
rounded-xl
px-4
py-2
w-80
"

                    />



                    <select

                        value={type}

                        onChange={(e) =>
                            setType(
                                e.target.value
                            )
                        }

                        className="
border
rounded-xl
px-4
py-2
"

                    >


                        {attachmentTypes.map(t => (


                            <option key={t}>

                                {t}

                            </option>


                        ))}


                    </select>





                    <label className="
ml-auto
bg-blue-600
text-white
rounded-xl
px-6
py-3
font-bold
cursor-pointer
">


                        {
                            uploading
                                ?
                                "Uploading..."
                                :
                                "+ Add Attachment(s)"
                        }



                        <input

                            hidden

                            multiple

                            type="file"

                            onChange={(e) =>
                                uploadAttachment(
                                    e.target.files
                                )
                            }

                        />


                    </label>



                </div>








                {/* DROP BOX */}


                <div

                    onDragOver={(e) =>
                        e.preventDefault()
                    }


                    onDrop={(e) => {

                        e.preventDefault();

                        uploadAttachment(
                            e.dataTransfer.files
                        );

                    }}


                    className="
bg-white
border-2
border-dashed
rounded-3xl
h-44
flex
items-center
justify-center
text-gray-400
font-semibold
mb-6
"

                >


                    Drop files here


                </div>









                {/* FILE LIST */}

                <div className="
bg-white
rounded-3xl
border
overflow-hidden
">


                    <table className="w-full text-sm">


                        <thead className="bg-gray-100">


                            <tr>


                                <th className="p-3 text-left">

                                    File Name

                                </th>


                                <th>

                                    Type

                                </th>


                                <th>

                                    Size

                                </th>


                                <th>

                                    Action

                                </th>


                            </tr>


                        </thead>




                        <tbody>



                            {filtered.map(file => (


                                <tr

                                    key={file.id}

                                    className="
border-t
hover:bg-gray-50
"

                                >


                                    <td className="p-3">


                                        <a

                                            href={file.url}

                                            target="_blank"

                                            className="
font-bold
text-blue-600
"

                                        >


                                            {file.name}


                                        </a>


                                    </td>




                                    <td className="text-center">

                                        {file.type}

                                    </td>




                                    <td className="text-center">

                                        {
                                            Math.round(
                                                file.size / 1024
                                            )
                                        }

                                        KB

                                    </td>




                                    <td className="text-center">


                                        <button

                                            onClick={() =>
                                                removeAttachment(file)
                                            }

                                            className="
text-red-600
font-bold
"

                                        >

                                            Delete

                                        </button>


                                    </td>



                                </tr>



                            ))}



                            {filtered.length === 0 && (


                                <tr>

                                    <td

                                        colSpan={4}

                                        className="
p-10
text-center
text-gray-400
"

                                    >

                                        No attachments found

                                    </td>

                                </tr>


                            )}



                        </tbody>



                    </table>



                </div>



            </div>


        </div>


    );


}