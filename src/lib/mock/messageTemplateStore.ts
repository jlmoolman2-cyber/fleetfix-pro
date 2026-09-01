export type MessageTemplate = {

    id: string;

    name: string;

    module: string;

    subject: string;

    body: string;
};

const STORAGE_KEY =
    "fleetfix_message_templates";

const defaultTemplates: MessageTemplate[] = [

    {
        id: "1",

        name:
            "Arrival Notification",

        module:
            "Job Card",

        subject:
            "Technician Arrived",

        body:
            "Technician arrived at {{CustName}}",
    },

    {
        id: "2",

        name:
            "Job Booked",

        module:
            "Job Card",

        subject:
            "Job Booked",

        body:
            `Hi {{CustName}}

Your job {{JobNo}}
has been booked successfully.
`,
    },
];

export function getTemplates() {

    if (
        typeof window ===
        "undefined"
    ) {

        return defaultTemplates;
    }

    const stored =
        localStorage.getItem(
            STORAGE_KEY
        );

    if (!stored) {

        localStorage.setItem(

            STORAGE_KEY,

            JSON.stringify(
                defaultTemplates
            )
        );

        return defaultTemplates;
    }

    return JSON.parse(stored);
}

export function saveTemplates(

    templates:
        MessageTemplate[]
) {

    localStorage.setItem(

        STORAGE_KEY,

        JSON.stringify(
            templates
        )
    );
}