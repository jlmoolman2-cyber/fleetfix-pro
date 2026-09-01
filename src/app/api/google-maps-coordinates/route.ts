import { coordinatesFromGoogleMapsLink } from "@/lib/googleMapsCoordinates";

function isAllowedGoogleMapsHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "goo.gl"
    || host.endsWith(".goo.gl")
    || host === "google.com"
    || host.endsWith(".google.com");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const value = String(body?.url || "").trim();
    const url = new URL(value);

    if (url.protocol !== "https:" || !isAllowedGoogleMapsHost(url.hostname)) {
      return Response.json({ error: "Only secure Google Maps links are supported" }, { status: 400 });
    }

    const embeddedCoordinates = coordinatesFromGoogleMapsLink(value);
    if (embeddedCoordinates) return Response.json(embeddedCoordinates);

    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "Mozilla/5.0 FleetFix Google Maps coordinate resolver" },
    });

    const resolvedUrl = new URL(response.url);
    if (!isAllowedGoogleMapsHost(resolvedUrl.hostname)) {
      return Response.json({ error: "Google Maps link redirected to an unsupported host" }, { status: 400 });
    }

    const coordinates = coordinatesFromGoogleMapsLink(response.url);
    if (!coordinates) {
      return Response.json({ error: "No GPS coordinates were found in this Google Maps link" }, { status: 422 });
    }

    return Response.json(coordinates);
  } catch (error) {
    console.error("Unable to resolve Google Maps coordinates", error);
    return Response.json({ error: "Unable to resolve Google Maps link" }, { status: 400 });
  }
}
