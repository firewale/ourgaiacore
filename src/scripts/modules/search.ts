import * as geolocationModule from './geolocation.js';

let geolocationLocal: typeof geolocationModule;

export function BuildSearchControl(
  controlDiv: HTMLDivElement,
  geolocation: typeof geolocationModule,
  setLocationCallback: (latLng: google.maps.LatLng) => void
): void {
  geolocationLocal = geolocation;

  controlDiv.style.padding = '5px';

  const controlUI = document.createElement('div');
  controlUI.className = 'controlOverlay';
  controlDiv.appendChild(controlUI);

  const controlstrip = document.getElementById('controlstrip') as HTMLElement;
  controlstrip.style.visibility = 'visible';
  controlUI.appendChild(controlstrip);

  const searchBox = document.getElementById('searchTerm') as HTMLInputElement;
  const searchButton = document.getElementById('searchButton') as HTMLButtonElement;

  google.maps.event.addDomListener(searchButton, 'click', () => {
    void search(setLocationCallback);
  });

  google.maps.event.addDomListener(searchBox, 'keypress', (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    void search(setLocationCallback);
  });
}

async function search(
  setLocationCallback: (latLng: google.maps.LatLng) => void
): Promise<void> {
  const searchInput = document.getElementById('searchTerm') as HTMLInputElement;
  const searchTerm = searchInput.value.trim();

  if (!searchTerm) {
    console.error('No search term entered');
    return;
  }

  const result = await geolocationLocal.codeAddress(searchTerm);
  if (result.status === 'success') {
    const latLng = new google.maps.LatLng(result.latitude, result.longitude);
    setLocationCallback(latLng);
  } else {
    console.error(`Could not resolve "${searchTerm}": ${result.message}`);
  }
}
