"use client";

import L from "leaflet";
import { MapContainer, Marker, TileLayer, Tooltip } from "react-leaflet";

import type { MapPointer } from "@/app/ui/modules/map/pointer-catalog";

import "leaflet/dist/leaflet.css";

const pinIcon = L.divIcon({
  className: "tms-map-pin",
  html: `<span class="tms-map-pin-dot"></span>`,
  iconSize: [16, 16],
  iconAnchor: [8, 16],
  tooltipAnchor: [10, -8],
});

type MapCanvasProps = {
  pointers: MapPointer[];
  onRemove: (id: string) => void;
};

export function MapCanvas({ pointers, onRemove }: MapCanvasProps) {
  return (
    <MapContainer
      className="tms-leaflet"
      center={[52.27, -113.81]}
      zoom={9}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {pointers.map((pointer) => (
        <Marker key={pointer.id} position={[pointer.lat, pointer.lng]} icon={pinIcon}>
          <Tooltip permanent interactive direction="right" offset={[14, -6]} className="tms-pin-tooltip">
            <span className="tms-pin-label">{pointer.keyName}</span>
            <button
              type="button"
              className="tms-pin-remove"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onRemove(pointer.id);
              }}
            >
              Remove
            </button>
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
