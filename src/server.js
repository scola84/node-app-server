import { readFileSync } from 'fs';
import { Server as HttpServer } from 'http';
import { Server as WsServer } from 'ws';

import { Auth } from '@scola/auth-server';

import {
  HttpConnector,
  Router,
  WsConnector,
  handleError
} from '@scola/api';

import { I18n } from '@scola/i18n';

export default class Server {
  constructor() {
    this._auth = null;
    this._codec = null;
    this._database = null;
    this._http = null;
    this._httpServer = null;
    this._i18n = null;
    this._router = null;
    this._ws = null;
    this._wsServer = null;
  }

  destroy(code, reason, callback = () => {}) {
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
    }

    return this._router;
  }

  http(options = null) {
    if (options === null) {
      return this._http;
    }

    this._http = new HttpConnector()
      .server(this._httpInstance(options))
      .router(this.router());

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

    return this;
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
