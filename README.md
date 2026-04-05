# OurGaia

A single-page web application that shows a Google Maps view centered on your location and plots nearby Wikipedia articles as interactive markers.

## Prerequisites

- [Node.js](https://nodejs.org/) v20 or later
- A Google Maps JavaScript API key ([get one here](https://developers.google.com/maps/documentation/javascript/get-api-key))

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

   Open `.env` and set your Google Maps API key:

   ```
   VITE_GOOGLE_MAPS_API_KEY=your_key_here
   PORT=8080
   HTTPS_PORT=8443
   ```

## Running Locally

```bash
npm run dev
```

Open **`http://localhost:5173`** in your browser. Accept the location permission prompt and the map will center on your position with nearby Wikipedia articles plotted as markers.

This starts two servers concurrently:
- **Vite** on `http://localhost:5173` — serves the frontend with hot reload (use this for development)
- **Express** on `http://localhost:8080` — available for any future API routes

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

Build the image (the API key is embedded into the frontend bundle at build time):

```bash
docker build -t ourgaia --build-arg VITE_GOOGLE_MAPS_API_KEY=your_key_here .
```

Run the container:

```bash
docker run -p 8080:8080 ourgaia
```

Open `http://localhost:8080` in your browser.
