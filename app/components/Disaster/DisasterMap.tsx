"use client";

import React, { useRef, useEffect } from 'react';
import L, { LatLngBoundsExpression, Rectangle as LeafletRectangle } from 'leaflet';
import { MapContainer, TileLayer, Rectangle, Popup, Tooltip, useMap, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import type { DisasterData } from '../../types/disasters';
import { Hospital } from '../../types/hospital';

interface DisasterMapProps {
  disasters: DisasterData[];
  
  hospitals?: Hospital[];
  center: [number, number];
  zoom: number;
  onDisasterClick?: (disasterId: string) => void; // Callback for when a disaster shape is clicked
  selectedDisasterId?: string | null;             // ID of the currently selected disaster for highlighting 
  reloadDisasters?: () => void;
  isLoadingDisasters?: boolean; 
  showHospitals?: boolean;
  onToggleHospitals?: () => void;
}

// Helper function to determine rectangle style based on severity/type
const getDisasterStyle = (
  disaster: DisasterData,
  isSelected: boolean
): L.PathOptions => {
  let color: string;
  let weight = isSelected ? 3 : 1.5; // Thicker border if selected
  let fillOpacity = isSelected ? 0.4 : 0.2; // More opaque fill if selected

  // Base color on DisasterType
  switch (disaster.DisasterType) {
    case 'wildfire': color = '#DC2626'; break; // Red
    case 'hurricane': color = '#2563EB'; break; // Blue
    case 'earthquake': color = '#A16207'; break; // Brown/Yellow
    default: color = '#6B7280'; break; // Gray fallback
  }

  switch (disaster.Severity) {
    case 'critical': fillOpacity += 0.1; break;
    case 'high': fillOpacity += 0.05; break;
  }

  return {
    color: color,       // Border color
    fillColor: color,   // Fill color
    weight: weight,
    fillOpacity: Math.min(fillOpacity, 0.8), // Cap opacity
  };
};

// --- Map Component Internal Logic ---
// This component uses hooks that must be children of MapContainer
function MapEventsController({ selectedDisasterId, rectangleRefs, onDisasterClick }: {
  selectedDisasterId: string | null; // Expects null or string
  rectangleRefs: React.RefObject<Map<string, LeafletRectangle | null>>;
  onDisasterClick?: (disasterId: string) => void;
}) {
  const map = useMap();

  useEffect(() => {
    // Handle map clicks to unselect disasters
    const handleMapClick = (e: L.LeafletMouseEvent) => {
      // Get the clicked element and its parents
      const target = e.originalEvent.target as HTMLElement;
      
      // Check if click was on any interactive element
      const isInteractiveElement = 
        target.closest('.leaflet-popup') || // Any popup
        target.closest('button') || // Any button
        target.closest('.leaflet-marker-pane'); // Any marker
      
      // Only unselect if clicking on the map itself (not any interactive elements)
      if (!isInteractiveElement && onDisasterClick) {
        onDisasterClick('');
      }
    };

    map.on('click', handleMapClick);

    return () => {
      map.off('click', handleMapClick);
    };
  }, [map, onDisasterClick]);

  useEffect(() => {
    // Check if refs object and selected ID exist
    if (!rectangleRefs.current) return;

    if (!selectedDisasterId) {
      rectangleRefs.current.forEach(rectangle => {
        rectangle?.closePopup();
      });
      return;
    }

    if (selectedDisasterId && rectangleRefs.current) {
      const rectangleLayer = rectangleRefs.current.get(selectedDisasterId);
      if (rectangleLayer) {
        const bounds = rectangleLayer.getBounds();
        if (bounds.isValid()) {
          // TODO: find good zoom level
          map.flyToBounds(bounds, {
            padding: [50, 50],
            maxZoom: 8
          });

          if (rectangleLayer.getPopup()) {
            // Use a slight delay or wait for moveend event for smoother popup opening
            const openPopupOnEnd = () => {
              if (rectangleLayer.getPopup() && map.getBounds().contains(bounds.getCenter())) {
                rectangleLayer.openPopup();
              }
              map.off('moveend', openPopupOnEnd);
            };
            map.once('moveend', openPopupOnEnd);
          } else {
            console.warn(`Rectangle for ${selectedDisasterId} found, but it has no popup.`);
          }
        } else {
          console.warn(`Invalid bounds for selected disaster ${selectedDisasterId}`);
        }
      } else {
        console.warn(`Rectangle ref not found for selected ID: ${selectedDisasterId}`);
      }
    }
  }, [selectedDisasterId, map, rectangleRefs]);

  return null;
}
const hospitalMarkerOptions: L.PathOptions = {
  fillColor: "#8b5cf6", // Purple
  color: "#5b21b6",     // Darker Purple border
  weight: 1,
  opacity: 1,
  fillOpacity: 0.7
};

const DisasterMap: React.FC<DisasterMapProps> = ({
  disasters,
  hospitals = [],
  center,
  zoom,
  onDisasterClick,
  selectedDisasterId,
  reloadDisasters,
  isLoadingDisasters,
  showHospitals = false,
  onToggleHospitals,
}) => {
  // Ref to store mapping from disaster ID to Leaflet Rectangle layer instance
  const rectangleRefs = useRef<Map<string, LeafletRectangle | null>>(new Map());

  React.useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png').default,
      iconUrl: require('leaflet/dist/images/marker-icon.png').default,
      shadowUrl: require('leaflet/dist/images/marker-shadow.png').default,
    });
  }, []);

  const tileUrlCarto = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
  const attributionCarto = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      minZoom={4}
      scrollWheelZoom={false}
      dragging={true}
      zoomControl={true}
      doubleClickZoom={false}
      maxBounds={[[15.0, -170.0], [60.0, -50.0]]} // Extended bounds to include more of North America
      maxBoundsViscosity={1.0} // Prevents dragging outside these bounds
      style={{ height: '100%', width: '100%', zIndex: 0 }}
      className="rounded-lg"
    >
      <TileLayer url={tileUrlCarto} attribution={attributionCarto} />

      {/* Reload button at top right */}
      {reloadDisasters && (
        <div
          style={{
            position: "absolute",
            top: "10px",
            right: "10px",
            zIndex: 1000,
          }}
        >
          <button
            onClick={reloadDisasters}
            disabled={isLoadingDisasters}
            className="bg-miko-pink-dark hover:bg-miko-pink-light text-white text-sm font-semibold px-3 py-1 rounded shadow transition duration-200 disabled:opacity-50"
          >
            {isLoadingDisasters ? "Reloading..." : "⟳ Reload"}
          </button>
        </div>
      )}

      {/* Hospital toggle button */}
      {onToggleHospitals && (
        <div
          style={{
            position: "absolute",
            bottom: "40px", // Position above attribution
            right: "10px",
            zIndex: 1000,
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleHospitals();
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            className={`text-sm font-semibold px-3 py-1 rounded shadow transition duration-200 ${
              showHospitals 
                ? 'bg-miko-pink-dark text-white hover:bg-miko-pink' 
                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
            }`}
          >
            🏥 Hospitals
          </button>
        </div>
      )}

      {/* Component to handle map events based on props */}
      <MapEventsController
        selectedDisasterId={selectedDisasterId ?? null}
        rectangleRefs={rectangleRefs}
        onDisasterClick={onDisasterClick}
      />

      {disasters.map((disaster) => {
        // Validate bounding box data
        if (
          !disaster.BoundingBox ||
          typeof disaster.BoundingBox.MinLat !== 'number' ||
          typeof disaster.BoundingBox.MaxLat !== 'number' ||
          typeof disaster.BoundingBox.MinLon !== 'number' ||
          typeof disaster.BoundingBox.MaxLon !== 'number'
        ) {
          console.warn(`Invalid BoundingBox for disaster: ${disaster.ID}`, disaster);
          return null; // Skip rendering this disaster
        }

        // Create bounds for the Rectangle component
        const bounds: LatLngBoundsExpression = [
          [disaster.BoundingBox.MinLat, disaster.BoundingBox.MinLon],
          [disaster.BoundingBox.MaxLat, disaster.BoundingBox.MaxLon],
        ];

        const isSelected = disaster.ID === selectedDisasterId;
        const style = getDisasterStyle(disaster, isSelected);

        return (
          <Rectangle
            key={disaster.ID}
            bounds={bounds}
            pathOptions={style}
            ref={(el: LeafletRectangle | null) => {
              if (rectangleRefs.current) {
                if (el) {
                  rectangleRefs.current.set(disaster.ID, el);
                } else {
                  rectangleRefs.current.delete(disaster.ID);
                }
              }
            }}
            eventHandlers={{
              click: () => {
                console.log(`Disaster clicked: ${disaster.ID}`);
                if (onDisasterClick) {
                  onDisasterClick(disaster.ID);
                }
              },
              dblclick: (e) => {
                e.originalEvent.stopPropagation();
                e.originalEvent.preventDefault();
              }
            }}
          >
            <Popup
              eventHandlers={{
                remove: () => {
                  // Only unselect if the popup was closed by clicking the X button
                  const popupCloseButton = document.querySelector('.leaflet-popup-close-button');
                  if (popupCloseButton?.contains(document.activeElement) && onDisasterClick) {
                    onDisasterClick('');
                  }
                }
              }}
            >
              <b>{disaster.DisasterType.toUpperCase()}</b> ({disaster.Severity || 'N/A'})<br />
              Status: {disaster.Status || 'N/A'}<br />
              Locations: {disaster.LocationCount}<br />
              Skeets: {disaster.TotalSkeetsAmount}<br />
              Sentiment: {disaster.ClusterSentiment?.toFixed(2) ?? 'N/A'}<br />
              <hr className="my-1" />
              <i>{disaster.Summary || 'No summary available.'}</i>
            </Popup>

            <Tooltip>
              {disaster.DisasterType.toUpperCase()} - Severity: {disaster.Severity || 'N/A'}
            </Tooltip>
          </Rectangle>
        );
      })}

      {/* Show hospitals when toggle is on, regardless of disaster selection */}
      {showHospitals && hospitals.map((hospital, index) => {
        if (typeof hospital.lat !== 'number' || typeof hospital.lon !== 'number') {
          console.warn(`Hospital ${hospital.name} missing parsed coordinates.`);
          return null;
        }
        const hospitalKey = `${hospital.name}-${hospital.zipcode || index}`;

        return (
          <CircleMarker
            key={hospitalKey}
            center={[hospital.lat, hospital.lon]}
            radius={7}
            pathOptions={hospitalMarkerOptions}
          >
            <Popup>
              <b>{hospital.name}</b><br />
              {hospital.address || ''}{hospital.city ? `, ${hospital.city}` : ''}, {hospital.state || ''} {hospital.zipcode || ''}<br />
              Type: {hospital.care_type || 'N/A'}<br />
              Phone: {hospital.phone_number || 'N/A'}
            </Popup>
            <Tooltip>{hospital.name}</Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
};

export default DisasterMap;
