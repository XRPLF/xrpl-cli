import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import config from './config.js';
import keytar from 'keytar';

class SecretProvider {
  async get(service, key) {}
  async set(service, key, value) {}
  async delete(service, key) {}
  async list(service) {}
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

  type() {
    return 'local';
  }
}

class GCPSecretManagerProvider extends SecretProvider {
  constructor() {
    super();
    this.client = new SecretManagerServiceClient();
    this.projectId = process.env.GCP_PROJECT_ID;
  }

  _secretPath(service, key) {
    return `projects/${this.projectId}/secrets/${service}_${key}`;
  }

  type() {
    return 'gcp';
  }

  async get(service, key) {
    const [version] = await this.client.accessSecretVersion({
      name: `${this._secretPath(service, key)}/versions/latest`,
    });
    return version.payload?.data?.toString('utf8') ?? null;
  }

  async set(service, key, value) {
    const secretId = `${service}_${key}`;
    try {
      await this.client.createSecret({
        parent: `projects/${this.projectId}`,
        secretId,
        secret: { replication: { automatic: {} } },
      });
    } catch (e) {
      if (!e.message.includes('Already exists')) throw e;
    }

    await this.client.addSecretVersion({
      parent: this._secretPath(service, key),
      payload: { data: Buffer.from(value, 'utf8') },
    });
  }

  async delete(service, key) {
    await this.client.deleteSecret({ name: this._secretPath(service, key) });
  }

  async list(service) {
    console.warn('Listing not yet implemented for GCP');
    return [];
  }
}

export function getSecretProvider() {
  const backend = config.get('secret_backend') || process.env.XRPL_CLI_SECRET_BACKEND || 'local';
  if (backend === 'gcp') {
    return new GCPSecretManagerProvider();
  } else {
    return new KeytarProvider();
  }
}
