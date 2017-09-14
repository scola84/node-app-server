import { debuglog } from 'util';
import queue from 'async/queue';

export default class Processor {
  constructor() {
    this._log = debuglog('processor');

    this._config = null;
    this._queue = null;
    this._server = null;
  }

  config(value = null) {
    if (value === null) {
      return this._config;
    }

    this._config = value;
    return this;
  }

  server(value = null) {
    if (value === null) {
      return this._server;
    }

    this._server = value;
    return this;
  }

  start() {
    this._log('Processor start');

    this._config.pubsub.subscribe.forEach((path) => {
      this._subscribe(path);
    });

    this._setup();
  }

  _subscribe(path) {
    this._log('Processor _subscribe', path);

    const subscription = this._server
      .pubsub()
      .client()
      .subscribe(path);

    subscription.on('done', (data) => this._run(data));
    subscription.on('pause', () => this._pause());
    subscription.on('reset', () => this._reset());
    subscription.on('resume', () => this._resume());
    subscription.on('run', (data) => this._run(data));
  }

  _setup() {
    this._log('Processor _setup');

    this._queue = queue((t, c) => this._process(t, c),
      this._config.queue.concurrency);

    this._queue.drain = () => {
      this._stat('run', 0);
    };

    this._queue.error = (error) => {
      this._text('error', error.message);
    };

    if (this._config.queue.paused === true) {
      this._pause();
      return;
    }

    this._resume();
  }

  _process(data, callback) {
    this._log('Processor _process data=%j', data);

    this._config
      .task()
      .config(this._config)
      .data(data)
      .server(this._server)
      .run(callback);
  }

  _clear() {
    if (this._queue) {
      this._queue.kill();
      this._queue = null;
    }
  }

  _stat(name, value) {
    this._server
      .logger()
      .stat(
        [this._compose(name, value)],
        this._config.database.processor
      );
  }

  _text(name, value) {
    this._server
      .logger()
      .text(
        [this._compose(name, value)],
        this._config.database.processor
      );
  }

  _compose(name, value) {
    return [
      this._config.name + '.queue.' + name,
      this._server.id(),
      Date.now(),
      0,
      value
    ];
  }

  _pause() {
    this._queue.pause();
    this._stat('paused', 1);
  }

  _reset() {
    this._clear();
    this._setup();
  }

  _resume() {
    this._queue.resume();
    this._stat('paused', 0);
  }

  _run(data) {
    if (this._queue.paused === true) {
      return;
    }

    this._queue.push(data);
    this._stat('task', 1);
  }
}
