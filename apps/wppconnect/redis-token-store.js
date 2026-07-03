"use strict";

Object.defineProperty(exports, "__esModule", { value: true });

const config = require("../../config").default;
const redisClient = require("../db/redis/db").default;
const { getIPAddress } = require("../functions");

class RedisTokenStore {
  constructor(client) {
    this.client = client;
    this.prefix = config.db.redisPrefix || "";
    if (this.prefix === "docker") this.prefix = getIPAddress();
    if (this.prefix && !this.prefix.endsWith(":")) this.prefix = `${this.prefix}:`;
  }

  tokenStore = {
    getToken: (sessionName) =>
      new Promise((resolve, reject) => {
        redisClient.get(this.prefix + sessionName, (err, reply) => {
          if (err) return reject(err);
          if (!reply) return resolve(null);

          const object = JSON.parse(reply);
          if (object) {
            if (object.config && Object.keys(this.client.config).length === 0) {
              this.client.config = object.config;
            }
            if (object.webhook && Object.keys(this.client.config).length === 0) {
              this.client.config.webhook = object.webhook;
            }
          }
          return resolve(object);
        });
      }),
    setToken: (sessionName, tokenData) =>
      new Promise((resolve) => {
        tokenData.sessionName = sessionName;
        tokenData.config = this.client.config;
        redisClient.set(this.prefix + sessionName, JSON.stringify(tokenData), (err) => {
          return resolve(err ? false : true);
        });
      }),
    removeToken: (sessionName) =>
      new Promise((resolve) => {
        redisClient.del(this.prefix + sessionName, (err) => {
          return resolve(err ? false : true);
        });
      }),
    listTokens: () =>
      new Promise((resolve) => {
        redisClient.keys(`${this.prefix}*`, (err, keys) => {
          if (err) return resolve([]);
          return resolve(
            keys.map((item) => (this.prefix && item.startsWith(this.prefix) ? item.slice(this.prefix.length) : item))
          );
        });
      })
  };
}

exports.default = RedisTokenStore;

