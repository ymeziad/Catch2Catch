import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// Reminder sweep every minute (uses the demo clock, so "+7 days" fires a week of reminders at once).
const crons = cronJobs();
crons.interval("send due reminders", { minutes: 1 }, internal.reminders.processDue, {});
export default crons;
