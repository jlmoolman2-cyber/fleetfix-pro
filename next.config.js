/** @type {import('next').NextConfig} */
const nextConfig = {

    serverExternalPackages: ["@napi-rs/canvas"],

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
