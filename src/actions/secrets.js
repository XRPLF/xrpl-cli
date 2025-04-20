import chalk from 'chalk';
import config from '../lib/config.js';
import { getSecretProvider } from '../lib/secrets.js';
import getStdin from 'get-stdin';
import prompts from 'prompts';

export const description = 'Manage global secret config (set, get, list, delete)';

export const exec = async (context) => {
  const [cmd, subcommand, key = '', ...rest] = context.input;
  const value = rest.join(' ');

  const service = config.get('personality') || context.personality || 'default';

  if (context.flags.debug) {
    console.log(
      chalk.blue(`Running secret command: ${subcommand} ${key} ${value} ${context.personality}`)
    );
  }

  const provider = getSecretProvider();

  switch (subcommand) {
    case 'provider': {
      if (!key) {
        console.log(provider.type());
        process.exit(1);
      }
      // set the provider
      switch (key) {
        case 'gcp': {
          config.set('secret_backend', 'gcp');
          break;
        }
        case 'local': {
          config.set('secret_backend', 'local');
          break;
        }
        default: {
          console.error(`Unknown provider: ${key}\n\nAvailable providers: gcp, local`);
          process.exit(1);
        }
      }

      const newSecrets = getSecretProvider();

      console.log(`${newSecrets.type()}`);
      break;
    }
    case 'set': {
      if (!key) {
        console.error('❌ Missing key');
        process.exit(1);
      }
      let value;

      // see if stdin is available
      const input = await getStdin();
      if (input) {
        value = input;
        // trim off the trailing newline
        value = value.trim();
      } else {
        const userInput = await prompts({
          type: 'text',
          name: 'value',
          message: `Enter value for secret ${key}`,
        });
        value = userInput.value;
      }

      if (!value) {
        console.error('❌ No value entered, aborting.');
        process.exit(1);
      }

      await provider.set(service, key, value);
      console.log(chalk.green(`✅ Secret ${key} set`));
      break;
    }

    case 'get': {
      if (!key) {
        console.error(`Usage: ${context.personality} secret get KEY`);
        process.exit(1);
      }
      let result;
      try {
        result = await provider.get(service, key);
      } catch (err) {
        console.error(chalk.red(`Error getting secret: ${err.message}`));
        process.exit(1);
      }
      if (result) {
        console.log(result);
      } else console.warn(chalk.yellow(`No secret set for ${key}`));
      break;
    }

    case 'delete': {
      if (!key) {
        console.error(`Usage: ${context.personality} secret delete KEY`);
        process.exit(1);
      }
      await provider.delete(service, key);
      console.log(chalk.green(`✅ Deleted ${key} from secret storage`));
      break;
    }

    case 'list': {
      const list = await provider.list(service);
      console.log(list);
      break;
    }

    default: {
      console.error('Usage:');
      console.error(`  ${context.personality} secret set KEY VALUE`);
      console.error(`  ${context.personality} secret get KEY`);
      console.error(`  ${context.personality} secret list`);
      console.error(`  ${context.personality} secret delete KEY\n`);

      console.error(`  ${context.personality} secret provider [gcp|local]`);

      console.error('\nCurrent Provider:');
      console.error(`  provider: ${provider.type()}`);
      process.exit(1);
    }
  }
};
