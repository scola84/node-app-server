import {
  cached,
  subscribe,
  respond
} from '@scola/api';

import { authorize } from '@scola/auth-server';
import { ScolaError } from '@scola/error';

export default class Route {
  constructor() {
    this._server = null;

    this._allow = null;
    this._authorize = null;
    this._cache = null;
    this._channel = null;
    this._invert = null;
    this._method = null;
    this._mode = 'object';
    this._publish = null;
    this._respond = null;
    this._query = null;
    this._route = null;
    this._validate = null;
  }

  server(value) {
    this._server = value;
    return this;
  }

  get(route, query) {
    this._method = 'GET';
    this._route = route;
    this._query = query;

    this._open();
    return this;
  }

  post(route, query) {
    this._method = 'POST';
    this._route = route;
    this._query = query;

    this._open();
    return this;
  }

  put(route, query) {
    this._method = 'PUT';
    this._route = route;
    this._query = query;

    this._open();
    return this;
  }

  delete(route, query) {
    this._method = 'DELETE';
    this._route = route;
    this._query = query;

    this._open();
    return this;
  }

  allow(value) {
    this._allow = value;
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

  mode(value, invert = false) {
    this._mode = value;
    this._invert = invert;
    return this;
  }

  publish(channel, handler) {
    this._channel = channel;
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

  _open() {
    const handlers = [];

    this._addValidate(handlers);
    this._addAllow(handlers);
    this._addAuthorize(handlers);
    this._addQuery(handlers);
    this._addRespond(handlers);
    this._addPublish(handlers);
    this._addSubscribe(handlers);

    const route = this._server
      .router()
      .route(
        this._method,
        this._route,
        ...handlers
      );

    if (this._method !== 'GET') {
      route.extract();
    }
  }

  _addAllow(handlers) {
    if (this._allow === null) {
      return;
    }

    handlers.push(authorize(this._allow));
  }

  _addAuthorize(handlers) {
    if (this._authorize === null) {
      return;
    }

    handlers.push(this._authorize);
  }

  _addCache(handlers) {
    if (this._mode === 'list' && this._invert === false) {
      handlers.push(cached(this._server.cache(),
        this._cache, this._query, 'total'));
    }

    handlers.push(cached(this._server.cache(),
      this._cache, this._query, this._mode));

    if (this._mode === 'list' && this._invert === true) {
      handlers.push(cached(this._server.cache(),
        this._cache, this._query, 'total'));
    }
  }

  _addPublish(handlers) {
    if (this._publish === null) {
      return;
    }

    if (this._method === 'GET') {
      this._server
        .pubsub()
        .client()
        .on(this._channel, (message) => {
          this._publish(message);
        });
      return;
    }

    handlers.push((request, response, next) => {
      this._publish(request, (data) => {
        this._server
          .pubsub()
          .client()
          .publish(this._channel, data);

        next();
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
        if (error instanceof ScolaError === true) {
          next(error);
          return;
        }

        if (error instanceof Error === true) {
          next(request.error('500 invalid_query ' +
            error.message));
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
