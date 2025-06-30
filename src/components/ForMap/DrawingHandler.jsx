// components/ForMap/DrawingHandler.jsx
import React, { useState, useEffect } from 'react';
import { Polygon, useMapEvents } from 'react-leaflet';

// Пользовательский компонент для рисования полигонов
export default function DrawingHandler({ onPolygonComplete, onStopAndSave, isDrawing, setIsDrawing }) {
  const [currentPath, setCurrentPath] = useState([]); // Состояние для хранения текущих координат рисуемого полигона
  const [hoveredPoint, setHoveredPoint] = useState(null); // Точка, следующая за курсором, для визуализации линии

  // Предоставление текущего пути родительскому компоненту через глобальные методы window.
  // Это позволяет родителю вручную сохранить рисуемый полигон.
  useEffect(() => {
    if (onStopAndSave) {
      window.getCurrentPath = () => currentPath;
      window.clearCurrentPath = () => setCurrentPath([]);
    }
    // Функция очистки: удаляем глобальные методы при размонтировании компонента
    return () => { 
      if (onStopAndSave) {
        delete window.getCurrentPath;
        delete window.clearCurrentPath;
      }
    };
  }, [currentPath, onStopAndSave]); // Пересоздавать эффект только при изменении currentPath или onStopAndSave

    // Если режим рисования не активен или точек нет, ничего не рендерим
  if (!isDrawing || currentPath.length === 0) {
    return null;
  }

  // Создаем путь для отображения: добавляем hoveredPoint, если он есть и достаточно точек
  const displayPath = hoveredPoint && currentPath.length >= 1 
    ? [...currentPath, hoveredPoint]
    : currentPath;

  // Рендерим полигон только если точек достаточно для его формирования (минимум 3, для отображения линии достаточно 2 точки, но для завершенного полигона нужно 3)
  if (displayPath.length > 2) {
    return (
      <Polygon
        positions={displayPath} // Координаты для отображения
        pathOptions={{
          color: 'blue', // Цвет обводки
          fillOpacity: 0.2, // Прозрачность заливки
          dashArray: '5, 5', // Пунктирная линия
          weight: 2 // Толщина линии
        }}
      />
    );
  }

  return null;
}
