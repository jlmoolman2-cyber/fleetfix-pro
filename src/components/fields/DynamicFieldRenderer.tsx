"use client";

import { JobField } from "@/types/fields";

type Props = {
  field: JobField;
  value?: string;
  onChange?: (value: string) => void;
  required?: boolean;
};

export default function DynamicFieldRenderer({
  field,
  value,
  onChange,
  required,
}: Props) {

  switch (field.type) {

    /* TEXT */
    case "text":

      return (

        <div>

          <label className="mb-2 block text-sm font-semibold text-gray-700">

            {field.label}

            {required && (
              <span className="ml-1 text-red-500">*</span>
            )}

          </label>

          <input
            value={value || ""}
            onChange={(e) =>
              onChange?.(e.target.value)
            }
            className="
              w-full
              rounded-2xl
              border
              border-gray-300
              px-4
              py-3
              text-sm
              outline-none
              focus:border-blue-500
            "
          />

        </div>
      );

    /* TEXTAREA */
    case "textarea":

      return (

        <div>

          <label className="mb-2 block text-sm font-semibold text-gray-700">

            {field.label}

            {required && (
              <span className="ml-1 text-red-500">*</span>
            )}

          </label>

          <textarea
            value={value || ""}
            onChange={(e) =>
              onChange?.(e.target.value)
            }
            rows={4}
            className="
              w-full
              rounded-2xl
              border
              border-gray-300
              px-4
              py-3
              text-sm
              outline-none
              focus:border-blue-500
            "
          />

        </div>
      );

    /* NUMBER */
    case "number":

      return (

        <div>

          <label className="mb-2 block text-sm font-semibold text-gray-700">

            {field.label}

            {required && (
              <span className="ml-1 text-red-500">*</span>
            )}

          </label>

          <input
            type="number"
            value={value || ""}
            onChange={(e) =>
              onChange?.(e.target.value)
            }
            className="
              w-full
              rounded-2xl
              border
              border-gray-300
              px-4
              py-3
              text-sm
              outline-none
              focus:border-blue-500
            "
          />

        </div>
      );

    /* DATE */
    case "date":

      return (

        <div>

          <label className="mb-2 block text-sm font-semibold text-gray-700">

            {field.label}

            {required && (
              <span className="ml-1 text-red-500">*</span>
            )}

          </label>

          <input
            type="date"
            value={value || ""}
            onChange={(e) =>
              onChange?.(e.target.value)
            }
            className="
              w-full
              rounded-2xl
              border
              border-gray-300
              px-4
              py-3
              text-sm
              outline-none
              focus:border-blue-500
            "
          />

        </div>
      );

    /* CHECKBOX */
    case "checkbox":

      return (

        <div
          className="
            flex
            items-center
            gap-3
            rounded-2xl
            border
            border-gray-200
            bg-white
            p-4
          "
        >

          <input
            type="checkbox"
            checked={value === "true"}
            onChange={(e) =>
              onChange?.(
                e.target.checked
                  ? "true"
                  : "false"
              )
            }
            className="h-5 w-5"
          />

          <label className="text-sm font-medium text-gray-700">
            {field.label}
          </label>

        </div>
      );

    /* DROPDOWN */
    case "dropdown":

      return (

        <div>

          <label className="mb-2 block text-sm font-semibold text-gray-700">

            {field.label}

            {required && (
              <span className="ml-1 text-red-500">*</span>
            )}

          </label>

          <select
            value={value || ""}
            onChange={(e) =>
              onChange?.(e.target.value)
            }
            className="
              w-full
              rounded-2xl
              border
              border-gray-300
              px-4
              py-3
              text-sm
              outline-none
              focus:border-blue-500
            "
          >

            <option value="">
              Select option
            </option>

            <option value="Option 1">
              Option 1
            </option>

            <option value="Option 2">
              Option 2
            </option>

          </select>

        </div>
      );

    /* PHOTO */
    case "photo":

      return (

        <div>

          <label className="mb-2 block text-sm font-semibold text-gray-700">

            {field.label}

          </label>

          <div
            className="
              flex
              h-40
              items-center
              justify-center
              rounded-3xl
              border-2
              border-dashed
              border-gray-300
              bg-gray-50
            "
          >

            <div className="text-center">

              <div className="text-4xl">
                📸
              </div>

              <p className="mt-2 text-sm text-gray-500">
                Upload Photo
              </p>

            </div>

          </div>

        </div>
      );

    default:
      return null;
  }
}