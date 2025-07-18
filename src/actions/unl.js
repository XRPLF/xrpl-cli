import { createVL, generateKeyPair } from '../lib/unl.js';

import { Storage } from '@google-cloud/storage';
import { Client as XrplClient } from 'xrpl';
import chalk from 'chalk';
import colorize from 'json-colorizer';
import fsPromises from 'fs/promises';
import { getSecretProvider } from '../lib/secrets.js';
import { gzipFile } from '../lib/compress.js';
import prompts from 'prompts';
import { waitFor } from '../lib/wait.js';
import yaml from 'yaml';

const storage = new Storage();

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

  const width = process.stdout?.columns || 80;
  const line = '-'.repeat(Math.max(10, width - 10));
  log(chalk.blue(line));

  if (!subcommand) {
    const result = await prompts({
      type: 'select',
      name: 'value',
      message: 'Task ?',
      choices: [
        { title: 'Quit', value: 'quit', selected: true },
        { title: 'Initialize Keys', value: 'init', selected: false },
        { title: 'Generate UNL', value: 'generate', selected: false },
        { title: 'Upload UNL', value: 'upload', selected: false },
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
        log('upload: Upload the UNL to a bucket');
        log('help: Show this help message');
        log('quit: Quit the program');
        log('');
        log('Examples:');
        log('  unl init');
        log('  unl generate --validators="validators.yaml"');
        log('  unl generate validators.yaml --output="../unl.json" --compress');
        log('');

        break;
      }
      case 'init': {
        // see if we have validator keys in our config
        let validatorKeys;
        try {
          // xrplf secrets get --service=unl validator_keys

          // see if we should check the environment variable first
          if (context.flags.use_env) {
            const envKeys = process.env.UNL_VALIDATOR_KEYS;
            if (envKeys) {
              log('✅ Validator keys found in environment variable');
              // parse the toml file
              validatorKeys = JSON.parse(envKeys);
              // log(colorJson(validatorKeys)); // do not print, sensitive information
              break;
            } else {
              log(chalk.red(`❌ No validator keys found in environment variable`));
              process.exit(1);
            }
          }

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
          // log(colorJson(validatorKeys)); // do not print, sensitive information
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
          log(chalk.red(`❌ Error parsing validator keys`));
        }
        if (validatorKeys) {
          // log the keys
          log('✅ Validator keys found in secret store');
          // log(colorJson(validatorKeys));
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
          // const expiration = 1756598400;

          // ask for the expiration date, default to 180 days from now
          let expiration = context.flags.expiration;

          if (!expiration) {
            const result = await prompts({
              type: 'text',
              name: 'exp',
              message: 'Expiration date ?',
              initial: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
            });
            if (!result.exp) {
              log(chalk.red(`❌ No expiration date provided`));
              process.exit(1);
            }
            expiration = Math.floor(new Date(result.exp).getTime() / 1000); // convert to unix timestamp
          } else {
            expiration = Math.floor(new Date(expiration).getTime() / 1000); // convert to unix timestamp
          }
          if (isNaN(expiration) || expiration <= 0) {
            log(chalk.red(`❌ Invalid expiration date`));
            process.exit(1);
          }
          log('Expiration:', new Date(expiration * 1000).toISOString());
          log(chalk.blue(line));

          if (!context.flags.quiet) {
            // ask for confirmation
            const confirmResult = await prompts({
              type: 'confirm',
              name: 'value',
              message: `Are you sure you want to create a UNL with ${
                validators.length
              } validators? Expiration: ${new Date(expiration * 1000).toISOString()}`,
              initial: true,
            });
            if (!confirmResult.value) {
              log(chalk.red(`❌ UNL creation cancelled`));
              process.exit(0);
            }
          }

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
          let outputFile = context.flags.output;

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

          // if we have flags.compress, compress the output file
          if (context.flags.compress) {
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
      case 'upload': {
        // we will upload the UNL to a bucket, creating it if it doesn't exist
        const bucketName = context.flags.bucket || context.input[2] || 'xrplf-unl';
        if (!bucketName) {
          log(chalk.red(`❌ No bucket name provided`));
          process.exit(1);
        }

        // get the file to upload
        let fileToUpload = context.flags.file || context.input[3];
        if (!fileToUpload) {
          // ask the user for a file name
          const result = await prompts({
            type: 'text',
            name: 'value',
            message: 'File to upload ?',
            initial: 'unl.json',
          });
          fileToUpload = result.value;
        }

        if (!fileToUpload) {
          log(chalk.red(`❌ No file to upload`));
          process.exit(1);
        }

        // check if the file exists
        try {
          await fsPromises.access(fileToUpload);
        } catch (error) {
          log(chalk.red(`❌ File not found: ${fileToUpload}`));
          process.exit(1);
        }

        // see if the bucket exists
        const bucket = storage.bucket(bucketName);

        const existsPromise = bucket.exists();
        const [exists] = await waitFor(existsPromise, {
          text: `Checking if bucket ${bucketName} exists...`,
        });

        if (!exists) {
          // create the bucket in europe
          const createBucketPromise = storage.createBucket(bucketName, {
            location: 'EU',
            storageClass: 'STANDARD',
            predefinedAcl: 'publicRead',
          });
          await waitFor(createBucketPromise, {
            text: `Creating bucket ${bucketName}...`,
          });
          log(chalk.green(`✅ Bucket ${bucketName} created.`));
        } else {
          log(chalk.green(`Bucket ${bucketName} already exists.`));
        }

        const [policy] = await bucket.iam.getPolicy();

        policy.bindings.push({
          role: 'roles/storage.objectViewer',
          members: ['allUsers'],
        });

        await waitFor(bucket.iam.setPolicy(policy), {
          text: `Granting public read access via IAM to bucket ${bucketName}...`,
        });

        log(chalk.green(`✅ Public read access granted via IAM`));

        // check if the file exists in the bucket
        const [files] = await bucket.getFiles({ prefix: fileToUpload });
        if (files.length > 0) {
          log(chalk.yellow(`⚠️  File ${fileToUpload} already exists in bucket ${bucketName}.`));
          if (!context.flags.quiet) {
            const result = await prompts({
              type: 'confirm',
              name: 'value',
              message: `Do you want to overwrite it?`,
              initial: false,
            });
            if (!result.value) {
              log(chalk.red(`❌ File not uploaded. Exiting.`));
              process.exit(0);
            }
          }
          log(chalk.blue(`Overwriting file ${fileToUpload} in bucket ${bucketName}.`));
        } else {
          log(chalk.blue(`File ${fileToUpload} does not exist in bucket ${bucketName}.`));
        }

        const uploadPromise = bucket.upload(fileToUpload, {
          destination: fileToUpload,
          gzip: true, // compress the file
          metadata: {
            cacheControl: 'public, max-age=30, stale-while-revalidate=86400, stale-if-error=604800',
            contentType: 'application/json', // set the content type
          },
        });

        await waitFor(uploadPromise, {
          text: `Uploading ${fileToUpload} to bucket ${bucketName}...`,
        });

        log(chalk.green(`✅ File uploaded to bucket ${bucketName}`));
        log(
          `You can access the file at: https://storage.googleapis.com/${bucketName}/${fileToUpload}`
        );

        // if (false) {
        //   // always set the default file for unl
        //   // set the default file by uploading index.html as the same file
        //   const defaultFileUploadPromise = bucket.upload(fileToUpload, {
        //     destination: 'index.html',
        //     gzip: true, // compress the file
        //     metadata: {
        //       cacheControl:
        //         'public, max-age=30, stale-while-revalidate=86400, stale-if-error=604800',
        //       contentType: 'application/json',
        //     },
        //   });
        //   await waitFor(defaultFileUploadPromise, {
        //     text: `Setting ${fileToUpload} as the default file...`,
        //   });
        //   log(chalk.green(`✅ Default file set to ${fileToUpload}`));
        // }
        // else {
        //   log(chalk.blue(`Default file not set.`));
        // }

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
