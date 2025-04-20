import chalk from 'chalk';
import config from '../lib/config.js';
import { getSecretProvider } from '../lib/secrets.js';

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
      console.error(`  ${context.personality} secret delete KEY`);
      process.exit(1);
    }
  }
};
