import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';
import helmet from 'helmet';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In production (after `npm run build`), serve the Vite-built client from dist/client/.
// In dev, Vite's own dev server handles the frontend at :5173.
const clientDir = path.join(__dirname, '../dist/client');
if (fs.existsSync(clientDir)) {
  app.use(express.static(clientDir));
}

const PORT = parseInt(process.env.PORT ?? '8080', 10);
app.listen(PORT, () => console.log(`HTTP listening on port ${PORT}`));

const keyPath = path.join(__dirname, '../server.key');
const certPath = path.join(__dirname, '../server.crt');

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  const options = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };
  const HTTPS_PORT = parseInt(process.env.HTTPS_PORT ?? '8443', 10);
  https.createServer(options, app).listen(HTTPS_PORT, () =>
    console.log(`HTTPS listening on port ${HTTPS_PORT}`)
  );
} else {
  console.warn('TLS cert/key not found — HTTPS server not started');
}
