import { TileLayer } from 'react-leaflet';

const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

export function OfflineTileLayer() {
  return (
    <TileLayer
      url={OSM_TILE_URL}
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    />
  );
}
