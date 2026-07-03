import { stableCreateCommand } from './commands/stable-create.js';
import { stableListCommand } from './commands/stable-list.js';
import { stableDeleteCommand } from './commands/stable-delete.js';
import { stableEditCommand } from './commands/stable-edit.js';
import { createRaceCommand } from './commands/create.js';
import { joinCommand } from './commands/join.js';
import { endCommand } from './commands/end.js';
import { initCommand } from './commands/init.js';
import { updateCommand } from './commands/update.js';
import { rollCommand } from './commands/roll.js';
import { orgJoinCommand } from './commands/org-join.js';
import { webCommand } from './commands/web.js';
import { envCommand } from './commands/env.js';
import { CLI_VERSION } from './version.js';
import { loadIdentity } from './identity/identity.js';

const HELP = `token-derby v${CLI_VERSION}

Identity:
  token-derby init                        Set up your jockey identity (run this first)
                                          Re-running renames you on the server.
  token-derby init --reset                Wipe local identity and create a fresh account.
                                          Your previous stable is abandoned on the server.

Maintenance:
  token-derby update                      Check for and install the latest CLI version

Stable management:
  token-derby stable create               Make a new horse (interactive)
  token-derby stable list                 Show your saved horses
  token-derby stable edit [name]          Edit an existing horse's colors (interactive picker if no name)
  token-derby stable delete <name>        Remove a horse from your stable

Organisations:
  token-derby organisation join <token>   Join an organisation with a join token
  token-derby web                         Open the web org manager (create orgs,
                                          manage schedules, webhooks, members)

Races:
  token-derby create [--organisation <name>]
                                          Create a new race (interactive). When
                                          --organisation is set, only members of
                                          that org can join.
  token-derby join <join-code>            Join (or resume) a race
  token-derby end <admin-code>            End a race early

Cosmetics:
  token-derby roll                        Spend a pending roll to try for a hat.
                                          Earn rolls by leveling up horses.

Environment:
  token-derby env                         Show the active environment (prod|staging)
  token-derby env <prod|staging>          Switch environment. Each env has its own
                                          identity/stable dir, so switching never
                                          touches the other env's account.
  TOKEN_DERBY_API_BASE                    Hard-override API base URL (wins over env)
  TOKEN_DERBY_HOME                        Hard-override identity/stable directory
`;

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (!cmd || cmd === '--help' || cmd === '-h') { console.log(HELP); return 0; }
  if (cmd === '--version' || cmd === '-v') { console.log(CLI_VERSION); return 0; }

  if (cmd === 'init') {
    const reset = argv.slice(1).includes('--reset');
    return initCommand(reset);
  }
  // `update` runs before the identity gate so a broken or stale install can fix itself.
  if (cmd === 'update') return updateCommand();
  // `env` runs before the identity gate: switching to a fresh env is exactly
  // when no identity exists there yet.
  if (cmd === 'env') return envCommand(argv[1]);

  // Every other command requires an identity. `init`, `update`, and `env` are the only escape hatches.
  const identity = await loadIdentity();
  if (!identity) {
    console.error('Run `token-derby init` to set up your identity before using any other command.');
    return 1;
  }

  if (cmd === 'stable') {
    const sub = argv[1];
    if (sub === 'create') return stableCreateCommand();
    if (sub === 'list') return stableListCommand();
    if (sub === 'edit') return stableEditCommand(argv[2]);
    if (sub === 'delete') return stableDeleteCommand(argv[2]);
    console.error(`Unknown stable subcommand: ${sub ?? '(none)'}`);
    console.error('Try: stable create | stable list | stable edit <name> | stable delete <name>');
    return 2;
  }

  if (cmd === 'organisation' || cmd === 'org') {
    const sub = argv[1];
    if (sub === 'join') return orgJoinCommand(argv[2]);
    console.error(`Organisation management has moved to the web: token-derby web`);
    console.error(`The only CLI organisation command is: organisation join <token>`);
    return 2;
  }

  if (cmd === 'create') {
    const orgName = parseFlag(argv.slice(1), '--organisation');
    return createRaceCommand(orgName);
  }
  if (cmd === 'join')   return joinCommand(argv[1], argv.slice(2));
  if (cmd === 'end')    return endCommand(argv[1]);
  if (cmd === 'roll')      return rollCommand();
  if (cmd === 'web')    return webCommand();

  console.error(`Unknown command: ${cmd}`);
  console.error(HELP);
  return 2;
}

function parseFlag(args: string[], flag: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag) return args[i + 1];
    const eq = `${flag}=`;
    if (args[i]?.startsWith(eq)) return args[i]!.slice(eq.length);
  }
  return undefined;
}

main().then(
  code => process.exit(code),
  err => {
    console.error(err?.stack ?? err);
    process.exit(1);
  },
);
