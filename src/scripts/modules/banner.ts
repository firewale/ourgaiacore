let dismissTimer: ReturnType<typeof setTimeout> | undefined;

export function showBanner(message: string, durationMs: number = 5000): void {
  const banner = document.getElementById('error-banner') as HTMLElement;

  const text = document.createElement('span');
  text.className = 'error-banner__text';
  text.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'error-banner__close';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', 'Dismiss');
  closeBtn.addEventListener('click', hideBanner);

  banner.replaceChildren(text, closeBtn);
  banner.removeAttribute('hidden');
  clearTimeout(dismissTimer);
  dismissTimer = setTimeout(hideBanner, durationMs);
}

export function hideBanner(): void {
  const banner = document.getElementById('error-banner') as HTMLElement;
  banner.setAttribute('hidden', '');
  clearTimeout(dismissTimer);
}
