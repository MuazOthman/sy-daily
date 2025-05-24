export function getMostRecent12AMInDamascus(): number {
  // Get current time in UTC
  const now = new Date();

  // Create date in UTC
  const dateInUTC = new Date(now);

  // For UTC+3, when it's 00:00 in UTC+3, it's 21:00 the previous day in UTC
  // So we need to set the UTC time to 21:00 of the current day
  dateInUTC.setUTCHours(21, 0, 0, 0);

  // If this time is in the future, we need to go back 24 hours
  if (dateInUTC > now) {
    dateInUTC.setUTCDate(dateInUTC.getUTCDate() - 1);
  }

  // Return the epoch time in seconds
  return Math.floor(dateInUTC.getTime() / 1000);
}
