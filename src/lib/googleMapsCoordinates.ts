export type Coordinates = {
  latitude: string;
  longitude: string;
};

function validCoordinates(latitude: number, longitude: number) {
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90
    && Math.abs(longitude) <= 180;
}

function coordinates(latitudeValue: string, longitudeValue: string): Coordinates | null {
  if (!latitudeValue.trim() || !longitudeValue.trim()) return null;

  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);

  if (!validCoordinates(latitude, longitude)) return null;

  return {
    latitude: String(latitude),
    longitude: String(longitude),
  };
}

export function coordinatesFromGoogleMapsLink(value: string): Coordinates | null {
  if (!value.trim()) return null;

  let link = value.trim();
  try {
    link = decodeURIComponent(link);
  } catch {
    // Keep the original text when it contains malformed URL escapes.
  }

  const number = "(-?\\d+(?:\\.\\d+)?)";
  const patterns = [
    new RegExp(`@${number},\\s*${number}`),
    new RegExp(`/maps/(?:search|place)/${number},(?:\\+|%20|\\s)*${number}`, "i"),
    new RegExp(`[?&](?:q|query|ll|destination|center)=${number}(?:,|%2C|\\s)${number}`, "i"),
    new RegExp(`!3d${number}!4d${number}`, "i"),
  ];

  for (const pattern of patterns) {
    const match = link.match(pattern);
    if (!match) continue;

    const result = coordinates(match[1], match[2]);
    if (result) return result;
  }

  return null;
}

export function googleMapsLinkFromCoordinates(
  latitudeValue: string,
  longitudeValue: string
) {
  const result = coordinates(latitudeValue.trim(), longitudeValue.trim());
  return result
    ? `https://www.google.com/maps?q=${result.latitude},${result.longitude}`
    : "";
}

export async function resolveGoogleMapsCoordinates(value: string): Promise<Coordinates | null> {
  const embeddedCoordinates = coordinatesFromGoogleMapsLink(value);
  if (embeddedCoordinates) return embeddedCoordinates;
  if (!value.trim()) return null;

  try {
    const response = await fetch("/api/google-maps-coordinates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: value }),
    });

    if (!response.ok) return null;
    return await response.json() as Coordinates;
  } catch {
    return null;
  }
}
