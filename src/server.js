import { EventEmitter } from 'events';
import { readFileSync } from 'fs';
import { Server as HttpServer } from 'http';
import WebSocket, { Server as WsServer } from 'ws';

import {
  Auth,
  load as loadAuth
} from '@scola/auth-server';

import {
  CacheFactory,
  HttpConnector,
  PubSub,
  Router,
  WsConnection,
  WsConnector,
  handleError
} from '@scola/api';

import { I18n } from '@scola/i18n';

export default class Server extends EventEmitter {
  constructor() {
    super();

    this._auth = null;
    this._cache = null;
    this._codec = null;
    this._database = null;
    this._http = null;
    this._httpServer = null;
    this._i18n = null;
    this._pubsub = null;
    this._router = null;
    this._ws = null;
    this._wsServer = null;

    this._handleError = (e) => this._error(e);
  }

  destroy(code, reason, callback = () => {}) {
    this._unbindHttp();
    this._unbindRouter();
    this._unbindWs();

    this._closeWs(code, reason, () => {
      this._closeHttp(callback);
    });
  }

  auth(dao = null, options = null) {
    if (dao === null) {
      return this._auth;
    }

    this._auth = new Auth()
      .dao(dao)
      .key(readFileSync(options.key));

    return this;
  }

  cache(client = null) {
    if (client === null) {
      return this._cache;
    }

    this._cache = new CacheFactory()
      .client(client);

    return this;
  }

  codec(value = null) {
    if (value === null) {
      return this._codec;
    }

    this._codec = value;

    if (this._ws) {
      this._ws.codec(value);
    }

    return this;
  }

  database(value = null) {
    if (value === null) {
      return this._database;
    }

    this._database = value;
    return this;
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

  router() {
    if (!this._router) {
      this._router = new Router();
      this._router.on('error', handleError());
      this._bindRouter();
    }

    return this._router;
  }

  pubsub(options = null) {
    if (!this._pubsub) {
      this._pubsub = new PubSub();
    }

    if (options === null) {
      return this._pubsub;
    }

    options.factory = (u, p, o) => {
      return new WebSocket(u, p, o);
    };

    const connection = new WsConnection()
      .codec(this.codec())
      .reconnector(options);

    this._pubsub.connection(connection);
    return this;
  }

  ws(options = null) {
    if (options === null) {
      return this._ws;
    }

    options.server = this._httpInstance(options);

    delete options.port;
    delete options.host;

    this._wsServer = new WsServer(options);

    this._ws = new WsConnector()
      .server(this._wsServer)
      .router(this.router())
      .codec(this.codec())
      .ping(options.ping);

    this._bindWs();
    return this;
  }

  start() {
    if (this._auth) {
      loadAuth(this);
    }

    if (this._pubsub) {
      this._pubsub.open();
    }

    return this;
  }

  _bindHttp() {
    if (this._http) {
      this._http.on('error', this._handleError);
    }
  }

  _unbindHttp() {
    if (this._http) {
      this._http.removeListener('error', this._handleError);
    }
  }

  _bindRouter() {
    if (this._router) {
      this._router.on('error', this._handleError);
    }
  }

  _unbindRouter() {
    if (this._router) {
      this._router.removeListener('error', this._handleError);
    }
  }

  _bindWs() {
    if (this._ws) {
      this._ws.on('error', this._handleError);
    }
  }

  _unbindWs() {
    if (this._ws) {
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
