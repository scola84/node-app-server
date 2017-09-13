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
    this._log('Processor start %j', this._config);

    this._server
      .pubsub()
      .client()
      .subscribe(this._config.pubsub.path)
      .on(this._config.pubsub.event, (data) => {
        this._publish(data);
      });

    this._setup();
  }

  _setup() {
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

  _publish(data) {
    this._log('Processor _pubsub data=%j', data);

    if (this._cancel(data) === true) {
      return false;
    }

    if (data.action === 'pause') {
      this._pause();
    }

    if (data.action === 'reset') {
      this._clear();
      this._setup();
    }

    if (data.action === 'resume') {
      this._resume();
    }

    if (data.action === 'run') {
      this._run(data);
    }

    return true;
  }

  _cancel(data) {
    if (typeof data.si !== 'undefined') {
      return data.si !== this._server.id();
    }

    if (typeof data.pn !== 'undefined') {
      return data.pn !== this._config.name;
    }

    return false;
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
        this._config.database.queue,
        null,
        false
      );
  }

  _text(name, value) {
    this._server
      .logger()
      .text(
        [this._compose(name, value)],
        this._config.database.queue,
        null,
        false
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
