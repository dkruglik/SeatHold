import { createBookingServices } from "../modules/booking/index.js";
import { runSweepHoldsCommand } from "./sweep-holds-command.js";
import { processIo, runScript } from "./script-runtime.js";

process.exitCode = await runScript(process.env, processIo, ({ config, prisma, clock }) =>
  runSweepHoldsCommand(process.argv.slice(2), { sweeper: createBookingServices({ ...config, prisma, clock }).expireHolds, io: processIo }),
);
