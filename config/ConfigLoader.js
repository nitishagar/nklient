const Ajv = require('ajv');
const ajvFormats = require('ajv-formats');
const fs = require('fs');
// const path = require('path');

const schema = require('./client-config.schema.json');

class ConfigLoader {
  constructor() {
    this.ajv = new Ajv({ useDefaults: true, coerceTypes: true });
    ajvFormats(this.ajv);
    this.validate = this.ajv.compile(schema);
  }

  loadConfig(config) {
    const valid = this.validate(config);
    if (!valid) {
      const errors = this.validate.errors.map(err => {
        return `${err.instancePath || 'root'}: ${err.message}`;
      }).join(', ');
      throw new Error(`Invalid configuration: ${errors}`);
    }

    // Apply defaults from schema
    const defaultConfig = this.getDefaultConfig();
    return this.mergeConfigs(defaultConfig, config);
  }

  getDefaultConfig() {
    return {
      baseUrl: '',
      defaultHeaders: {},
      timeout: 30000,
      maxRedirects: 5,
      retry: {
        attempts: 3,
        delay: 1000,
        maxDelay: 30000,
        retryOnStatusCodes: [408, 429, 500, 502, 503, 504],
        backoffMultiplier: 2
      },
      keepAlive: true,
      cookies: false,
      followRedirects: true,
      decompress: true
    };
  }

  mergeConfigs(defaults, userConfig) {
    const merged = { ...defaults };

    for (const key in userConfig) {
      if (Object.prototype.hasOwnProperty.call(userConfig, key)) {
        if (typeof userConfig[key] === 'object' && !Array.isArray(userConfig[key]) && userConfig[key] !== null) {
          merged[key] = { ...defaults[key], ...userConfig[key] };
        } else {
          merged[key] = userConfig[key];
        }
      }
    }

    return merged;
  }

  loadFromFile(filePath) {
    try {
      const configContent = fs.readFileSync(filePath, 'utf8');
      const config = JSON.parse(configContent);
      return this.loadConfig(config);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Configuration file not found: ${filePath}`);
      } else if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in configuration file: ${error.message}`);
      }
      throw error;
    }
  }
}

module.exports = ConfigLoader;
