// components/ForMap/MapComponent.jsx
import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, FeatureGroup, Polygon, useMapEvents, useMap, WMSTileLayer, ImageOverlay } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

import PolygonAndMarkerLayer from './PolygonAndMarkerLayer';

// Исправление для путей иконок Leaflet по умолчанию
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

const INSTANCE_ID = 'f15c44d0-bbb8-4c66-b94e-6a8c4ab39349'; // Убедитесь, что это ваш реальный Instance ID

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
  onPolygonSelect,
}) {
  const [activeBaseLayerId, setActiveBaseLayerId] = useState('OSM');

  const mapRef = useRef();
  const [currentPath, setCurrentPath] = useState([]);
  const [hoveredPoint, setHoveredPoint] = useState(null);

  const [maskedNdviImageUrl, setMaskedNdviImageUrl] = useState(null);
  const [maskedNdviImageBounds, setMaskedNdviImageBounds] = useState(null);
  const [maskedNdviImageLoading, setMaskedNdviImageLoading] = useState(false);

  const sentinelLayerOptions = [
    { id: 'OSM', name: 'OpenStreetMap' },
    { id: '1_TRUE_COLOR', name: 'Истинный цвет' },
    { id: '2_FALSE_COLOR', name: 'Ложный цвет' },
    { id: '3_NDVI', name: 'NDVI (в полигоне)' },
    { id: '5-MOISTURE-INDEX1', name: 'Индекс влажности' },
    { id: '6-SWIR', name: 'SWIR' },
    { id: '7-NDWI', name: 'NDWI' },
    { id: '8-NDSI', name: 'NDSI' },
    { id: 'SCENE-CLASSIFICATION', name: 'Классификация сцен' }
  ];

  const sentinelHubLayerNames = {
    '1_TRUE_COLOR': '1_TRUE_COLOR',
    '2_FALSE_COLOR': '2_FALSE_COLOR',
    '5-MOISTURE-INDEX1': '5-MOISTURE-INDEX1',
    '6-SWIR': '6-SWIR',
    '7-NDWI': '7_NDWI',
    '8-NDSI': '8_NDSI',
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
    infoBoxVisible,
    onPolygonSelect,
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

          if (!infoBoxVisible) {
            setInfoBoxVisible(true);
          }

          if (fetchTimeout.current) clearTimeout(fetchTimeout.current);
          fetchTimeout.current = setTimeout(async () => {
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
              console.error('Ошибка при получении NDVI для координат:', error);
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
            onPolygonSelect={onPolygonSelect}
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

  useEffect(() => {
    const fetchMaskedNdvi = async (polygonId, coordinates) => {
      setMaskedNdviImageLoading(true);
      setMaskedNdviImageUrl(null);
      setMaskedNdviImageBounds(null);

      console.log('Попытка загрузить маскированное NDVI для:', { polygonId, coordinates });

      if (!polygonId ||
          !coordinates ||
          !Array.isArray(coordinates) ||
          coordinates.length === 0 ||
          !coordinates.every(point => Array.isArray(point) && point.length === 2 && typeof point[0] === 'number' && typeof point[1] === 'number')) {
        console.log("Отмена запроса NDVI: ID полигона отсутствует или координаты имеют неверную структуру.");
        setMaskedNdviImageLoading(false);
        return;
      }

      try {
        const token = localStorage.getItem('token');
        console.log(`Отправка запроса на ${baseApiUrl}/api/v1/indices/ndvi-masked/${polygonId}`);
        const response = await fetch(`${baseApiUrl}/api/v1/indices/ndvi-masked/${polygonId}`, {
          headers: {
            'Authorization': token ? `Bearer ${token}` : undefined,
          },
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Не удалось прочитать тело ошибки');
          throw new Error(`Ошибка HTTP! Статус: ${response.status}. Ответ: ${errorText.substring(0, 200)}`);
        }

        const blob = await response.blob();
        const imageUrl = URL.createObjectURL(blob);
        console.log('Изображение NDVI получено как Blob, создан URL:', imageUrl);

        const leafletPolygon = L.polygon(coordinates);
        const bounds = leafletPolygon.getBounds().toBBoxString().split(',').map(Number);
        const imageBounds = [[bounds[1], bounds[0]], [bounds[3], bounds[2]]];
        // ✅ НОВОЕ ЛОГИРОВАНИЕ: Более подробный вывод границ
        console.log('Границы изображения (bounds):', imageBounds);


        setMaskedNdviImageUrl(imageUrl);
        setMaskedNdviImageBounds(imageBounds);
        console.log('Маскированное NDVI изображение загружено и установлены границы:', imageBounds);

      } catch (error) {
        console.error('Ошибка при получении маскированного NDVI изображения:', error);
        setMaskedNdviImageUrl(null);
        setMaskedNdviImageBounds(null);
      } finally {
        setMaskedNdviImageLoading(false);
      }
    };

    const currentActivePolygon = selectedPolygon || (isEditingMode ? editingMapPolygon : null);

    console.log('Текущий активный слой:', activeBaseLayerId);
    console.log('Текущий активный полигон ID:', currentActivePolygon ? currentActivePolygon.id : 'нет');
    console.log('Текущие координаты полигона:', currentActivePolygon ? currentActivePolygon.coordinates : 'нет');

    if (activeBaseLayerId === '3_NDVI' && currentActivePolygon && currentActivePolygon.id && currentActivePolygon.coordinates) {
      fetchMaskedNdvi(currentActivePolygon.id, currentActivePolygon.coordinates);
    } else {
      if (maskedNdviImageUrl) {
        URL.revokeObjectURL(maskedNdviImageUrl);
      }
      setMaskedNdviImageUrl(null);
      setMaskedNdviImageBounds(null);
    }

    return () => {
      if (maskedNdviImageUrl) {
        URL.revokeObjectURL(maskedNdviImageUrl);
      }
    };
  }, [activeBaseLayerId, selectedPolygon, isEditingMode, editingMapPolygon, baseApiUrl]);

  const onEdited = useCallback((e) => {
  }, [onPolygonEdited]);

  const onDeleted = useCallback((e) => {
  }, []);

  return (
    <MapContainer
      center={[43.238949, 76.889709]}
      zoom={13}
      style={{ flexGrow: 1, height: '100vh', width: '100%' }}
      whenCreated={mapInstance => { mapRef.current = mapInstance; }}
    >
      {/* Всегда отображаем OpenStreetMap как базовый слой */}
      <TileLayer
        attribution="© OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* ✅ ОТОБРАЖЕНИЕ МАСКИРОВАННОГО ИЗОБРАЖЕНИЯ NDVI */}
      {activeBaseLayerId === '3_NDVI' && maskedNdviImageUrl && maskedNdviImageBounds && (
        <ImageOverlay
          url={maskedNdviImageUrl}
          bounds={maskedNdviImageBounds}
          opacity={0.7}
          zIndex={5} // ✅ ДОБАВЛЕНО: Устанавливаем z-index для отображения поверх базовой карты
        />
      )}
      {/* Индикатор загрузки для маскированного изображения */}
      {activeBaseLayerId === '3_NDVI' && maskedNdviImageLoading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1000,
          backgroundColor: 'rgba(0,0,0,0.5)',
          color: 'white',
          padding: '15px 30px',
          borderRadius: '8px',
          boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px'
        }}>
          <span className="loader-spin h-6 w-6 border-4 border-t-4 border-white-500 rounded-full inline-block"></span>
          Загрузка NDVI изображения...
        </div>
      )}

      {/* Условное отображение для других слоев Sentinel Hub (которые не маскируются на фронтенде) */}
      {activeBaseLayerId !== 'OSM' && activeBaseLayerId !== '3_NDVI' && (
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
            time: '2024-05-03/2024-05-30',
            maxcc: 20,
          }}
        />
      )}

      {/* Основное содержимое карты и интеракции (полигоны, маркеры, рисование) */}
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
        infoBoxVisible={infoBoxVisible}
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
        onPolygonSelect={onPolygonSelect}
      />

      {/* Инфо-бокс с координатами и NDVI точки */}
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
