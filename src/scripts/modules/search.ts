import * as geolocationModule from './geolocation.js';
import { showBanner, hideBanner } from './banner.js';

let geolocationLocal: typeof geolocationModule;
let searchInputRef: HTMLInputElement;

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

  // Capture references before moving controlstrip out of the document.
  // After appendChild below, getElementById can no longer find these elements.
  searchInputRef = document.getElementById('searchTerm') as HTMLInputElement;
  const searchButton = document.getElementById('searchButton') as HTMLButtonElement;

  controlUI.appendChild(controlstrip);

  searchButton.addEventListener('click', () => {
    void search(setLocationCallback);
  });

  searchInputRef.addEventListener('keypress', (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    void search(setLocationCallback);
  });
}

async function search(
  setLocationCallback: (latLng: google.maps.LatLng) => void
): Promise<void> {
  const searchTerm = searchInputRef.value.trim();

  if (!searchTerm) {
    console.error('No search term entered');
    return;
  }

  const result = await geolocationLocal.codeAddress(searchTerm);
  if (result.status === 'success') {
    hideBanner();
    const latLng = new google.maps.LatLng(result.latitude, result.longitude);
    setLocationCallback(latLng);
  } else {
    console.error(`Could not resolve "${searchTerm}": ${result.message}`);
    showBanner(`Could not find "${searchTerm}" — please try a different search term.`);
  }
}
