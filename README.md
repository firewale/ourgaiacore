# OurGaia

A single-page web application that shows a MapLibre-powered map centered on your location and plots nearby Wikipedia articles as interactive markers.

## Prerequisites

- [Node.js](https://nodejs.org/) v20 or later

## Setup

1. **Clone the repo and install dependencies**

   ```bash
   git clone <repo-url>
   cd ourgaiacore
   npm install
   ```

2. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   No API key is required — the map defaults to [OpenFreeMap](https://openfreemap.org/)'s free `liberty` style. Optionally set a different MapLibre style URL in `.env`:

   ```
   VITE_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
   PORT=8080
   HTTPS_PORT=8443
   ```

## Running Locally

**Start Redis** (optional but recommended for caching):

```bash
npm run services:up
```

This runs `docker compose up -d`, starting a local Redis container (`compose.yaml`) published on `6379` to match `REDIS_URL` in `.env.example`. Stop it with:

```bash
npm run services:down
```

> If Redis is unavailable the server falls back to direct Wikipedia API calls with no caching.

**Start the dev servers:**

```bash
npm run dev
```

Open **`http://localhost:5173`** in your browser. Accept the location permission prompt and the map will center on your position with nearby Wikipedia articles plotted as markers.

This starts two servers concurrently:
- **Vite** on `http://localhost:5173` — serves the frontend with hot reload (use this for development)
- **Express** on `http://localhost:8080` — handles API requests and Wikipedia data fetching

## Building for Production

```bash
npm run build
```

This compiles `src/server.ts` to `dist/server.js` and bundles the frontend to `public/js/main.js`.

```bash
npm start
```

Serves the app from `http://localhost:8080` (or the port set in `.env`).

## HTTPS (Optional)

Place `server.key` and `server.crt` in the project root. The server will automatically start an HTTPS listener on `HTTPS_PORT` (default: 8443) if both files are present.

To generate a self-signed certificate for local testing:

```bash
openssl req -x509 -newkey rsa:4096 -keyout server.key -out server.crt -days 365 -nodes
```

## Running Tests

```bash
npm test               # run all tests
npm run test:watch     # re-run tests on file changes
npm run test:coverage  # generate a coverage report
```

## Docker

Build the image:

```bash
docker build -t ourgaia .
```

Run the container:

```bash
docker run -p 8080:8080 ourgaia
```

Open `http://localhost:8080` in your browser.
