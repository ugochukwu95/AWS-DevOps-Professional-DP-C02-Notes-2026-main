import { Worker, isMainThread, parentPort } from 'node:worker_threads';

if (isMainThread) {
  console.log('Main thread is running smoothly')

  const worker = new Worker(new URL(import.meta.url))

  worker.on('message', (result) => {
    console.log('Main thread received result: ' + result)
  })

  // start heavy processing work
  worker.postMessage({ task: 'calculateSum', limit: 10_000_000_000})
}
else {
  // 2. this code below runs entirely on the background thread
  parentPort.on('message', (data) => {
    if (data.task === 'calculateSum') {
      console.log(`Worker thread started a massive loop...`);

      let total = 0;
      for (let i = 0; i < data.limit; i++) {
        total += i
      }

      parentPort.postMessage(total)
    }
  })
}