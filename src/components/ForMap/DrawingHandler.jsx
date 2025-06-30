// components/ForMap/DrawingHandler.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Polygon, useMapEvents, useMap } from 'react-leaflet';
import * as L from 'leaflet'; // Импортируем Leaflet для работы с геометрией

// Пользовательский компонент для рисования полигонов
export default function DrawingHandler({ onPolygonComplete, isDrawing, setIsDrawing }) {
  const map = useMap(); // Получаем доступ к экземпляру карты Leaflet
  const [currentPath, setCurrentPath] = useState([]); // Состояние для хранения текущих координат рисуемого полигона
  const [hoveredPoint, setHoveredPoint] = useState(null); // Точка, следующая за курсором, для визуализации линии

  // Функция для проверки, находится ли текущая точка близко к первой точке полигона
  const isNearFirstPoint = useCallback((currentPoint, firstPoint, tolerance = 10) => {
    if (!map) return false;
    const p1 = map.latLngToContainerPoint(L.latLng(currentPoint[0], currentPoint[1]));
    const p2 = map.latLngToContainerPoint(L.latLng(firstPoint[0], firstPoint[1]));
    return p1.distanceTo(p2) < tolerance;
  }, [map]);

  // Обработчики событий карты
  useMapEvents({
    mousemove: (e) => {
      if (isDrawing && currentPath.length > 0) {
        // Обновляем hoveredPoint для визуализации линии
        setHoveredPoint([e.latlng.lat, e.latlng.lng]);
      }
    },
    click: (e) => {
      if (!isDrawing) {
        // Если режим рисования не активен, игнорируем клик
        return;
      }

      const newPoint = [e.latlng.lat, e.latlng.lng];

      if (currentPath.length >= 3 && isNearFirstPoint(newPoint, currentPath[0])) {
        // Если клик близко к первой точке и уже есть минимум 3 точки, завершаем полигон
        onPolygonComplete(currentPath); // Передаем завершенный полигон в родительский компонент
        setCurrentPath([]); // Сбрасываем текущий путь
        setIsDrawing(false); // Выключаем режим рисования
        setHoveredPoint(null); // Сбрасываем hoveredPoint
        return;
      }

      // Добавляем новую точку к текущему пути
      setCurrentPath((prev) => [...prev, newPoint]);
    },
    dblclick: (e) => {
      if (!isDrawing || currentPath.length < 3) {
        // Если режим рисования не активен или точек меньше 3, игнорируем двойной клик
        return;
      }
      // Завершаем полигон по двойному клику
      onPolygonComplete(currentPath); // Передаем завершенный полигон в родительский компонент
      setCurrentPath([]); // Сбрасываем текущий путь
      setIsDrawing(false); // Выключаем режим рисования
      setHoveredPoint(null); // Сбрасываем hoveredPoint
    },
  });

  // Эффект для сброса состояния рисования, если isDrawing становится false извне
  useEffect(() => {
    if (!isDrawing && currentPath.length > 0) {
      setCurrentPath([]);
      setHoveredPoint(null);
    }
  }, [isDrawing, currentPath.length]);

  // Создаем путь для отображения: добавляем hoveredPoint, если он есть и достаточно точек
  const displayPath = useMemo(() => {
    return hoveredPoint && currentPath.length >= 1 
      ? [...currentPath, hoveredPoint]
      : currentPath;
  }, [currentPath, hoveredPoint]);

  // Если режим рисования не активен или точек нет, ничего не рендерим
  if (!isDrawing || displayPath.length === 0) { 
    return null;
  }

  // Рендерим полигон только если точек достаточно для его формирования (минимум 2 для линии, 3 для завершенного полигона)
  if (displayPath.length > 1) { 
    return (
      <Polygon
        positions={displayPath} // Координаты для отображения
        pathOptions={{
          color: '#2196f3', // Цвет обводки
          fillOpacity: 0.2, // Прозрачность заливки
          dashArray: '5, 5', // Пунктирная линия
          weight: 2 // Толщина линии
        }}
      />
    );
  }

  return null;
}
