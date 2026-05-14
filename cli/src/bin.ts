import { stableCreateCommand } from './commands/stable-create.js';
import { stableListCommand } from './commands/stable-list.js';
import { stableDeleteCommand } from './commands/stable-delete.js';
import { stableEditCommand } from './commands/stable-edit.js';
import { createRaceCommand } from './commands/create.js';
import { joinCommand } from './commands/join.js';
import { endCommand } from './commands/end.js';
import { initCommand } from './commands/init.js';
import { rollCommand } from './commands/roll.js';
import { CLI_VERSION } from './version.js';
import { loadIdentity } from './identity/identity.js';

const HELP = `token-derby v${CLI_VERSION}

Identity:
  token-derby init                        Set up your jockey identity (run this first)

Stable management:
  token-derby stable create               Make a new horse (interactive)
  token-derby stable list                 Show your saved horses
  token-derby stable edit <name>          Edit an existing horse's colors
  token-derby stable delete <name>        Remove a horse from your stable

Races:
  token-derby create                      Create a new race (interactive)
  token-derby join <join-code>            Join (or resume) a race
  token-derby end <admin-code>            End a race early
  token-derby roll <join-code>            Roll a hat with a loot token

Environment:
  TOKEN_DERBY_API_BASE                    Override API base URL (default: production)
  TOKEN_DERBY_HOME                        Override identity/stable directory
`;

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (!cmd || cmd === '--help' || cmd === '-h') { console.log(HELP); return 0; }
  if (cmd === '--version' || cmd === '-v') { console.log(CLI_VERSION); return 0; }

  if (cmd === 'init') return initCommand();

  // Every other command requires an identity. `init` is the only escape hatch.
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

  if (cmd === 'create') return createRaceCommand();
  if (cmd === 'join')   return joinCommand(argv[1]);
  if (cmd === 'end')    return endCommand(argv[1]);
  if (cmd === 'roll')   return rollCommand(argv[1]);

  console.error(`Unknown command: ${cmd}`);
  console.error(HELP);
  return 2;
}

main().then(
  code => process.exit(code),
  err => {
    console.error(err?.stack ?? err);
    process.exit(1);
  },
);
