type GeocodeResult =
  | { status: 'success'; latitude: number; longitude: number }
  | { status: 'error'; message: string };

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  // North America — major cities
  'charlotte':      { lat: 35.2271,  lng: -80.8431  },
  'san francisco':  { lat: 37.7749,  lng: -122.4194 },
  'chicago':        { lat: 41.8781,  lng: -87.6298  },
  'new york':       { lat: 40.7128,  lng: -74.0060  },
  'los angeles':    { lat: 34.0522,  lng: -118.2437 },
  'seattle':        { lat: 47.6062,  lng: -122.3321 },
  'austin':         { lat: 30.2672,  lng: -97.7431  },
  'denver':         { lat: 39.7392,  lng: -104.9903 },
  'miami':          { lat: 25.7617,  lng: -80.1918  },
  'boston':         { lat: 42.3601,  lng: -71.0589  },
  'atlanta':        { lat: 33.7490,  lng: -84.3880  },
  'portland':       { lat: 45.5051,  lng: -122.6750 },
  'toronto':        { lat: 43.6532,  lng: -79.3832  },
  'mexico city':    { lat: 19.4326,  lng: -99.1332  },
  // New Mexico
  'albuquerque':    { lat: 35.0844,  lng: -106.6504 },
  'santa fe':       { lat: 35.6870,  lng: -105.9378 },
  'belen':          { lat: 34.6612,  lng: -106.7759 },
  'socorro':        { lat: 34.0584,  lng: -106.8914 },
  'las cruces':     { lat: 32.3199,  lng: -106.7637 },
  'taos':           { lat: 36.4072,  lng: -105.5731 },
  'roswell':        { lat: 33.3943,  lng: -104.5230 },
  'farmington':     { lat: 36.7281,  lng: -108.2087 },
  'gallup':         { lat: 35.5281,  lng: -108.7426 },
  'truth or consequences': { lat: 33.1284, lng: -107.2528 },
  // California — Bay Area & Central Valley
  'hayward':        { lat: 37.6688,  lng: -122.0808 },
  'oakland':        { lat: 37.8044,  lng: -122.2712 },
  'san jose':       { lat: 37.3382,  lng: -121.8863 },
  'fremont':        { lat: 37.5485,  lng: -121.9886 },
  'richmond':       { lat: 37.9358,  lng: -122.3478 },
  'vallejo':        { lat: 38.1041,  lng: -122.2566 },
  'stockton':       { lat: 37.9577,  lng: -121.2908 },
  'modesto':        { lat: 37.6391,  lng: -120.9969 },
  'fresno':         { lat: 36.7378,  lng: -119.7871 },
  'visalia':        { lat: 36.3302,  lng: -119.2921 },
  'bakersfield':    { lat: 35.3733,  lng: -119.0187 },
  'salinas':        { lat: 36.6777,  lng: -121.6555 },
  // California — Southern & Coast
  'santa barbara':  { lat: 34.4208,  lng: -119.6982 },
  'san luis obispo': { lat: 35.2828, lng: -120.6596 },
  'oxnard':         { lat: 34.1975,  lng: -119.1771 },
  'riverside':      { lat: 33.9806,  lng: -117.3755 },
  'san bernardino': { lat: 34.1083,  lng: -117.2898 },
  // Arizona
  'phoenix':        { lat: 33.4484,  lng: -112.0740 },
  'tucson':         { lat: 32.2226,  lng: -110.9747 },
  'flagstaff':      { lat: 35.1983,  lng: -111.6513 },
  'sedona':         { lat: 34.8697,  lng: -111.7610 },
  'yuma':           { lat: 32.6927,  lng: -114.6277 },
  // Nevada & Utah
  'las vegas':      { lat: 36.1699,  lng: -115.1398 },
  'reno':           { lat: 39.5296,  lng: -119.8138 },
  'salt lake city': { lat: 40.7608,  lng: -111.8910 },
  'moab':           { lat: 38.5733,  lng: -109.5498 },
  // Colorado
  'colorado springs': { lat: 38.8339, lng: -104.8214 },
  'boulder':        { lat: 40.0150,  lng: -105.2705 },
  'fort collins':   { lat: 40.5853,  lng: -105.0844 },
  'pueblo':         { lat: 38.2544,  lng: -104.6091 },
  // Europe
  'london':         { lat: 51.5074,  lng: -0.1278   },
  'paris':          { lat: 48.8566,  lng: 2.3522    },
  'berlin':         { lat: 52.5200,  lng: 13.4050   },
  'amsterdam':      { lat: 52.3676,  lng: 4.9041    },
  'rome':           { lat: 41.9028,  lng: 12.4964   },
  'barcelona':      { lat: 41.3851,  lng: 2.1734    },
  // Africa
  'kigali':         { lat: -1.9441,  lng: 30.0619   },
  'nairobi':        { lat: -1.2921,  lng: 36.8219   },
  'lagos':          { lat: 6.5244,   lng: 3.3792    },
  'cape town':      { lat: -33.9249, lng: 18.4241   },
  'accra':          { lat: 5.6037,   lng: -0.1870   },
  // Asia & Pacific
  'tokyo':          { lat: 35.6762,  lng: 139.6503  },
  'beijing':        { lat: 39.9042,  lng: 116.4074  },
  'mumbai':         { lat: 19.0760,  lng: 72.8777   },
  'dubai':          { lat: 25.2048,  lng: 55.2708   },
  'singapore':      { lat: 1.3521,   lng: 103.8198  },
  'sydney':         { lat: -33.8688, lng: 151.2093  },
  // South America
  'sao paulo':      { lat: -23.5505, lng: -46.6333  },
  'buenos aires':   { lat: -34.6037, lng: -58.3816  },
  'bogota':         { lat: 4.7110,   lng: -74.0721  },
};

export async function codeAddress(address: string): Promise<GeocodeResult> {
  const normalized = address.trim().toLowerCase();
  const hit = CITY_COORDS[normalized];
  if (hit) return { status: 'success', latitude: hit.lat, longitude: hit.lng };

  return new Promise((resolve) => {
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address }, (results, status) => {
      if (status === google.maps.GeocoderStatus.OK && results?.[0]) {
        resolve({
          status: 'success',
          latitude: results[0].geometry.location.lat(),
          longitude: results[0].geometry.location.lng(),
        });
      } else {
        resolve({ status: 'error', message: status });
      }
    });
  });
}

export async function getCurrentPosition(): Promise<google.maps.LatLng> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      console.error('Geolocation not available — using default location');
      resolve(new google.maps.LatLng(35.22, -80.84));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve(
          new google.maps.LatLng(
            position.coords.latitude,
            position.coords.longitude
          )
        );
      },
      (error) => {
        console.error('Geolocation error:', error.message);
        resolve(new google.maps.LatLng(35.22, -80.84));
      }
    );
  });
}
