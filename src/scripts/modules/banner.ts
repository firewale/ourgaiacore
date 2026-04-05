let dismissTimer: ReturnType<typeof setTimeout> | undefined;

export function showBanner(message: string, durationMs: number = 5000): void {
  const banner = document.getElementById('error-banner') as HTMLElement;
  banner.textContent = message;
  banner.removeAttribute('hidden');
  clearTimeout(dismissTimer);
  dismissTimer = setTimeout(hideBanner, durationMs);
}

export function hideBanner(): void {
  const banner = document.getElementById('error-banner') as HTMLElement;
  banner.setAttribute('hidden', '');
  clearTimeout(dismissTimer);
}
