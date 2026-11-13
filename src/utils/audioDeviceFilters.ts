export function isDeprecatedOpungDriverLabel(label: string): boolean {
  const l = (label || '').toLowerCase();
  return l.includes('opung');
}

export function isVirtualCableLabel(label: string): boolean {
  const l = (label || '').toLowerCase();
  if (isDeprecatedOpungDriverLabel(l)) return false;
  return (
    l.includes('blackhole') ||
    l.includes('vb-cable') ||
    l.includes('cable input') ||
    l.includes('cable output') ||
    l.includes('vb-audio') ||
    l.includes('voicemeeter') ||
    l.includes('soundflower') ||
    l.includes('loopback') ||
    l.includes('existential') ||
    l.includes('virtual')
  );
}

export function isAnyVirtualOrDeprecatedInputLabel(label: string): boolean {
  const l = (label || '').toLowerCase();
  return (
    l.includes('opung') ||
    l.includes('blackhole') ||
    l.includes('vb-cable') ||
    l.includes('cable input') ||
    l.includes('cable output') ||
    l.includes('vb-audio') ||
    l.includes('voicemeeter') ||
    l.includes('soundflower') ||
    l.includes('loopback') ||
    l.includes('existential') ||
    l.includes('virtual') ||
    l.includes('aggregate')
  );
}

export function isPhysicalSpeakerOrEarphoneLabel(label: string): boolean {
  const l = (label || '').toLowerCase();
  if (isAnyVirtualOrDeprecatedInputLabel(l)) return false;
  return (
    l.includes('headphone') ||
    l.includes('earphone') ||
    l.includes('airpods') ||
    l.includes('speaker') ||
    l.includes('built-in') ||
    l.includes('macbook') ||
    l.includes('realtek') ||
    l.includes('high definition audio') ||
    l.includes('hdmi') ||
    l.includes('displayport') ||
    l.includes('bluetooth')
  );
}

export function formatConnectedVirtualMicBadge(label?: string, isWindows = false): string {
  const l = (label || '').toLowerCase();
  if (
    l.includes('cable') ||
    l.includes('vb-audio') ||
    l.includes('vb-cable') ||
    l.includes('voicemeeter') ||
    (!l.includes('blackhole') && isWindows)
  ) {
    return 'Terhubung ke VB-CABLE ✓';
  }
  return 'Terhubung ke BlackHole 2ch ✓';
}
