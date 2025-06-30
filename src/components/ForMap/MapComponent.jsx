// components/ForMap/MapComponent.jsx
import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, FeatureGroup, Polygon, useMapEvents, useMap, WMSTileLayer, ImageOverlay } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

import PolygonAndMarkerLayer from './PolygonAndMarkerLayer';
import DrawingHandler from './DrawingHandler'; // Импорт DrawingHandler

// Исправление для путей иконок Leaflet по умолчанию
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// ОБНОВИТЕ ЭТОТ ID на ваш реальный Instance ID из Sentinel Hub Dashboard
const INSTANCE_ID = 'f15c44d0-bbb8-4c66-b94e-6a8c7ab39349'; 

// Выносим sentinelLayerOptions за пределы компонента
const SENTINEL_LAYER_OPTIONS = [
  { id: '1_TRUE_COLOR', sentinelId: '1_TRUE_COLOR', name: 'Истинный цвет (базовый)' }, // Базовый фон
  { id: 'OSM', name: 'OpenStreetMap (базовый)' },

  { id: '3_NDVI', sentinelId: 'NDVI', name: 'NDVI', type: 'masked_overlay' },
  { id: '2_FALSE_COLOR', sentinelId: '2_FALSE_COLOR', name: 'Ложный цвет', type: 'masked_overlay' },
  { id: '4-FALSE-COLOR-URBAN', sentinelId: 'FALSE-COLOR-URBAN', name: 'Ложный цвет (городской)', type: 'masked_overlay' },
  { id: '5-MOISTURE-INDEX1', sentinelId: 'MOISTURE-INDEX1', name: 'Индекс влажности', type: 'masked_overlay' },
  { id: '6-SWIR', sentinelId: 'SWIR', name: 'SWIR', type: 'masked_overlay' },
  { id: '7-NDWI', sentinelId: 'NDWI', name: 'NDWI', type: 'masked_overlay' },
  { id: '8-NDSI', sentinelId: 'NDSI', name: 'NDSI', type: 'masked_overlay' },
  { id: 'SCENE-CLASSIFICATION', sentinelId: 'SCENE-CLASSIFICATION', name: 'Классификация сцен', type: 'masked_overlay' },
];

