#!/usr/bin/env node

// import updateNotifier from "update-notifier";
import { URL } from 'url';
import commands from './index.js';
import config from './lib/config.js';
import dotenv from 'dotenv';
import envPaths from 'env-paths';
import fs from 'fs';
import { loadActions } from './actions/index.js'; // add new top level actions here
import meow from 'meow';
import path from 'path';
const __dirname = new URL('.', import.meta.url).pathname;

const pkgJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json')));
let personality = pkgJson.name || 'xrplf';
personality = personality.replace('-cli', '');

// load environment variables
const paths = envPaths(personality);
// 1. System-level config
const systemEnvPath = path.join(paths.config, '.env');
if (fs.existsSync(systemEnvPath)) {
  dotenv.config({ path: systemEnvPath });
}

// 2. Project-local .env
const localEnvPath = path.join(process.cwd(), '.env');
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath, override: true });
}

// squelch experimental warnings
const originalEmit = process.emit;
process.emit = function (name, data) {
  // , ...args
  if (
    name === `warning` &&
    typeof data === `object` &&
    data.name === `ExperimentalWarning`
    //if you want to only stop certain messages, test for the message here:
    //&& data.message.includes(`Fetch API`)
  ) {
    return false;
  }
  return originalEmit.apply(process, arguments);
};

export async function getHelpText(personality = 'xrpl-cli') {
  const actions = await loadActions();

  const commandList = Object.entries(actions)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, action]) => {
      const desc = action.description ? ` - ${action.description}` : '';
      return `    $ ${personality} ${name}${desc}`;
    })
    .join('\n');

  const defaultHelp = `
  ${personality}: additional commands

  $ ${personality} --help

  Usage
    $ ${personality} [input]

  Options
    --debug=[bool]  [Default: false]
    --help          [Default: false]
    --quiet         [Default: false]

  Commands
${commandList || '    (none found)'}

  Examples
    $ ${personality}

    Check Version
    $ ${personality} --version

    Run Commands
    $ ${personality} help
`;

  return defaultHelp;
}

const defaultHelp = await getHelpText(personality);

const cli = meow(defaultHelp, {
  importMeta: import.meta,
  flags: {
    // debug: {
    //   type: "boolean",
    //   default: false,
    // }
  },
});
if (cli.input.length === 0 || cli.input[0] === 'help') {
  process.stderr.write(`${defaultHelp}\n`);
  process.exit(0);
}

commands({
  action: cli.input[0],
  flags: cli.flags,
  input: cli.input,
  config,
  personality,
  version: pkgJson.version,
  bin: `${__dirname}cli.js`,
});

// updateNotifier({
//   pkg: pkgJson,
//   defer: true,
// }).notify();
