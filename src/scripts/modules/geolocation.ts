type GeocodeResult =
  | { status: 'success'; latitude: number; longitude: number }
  | { status: 'error'; message: string };

export async function codeAddress(address: string): Promise<GeocodeResult> {
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
