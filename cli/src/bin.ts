import { stableCreateCommand } from './commands/stable-create.js';
import { stableListCommand } from './commands/stable-list.js';
import { stableDeleteCommand } from './commands/stable-delete.js';
import { createRaceCommand } from './commands/create.js';
import { joinCommand } from './commands/join.js';
import { rejoinCommand } from './commands/rejoin.js';
import { endCommand } from './commands/end.js';

const VERSION = '0.1.0';

const HELP = `token-derby v${VERSION}

Stable management:
  token-derby stable create               Make a new horse (interactive)
  token-derby stable list                 Show your saved horses
  token-derby stable delete <name>        Remove a horse from your stable

Races:
  token-derby create                      Create a new race (interactive)
  token-derby join <join-code>            Pick a horse and join a race
  token-derby rejoin <join-code>          Resume a race after a disconnect
  token-derby end <admin-code>            End a race early

Environment:
  TOKEN_DERBY_API_BASE                    Override API base URL (default: production)
`;

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (!cmd || cmd === '--help' || cmd === '-h') { console.log(HELP); return 0; }
  if (cmd === '--version' || cmd === '-v') { console.log(VERSION); return 0; }

  if (cmd === 'stable') {
    const sub = argv[1];
    if (sub === 'create') return stableCreateCommand();
    if (sub === 'list') return stableListCommand();
    if (sub === 'delete') return stableDeleteCommand(argv[2]);
    console.error(`Unknown stable subcommand: ${sub ?? '(none)'}`);
    console.error('Try: stable create | stable list | stable delete <name>');
    return 2;
  }

  if (cmd === 'create') return createRaceCommand();
  if (cmd === 'join')   return joinCommand(argv[1]);
  if (cmd === 'rejoin') return rejoinCommand(argv[1]);
  if (cmd === 'end')    return endCommand(argv[1]);

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
