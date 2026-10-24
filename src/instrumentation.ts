// Runs once when the server starts. All dates (attendance days, task due times, payroll months)
// are computed in company local time, so pin the process timezone even if the host runs on UTC.
export function register() {
  process.env.TZ = process.env.APP_TIMEZONE ?? "Asia/Karachi";
}
