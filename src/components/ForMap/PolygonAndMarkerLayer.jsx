// components/ForMap/PolygonAndMarkerLayer.jsx
import React from 'react';
import { Polygon, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

export default function PolygonAndMarkerLayer({ polygons, calculateArea, formatArea, selectedPolygon, flyToMarker, onPolygonSelect }) { // ✅ Добавлен onPolygonSelect
  // Marker icon for the center of polygons
  const polygonCenterIcon = new L.Icon({
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png', // Default marker
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
    shadowSize: [41, 41]
  });

  return (
    <>
      {polygons.map((polygon) => {
        // Убедитесь, что selectedPolygon содержит объект полигона, а не только ID
        // Если selectedPolygon - это только ID, то строка `selectedPolygon?.id` будет корректна.
        // Если selectedPolygon - это весь объект полигона, то `selectedPolygon.id` будет работать.
        const isSelected = selectedPolygon && selectedPolygon.id === polygon.id; // ✅ Уточняем проверку выбора

        // Leaflet polygon options
        const polygonOptions = {
          color: isSelected ? '#ff0000' : polygon.color, // Красный, если выделен
          fillOpacity: 0.1, // Adjusted for better visibility when not selected, can be 0 if fully transparent is desired
          weight: isSelected ? 6 : 4, // <-- Толще граница: 6 для выделенного, 4 для остальных
          opacity: 1,
          lineJoin: 'round',
        };

        // Calculate centroid for the marker (simple average for now)
        let center = [0, 0];
        if (polygon.coordinates && polygon.coordinates.length > 0) {
          // Если координаты представлены как массив массивов (для мультиполигонов или полигонов с отверстиями)
          // или как простой массив точек для простого полигона.
          // Убедимся, что берем только первое кольцо для расчета центра, если это полигон с отверстиями.
          const flatCoordinates = polygon.coordinates.flat(Infinity); // Flatten to handle potential nested arrays for complex polygons
          
          let validCoords = [];
          // Assuming coordinates are like [[lat, lng], [lat, lng], ...]
          // Or [[[lat, lng], [lat, lng], ...]] for multi-polygons/polygons with holes
          if (Array.isArray(flatCoordinates[0]) && flatCoordinates[0].length === 2) {
            validCoords = flatCoordinates;
          } else if (Array.isArray(polygon.coordinates[0][0]) && polygon.coordinates[0][0].length === 2) {
             // Case for [[[lat, lng], ...]]
             validCoords = polygon.coordinates[0];
          } else {
             validCoords = polygon.coordinates; // Assume it's already in [[lat, lng], ...]
          }


          if (validCoords.length > 0) {
            const latSum = validCoords.reduce((sum, coord) => sum + coord[0], 0);
            const lngSum = validCoords.reduce((sum, coord) => sum + coord[1], 0);
            center = [latSum / validCoords.length, lngSum / validCoords.length];
          }
        }

        return (
          <Polygon 
            key={polygon.id} 
            positions={polygon.coordinates} 
            pathOptions={polygonOptions}
            eventHandlers={{ // ✅ Добавлен обработчик клика на полигон
              click: () => {
                console.log('Полигон кликнут:', polygon.id); // Лог для отладки
                if (onPolygonSelect) {
                  onPolygonSelect(polygon); // Вызываем функцию из родителя с данными кликнутого полигона
                }
              },
            }}
          >
            {/* Optional marker at polygon center */}
            {center[0] !== 0 || center[1] !== 0 ? (
              <Marker 
                position={center} 
                icon={polygonCenterIcon}
                eventHandlers={{
                  click: (e) => { // Останавливаем распространение события, чтобы избежать двойного клика
                    e.originalEvent.stopPropagation();
                    flyToMarker(center, 15); // Приближаем к маркеру с зумом 15
                  },
                }}
              >
                <Popup>
                  <div>
                    <strong>Название:</strong> {polygon.name || 'Без названия'} <br/>
                    <strong>Культура:</strong> {polygon.crop || 'Не указана'} <br/>
                    <strong>Площадь:</strong> {formatArea(calculateArea(polygon.coordinates))}
                  </div>
                </Popup>
              </Marker>
            ) : null}
          </Polygon>
        );
      })}
    </>
  );
}
