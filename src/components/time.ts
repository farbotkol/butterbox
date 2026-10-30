export function localDate(value: string | Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find(part => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function localInput(value: string, timeZone: string): string {
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(value));
  return `${localDate(value, timeZone)}T${time}`;
}

export function addDays(date: string, count: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}

export function monday(date: string): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -(day === 0 ? 6 : day - 1));
}

export function dateLabel(date: string, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", timeZone: "UTC", ...options,
  }).format(new Date(`${date}T12:00:00Z`));
}

export function timeLabel(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(value));
}

export function localToInstant(value: string, timeZone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("Enter a complete date and time.");
  const wall = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 16) !== value)
    throw new Error("Enter a valid calendar date.");
  // Collect the zone's actual offsets around the date, then verify every candidate.
  // This avoids silently choosing the wrong side of a daylight-saving transition.
  const offsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 3) {
    const instant = wall + hours * 3600000;
    offsets.add(Date.parse(`${localInput(new Date(instant).toISOString(), timeZone)}:00Z`) - instant);
  }
  const matches = [...offsets]
    .map(offset => wall - offset)
    .filter(instant => localInput(new Date(instant).toISOString(), timeZone) === value);
  if (!matches.length)
    throw new Error("This local time does not exist because the clocks change. Choose another time.");
  if (matches.length > 1)
    throw new Error("This local time occurs twice when the clocks change. Choose an unambiguous time.");
  return new Date(matches[0]).toISOString();
}
