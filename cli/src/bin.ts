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
import { rollDemoCommand } from './commands/roll-demo.js';
import { orgCreateCommand } from './commands/org-create.js';
import { orgJoinCommand } from './commands/org-join.js';
import { orgListCommand } from './commands/org-list.js';
import { orgInfoCommand } from './commands/org-info.js';
import { orgWebhookSetCommand } from './commands/org-webhook-set.js';
import { orgWebhookGetCommand } from './commands/org-webhook-get.js';
import { orgWebhookClearCommand } from './commands/org-webhook-clear.js';
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
  token-derby stable edit <name>          Edit an existing horse's colors
  token-derby stable delete <name>        Remove a horse from your stable

Organisations:
  token-derby organisation create         Create a new organisation (interactive)
  token-derby organisation join <token>   Join an organisation with a join token
  token-derby organisation info <name>    Show an org's join token (members only)
  token-derby organisation list           Show organisations you're a member of
  token-derby organisation webhook set <name> <url>
                                          Configure an https webhook for race events.
                                          Prints a secret used to sign each request.
                                          Only the org creator can run this.
  token-derby organisation webhook get <name>
                                          Show the org's configured webhook URL (or "no webhook").
  token-derby organisation webhook clear <name>
                                          Remove the webhook for this org.

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
  token-derby roll-demo                   Walk through every reveal type (no API).
                                          Useful for tweaking the reveal UX.

Environment:
  TOKEN_DERBY_API_BASE                    Override API base URL (default: production)
  TOKEN_DERBY_HOME                        Override identity/stable directory
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
  // `roll-demo` is a local UI tour — no API, no identity needed.
  if (cmd === 'roll-demo') return rollDemoCommand();

  // Every other command requires an identity. `init` and `update` are the only escape hatches.
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
    if (sub === 'create') return orgCreateCommand();
    if (sub === 'join')   return orgJoinCommand(argv[2]);
    if (sub === 'info')   return orgInfoCommand(argv[2]);
    if (sub === 'list')   return orgListCommand();
    if (sub === 'webhook') {
      const action = argv[2];
      if (action === 'set')   return orgWebhookSetCommand(argv[3], argv[4]);
      if (action === 'get')   return orgWebhookGetCommand(argv[3]);
      if (action === 'clear') return orgWebhookClearCommand(argv[3]);
      console.error(`Unknown webhook action: ${action ?? '(none)'}`);
      console.error('Try: organisation webhook set <name> <url> | organisation webhook get <name> | organisation webhook clear <name>');
      return 2;
    }
    console.error(`Unknown organisation subcommand: ${sub ?? '(none)'}`);
    console.error('Try: organisation create | organisation join <token> | organisation info <name> | organisation list | organisation webhook <set|get|clear> ...');
    return 2;
  }

  if (cmd === 'create') {
    const orgName = parseFlag(argv.slice(1), '--organisation');
    return createRaceCommand(orgName);
  }
  if (cmd === 'join')   return joinCommand(argv[1]);
  if (cmd === 'end')    return endCommand(argv[1]);
  if (cmd === 'roll')      return rollCommand();

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
