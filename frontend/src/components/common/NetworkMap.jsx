import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Leaflet's default marker images break under bundlers; point them at the
// imported assets so pins actually render.
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

// Manila fallback if no NAP has coordinates yet.
const DEFAULT_CENTER = [14.5995, 120.9842];

// Re-measures the map once its container has its real size. Covers the flex/grid
// height settling a frame late (gray card map) and the modal animating in from a
// smaller size, plus any later resize (sider collapse, window resize).
const InvalidateSize = () => {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const t = setTimeout(() => map.invalidateSize(), 200);

    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());

    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
  }, [map]);
  return null;
}

/**
 * A Leaflet map that plots NAPs by their GPS coordinates.
 *
 * @param {object} props
 * @param {Array<{id:number,label:string,total_ports:number,gps_lat:number,gps_lng:number}>} props.naps
 * @param {number} [props.zoom=13]
 */
const NetworkMap = ({ naps = [], zoom = 13 }) => {
  const markers = naps.filter((n) => n.gps_lat != null && n.gps_lng != null);
  const center = markers.length
    ? [Number(markers[0].gps_lat), Number(markers[0].gps_lng)]
    : DEFAULT_CENTER;

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom
    >
      <InvalidateSize />
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={20}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />
      {markers.map((n) => (
        <Marker key={n.id} position={[Number(n.gps_lat), Number(n.gps_lng)]}>
          <Popup>
            <div className="text-sm">
              <div className="font-semibold">{n.label}</div>
              <div>Ports: {n.total_ports}</div>
              <div className="text-gray-500">
                {Number(n.gps_lat).toFixed(5)}, {Number(n.gps_lng).toFixed(5)}
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
};

export default NetworkMap;
