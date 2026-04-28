// Let's use node to quickly fetch the source of the Kokoro WebGPU demo if possible
const https = require('https');
https.get('https://huggingface.co/spaces/webml-community/kokoro-webgpu/raw/main/src/worker.js', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => console.log(data.substring(0, 1000)));
}).on('error', (err) => console.log("Error: " + err.message));
