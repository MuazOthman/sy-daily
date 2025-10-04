export function getEpochSecondsMostRecent_11_PM_InDamascus(
  specifiedDate?: Date
): number {
  // Get current time in UTC
  const now = specifiedDate || new Date();

  // Create date in UTC
  const dateInUTC = new Date(now);

  // For UTC+3, when it's 23:00 in UTC+3, it's 20:00 the previous day in UTC
  // So we need to set the UTC time to 20:00 of the current day
  dateInUTC.setUTCHours(20, 0, 0, 0);

  // If this time is in the future, we need to go back 24 hours
  if (dateInUTC > now) {
    dateInUTC.setUTCDate(dateInUTC.getUTCDate() - 1);
  }

  // Return the epoch time in seconds
  return Math.floor(dateInUTC.getTime() / 1000);
}

export function formatDateUTCPlus3(date: Date): string {
  // Get UTC time in milliseconds
  const utcMilliseconds = date.getTime();

  // Add 3 hours (in ms) to shift from UTC → UTC+3
  const plus3Milliseconds = utcMilliseconds + 3 * 60 * 60 * 1000;

  // Create a new date object in UTC+3
  const plus3Date = new Date(plus3Milliseconds);

  // Extract year, month, day in UTC (since we've already shifted time)
  const year = plus3Date.getUTCFullYear();
  const month = String(plus3Date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(plus3Date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
