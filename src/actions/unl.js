import { createVL, generateKeyPair } from '../lib/unl.js';

import { Client as XrplClient } from 'xrpl';
import chalk from 'chalk';
import colorize from 'json-colorizer';
import fsPromises from 'fs/promises';
import { getSecretProvider } from '../lib/secrets.js';
import { gzipFile } from '../lib/compress.js';
import prompts from 'prompts';
import { waitFor } from '../lib/wait.js';
import windowSize from 'window-size';
import yaml from 'yaml';

const log = console.log;

const colorJson = (obj) => {
  return colorize(obj, { pretty: true });
};

async function loadYamlFile(path) {
  // see if path is a url or a file
  if (path.startsWith('http://') || path.startsWith('https://')) {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to fetch YAML from ${path}: ${response.statusText}`);
    }
    const text = await response.text();
    return yaml.parse(text);
  }
  // otherwise, assume it's a file path
  const file = await fsPromises.readFile(path, 'utf8');
  return yaml.parse(file);
}

export const description = `Create and manage UNL (Unique Node List) for XRPL validators.`;

const exec = async (context) => {
  let subcommand = context.input[1];

  const secrets = await getSecretProvider();

  const { width } = windowSize.get();
  const line = '-'.repeat(width - 10);

  if (!subcommand) {
    const result = await prompts({
      type: 'select',
      name: 'value',
      message: 'Task ?',
      choices: [
        { title: 'Quit', value: 'quit', selected: true },
        { title: 'Initialize Keys', value: 'init', selected: false },
        { title: 'Generate UNL', value: 'generate', selected: false },
        { title: 'Help', value: 'help', selected: false },
      ],
      // hint: "- Space to select. Return to submit",
    });

    if (result.value === 'quit') {
      process.exit(0);
    }
    subcommand = result.value;
  }

  try {
    switch (subcommand) {
      case 'help': {
        log('Usage: [command]');
        log('');
        log('commands: { help, init, generate }');
        log('');
        log('init: Initialize validator keys');
        log('generate: Generate a UNL from a list of validators');
        log('help: Show this help message');
        log('quit: Quit the program');
        log('');
        log('Examples:');
        log('  unl init');
        log('  unl generate --validators="validators.yaml"');
        log('  unl generate validators.yaml --output="../unl.json" --nocompress');
        log('');

        break;
      }
      case 'init': {
        // see if we have validator keys in our config
        let validatorKeys;
        try {
          // xrplf secrets get --service=unl validator_keys
          const getUnlValidatorKeysPromise = secrets.get('unl', 'validator_keys'); // json
          const rawValidatorKeys = await waitFor(getUnlValidatorKeysPromise, {
            text: `Looking for validator keys...`,
          });
          if (rawValidatorKeys) {
            // parse the toml file
            validatorKeys = JSON.parse(rawValidatorKeys);
          }
        } catch (err) {
          // no keys found
          log(chalk.red(`❌ No validator keys found ${err.message}`));
        }
        if (validatorKeys) {
          // log the keys
          log('✅ Validator keys found');
          log(colorJson(validatorKeys));
        } else {
          // generate a new keypair
          // wait a random amount of time
          let waitPromise = new Promise((resolve) => {
            setTimeout(() => {
              resolve('done');
            }, Math.floor(Math.random() * 500) + 500);
          });
          // draw a line
          log(chalk.blue(line));
          await waitFor(waitPromise, {
            text: `Generating new keypair...`,
          });
          log(chalk.blue(line));

          const newKeypairPromise = new Promise(async (resolve) => {
            const kp = {};
            kp.ts = new Date().toISOString();
            kp.vk = generateKeyPair(); // NB: is sync. VK = "validator key"

            // wait a random amount of time
            const waitPromise = new Promise((resolve) => {
              setTimeout(() => {
                resolve('done');
              }, Math.floor(Math.random() * 500) + 500);
            });
            await waitPromise;

            // generate the signing keypair
            kp.sk = generateKeyPair(); // SK = "signing key"

            resolve(kp);
          });
          validatorKeys = await waitFor(newKeypairPromise, {
            text: `Calculating...`,
          });

          // save the keys to the config
          // config.set('validator_keys', keys);
          log('✅ Validator keys generated');
          log(colorJson(validatorKeys));

          // draw a line
          log(chalk.blue(line));

          const result = await prompts({
            type: 'select',
            name: 'value',
            message: 'Save Validator Keys ?',
            choices: [
              { title: 'Quit', value: 'quit', selected: true },
              // { title: 'that', value: 'that', selected: false },
              { title: 'Save', value: 'save' },
            ],
            // hint: "- Space to select. Return to submit",
          });

          if (result.value === 'quit') {
            process.exit(0);
          }
          if (result.value === 'save') {
            // save the keys to the config
            const setUnlValidatorKeysPromise = secrets.set(
              'unl',
              'validator_keys',
              JSON.stringify(validatorKeys)
            );
            const rawValidatorKeys = await waitFor(setUnlValidatorKeysPromise, {
              text: `Saving validator keys to secret store...`,
            });
            if (rawValidatorKeys) {
              log(chalk.green(`✅ Validator keys saved`));
            } else {
              log(chalk.red(`❌ Error saving validator keys`));
            }
          }
        }

        // const resp = {
        //   date: new Date().toISOString(),
        // };
        // console.log(`this`, colorJson(resp));
        break;
      }
      case 'generate': {
        // see if we have validator keys in our config
        let validatorKeys;
        try {
          // xrplf secrets get --service=unl validator_keys
          const getUnlValidatorKeysPromise = secrets.get('unl', 'validator_keys'); // json
          const rawValidatorKeys = await waitFor(getUnlValidatorKeysPromise, {
            text: `Looking for validator keys...`,
          });
          if (rawValidatorKeys) {
            // parse the toml file
            validatorKeys = JSON.parse(rawValidatorKeys);
          }
        } catch (err) {
          // no keys found
          log(chalk.red(`❌ No validator keys found ${err.message}`));
        }
        if (validatorKeys) {
          // log the keys
          log('✅ Validator keys found');
          log(colorJson(validatorKeys));
        } else {
          log(chalk.red(`❌ No validator keys found`));
          process.exit(1);
        }

        // the path to the file to sign should be passed as an argument
        const validatorsFile = context.input[2] || context.flags.validators;
        if (!validatorsFile) {
          log(chalk.red(`❌ No validators file to sign`));
          process.exit(1);
        }

        // read in the file as yaml
        const yamlPromise = loadYamlFile(validatorsFile);

        const nodeConfig = await waitFor(yamlPromise, {
          text: `Loading validators file...`,
        });

        console.log(nodeConfig.nodes);
        if (!nodeConfig.nodes) {
          log(chalk.red(`❌ No nodes found in file`));
          process.exit(1);
        }

        const client = new XrplClient('wss://s2.ripple.com');
        await client.connect();

        try {
          const vk = {
            privateKey: validatorKeys.vk.secret_key,
            publicKey: validatorKeys.vk.nodePublicKeyHex,
          };

          const sk = {
            privateKey: validatorKeys.sk.secret_key,
            publicKey: validatorKeys.sk.nodePublicKeyHex,
          };

          // Load the validators list from file
          // nodes = [{id,name}] => [id]
          const validators = nodeConfig.nodes.map((node) => {
            return node.id;
          });
          console.log('Validators:', validators);
          const sequence = 1;
          const expiration = 1756598400;

          // Create the UNL
          const createUnlPromise = createVL(
            vk, // masterKey
            sk, //  ephemeralKey
            sequence,
            expiration,
            validators,
            client
          );

          const vl = await waitFor(createUnlPromise, {
            text: `Creating the UNL...`,
          });
          if (!vl) {
            log(chalk.red(`❌ Error creating the UNL`));
            process.exit(1);
          }
          console.log('UNL:', colorJson(vl));

          // if we have flags.output, save the output to a file
          let outputFile = context.flags.output || context.input[3];

          if (!outputFile) {
            // ask the user for a file name
            const result = await prompts({
              type: 'text',
              name: 'value',
              message: 'Output file ?',
              initial: 'unl.json',
            });
            outputFile = result.value;
          }
          if (outputFile) {
            const savePromise = fsPromises.writeFile(outputFile, JSON.stringify(vl), 'utf8');
            await waitFor(savePromise, {
              text: `Saving the UNL to ${outputFile}...`,
            });
            log(chalk.green(`✅ UNL saved to ${outputFile}`));
          }

          // if we dont have flags.nocompress, compress the output file
          if (!context.flags.nocompress) {
            const compressPromise = gzipFile(outputFile, `${outputFile}.gz`);
            await waitFor(compressPromise, {
              text: `Compressing the UNL file in the same directory...`,
            });
            log(chalk.green(`✅ UNL file compressed`));
          }

          await client.disconnect();
        } catch (error) {
          console.error('Error:', error);
        }

        break;
      }
      case 'quit': {
        break;
      }
      default: {
        if (context.input[1] && context.input[1] !== 'help') {
          log(chalk.red(`Unknown command: ${context.input[1]}`));
        }
        log('');
        log('Usage: [command]');
        log('');
        log('commands: { help }');

        break;
      }
    }
  } catch (err) {
    console.log(err);
  }
};

export { exec };
