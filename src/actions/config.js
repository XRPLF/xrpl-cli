import chalk from "chalk";
import { config } from "dotenv";
import envPaths from "env-paths";
import fs from "fs/promises";
import path from "path";

const CONFIG_FILENAME = ".env";

export const description = "Manage global config (set, get, list)";

export const exec = async (context) => {
  //   console.log({ context });
  const [cmd, subcommand, key = "", ...rest] = context.input;
  const value = rest.join(" ");
  if (context.flags.debug) {
    console.log(
      chalk.blue(
        `Running config command: ${subcommand} ${key} ${value} ${context.personality}`
      )
    );
  }

  const paths = envPaths(context.personality);
  const configPath = path.join(paths.config, CONFIG_FILENAME);

  // Ensure the config dir exists
  await fs.mkdir(paths.config, { recursive: true });

  let contents = "";
  try {
    contents = await fs.readFile(configPath, "utf8");
  } catch {
    // no file yet, that's fine
  }

  const lines = contents.split("\n").filter(Boolean);
  const entries = Object.fromEntries(
    lines.map((line) => {
      const [k, ...vParts] = line.split("=");
      return [k, vParts.join("=")];
    })
  );

  if (context.flags.debug) {
    console.log(chalk.blue(subcommand, key, value));
  }
  switch (subcommand) {
    case "set": {
      if (!key || !value) {
        console.error(`Usage: ${context.personality} config set KEY VALUE`);
        process.exit(1);
      }
      entries[key] = value;
      const updated = Object.entries(entries)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n");
      await fs.writeFile(configPath, updated + "\n");
      console.log(chalk.green(`✅ Set ${key} in global config`));
      break;
    }

    case "get": {
      if (!key) {
        console.error(`Usage: ${context.personality}} config get KEY`);
        process.exit(1);
      }
      if (entries[key]) {
        console.log(entries[key]);
      } else {
        console.warn(chalk.yellow(`No value set for ${key}`));
      }
      break;
    }

    case "list": {
      console.log(chalk.blue("Global config:"));
      for (const [k, v] of Object.entries(entries)) {
        console.log(`${k}=${v}`);
      }
      break;
    }

    case "delete": {
      if (!key) {
        console.error(`Usage: ${context.personality} config delete KEY`);
        process.exit(1);
      }
      if (entries[key]) {
        delete entries[key];
        const updated = Object.entries(entries)
          .map(([k, v]) => `${k}=${v}`)
          .join("\n");
        await fs.writeFile(configPath, updated + "\n");
        console.log(chalk.green(`✅ Deleted ${key} from global config`));
      } else {
        console.warn(chalk.yellow(`No value set for ${key}`));
      }
      break;
    }

    default: {
      console.error("Usage:");
      console.error(`  ${context.personality} config set KEY VALUE`);
      console.error(`  ${context.personality} config get KEY`);
      console.error(`  ${context.personality} config list`);
      console.error(`  ${context.personality} config delete KEY`);
      process.exit(1);
    }
  }
};
