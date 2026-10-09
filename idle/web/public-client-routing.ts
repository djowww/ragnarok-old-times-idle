export function getClassicClientPaths(location: Pick<Location, 'hostname' | 'protocol' | 'origin'>) {
  const localHost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const origin = localHost ? `${location.protocol}//${location.hostname}:3338` : location.origin;
  return {
    origin,
    entry: localHost ? `${origin}/` : '/ro/',
    mapViewer: localHost ? `${origin}/applications/pwa/map-idle.html` : '/ro/map-idle.html',
  };
}
