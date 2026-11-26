import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("refresh open PRs", { minutes: 5 }, internal.prs.scheduledRefresh, {});

export default crons;
