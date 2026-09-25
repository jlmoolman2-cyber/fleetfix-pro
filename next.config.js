/** @type {import('next').NextConfig} */
const nextConfig = {

    serverExternalPackages: ["@napi-rs/canvas", "@google-cloud/tasks"],

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
