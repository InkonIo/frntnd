// components/ForMap/PolygonAndMarkerLayer.jsx
import React, { useEffect, useCallback } from 'react';
import { Polygon, Popup, Marker } from 'react-leaflet'; // ✅ ДОБАВЛЕН Marker
import * as L from 'leaflet'; // Импортируем Leaflet для работы с иконками

// Создаем кастомную иконку маркера
const customMarkerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

export default function PolygonAndMarkerLayer({ 
  polygons, 
  selectedPolygon, 
  onPolygonSelect, 
  calculateArea, 
  formatArea, 
  flyToMarker, // ✅ ДОБАВЛЕН flyToMarker
  // onPolygonMouseMoveForNdvi, // ✅ УДАЛЕНО: больше не используется для инфо-бокса
}) {
  return (
    <>
      {polygons.map((polygon) => {
        const isSelected = selectedPolygon && selectedPolygon.id === polygon.id; // ✅ Проверяем selectedPolygon.id
        const defaultColor = polygon.color || '#3388ff'; 
        const selectedColor = '#ff0000'; 
        const pathOptions = {
          color: isSelected ? selectedColor : defaultColor,
          fillColor: isSelected ? selectedColor : defaultColor,
          weight: isSelected ? 4 : 2, 
          fillOpacity: 0.2,
        };

        // Вычисляем центр полигона для маркера
        let centerLat = 0;
        let centerLng = 0;
        let numPoints = 0;

        // Обработка как простых массивов координат, так и массивов массивов (для MultiPolygon)
        let coordsToCalculateCenter = polygon.coordinates;
        if (Array.isArray(polygon.coordinates[0]) && Array.isArray(polygon.coordinates[0][0])) {
          // Это MultiPolygon или Polygon с внутренними кольцами, берем только внешнее кольцо первого полигона
          coordsToCalculateCenter = polygon.coordinates[0]; 
        }
        
        if (Array.isArray(coordsToCalculateCenter)) {
            coordsToCalculateCenter.forEach(point => {
                centerLat += point[0];
                centerLng += point[1];
                numPoints++;
            });
        }
        
        const markerPosition = numPoints > 0 ? [centerLat / numPoints, centerLng / numPoints] : [0, 0];


        return (
          <React.Fragment key={polygon.id}>
            <Polygon
              positions={polygon.coordinates}
              pathOptions={pathOptions}
              eventHandlers={{
                click: () => onPolygonSelect(polygon),
                // ✅ УДАЛЕНО: Обработчики движения мыши для NDVI, так как они больше не нужны
                // mousemove: (e) => {
                //   if (onPolygonMouseMoveForNdvi) { 
                //     onPolygonMouseMoveForNdvi(e.latlng.lat, e.latlng.lng, polygon.id);
                //   }
                // },
                // mouseout: () => {
                // }
              }}
            >
              <Popup>
                <div>
                  <strong>Название:</strong> {polygon.name}<br />
                  <strong>Культура:</strong> {polygon.crop || 'Не указана'}<br />
                  <strong>Площадь:</strong> {formatArea(calculateArea(polygon.coordinates))}
                </div>
              </Popup>
            </Polygon>
            {/* ✅ ДОБАВЛЕН МАРКЕР ДЛЯ КАЖДОГО ПОЛИГОНА */}
            <Marker 
              position={markerPosition} 
              icon={customMarkerIcon}
              eventHandlers={{
                click: () => flyToMarker(markerPosition) // ✅ ПРИ НАЖАТИИ НА МАРКЕР - ПРИБЛИЖАЕМСЯ
              }}
            >
              <Popup>
                <div>
                  <strong>Название:</strong> {polygon.name}<br /> 
                  <strong>Площадь:</strong> {formatArea(calculateArea(polygon.coordinates))}<br /> 
                  Нажмите, чтобы приблизить.
                </div>
              </Popup>
            </Marker>
          </React.Fragment>
        );
      })}
    </>
  );
}
