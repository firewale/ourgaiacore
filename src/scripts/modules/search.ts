import * as geolocationModule from './geolocation.js';
import { showBanner, hideBanner } from './banner.js';

let geolocationLocal: typeof geolocationModule;
let searchInputRef: HTMLInputElement;
let resultsListRef: HTMLElement;

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

  // Appended as a sibling of controlstrip (not inside it) so it isn't clipped
  // by controlstrip's fixed height + overflow:hidden.
  resultsListRef = document.createElement('div');
  resultsListRef.id = 'search-results';
  resultsListRef.className = 'search-results';
  resultsListRef.hidden = true;
  controlUI.appendChild(resultsListRef);

  searchButton.addEventListener('click', () => {
    void search(setLocationCallback);
  });

  searchInputRef.addEventListener('keypress', (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    void search(setLocationCallback);
  });
}

function hideResults(): void {
  resultsListRef.hidden = true;
  resultsListRef.replaceChildren();
}

function showResults(
  choices: geolocationModule.GeocodeChoice[],
  setLocationCallback: (latLng: google.maps.LatLng) => void
): void {
  resultsListRef.replaceChildren();
  for (const choice of choices) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'search-result-item';
    item.textContent = choice.displayName;
    item.addEventListener('click', () => {
      hideBanner();
      hideResults();
      setLocationCallback(new google.maps.LatLng(choice.latitude, choice.longitude));
    });
    resultsListRef.appendChild(item);
  }
  resultsListRef.hidden = false;
}

async function search(
  setLocationCallback: (latLng: google.maps.LatLng) => void
): Promise<void> {
  const searchTerm = searchInputRef.value.trim();

  if (!searchTerm) {
    console.error('No search term entered');
    return;
  }

  hideResults();

  const result = await geolocationLocal.codeAddress(searchTerm);
  if (result.status === 'success') {
    hideBanner();
    const latLng = new google.maps.LatLng(result.latitude, result.longitude);
    setLocationCallback(latLng);
  } else if (result.status === 'multiple') {
    hideBanner();
    showResults(result.choices, setLocationCallback);
  } else {
    console.error(`Could not resolve "${searchTerm}": ${result.message}`);
    showBanner(`Could not find "${searchTerm}" — please try a different search term.`);
  }
}
