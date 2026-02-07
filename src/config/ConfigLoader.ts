import Ajv, { ValidateFunction } from 'ajv';
import ajvFormats from 'ajv-formats';
import * as fs from 'fs';
import { ClientConfig } from '../types';

const schema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://github.com/nitishagar/nklient/config/client-config.schema.json",
  "title": "nklient Configuration Schema",
  "description": "Configuration schema for nklient HTTP client",
  "type": "object",
  "properties": {
    "baseUrl": {
      "type": "string",
      "format": "uri",
      "description": "Base URL for all requests."
    },
    "defaultHeaders": {
      "type": "object",
      "description": "Default headers to include with every request",
      "additionalProperties": { "type": "string" }
    },
    "timeout": {
      "type": "integer",
      "minimum": 0,
      "default": 30000,
      "description": "Default timeout in milliseconds"
    },
    "maxRedirects": {
      "type": "integer",
      "minimum": 0,
      "default": 5,
      "description": "Maximum number of redirects to follow"
    },
    "retry": {
      "type": "object",
      "description": "Retry policy configuration",
      "properties": {
        "attempts": { "type": "integer", "minimum": 0, "default": 1 },
        "delay": { "type": "integer", "minimum": 0, "default": 1000 },
        "maxDelay": { "type": "integer", "minimum": 0, "default": 30000 },
        "retryOnStatusCodes": {
          "type": "array",
          "items": { "type": "integer", "minimum": 100, "maximum": 599 },
          "default": [408, 429, 500, 502, 503, 504]
        },
        "backoffMultiplier": { "type": "number", "minimum": 1, "default": 2 }
      },
      "additionalProperties": false
    },
    "keepAlive": { "type": "boolean", "default": true },
    "cookies": { "type": "boolean", "default": false },
    "followRedirects": { "type": "boolean", "default": true },
    "decompress": { "type": "boolean", "default": true }
  },
  "additionalProperties": false
};

class ConfigLoader {
  private ajv: Ajv;
  private validate: ValidateFunction;

  constructor() {
    this.ajv = new Ajv({ useDefaults: true, coerceTypes: true });
    ajvFormats(this.ajv);
    this.validate = this.ajv.compile(schema);
  }

  loadConfig(config: Record<string, any>): ClientConfig {
    const configCopy: Record<string, any> = JSON.parse(JSON.stringify(config));
    const valid = this.validate(configCopy);
    if (!valid) {
      const errors = this.validate.errors!.map(err =>
        `${err.instancePath || 'root'}: ${err.message}`
      ).join(', ');
      throw new Error(`Invalid configuration: ${errors}`);
    }
    const defaultConfig = this.getDefaultConfig();
    return this.mergeConfigs(defaultConfig, configCopy);
  }

  getDefaultConfig(): ClientConfig {
    return {
      baseUrl: '',
      defaultHeaders: {},
      timeout: 30000,
      maxRedirects: 5,
      retry: {
        attempts: 1,
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

  mergeConfigs(defaults: ClientConfig, userConfig: Record<string, any>): ClientConfig {
    const merged: any = { ...defaults };
    for (const key in userConfig) {
      if (Object.prototype.hasOwnProperty.call(userConfig, key)) {
        if (typeof userConfig[key] === 'object' && !Array.isArray(userConfig[key]) && userConfig[key] !== null) {
          merged[key] = { ...(defaults as any)[key], ...userConfig[key] };
        } else {
          merged[key] = userConfig[key];
        }
      }
    }
    return merged;
  }

  loadFromFile(filePath: string): ClientConfig {
    try {
      const configContent = fs.readFileSync(filePath, 'utf8');
      const config = JSON.parse(configContent) as Record<string, any>;
      return this.loadConfig(config);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Configuration file not found: ${filePath}`);
      } else if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in configuration file: ${error.message}`);
      }
      throw error;
    }
  }
}

export = ConfigLoader;
