import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';
import helmet from 'helmet';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { wikipediaRouter } from './routes/wikipedia.js';
import { chatRouter } from './routes/chat.js';
import { geocodeRouter } from './routes/geocode.js';
import { categoriesRouter } from './routes/categories.js';
import { getRedisClient } from './lib/redisClient.js';
import { initCategoryRules } from './lib/categoryRules.js';
import { initArticleCategoryOverrides } from './lib/articleCategoryOverrides.js';
import { initCategories } from './lib/categories.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'connect-src': ["'self'", 'https://tiles.openfreemap.org'],
      'img-src': ["'self'", 'data:', 'https://tiles.openfreemap.org', 'https://en.wikipedia.org'],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
      'worker-src': ["'self'", 'blob:'],
    },
  },
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/wikipedia', wikipediaRouter);
app.use('/api/chat', chatRouter);
app.use('/api/geocode', geocodeRouter);
app.use('/api/categories', categoriesRouter);

// Eagerly initialize Redis so the connection can become ready before requests arrive.
getRedisClient();

// Loads category classification rules from Postgres (creating/seeding the table
// on first run). Fire-and-forget: the route already has built-in defaults to
// classify with while this resolves, and if Postgres is down, it stays on those.
initCategoryRules();
initArticleCategoryOverrides();
initCategories();

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
