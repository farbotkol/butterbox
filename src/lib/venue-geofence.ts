type GeofenceForm = {
  latitude: string;
  longitude: string;
  radiusMeters: string;
};

type Geofence = {
  valid: true;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
} | { valid: false };

function coordinate(value: string, limit: number): number | undefined {
  if (value.length > 32 || !/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return undefined;
  const fraction = value.split(".")[1]?.replace(/0+$/, "") ?? "";
  const parsed = Number(value);
  if (fraction.length > 6 || !Number.isFinite(parsed) || Math.abs(parsed) > limit) return undefined;
  return parsed;
}

export function parseVenueGeofence(input: GeofenceForm): Geofence {
  const latitudeText = input.latitude.trim();
  const longitudeText = input.longitude.trim();
  const radiusText = input.radiusMeters.trim();
  if (!latitudeText && !longitudeText && !radiusText) {
    return { valid: true, latitude: null, longitude: null, radiusMeters: null };
  }
  const latitude = coordinate(latitudeText, 90);
  const longitude = coordinate(longitudeText, 180);
  if (latitude === undefined || longitude === undefined || !/^\d{1,5}$/.test(radiusText)) {
    return { valid: false };
  }
  const radiusMeters = Number(radiusText);
  if (radiusMeters < 1 || radiusMeters > 10000) return { valid: false };
  return { valid: true, latitude, longitude, radiusMeters };
}
