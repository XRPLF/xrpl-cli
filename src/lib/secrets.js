import { GoogleAuth } from 'google-auth-library';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import chalk from 'chalk';
import config from './config.js';
import keytar from 'keytar';
import prompts from 'prompts';
import { spawnSync } from 'child_process';

class SecretProvider {
  async get(service, key) {}
  async set(service, key, value) {}
  async delete(service, key) {}
  async list(service) {}
  async setup() {}
  type() {}
}

class KeytarProvider extends SecretProvider {
  async get(service, key) {
    return keytar.getPassword(service, key);
  }

  async set(service, key, value) {
    return keytar.setPassword(service, key, value);
  }

  async delete(service, key) {
    return keytar.deletePassword(service, key);
  }

  async list(service) {
    console.warn('Listing not supported for keytar');
    return [];
  }

  async setup() {
    return true;
  }

  type() {
    return 'local';
  }
}

class GCPSecretManagerProvider extends SecretProvider {
  constructor() {
    super();
    this.client = null; // new SecretManagerServiceClient();
    this.projectId = process.env.GCP_PROJECT_ID || config.get('gcp_project_id');
    if (!this.projectId) {
      console.log(chalk.blue(`GCP Secret Manager project ID: ${this.projectId || 'not set'}`));
    }
  }

  _secretPath(service, key) {
    return `projects/${this.projectId}/secrets/${service}_${key}`;
  }

  type() {
    return 'gcp';
  }

  async setup() {
    let client;

    const getAuthStatus = async () => {
      try {
        client = new SecretManagerServiceClient({
          projectId: this.projectId,
        });
        //   console.log('GCP Secret Manager client created', client);

        //   await client.getProjectId();
        const projectId = await client.getProjectId();
        // console.log('GCP Secret Manager project ID:', projectId);
        if (projectId) {
          try {
            const auth = new GoogleAuth({
              scopes: 'https://www.googleapis.com/auth/cloud-platform',
            });
            const client = await auth.getClient();
            const projectId = await auth.getProjectId();
            const url = `https://dns.googleapis.com/dns/v1/projects/${projectId}`;
            const res = await client.request({ url });
            //   console.log(res.data);
            //   console.log('GCP Secret Manager client authenticated with API key');
          } catch (e) {
            console.error(chalk.red('❌ GCP Secret Manager client not authenticated with API key'));
            console.error(e);

            return false;
          }
        } else {
          console.error(chalk.red('❌ GCP Secret Manager client not authenticated with API key'));
          console.error(e);
          return false;
        }

        this.client = client;
        return true;
      } catch (err) {
        if (err.message.includes('Unable to detect a Project Id in the current environment')) {
          console.error(
            chalk.red(
              '❌ GCP Secret Manager setup failed. Please set GCP_PROJECT_ID in your environment variables or config.'
            )
          );
          console.error(err);
          process.exit(1);
        } else {
          console.error(
            chalk.yellow('⚠️ GCP Secret Manager client not authenticated with API key')
          );
        }
        return false;
      }
    };

    const authStatus = await getAuthStatus();
    if (authStatus) {
      // console.log('GCP Secret Manager client authenticated');
      this.client = client;
      return true;
    } else {
      const { login } = await prompts({
        type: 'confirm',
        name: 'login',
        message: 'Would you like to log in to Google Cloud Platform now?',
        initial: true,
      });

      if (login) {
        try {
          console.log(chalk.white('🔐 Logging in to GCP...'));
          const result = spawnSync('gcloud', ['auth', 'application-default', 'login'], {
            stdio: 'inherit',
          });

          if (result.status === 0) {
            console.log('\n✅ GCP login successful');
            console.log('You can now run the command again.\n');
          } else {
            console.error('\n❌ GCP login failed.');
            process.exit(result.status ?? 1);
          }

          process.exit(0);
        } catch (e) {
          console.error('\n❌ GCP login failed. Please try running it manually:');
          console.error('   gcloud auth application-default login\n');
          process.exit(1);
        }
      } else {
        console.error(
          chalk.red('❌ GCP Secret Manager setup failed. Please run the command again.')
        );
        process.exit(1);
      }
    }
  }

  async get(service, key) {
    if (!this.projectId) {
      throw new Error(
        'GCP_PROJECT_ID is not set. Please set it in your config or environment variables.'
      );
    }

    let result;
    try {
      result = await this.client.accessSecretVersion({
        name: `${this._secretPath(service, key)}/versions/latest`,
      });
    } catch (e) {
      if (e.code === 2) {
        if (e.message.includes('status code 400')) {
          throw new Error('GCP Auth failed. Please check your credentials and permissions.');
        }
      } else if (e.code === 5) {
        return null; // secret not found
      } else {
        throw e;
      }
    }
    const [version] = result;
    return version.payload?.data?.toString('utf8') ?? null;
  }

  async set(service, key, value) {
    if (!this.projectId) {
      throw new Error(
        'GCP_PROJECT_ID is not set. Please set it in your config or environment variables.'
      );
    }

    const secretId = `${service}_${key}`;
    try {
      await this.client.createSecret({
        parent: `projects/${this.projectId}`,
        secretId,
        secret: { replication: { automatic: {} } },
      });
    } catch (e) {
      if (!e.message.includes('ALREADY_EXISTS')) throw e;
    }

    await this.client.addSecretVersion({
      parent: this._secretPath(service, key),
      payload: { data: Buffer.from(value, 'utf8') },
    });
  }

  async delete(service, key) {
    if (!this.projectId) {
      throw new Error(
        'GCP_PROJECT_ID is not set. Please set it in your config or environment variables.'
      );
    }

    await this.client.deleteSecret({ name: this._secretPath(service, key) });
  }

  async list(service) {
    console.warn('Listing not yet implemented for GCP');
    return [];
  }
}

export async function getSecretProvider() {
  const backend = process.env.XRPL_CLI_SECRET_BACKEND || config.get('secret_backend') || 'local';
  if (backend === 'gcp') {
    const secrets = new GCPSecretManagerProvider();
    await secrets.setup();
    return secrets;
  } else {
    return new KeytarProvider();
  }
}
