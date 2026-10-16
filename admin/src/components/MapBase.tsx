import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer } from 'react-leaflet';
import type { ReactNode } from 'react';
import { config } from '@/config';

/** Map with the configured tile provider (isolated in config — the map provider is still [CONFIRM]). */
export function MapBase({
  children,
  height = 520,
  center = config.map.center,
  zoom = config.map.zoom,
}: {
  children?: ReactNode;
  height?: number | string;
  center?: [number, number];
  zoom?: number;
}) {
  return (
    <MapContainer center={center} zoom={zoom} style={{ height, width: '100%', borderRadius: 8 }} scrollWheelZoom>
      <TileLayer url={config.map.tileUrl} attribution={config.map.attribution} />
      {children}
    </MapContainer>
  );
}
