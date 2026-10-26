import cluster from 'node:cluster';
import http from 'node:http';
import { availableParallelism } from 'node:os';

if (cluster.isPrimary) { // or isMaster in older versions
  const numCPUs = availableParallelism();
  console.log(`Primary process ${process.pid} is running. Forking ${numCPUs} workers...`);

  // Fork a completely new OS process for each CPU core
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork(); 
  }

} else {
  // Workers all share the exact same network ports automatically!
  http.createServer((req, res) => {
    res.writeHead(200);
    res.end(`Hello from Worker process ${process.pid}\n`);
  }).listen(8000);
}
