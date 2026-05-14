# Token Derby CLI

Run a horse in a Token Derby race. Each token your Claude Code generates moves your horse forward; the terminal is your horse's life support — close it and you crash.

## Install

```bash
npm i -g @mauricode/token-derby
```

Requires Node 20+.

## Usage

```bash
# 1. Make a horse (pixel-art picker)
token-derby stable create

# 2. Show your stable
token-derby stable list

# 2a. Tweak an existing horse's colors
token-derby stable edit <name>

# 3. Create a race
token-derby create

# 4. Join a race (uses the join code printed by `create`)
token-derby join <join-code>

# 5. If you crash, resume:
token-derby rejoin <join-code>

# 6. End a race early (admin only)
token-derby end <admin-code>
```

## What's tracked

The CLI sums `message.usage.output_tokens` across every `*.jsonl` under `~/.claude/projects/`. Your "race tokens" are everything generated since the moment you joined. Tokens generated while disconnected are skipped — that window is your crash penalty.

## Files

- `~/.token-derby/stable.json` — saved horses
- `~/.token-derby/active-races/<join-code>.json` — per-race state for rejoin

## Environment

- `TOKEN_DERBY_API_BASE` — override the API base URL (default: `https://token-derby.mauricode.co.uk/api`)
- `TOKEN_DERBY_HOME` — override the data directory (default: `~/.token-derby`)
- `TOKEN_DERBY_CLAUDE_DIR` — override the transcripts directory (default: `~/.claude/projects`)
