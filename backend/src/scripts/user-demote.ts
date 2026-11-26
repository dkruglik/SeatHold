import { ChangeUserRoleService } from "../modules/auth/application/change-user-role-service.js";
import { runRoleCommand } from "./role-command.js";
import { processIo, runScript } from "./script-runtime.js";

process.exitCode = await runScript(process.env, processIo, ({ users }) =>
  runRoleCommand("buyer", process.argv.slice(2), { changeRole: new ChangeUserRoleService({ users }), io: processIo }),
);
