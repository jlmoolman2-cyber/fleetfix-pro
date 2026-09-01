"use client";


type Props = {

  status: any;

};


export default function StatusBadge({

  status,

}: Props) {


  if (typeof status === "object") {

    return (

      <span

        className={`

            inline-flex
            rounded-full
            px-3
            py-1.5
            text-sm
            font-black

            ${status.color || "bg-gray-200"}

            ${status.textColor || "text-gray-800"}

            `}

      >

        {status.name}

      </span>

    );

  }


  return (

    <span

      className="
        inline-flex
        rounded-full
        bg-gray-200
        px-3
        py-1.5
        text-sm
        font-black
        text-gray-800
        "

    >

      {status}

    </span>

  );

}
