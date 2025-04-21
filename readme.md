## XRPLF CLI

This CLI tool provides a common interface for interacting with XRPL-related repositories and tools.

## Install

```bash
pnpm link --global
```

## Usage

```bash
xrplf help
```

## Commands

You can add new commands by creating a new file in the `src/actions` directory. There are two ways to add a command: 1) as a javascript file or 2) as a shell script. The CLI will automatically detect and load the command, preferring the javascript file if both are present.

If the command is a javascript file, it should export an exec function:

```
import chalk from "chalk";
import getStdin from "get-stdin";

const log = console.log;

export const exec = async (context) => {
  const input = await getStdin();

  // context contains the flags and input

  if (!context.flags.quiet) {
    log(`via: ${context.personality}\n`);
    log(
      chalk.white(
        JSON.stringify(
          { ...context, stdin: input, env: { ...process.env } },
          null,
          2
        )
      )
    );
  }
};

export const description = "hello world example in javascript";
```

## List Commands

You can list all commands by running:

```bash
xrpl
```

## Config

You can set config options with:

```bash
xrplf config set <key> <value>
```

You can get config options with:

```bash
xrplf config get <key>
```

You can list all config options with:

```bash
xrplf config list
```

## Secrets

You can interface with a secret manager using the `xrplf secrets` command. Currently supported secret managers are:

- `local` - Local secret manager (OS keychain)
- `gcp` - Google Cloud Secret Manager

You can set a secret with:

```bash
xrplf secrets set --service="$optionalKeyPrefix" <key> <value>
```

You can read a secret with:

```bash
xrplf secrets get --service="$optionalKeyPrefix" <key>
```

You can set the default secret manager with:

```bash
xrplf secrets provider <provider:local|gcp>
```
