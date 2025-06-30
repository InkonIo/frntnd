// components/ForMap/PolygonAndMarkerLayer.jsx
import React, { useEffect, useCallback } from 'react';
import { Polygon, Popup } from 'react-leaflet';

export default function PolygonAndMarkerLayer({ 
  polygons, 
  selectedPolygon, 
  onPolygonSelect, 
  calculateArea, 
  formatArea, 
  flyToMarker,
  // НОВЫЕ ПРОПСЫ: для управления инфо-боксом и NDVI
  onPolygonMouseMoveForNdvi, 
  onPolygonMouseOutForNdvi, 
}) {
  return (
    <>
      {polygons.map((polygon) => {
        const isSelected = selectedPolygon && selectedPolygon.id === polygon.id;
        const defaultColor = polygon.color || '#3388ff'; 
        const selectedColor = '#ff0000'; 
        const pathOptions = {
          color: isSelected ? selectedColor : defaultColor,
          fillColor: isSelected ? selectedColor : defaultColor,
          weight: isSelected ? 4 : 2, 
          fillOpacity: 0.2,
        };

        return (
          <Polygon
            key={polygon.id}
            positions={polygon.coordinates}
            pathOptions={pathOptions}
            eventHandlers={{
              click: () => onPolygonSelect(polygon),
              // ОБНОВЛЕНО: Обработчики движения мыши для NDVI
              mousemove: (e) => {
                // Отправляем координаты и ID полигона для запроса NDVI
                onPolygonMouseMoveForNdvi(e.latlng.lat, e.latlng.lng, polygon.id); // Передаем полные числа
              },
              mouseout: () => {
                // При уходе мыши с полигона сбрасываем состояние NDVI в инфо-боксе
                onPolygonMouseOutForNdvi();
              }
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
        );
      })}
    </>
  );
}
