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

If you use GCP Secret Manager, you will be prompted to authenticate with your Google account. You can also set the `GOOGLE_APPLICATION_CREDENTIALS` environment variable to point to a service account key file.

## Unique Node List (UNL)

You can also create a signed UNL using the `xrplf unl` command. This command will create a signed UNL file from keys that are stored in your secret manager.

```bash
 xrplf unl generate  --validators="../unl/data/unl-raw.yaml" --output="/tmp/unl.json"
```

This will create a signed UNL file in the specified output directory. The `--validators` flag is required and should point to the raw YAML file containing the list of validators. The `--output` flag is optional and defaults to `./unl.json`.

Example (truncated) YAML file:

```yaml
nodes:
  - id: nHBgyVGAEhgU6GoEqoriKmkNBjzhy6WJhX9Z7cZ71yJbv28dzvVN
    name: v2.xrpl-commons.org
  - id: nHU4bLE3EmSqNwfL4AP1UZeTNPrSPPP6FXLKXo2uqfHuvBQxDVKd
    name: ripple.com
```
