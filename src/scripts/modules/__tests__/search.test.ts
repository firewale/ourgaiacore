import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BuildSearchControl } from '../search.js';
import * as geolocation from '../geolocation.js';

class MockLatLng {
  constructor(public lat: number, public lng: number) {}
}

beforeEach(() => {
  vi.stubGlobal('google', {
    maps: {
      LatLng: MockLatLng,
      event: {
        addDomListener: vi.fn((el: HTMLElement, event: string, handler: () => void) => {
          el.addEventListener(event, handler);
        }),
      },
    },
  });

  document.body.innerHTML = `
    <div id="error-banner" hidden></div>
    <div id="controlstrip" style="visibility:hidden">
      <div id="floater">
        <input id="searchTerm" type="text" />
        <input id="searchButton" type="button" />
      </div>
    </div>
  `;

  vi.clearAllMocks();
});

function setupControl(setLocationCallback = vi.fn()) {
  const controlDiv = document.createElement('div') as HTMLDivElement;
  document.body.appendChild(controlDiv);
  BuildSearchControl(controlDiv, geolocation, setLocationCallback);
  return { controlDiv, setLocationCallback };
}

describe('BuildSearchControl', () => {
  it('makes the controlstrip visible', () => {
    setupControl();
    const strip = document.getElementById('controlstrip') as HTMLElement;
    expect(strip.style.visibility).toBe('visible');
  });

  it('appends the controlUI into the controlDiv', () => {
    const { controlDiv } = setupControl();
    expect(controlDiv.querySelector('.controlOverlay')).toBeTruthy();
  });

  it('wires up button and input even when controlDiv is detached from the document', async () => {
    // Regression test: map.ts passes a detached div to BuildSearchControl (homeDiv is
    // only added to map.controls after this call returns). The original bug called
    // document.getElementById('searchTerm') AFTER moving controlstrip into the detached
    // div, which returned null and caused addDomListener to throw.
    const codeAddressSpy = vi.spyOn(geolocation, 'codeAddress').mockResolvedValue({
      status: 'error',
      message: 'ZERO_RESULTS',
    });

    const detachedDiv = document.createElement('div') as HTMLDivElement;
    // intentionally NOT appended to document.body
    expect(() => BuildSearchControl(detachedDiv, geolocation, vi.fn())).not.toThrow();

    // After the move, searchTerm is no longer findable via getElementById —
    // confirm the module still holds a valid reference by triggering the button.
    const searchButton = detachedDiv.querySelector('#searchButton') as HTMLInputElement;
    const searchInput = detachedDiv.querySelector('#searchTerm') as HTMLInputElement;
    searchInput.value = 'Charlotte';
    searchButton.click();

    await vi.waitFor(() => expect(codeAddressSpy).toHaveBeenCalledWith('Charlotte'));
  });
});

describe('search (via button click)', () => {
  it('logs an error when the search term is empty', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setupControl();

    (document.getElementById('searchTerm') as HTMLInputElement).value = '';
    document.getElementById('searchButton')!.click();

    await vi.waitFor(() => expect(consoleSpy).toHaveBeenCalledWith('No search term entered'));
  });

  it('calls codeAddress with the input value', async () => {
    const codeAddressSpy = vi.spyOn(geolocation, 'codeAddress').mockResolvedValue({
      status: 'error',
      message: 'ZERO_RESULTS',
    });
    setupControl();

    (document.getElementById('searchTerm') as HTMLInputElement).value = 'London';
    document.getElementById('searchButton')!.click();

    await vi.waitFor(() => expect(codeAddressSpy).toHaveBeenCalledWith('London'));
  });

  it('calls setLocationCallback with a LatLng and hides the banner on success', async () => {
    vi.spyOn(geolocation, 'codeAddress').mockResolvedValue({
      status: 'success',
      latitude: 51.5,
      longitude: -0.12,
    });
    const { setLocationCallback } = setupControl();

    (document.getElementById('searchTerm') as HTMLInputElement).value = 'London';
    document.getElementById('searchButton')!.click();

    await vi.waitFor(() => expect(setLocationCallback).toHaveBeenCalledOnce());
    const arg = setLocationCallback.mock.calls[0][0] as MockLatLng;
    expect(arg.lat).toBe(51.5);
    expect(arg.lng).toBe(-0.12);
    expect(document.getElementById('error-banner')!.hasAttribute('hidden')).toBe(true);
  });

  it('shows the error banner when codeAddress returns status error', async () => {
    vi.spyOn(geolocation, 'codeAddress').mockResolvedValue({
      status: 'error',
      message: 'ZERO_RESULTS',
    });
    setupControl();

    (document.getElementById('searchTerm') as HTMLInputElement).value = 'xyznonexistent';
    document.getElementById('searchButton')!.click();

    await vi.waitFor(() =>
      expect(document.getElementById('error-banner')!.hasAttribute('hidden')).toBe(false)
    );
    expect(document.getElementById('error-banner')!.textContent).toContain('xyznonexistent');
  });
});
