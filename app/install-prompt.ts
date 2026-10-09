'use client';
// Captură singleton a promptului nativ de instalare (beforeinstallprompt): evenimentul
// se declanșează o singură dată, la încărcare — înainte ca secțiunea Despre să fie
// montată — deci boot-ul aplicației îl capturează, iar cardul din Despre îl cere când
// se deschide. Fără prompt (Firefox, Safari ori instalarea deja făcută), cardul rămâne
// cu rutele oneste: instalarea din bara de adresă a Chromium-ului, pachetul semnat
// Android și gestul Safari de mai jos.
type InstallPromptEvent = Event & {prompt: () => Promise<void>; userChoice: Promise<{outcome: 'accepted' | 'dismissed'}>};

let captured: InstallPromptEvent | null = null;
let available = false;
const listeners = new Set<(available: boolean) => void>();

function publish(): void {
  for (const listener of [...listeners]) listener(available);
}

export function captureInstallPrompt(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (event: Event) => {
    event.preventDefault();
    captured = event as InstallPromptEvent;
    available = true;
    publish();
  });
  window.addEventListener('appinstalled', () => {
    captured = null;
    available = false;
    publish();
  });
}

export function subscribeInstallPrompt(listener: (available: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function installPromptAvailable(): boolean {
  return available;
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!captured) return 'unavailable';
  const event = captured;
  captured = null;
  await event.prompt();
  const choice = await event.userChoice;
  if (choice.outcome === 'accepted') {
    available = false;
    publish();
  }
  return choice.outcome;
}
