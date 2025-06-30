// components/ForMap/MapComponent.jsx
import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, FeatureGroup, Polygon, useMapEvents, useMap, WMSTileLayer } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

import PolygonAndMarkerLayer from './PolygonAndMarkerLayer';

// Fix for default Leaflet icon paths
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

const INSTANCE_ID = 'f15c44d0-bbb8-4c66-b94e-6a8c7ab39349';

export default function MapComponent({
  polygons,
  onPolygonComplete,
  onPolygonEdited,
  isDrawing,
  setIsDrawing,
  editableFGRef,
  selectedPolygon,
  isEditingMode,
  editingMapPolygon,
  baseApiUrl,
  calculateArea,
  formatArea,
  infoBoxVisible,
  setInfoBoxVisible,
  infoBoxLat,
  setInfoBoxLat,
  infoBoxLng,
  setInfoBoxLng,
  infoBoxNdvi,
  setInfoBoxNdvi,
  infoBoxLoading,
  setInfoBoxLoading,
}) {
  const [activeBaseLayerId, setActiveBaseLayerId] = useState('OSM');

  const mapRef = useRef();
  const [currentPath, setCurrentPath] = useState([]);
  const [hoveredPoint, setHoveredPoint] = useState(null);

  const sentinelLayerOptions = [
    { id: 'OSM', name: 'OpenStreetMap' },
    { id: '1_TRUE_COLOR', name: 'True Color' },
    { id: '2_FALSE_COLOR', name: 'False Color' },
    { id: '3_NDVI', name: 'NDVI' },
    { id: '5-MOISTURE-INDEX1', name: 'Moisture Index' },
    { id: '6-SWIR', name: 'SWIR' },
    { id: '7-NDWI', name: 'NDWI' },
    { id: '8-NDSI', name: 'NDSI' },
    { id: 'SCENE-CLASSIFICATION', name: 'Scene Classification' }
  ];

  const sentinelHubLayerNames = {
    '1_TRUE_COLOR': '1_TRUE_COLOR',
    '2_FALSE_COLOR': '2_FALSE_COLOR',
    '3_NDVI': '3_NDVI',
    '5-MOISTURE-INDEX1': '5-MOISTURE-INDEX1',
    '6-SWIR': '6-SWIR',
    '7-NDWI': '7-NDWI',
    '8-NDSI': '8-NDSI',
    'SCENE-CLASSIFICATION': 'SCENE-CLASSIFICATION',
  };

  useEffect(() => {
    window.clearCurrentPath = () => {
      setCurrentPath([]);
      setIsDrawing(false);
      setHoveredPoint(null);
    };
    return () => {
      window.clearCurrentPath = null;
    };
  }, [setIsDrawing]);

  const isNearFirstPoint = (currentPoint, firstPoint, tolerance = 10) => {
    if (!mapRef.current) return false;
    const map = mapRef.current;
    const p1 = map.latLngToContainerPoint(L.latLng(currentPoint[0], currentPoint[1]));
    const p2 = map.latLngToContainerPoint(L.latLng(firstPoint[0], firstPoint[1]));
    return p1.distanceTo(p2) < tolerance;
  };

  const MapContentAndInteractions = ({
    isDrawing,
    currentPath,
    setCurrentPath,
    setHoveredPoint,
    onPolygonComplete,
    baseApiUrl,
    polygons,
    editableFGRef,
    selectedPolygon,
    isEditingMode,
    editingMapPolygon,
    onEdited,
    onDeleted,
    calculateArea,
    formatArea,
    setInfoBoxVisible,
    setInfoBoxLat,
    setInfoBoxLng,
    setInfoBoxNdvi,
    setInfoBoxLoading,
    infoBoxVisible, // ✅ Добавлен пропс infoBoxVisible
  }) => {
    const map = useMap();
    const editControlRefInternal = useRef();
    const fetchTimeout = useRef(null);

    const flyToMarker = useCallback((center, zoom) => {
      map.flyTo(center, zoom);
    }, [map]);

    useMapEvents({
      mousemove: (e) => {
        if (isDrawing && currentPath.length > 0) {
          setHoveredPoint([e.latlng.lat, e.latlng.lng]);
        }

        if (!isDrawing) {
          const { lat, lng } = e.latlng;

          // ✅ Устанавливаем видимость инфо-бокса только один раз, если он еще не виден.
          // Это предотвращает лишние перерисовки, если он уже visible.
          if (!infoBoxVisible) {
            setInfoBoxVisible(true);
          }

          if (fetchTimeout.current) clearTimeout(fetchTimeout.current);
          fetchTimeout.current = setTimeout(async () => {
            // ✅ ПЕРЕМЕЩЕНО: Обновляем lat/lng ТОЛЬКО здесь, когда запрос NDVI собирается идти.
            // Это уменьшает частоту обновлений состояния.
            setInfoBoxLat(lat.toFixed(5));
            setInfoBoxLng(lng.toFixed(5));

            setInfoBoxLoading(true);
            setInfoBoxNdvi('Загрузка...');
            try {
              const token = localStorage.getItem('token');
              const response = await fetch(`${baseApiUrl}/api/v1/indices/ndvi`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': token ? `Bearer ${token}` : undefined,
                },
                body: JSON.stringify({ lat, lon: lng })
              });

              if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || errorData.message || `Ошибка: ${response.status}`);
              }

              const data = await response.json();
              setInfoBoxNdvi(data.ndvi !== null ? data.ndvi.toFixed(4) : 'Нет данных');
            } catch (error) {
              console.error('Error fetching NDVI:', error);
              setInfoBoxNdvi(`Ошибка: ${error.message ? error.message.substring(0, 50) + (error.message.length > 50 ? '...' : '') : 'Неизвестная ошибка'}`);
            } finally {
              setInfoBoxLoading(false);
            }
          }, 300);
        }
      },

      click: (e) => {
        if (!isDrawing) return;
        const newPoint = [e.latlng.lat, e.latlng.lng];

        if (
          currentPath.length >= 3 &&
          isNearFirstPoint(newPoint, currentPath[0])
        ) {
          onPolygonComplete(currentPath);
          setCurrentPath([]);
          setIsDrawing(false);
          setHoveredPoint(null);
          return;
        }

        setCurrentPath((prev) => [...prev, newPoint]);
      },

      dblclick: (e) => {
        if (!isDrawing || currentPath.length < 3) return;
        onPolygonComplete(currentPath);
        setCurrentPath([]);
        setIsDrawing(false);
        setHoveredPoint(null);
      },

      mouseout: () => {
        setHoveredPoint(null);
        setInfoBoxVisible(false);
        if (fetchTimeout.current) clearTimeout(fetchTimeout.current);
      }
    });

    const displayDrawingPath = hoveredPoint && currentPath.length >= 1
      ? [...currentPath, hoveredPoint]
      : currentPath;

    return (
      <>
        <FeatureGroup ref={editableFGRef}>
          <EditControl
            ref={editControlRefInternal}
            position={null}
            onCreated={() => { }}
            onEdited={onEdited}
            onDeleted={onDeleted}
            draw={{
              polygon: false, rectangle: false, circle: false, marker: false, polyline: false, circlemarker: false,
            }}
            edit={{
              featureGroup: editableFGRef.current,
              edit: isEditingMode ? { selectedPathOptions: {} } : false,
              remove: false,
            }}
          />
          <PolygonAndMarkerLayer
            polygons={polygons.filter(p => !(isEditingMode && editingMapPolygon && editingMapPolygon.id === p.id))}
            calculateArea={calculateArea}
            formatArea={formatArea}
            selectedPolygon={selectedPolygon}
            flyToMarker={flyToMarker}
          />
        </FeatureGroup>

        {isDrawing && currentPath.length > 0 && (
          <Polygon
            positions={displayDrawingPath}
            pathOptions={{
              color: '#2196f3',
              fillOpacity: 0.2,
              dashArray: currentPath.length > 0 ? '5, 5' : null,
              weight: 2
            }}
          />
        )}
      </>
    );
  };

  // ✅ Обертываем MapContentAndInteractions в React.memo для оптимизации.
  // Это предотвратит ненужные перерисовки, если пропсы не изменились.
  const MemoizedMapContentAndInteractions = React.memo(MapContentAndInteractions);


  useEffect(() => {
    const fg = editableFGRef.current;
    if (!fg) return;

    if (isEditingMode && editingMapPolygon) {
      fg.clearLayers();
      const leafletPolygon = L.polygon(editingMapPolygon.coordinates);
      fg.addLayer(leafletPolygon);
      if (leafletPolygon.editing) {
        leafletPolygon.editing.enable();
        if (leafletPolygon.editing._markers) {
          leafletPolygon.editing._markers.forEach(marker => marker.bringToFront());
        }
      }
    } else if (!isEditingMode && fg.getLayers().length > 0) {
      fg.eachLayer(layer => {
        if (layer.editing && layer.editing.enabled()) {
          layer.editing.disable();
        }
      });
      fg.clearLayers();
    }
  }, [isEditingMode, editingMapPolygon, editableFGRef]);

  const onEdited = useCallback((e) => { }, []);
  const onDeleted = useCallback((e) => { }, []);

  return (
    <MapContainer
      center={[43.238949, 76.889709]}
      zoom={13}
      style={{ flexGrow: 1, height: '100vh', width: '100%' }}
      whenCreated={mapInstance => { mapRef.current = mapInstance; }}
    >
      {activeBaseLayerId === 'OSM' ? (
        <TileLayer
          attribution="© OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
      ) : (
        <WMSTileLayer
          attribution="Sentinel Hub"
          url={`${baseApiUrl}/api/v1/indices/wms-proxy/${INSTANCE_ID}`}
          crs={L.CRS.EPSG3857}
          format="image/png"
          version="1.3.0"
          transparent={true}
          params={{
            layers: sentinelHubLayerNames[activeBaseLayerId],
            styles: '',
            time: '2024-05-03/2024-05-30', // ✅ Убедитесь, что используете прошедший диапазон дат!
            maxcc: 20,
          }}
        />
      )}

      {/* ✅ Используем MemoizedMapContentAndInteractions */}
      <MemoizedMapContentAndInteractions
        isDrawing={isDrawing}
        currentPath={currentPath}
        setCurrentPath={setCurrentPath}
        setHoveredPoint={setHoveredPoint}
        onPolygonComplete={onPolygonComplete}
        baseApiUrl={baseApiUrl}
        setInfoBoxLat={setInfoBoxLat}
        setInfoBoxLng={setInfoBoxLng}
        setInfoBoxVisible={setInfoBoxVisible}
        infoBoxVisible={infoBoxVisible} // Передаем состояние
        setInfoBoxLoading={setInfoBoxLoading}
        setInfoBoxNdvi={setInfoBoxNdvi}
        polygons={polygons}
        editableFGRef={editableFGRef}
        selectedPolygon={selectedPolygon}
        isEditingMode={isEditingMode}
        editingMapPolygon={editingMapPolygon}
        onEdited={onEdited}
        onDeleted={onDeleted}
        calculateArea={calculateArea}
        formatArea={formatArea}
      />

      {infoBoxVisible && (
        <div style={{
          position: 'fixed',
          bottom: '16px',
          backgroundColor: '#ffff',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: '9999999',
          pointerEvents: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}>
          <div
            className="flex flex-col items-center space-y-3
                       bg-white/10 rounded-2xl shadow-2xl p-4 backdrop-blur-lg border border-white/20"
            style={{ pointerEvents: 'none' }}
          >
            <div
              className="text-white rounded-xl p-3 flex flex-col items-center justify-center space-y-1 w-full"
            >
              <p className="text-base font-medium">
                Шир: <span className="font-semibold">{infoBoxLat}</span>, Дол: <span className="font-semibold">{infoBoxLng}</span>
              </p>
              <p className="text-base font-medium">NDVI:
                {infoBoxLoading ? (
                  <span className="loader-spin ml-2 h-4 w-4 border-2 border-t-2 border-blue-500 rounded-full inline-block"></span>
                ) : (
                  <span className="font-semibold ml-2">{infoBoxNdvi}</span>
                )}
              </p>
            </div>

            <div className="text-white rounded-xl p-3 flex flex-col items-start w-full">
              <label htmlFor="sentinel-layer-select-control" className="text-sm font-medium mb-2 w-full text-center">
                Выбрать слой карты:
              </label>
              <select
                id="sentinel-layer-select-control"
                value={activeBaseLayerId}
                onChange={(e) => setActiveBaseLayerId(e.target.value)}
                className="bg-white/20 text-white rounded-lg text-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-300 border border-white/30 w-full hover:bg-white/30 transition-colors duration-200"
                style={{ pointerEvents: 'auto' }}
              >
                {sentinelLayerOptions.map(option => (
                  <option
                    key={option.id}
                    value={option.id}
                    className="bg-gray-800 text-white"
                  >
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </MapContainer>
  );
}

