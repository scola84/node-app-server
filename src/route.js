import {
  cached,
  subscribe,
  respond
} from '@scola/api';

import { authorize } from '@scola/auth-server';

export default class Route {
  constructor() {
    this._server = null;

    this._authorize = null;
    this._cache = null;
    this._method = null;
    this._mode = 'object';
    this._path = null;
    this._ppublish = null;
    this._publish = null;
    this._respond = null;
    this._query = null;
    this._validate = null;
  }

  server(value) {
    this._server = value;
    return this;
  }

  get(path, query) {
    this._method = 'GET';
    this._path = path;
    this._query = query;

    return this;
  }

  post(path, query) {
    this._method = 'POST';
    this._path = path;
    this._query = query;

    return this;
  }

  put(path, query) {
    this._method = 'PUT';
    this._path = path;
    this._query = query;

    return this;
  }

  delete(path, query) {
    this._method = 'DELETE';
    this._path = path;
    this._query = query;

    return this;
  }

  authorize(value) {
    this._authorize = value;
    return this;
  }

  cache(value) {
    this._cache = value;
    return this;
  }

  mode(value) {
    this._mode = value;
    return this;
  }

  publish(path, handler) {
    this._ppublish = path;
    this._publish = handler;
    return this;
  }

  respond(value) {
    this._respond = value;
    return this;
  }

  validate(value) {
    this._validate = value;
    return this;
  }

  open() {
    const handlers = [];

    this._addValidate(handlers);
    this._addAuthorize(handlers);
    this._addQuery(handlers);
    this._addRespond(handlers);
    this._addPublish(handlers);
    this._addSubscribe(handlers);

    const route = this._server
      .router()
      .route(
        this._method,
        this._path,
        ...handlers
      );

    if (this._method !== 'GET') {
      route.extract();
    }
  }

  _addAuthorize(handlers) {
    if (this._authorize === null) {
      return;
    }

    handlers.push(authorize(this._authorize));
  }

  _addCache(handlers) {
    if (this._mode === 'list') {
      handlers.push(cached(this._server.cache(),
        this._cache, this._query, 'total'));
    }

    handlers.push(cached(this._server.cache(),
      this._cache, this._query, this._mode));
  }

  _addPublish(handlers) {
    if (this._method === 'GET') {
      this._server
        .pubsub()
        .client()
        .on(this._ppublish, (message) => {
          this._publish(message);
        });
      return;
    }

    handlers.push((request, response, next) => {
      this._server
        .pubsub()
        .client()
        .publish(this._ppublish, (callback) => {
          this._publish(request, (data) => {
            callback(data);
            next();
          });
        });
    });
  }

  _addQuery(handlers) {
    if (this._cache !== null) {
      this._addCache(handlers);
      return;
    }

    handlers.push((request, response, next) => {
      this._query(request, (error, result = null) => {
        if (error instanceof Error === true) {
          next(error);
          return;
        }

        request.datum('result', result);
        next();
      });
    });
  }

  _addRespond(handlers) {
    if (this._respond !== null) {
      handlers.push(this._respond);
    }

    if (this._cache !== null) {
      handlers.push(respond(this._publish !== null));
      return;
    }

    handlers.push((request, response, next) => {
      if (this._method === 'POST') {
        response.status(201);
      }

      response.end(request.datum('result'));
      next();
    });
  }

  _addSubscribe(handlers) {
    if (this._method !== 'GET') {
      return;
    }

    if (this._publish === null) {
      return;
    }

    handlers.push(subscribe(this._server.pubsub()));
  }

  _addValidate(handlers) {
    if (this._validate === null) {
      return;
    }

    handlers.push((request, response, next) => {
      this._validate(request, next);
    });
  }
}