// --- Утилита для Debounce (для функций, которые не должны вызываться слишком часто) ---
const debounce = (func, delay) => {
  let timeout;
  const debounced = function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), delay);
  };
  debounced.cancel = () => {
    clearTimeout(timeout);
  };
  return debounced;
};

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
  onPolygonSelect,
  activeBaseLayerId, 
  setActiveBaseLayerId, 
  // УДАЛЕНО: Пропсы для управления инфо-боксом и NDVI
  // onMapMouseMove, 
  // onPolygonMouseMoveForNdvi, 
}) {
  const mapRef = useRef();

  const [maskedOverlayImageUrl, setMaskedOverlayImageUrl] = useState(null); 
  const [maskedOverlayImageBounds, setMaskedOverlayImageBounds] = useState(null); 
  const [maskedOverlayImageLoading, setMaskedOverlayImageLoading] = useState(false); 

  const fetchControllerRef = useRef(null);

  const currentLayerOptions = useMemo(() => {
    return SENTINEL_LAYER_OPTIONS.find(opt => opt.id === activeBaseLayerId);
  }, [activeBaseLayerId]);

  useEffect(() => {
    return () => {
      // Cleanup, если необходимо
    };
  }, []); 

  const MapContentAndInteractions = React.memo(({
    isDrawing,
    onPolygonComplete,
    polygons,
    editableFGRef,
    selectedPolygon,
    isEditingMode,
    editingMapPolygon,
    onEdited,
    onDeleted,
    calculateArea,
    formatArea,
    onPolygonSelect,
    setIsDrawing, 
    // УДАЛЕНО: Пропсы для управления инфо-боксом и NDVI
    // onMapMouseMove, 
    // onPolygonMouseMoveForNdvi, 
  }) => {
    const map = useMap();
    const editControlRefInternal = useRef();
    
    const flyToMarker = useCallback((center, zoom = 16) => { 
      map.flyTo(center, zoom);
    }, [map]);

    // УДАЛЕНО: ОБРАБОТЧИКИ СОБЫТИЙ КАРТЫ ДЛЯ ИНФО-БОКСА
    // useMapEvents({
    //   mousemove: (e) => {
    //     onMapMouseMove(e.latlng.lat, e.latlng.lng); 
    //   },
    //   mouseout: () => {
    //   }
    // });

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
            // УДАЛЕНО: Пропсы для управления инфо-боксом и NDVI
            // onPolygonMouseMoveForNdvi={onPolygonMouseMoveForNdvi} 
          />
        </FeatureGroup>

        {/* РЕНДЕРИНГ DrawingHandler */}
        <DrawingHandler
          isDrawing={isDrawing}
          setIsDrawing={setIsDrawing}
          onPolygonComplete={onPolygonComplete}
        />
      </>
    );
  }); 

  const debouncedFetchMaskedOverlayImage = useMemo(() => debounce(async (polygon, layerId) => { 
    if (fetchControllerRef.current) {
        fetchControllerRef.current.abort();
    }
    fetchControllerRef.current = new AbortController();
    const signal = fetchControllerRef.current.signal;

    setMaskedOverlayImageLoading(true);
    setMaskedOverlayImageUrl(null);
    setMaskedOverlayImageBounds(null);

    if (!polygon || !polygon.id || !polygon.coordinates || !Array.isArray(polygon.coordinates) || polygon.coordinates.length === 0 || !polygon.coordinates.every(point => Array.isArray(point) && point.length === 2 && typeof point[0] === 'number' && typeof point[1] === 'number')) {
      setMaskedOverlayImageLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${baseApiUrl}/api/v1/indices/masked-index/${polygon.id}/${layerId}`, { 
        headers: {
          'Authorization': token ? `Bearer ${token}` : undefined,
        },
        signal: signal 
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => ({}));
        if (signal.aborted) {
            return;
        }
        throw new Error(`Ошибка HTTP! Статус: ${response.status}. Ответ: ${errorText.substring(0, 200)}`);
      }

      const blob = await response.blob();
      const imageUrl = URL.createObjectURL(blob);

      const leafletPolygon = L.polygon(polygon.coordinates); 
      const bounds = leafletPolygon.getBounds().toBBoxString().split(',').map(Number);
      const imageBounds = [[bounds[1], bounds[0]], [bounds[3], bounds[2]]];

      setMaskedOverlayImageUrl(imageUrl);
      setMaskedOverlayImageBounds(imageBounds);

    } catch (error) {
      if (error.name === 'AbortError') {
          return;
      }
      console.error(`Ошибка при получении маскированного изображения слоя "${layerId}":`, error);
      setMaskedOverlayImageUrl(null);
      setMaskedOverlayImageBounds(null);
    } finally {
      if (!signal.aborted) { 
          setMaskedOverlayImageLoading(false);
      }
    }
  }, 500), [baseApiUrl]); 

  useEffect(() => {
    const currentActivePolygon = selectedPolygon || (isEditingMode ? editingMapPolygon : null);
    const activeLayerType = currentLayerOptions ? currentLayerOptions.type : '';

    if (activeLayerType === 'masked_overlay' && currentActivePolygon && currentActivePolygon.id && currentActivePolygon.coordinates) {
        debouncedFetchMaskedOverlayImage(currentActivePolygon, activeBaseLayerId); 
    } else {
        if (maskedOverlayImageUrl) {
            URL.revokeObjectURL(maskedOverlayImageUrl);
        }
        setMaskedOverlayImageUrl(null);
        setMaskedOverlayImageBounds(null);
        debouncedFetchMaskedOverlayImage.cancel();
    }

    return () => {
        if (fetchControllerRef.current) {
            fetchControllerRef.current.abort(); 
        }
        if (maskedOverlayImageUrl) {
            URL.revokeObjectURL(maskedOverlayImageUrl);
        }
        debouncedFetchMaskedOverlayImage.cancel();
    };
  }, [activeBaseLayerId, selectedPolygon?.id, editingMapPolygon?.id, currentLayerOptions, debouncedFetchMaskedOverlayImage, selectedPolygon, editingMapPolygon]); 

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
      {/* БАЗОВЫЙ СЛОЙ - Всегда "Истинный цвет" или OpenStreetMap */}
      {activeBaseLayerId === 'OSM' ? (
        <TileLayer
          attribution="© OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          zIndex={1} 
        />
      ) : (
        <WMSTileLayer
          attribution="Sentinel Hub"
          url={`${baseApiUrl}/api/v1/indices/wms-proxy/${INSTANCE_ID}`}
          crs={L.CRS.EPSG3857}
          format="image/png"
          version="1.3.0"
          transparent={false} 
          params={{
            layers: '1_TRUE_COLOR', 
            styles: '',
            time: '2023-06-01/2024-06-30', 
            maxcc: 80, 
          }}
          zIndex={1} 
        />
      )}

      {/* ОВЕРЛЕЙ СЛОЙ - Маскированное изображение выбранного индекса (в полигоне) */}
      {currentLayerOptions && currentLayerOptions.type === 'masked_overlay' && selectedPolygon && selectedPolygon.id && maskedOverlayImageUrl && maskedOverlayImageBounds && (
        <ImageOverlay
          url={maskedOverlayImageUrl}
          bounds={maskedOverlayImageBounds}
          opacity={0.7} 
          zIndex={5} 
        />
      )}
      {/* Индикатор загрузки для маскированного оверлей слоя */}
      {currentLayerOptions && currentLayerOptions.type === 'masked_overlay' && maskedOverlayImageLoading && (
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
          Загрузка изображения слоя "{currentLayerOptions.name}"...
        </div>
      )}
      {/* MapContentAndInteractions теперь принимает setIsDrawing */}
      <MapContentAndInteractions
        isDrawing={isDrawing}
        onPolygonComplete={onPolygonComplete}
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
        setIsDrawing={setIsDrawing} 
        // УДАЛЕНО: Пропсы для управления инфо-боксом и NDVI
        // onMapMouseMove={onMapMouseMove} 
        // onPolygonMouseMoveForNdvi={onPolygonMouseMoveForNdvi} 
      />
    </MapContainer>
  );
}
