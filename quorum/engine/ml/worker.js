// GBDT worker: fits one model on a set of training-row ranges and optionally predicts a contiguous
// range of feature-store rows. Shared inputs arrive once through workerData (SharedArrayBuffers).
import { parentPort, workerData } from 'node:worker_threads';
import { fitBinned, predictRange } from './gbdt.js';

const { X, F, y, lists, shift } = workerData;

function expand(ranges, list) {
  let n = 0;
  for (const [a, b] of ranges) n += b - a;
  const out = new Int32Array(n);
  let k = 0;
  for (const [a, b] of ranges) for (let j = a; j < b; j++) out[k++] = list[j];
  return out;
}

parentPort.on('message', (job) => {
  try {
    const list = lists[job.list];
    const rows = expand(job.trainRanges, list);
    const evalRows = job.evalRanges ? expand(job.evalRanges, list) : null;
    const { model, evalPreds } = fitBinned(X, F, y, rows, job.params, {
      shift,
      features: job.features,
      evalRows,
      checkpoints: job.checkpoints,
    });
    let preds = null;
    if (job.predict) preds = Float32Array.from(predictRange(model, X, job.predict[0], job.predict[1]));
    const transfer = [];
    if (preds) transfer.push(preds.buffer);
    for (const e of evalPreds) transfer.push(e.pred.buffer);
    parentPort.postMessage(
      { id: job.id, gain: model.gain, nRows: rows.length, evalPreds, preds, model: job.returnModel ? model : null },
      transfer,
    );
  } catch (err) {
    parentPort.postMessage({ id: job.id, error: String(err && err.stack ? err.stack : err) });
  }
});
