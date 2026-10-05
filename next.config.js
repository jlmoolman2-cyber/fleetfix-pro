/** @type {import('next').NextConfig} */
const nextConfig = {

    serverExternalPackages: ["@napi-rs/canvas", "@google-cloud/tasks"],

    // The tasks client require()s protos.json via a computed path the tracer cannot follow.
    outputFileTracingIncludes: {
        "/api/iq200/knowledge/documents/upload": [
            "./node_modules/@google-cloud/tasks/build/protos/protos.json",
            "./node_modules/@google-cloud/tasks/package.json",
        ],
    },

    images: {

        remotePatterns: [

            {
                protocol: "https",
                hostname: "placehold.co",
            },

            {
                protocol: "https",
                hostname: "api.qrserver.com",
            },

            {
                protocol: "https",
                hostname: "firebasestorage.googleapis.com",
            },

        ],

    },

};

module.exports = nextConfig;
