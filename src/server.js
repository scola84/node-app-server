import { EventEmitter } from 'events';
import { Server as HttpServer } from 'http';
import get from 'lodash-es/get';
import ip from 'ip';
import { createTransport } from 'nodemailer';
import { markdown } from 'nodemailer-markdown';
import WebSocket, { Server as WsServer } from 'ws';

import {
  Cache,
  HttpConnector,
  Logger,
  PubSub,
  Router,
  WsConnection,
  WsConnector,
  dictionary,
  handleError
} from '@scola/api';

import {
  Auth,
  load as loadAuth
} from '@scola/auth-server';

import { ScolaError } from '@scola/error';
import { I18n } from '@scola/i18n';

import Processor from './processor';
import Route from './route';

export default class Server extends EventEmitter {
  constructor() {
    super();

    this._auth = null;
    this._cache = null;
    this._config = {};
    this._database = null;
    this._http = null;
    this._httpServer = null;
    this._i18n = null;
    this._id = null;
    this._logger = null;
    this._processors = [];
    this._pubsub = null;
    this._router = null;
    this._smtp = null;
    this._ws = null;
    this._wsServer = null;

    this._handleError = (e) => this._error(e);
  }

  destroy(code, reason, callback = () => {}) {
    this._unbindHttp();
    this._unbindRouter();
    this._unbindWs();

    if (this._auth) {
      this._auth.destroy();
    }

    if (this._cache) {
      this._cache.destroy();
    }

    if (this._pubsub) {
      this._pubsub.destroy();
    }

    if (this._database) {
      this._closeDatabase();
    }

    this._closeWs(code, reason, () => {
      this._closeHttp(callback);
    });
  }

  auth(dao = null) {
    if (dao === null) {
      return this._auth;
    }

    this._auth = new Auth()
      .dao(dao);

    return this;
  }

  cache(client = null) {
    if (client === null) {
      return this._cache;
    }

    this._cache = new Cache()
      .client(client);

    return this;
  }

  config(value = null) {
    if (value === null) {
      return this._config;
    }

    if (typeof value === 'string') {
      return get(this._config, value);
    }

    this._config = value;
    return this;
  }

  database(value = null) {
    if (value === null) {
      return this._database;
    }

    this._database = value;
    return this;
  }

  error(message) {
    return new ScolaError(message);
  }

  http(options = null) {
    if (options === null) {
      return this._http;
    }

    this._http = new HttpConnector()
      .server(this._httpInstance(options))
      .router(this.router());

    this._bindHttp();
    return this;
  }

  i18n(options = null) {
    if (options === null) {
      return this._i18n;
    }

    this._i18n = new I18n()
      .locale(options.locale)
      .timezone(options.timezone);

    return this;
  }

  id() {
    return this._id;
  }

  logger(config = null) {
    if (config === null) {
      return this._logger;
    }

    this._logger = new Logger()
      .config(config)
      .server(this);

    return this;
  }

  processor(config = null) {
    if (config === null) {
      return this._proccesors;
    }

    const processor = new Processor()
      .config(config)
      .server(this);

    this._processors.push(processor);
    return this;
  }

  route() {
    return new Route()
      .server(this);
  }

  router() {
    if (this._router === null) {
      this._router = new Router();
      this._router.on('error', handleError());
      this._bindRouter();
    }

    return this._router;
  }

  pubsub(options = null) {
    if (this._pubsub === null) {
      this._pubsub = new PubSub();
    }

    if (options === null) {
      return this._pubsub;
    }

    options = Object.assign({}, options);

    options.dictionary = options.dictionary || dictionary;
    options.factory = (u, p, o) => {
      return new WebSocket(u, p, o);
    };

    const connection = new WsConnection()
      .codec(options.codec)
      .dictionary(options.dictionary)
      .reconnector(options);

    this._pubsub.connection(connection);
    return this;
  }

  smtp(options = null) {
    if (options === null) {
      return this._smtp;
    }

    this._smtp = createTransport(options);
    this._smtp.use('compile', markdown());

    return this;
  }

  ws(options = null) {
    if (options === null) {
      return this._ws;
    }

    options = Object.assign({}, options);

    options.server = this._httpInstance(options);
    options.dictionary = options.dictionary || dictionary;

    delete options.port;
    delete options.host;

    this._wsServer = new WsServer(options);
    this._ws = new WsConnector();

    this._ws.server(this._wsServer);
    this._ws.router(this.router());
    this._ws.codec(options.codec);
    this._ws.ping(options.ping);
    this._ws.dictionary(options.dictionary);

    this._bindWs();
    return this;
  }

  start() {
    this._id = ip.toLong(ip.address());

    if (this._auth) {
      loadAuth(this);
    }

    if (this._pubsub) {
      this._pubsub.open();
    }

    this._processors.forEach((processor) => {
      processor.start();
    });

    return this;
  }

  _bindHttp() {
    if (this._http) {
      this._http.setMaxListeners(this._http.getMaxListeners() + 1);
      this._http.on('error', this._handleError);
    }
  }

  _unbindHttp() {
    if (this._http) {
      this._http.setMaxListeners(this._http.getMaxListeners() - 1);
      this._http.removeListener('error', this._handleError);
    }
  }

  _bindRouter() {
    if (this._router) {
      this._router.setMaxListeners(this._router.getMaxListeners() + 1);
      this._router.on('error', this._handleError);
    }
  }

  _unbindRouter() {
    if (this._router) {
      this._router.setMaxListeners(this._router.getMaxListeners() - 1);
      this._router.removeListener('error', this._handleError);
    }
  }

  _bindWs() {
    if (this._ws) {
      this._ws.setMaxListeners(this._ws.getMaxListeners() + 1);
      this._ws.on('error', this._handleError);
    }
  }

  _unbindWs() {
    if (this._ws) {
      this._ws.setMaxListeners(this._ws.getMaxListeners() - 1);
      this._ws.removeListener('error', this._handleError);
    }
  }

  _error(error) {
    this.emit('error', error);
  }

  _httpInstance(options) {
    if (this._httpServer) {
      return this._httpServer;
    }

    this._httpServer = new HttpServer();
    this._httpServer.listen(options.port, options.host);

    return this._httpServer;
  }

  _closeDatabase() {
    this._database.destroy();
    this._database = null;
  }

  _closeHttp(callback = () => {}) {
    if (this._http) {
      this._http.close();
      this._http = null;
    }

    if (this._httpServer) {
      this._httpServer.close(callback);
      this._httpServer = null;
      return;
    }

    callback();
  }

  _closeWs(code, reason, callback = () => {}) {
    if (this._ws) {
      this._ws.close(code, reason);
      this._ws = null;
    }

    if (this._wsServer) {
      this._wsServer.close(callback);
      this._wsServer = null;
      return;
    }

    callback();
  }
}
