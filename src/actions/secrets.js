import chalk from 'chalk';
import config from '../lib/config.js';
import { getSecretProvider } from '../lib/secrets.js';

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
      if (!key || !value) {
        console.error(`Usage: ${context.personality} secret set KEY VALUE`);
        process.exit(1);
      }
      await provider.set(service, key, value);
      console.log(chalk.green(`✅ Secret ${key} set via ${backend}`));
      break;
    }

    case 'get': {
      if (!key) {
        console.error(`Usage: ${context.personality} secret get KEY`);
        process.exit(1);
      }
      const result = await provider.get(service, key);
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
