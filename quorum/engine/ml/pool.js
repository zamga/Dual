// A small worker_threads pool for GBDT jobs. Workers share the feature store and targets through
// SharedArrayBuffers, so a job message only carries row ranges and parameters.
import { Worker } from 'node:worker_threads';
import os from 'node:os';

export function createPool(workerData, size = Math.max(1, Math.min(4, os.availableParallelism?.() ?? os.cpus().length))) {
  const workers = [];
  const idle = [];
  const queue = [];
  const pending = new Map();
  let nextId = 1;
  for (let k = 0; k < size; k++) {
    const w = new Worker(new URL('./worker.js', import.meta.url), { workerData });
    w.on('message', (msg) => {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error));
      else p.resolve(msg);
      idle.push(w);
      pump();
    });
    w.on('error', (err) => {
      for (const p of pending.values()) p.reject(err);
      pending.clear();
    });
    workers.push(w);
    idle.push(w);
  }
  function pump() {
    while (idle.length && queue.length) {
      const w = idle.pop();
      const job = queue.shift();
      w.postMessage(job);
    }
  }
  return {
    size,
    run(job) {
      return new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        queue.push({ ...job, id });
        pump();
      });
    },
    async close() {
      await Promise.all(workers.map((w) => w.terminate()));
    },
  };
}
