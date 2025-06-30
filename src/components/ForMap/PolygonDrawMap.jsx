// components/ForMap/PolygonDrawMap.jsx
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import MapComponent from './MapComponent'; // Импортируем компонент карты
import MapSidebar from './MapSidebar';     // Импортируем компонент боковой панели
import ToastNotification from './ToastNotification'; // Импортируем новый компонент тоста
import ConfirmDialog from './ConfirmDialog'; // Новый компонент диалога подтверждения
import * as L from 'leaflet';              // Импортируем библиотеку Leaflet для работы с геометрией
import './Map.css';                        // CSS-файл для специфичных стилей карты (если нужен)

// >>> ВАЖНО: УСТАНОВИТЕ ВАШ БАЗОВЫЙ URL БЭКЕНДА ЗДЕСЬ! <<<
// Он должен быть ТОЛЬКО корнем вашего домена/приложения, без '/api' или '/polygons'.
// Например: 'http://localhost:8080' для локальной разработки, или
// 'https://newback-production-aa83.up.railway.app' для вашего Railway App.
const BASE_API_URL = 'https://newback-production-aa83.up.railway.app'; // ✅ Определяем BASE_API_URL здесь

// ✅ Выносим sentinelLayerOptions за пределы компонента PolygonDrawMap
// Это те же опции, что и в MapComponent, но они нужны здесь для рендеринга селекта.
const SENTINEL_LAYER_OPTIONS = [
  { id: '1_TRUE_COLOR', sentinelId: '1_TRUE_COLOR', name: 'Истинный цвет (базовый)' }, // Базовый фон
  { id: 'OSM', name: 'OpenStreetMap (базовый)' },

  { id: '3_NDVI', sentinelId: 'NDVI', name: 'NDVI' },
  { id: '2_FALSE_COLOR', sentinelId: '2_FALSE_COLOR', name: 'Ложный цвет' },
  { id: '4-FALSE-COLOR-URBAN', sentinelId: 'FALSE-COLOR-URBAN', name: 'Ложный цвет (городской)' },
  { id: '5-MOISTURE-INDEX1', sentinelId: 'MOISTURE-INDEX1', name: 'Индекс влажности' },
  { id: '6-SWIR', sentinelId: 'SWIR', name: 'SWIR' },
  { id: '7-NDWI', sentinelId: 'NDWI', name: 'NDWI' },
  { id: '8-NDSI', sentinelId: 'NDSI', name: 'NDSI' },
  { id: 'SCENE-CLASSIFICATION', sentinelId: 'SCENE-CLASSIFICATION', name: 'Классификация сцен' },
];


// --- Вспомогательная функция для безопасного парсинга тела ответа ---
async function parseResponseBody(response) {
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch (e) {
      console.error("Не удалось разобрать JSON, возврат к тексту:", e);
      return await response.text();
    }
  } else {
    return await response.text();
  }
}

// --- Вспомогательная функция для безопасного парсинга GeoJSON ---
const parseGeoJson = (geoJsonString) => {
  try {
    const parsed = JSON.parse(geoJsonString);
    let geometryObject = parsed;

    if (parsed.type === "FeatureCollection" && parsed.features && parsed.features[0] && parsed.features[0].geometry) {
      geometryObject = parsed.features[0].geometry;
    } else if (parsed.type === "Feature" && parsed.geometry) {
      geometryObject = parsed.geometry;
    }

    if (!geometryObject || !geometryObject.coordinates || !Array.isArray(geometryObject.coordinates)) {
        console.warn("GeoJSON не содержит валидных координат или не является геометрическим объектом:", parsed);
        return null;
    }

    let geoJsonCoords;
    if (geometryObject.type === 'Polygon') {
        geoJsonCoords = geometryObject.coordinates;
    } else if (geometryObject.type === 'MultiPolygon') {
        if (geometryObject.coordinates.length > 0 && geometryObject.coordinates[0].length > 0) {
            geoJsonCoords = geometryObject.coordinates[0];
        } else {
            console.warn("MultiPolygon не содержит валидных координат:", geometryObject);
            return null;
        }
    } else {
        console.warn("GeoJSON geometry type не является Polygon или MultiPolygon:", geometryObject.type);
        return null;
    }

    if (geoJsonCoords.length === 0 || !Array.isArray(geoJsonCoords[0]) || geoJsonCoords[0].length < 3) {
      console.warn("GeoJSON имеет неверную или недостаточную структуру кольца для полигона:", geoJsonCoords);
      return null;
    }

    const leafletRings = geoJsonCoords.map(ring => {
      if (!Array.isArray(ring) || ring.length < 3) {
        console.warn("Кольцо GeoJSON недействительно или имеет недостаточно точек:", ring);
        return null;
      }
      return ring.map(coord => {
        if (!Array.isArray(coord) || coord.length !== 2 || typeof coord[0] !== 'number' || typeof coord[1] !== 'number') {
          console.warn("Точка координат GeoJSON недействительна:", coord);
          return null;
        }
        return [coord[1], coord[0]]; // GeoJSON [lng, lat] в Leaflet [lat, lng]
      }).filter(Boolean);
    }).filter(Boolean);

    if (leafletRings.length === 0 || leafletRings[0].length < 3) {
      console.warn("Разобранный GeoJSON не привел к действительным кольцам Leaflet или внешнее кольцо слишком мало.");
      return null;
    }

    return leafletRings.length === 1 ? leafletRings[0] : leafletRings;

  } catch (e) {
    console.error("Ошибка парсинга GeoJSON:", e);
  }
  return null;
};

// --- Вспомогательная функция для создания GeoJSON Geometry объекта ---
const createGeoJsonGeometryObject = (leafletCoords) => {
  if (!leafletCoords || leafletCoords.length === 0) {
    return null;
  }

  const deepCloneCoords = (coords) => {
    if (Array.isArray(coords[0]) && Array.isArray(coords[0][0])) {
      return coords.map(ring => ring.map(point => [...point]));
    }
    return coords.map(point => [...point]);
  };

  let processedLeafletCoords = deepCloneCoords(leafletCoords);

  const PRECISION = 8; 

  const roundCoord = (coord) => [
    parseFloat(coord[0].toFixed(PRECISION)),
    parseFloat(coord[1].toFixed(PRECISION))
  ];

  const filterConsecutiveDuplicatesForRing = (ring) => {
    if (!ring || ring.length < 2) return ring;
    const filtered = [roundCoord(ring[0])]; 

    for (let i = 1; i < ring.length; i++) {
      const currentPoint = roundCoord(ring[i]);
      const lastFilteredPoint = filtered[filtered.length - 1];
      
      if (currentPoint[0] !== lastFilteredPoint[0] || currentPoint[1] !== lastFilteredPoint[1]) {
        filtered.push(currentPoint);
      }
    }
    return filtered;
  };

  const removeCollinearPoints = (ring, epsilon = 1e-9) => {
    if (!ring || ring.length < 3) return ring;

    const simplifiedRing = [ring[0]]; 

    for (let i = 1; i < ring.length - 1; i++) {
      const p1 = simplifiedRing[simplifiedRing.length - 1]; 
      const p2 = ring[i]; 
      const p3 = ring[i + 1]; 

      const crossProduct = (p2[0] - p1[0]) * (p3[1] - p1[1]) - (p2[1] - p1[1]) * (p3[0] - p1[0]);

      if (Math.abs(crossProduct) > epsilon) {
        simplifiedRing.push(p2);
      }
    }
    simplifiedRing.push(ring[ring.length - 1]); 

    return simplifiedRing;
  };

  const ensureRingClosed = (ring) => {
    if (ring.length === 0) return ring;
    const firstPoint = roundCoord(ring[0]);
    const lastPoint = roundCoord(ring[ring.length - 1]);

    if (firstPoint[0] !== lastPoint[0] || firstPoint[1] !== lastPoint[1]) {
      return [...ring, firstPoint]; 
    }
    return ring;
  };

  let geoJsonCoordinates;

  if (Array.isArray(processedLeafletCoords[0]) && Array.isArray(processedLeafletCoords[0][0])) {
    geoJsonCoordinates = processedLeafletCoords.map(ring => {
      let tempRing = ring.map(roundCoord); 
      tempRing = filterConsecutiveDuplicatesForRing(tempRing); 
      tempRing = removeCollinearPoints(tempRing); 
      tempRing = ensureRingClosed(tempRing); 

      if (tempRing.length < 4) {
        console.warn("Ring became invalid (less than 4 points) after cleaning:", ring, "->", tempRing);
        return null; 
      }

      return tempRing.map(coord => [coord[1], coord[0]]); 
    }).filter(Boolean); 
  } else {
    let tempRing = processedLeafletCoords.map(roundCoord); 
    tempRing = filterConsecutiveDuplicatesForRing(tempRing); 
    tempRing = removeCollinearPoints(tempRing); 
    tempRing = ensureRingClosed(tempRing); 

    if (tempRing.length < 4) {
      console.warn("Main polygon ring became invalid (less than 4 points) after cleaning:", processedLeafletCoords, "->", tempRing);
      return null; 
    }

    geoJsonCoordinates = [tempRing.map(coord => [coord[1], coord[0]])]; 
  }

  if (geoJsonCoordinates.length === 0 || !Array.isArray(geoJsonCoordinates[0])) {
      console.error("Final GeoJSON geometry is invalid after processing: no valid rings.");
      return null;
  }

  return {
    type: "Polygon",
    coordinates: geoJsonCoordinates
  };
};

// --- Утилита для Debounce (для функций, которые не должны вызываться слишком часто) ---
const debounce = (func, delay) => {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), delay);
  };
};

/**
 * Главный компонент для отрисовки карты с полигонами и боковой панели.
 * Управляет состоянием полигонов, режимами рисования/редактирования,
 * а также взаимодействием с бэкендом и локальным хранилищем.
 *
 * @param {Function} handleLogout - Коллбэк для выхода из системы.
 */
export default function PolygonDrawMap({ handleLogout }) {
  const [polygons, setPolygons] = useState([]); 
  const [isDrawing, setIsDrawing] = useState(false); 
  const [isEditingMode, setIsEditingMode] = useState(false); 
  const [selectedPolygon, setSelectedPolygon] = useState(null); 
  const [crops, setCrops] = useState([]); 
  const [loadingCrops, setLoadingCrops] = useState(false); 
  const [cropsError, setCropsError] = useState(null); 
  const [editingMapPolygon, setEditingMapPolygon] = useState(null); 
  const editableFGRef = useRef(); 

  const [toast, setToast] = useState({ message: '', type: '', visible: false });
  const [isSavingPolygon, setIsSavingPolygon] = useState(false); 
  const [isFetchingPolygons, setIsFetchingPolygons] = useState(false); 
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);

  // СОСТОЯНИЯ ДЛЯ ИНФО-БОКСА (управляются здесь)
  const [infoBoxLat, setInfoBoxLat] = useState(null);
  const [infoBoxLng, setInfoBoxLng] = useState(null);
  const [infoBoxNdvi, setInfoBoxNdvi] = useState('Нет данных (вне полигона)');
  const [infoBoxLoading, setInfoBoxLoading] = useState(false);
  const [infoBoxVisible, setInfoBoxVisible] = useState(true); // Инфо-бокс всегда виден

  // СОСТОЯНИЕ ДЛЯ АКТИВНОГО СЛОЯ КАРТЫ
  const [activeBaseLayerId, setActiveBaseLayerId] = useState('1_TRUE_COLOR'); 

  /**
   * Отображает всплывающее тост-уведомление.
   * @param {string} message - Сообщение для отображения.
   * @param {string} type - Тип сообщения ('info', 'success', 'warning', 'error').
   */
  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type, visible: true });
    const timer = setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, 5000); 
    return () => clearTimeout(timer); 
  }, []);

  // --- Функции для расчета и форматирования площади ---
  const calculateArea = useCallback((coordinates) => {
    if (!coordinates || coordinates.length < 3) return 0;
    const toRadians = (deg) => (deg * Math.PI) / 180;
    const R = 6371000; 
    let area = 0;
    const n = coordinates.length;

    let coordsToCalculate = coordinates;
    if (Array.isArray(coordinates[0]) && Array.isArray(coordinates[0][0])) {
      coordsToCalculate = coordinates[0]; 
    }
    
    if (!Array.isArray(coordsToCalculate) || coordsToCalculate.length < 3) return 0; // ✅ ИСПРАВЛЕНО: Array_is_array на Array.isArray


    for (let i = 0; i < coordsToCalculate.length; i++) {
      const j = (i + 1) % coordsToCalculate.length;
      const lat1 = toRadians(coordsToCalculate[i][0]);
      const lat2 = toRadians(coordsToCalculate[j][0]);

      const x1 = R * Math.cos(lat1) * Math.cos(toRadians(coordsToCalculate[i][1]));
      const y1 = R * Math.cos(lat1) * Math.sin(toRadians(coordsToCalculate[i][1]));

      const x2 = R * Math.cos(lat2) * Math.cos(toRadians(coordsToCalculate[j][1]));
      const y2 = R * Math.cos(lat2) * Math.sin(toRadians(coordsToCalculate[j][1]));

      area += (x1 * y2 - x2 * y1);
    }
    return Math.abs(area) / 2;
  }, []);

  const formatArea = useCallback((area) => {
    if (area < 10000) return `${area.toFixed(1)} м²`;
    if (area < 1000000) return `${(area / 10000).toFixed(1)} га`;
    return `${(area / 1000000).toFixed(1)} км²`;
  }, []);

  // --- Функция для загрузки списка культур из API (Wikipedia) ---
  const fetchCropsFromAPI = async () => {
    setLoadingCrops(true);
    setCropsError(null);
    try {
      const response = await fetch(
        'https://ru.wikipedia.org/w/api.php?' +
        new URLSearchParams({
          action: 'query',
          format: 'json',
          list: 'categorymembers',
          cmtitle: 'Категория:Овощи', 
          cmlimit: '100', 
          cmtype: 'page', 
          origin: '*', 
        })
      );

      if (!response.ok) {
        throw new Error('Ошибка загрузки данных с Wikipedia API');
      }

      const data = await response.json();
      if (data.query && data.query.categorymembers) {
        const vegetableNames = data.query.categorymembers
          .map((item) => item.title)
          .filter(
            (title) =>
              !title.includes(':') && 
              !title.includes('Категория') &&
              !title.includes('Список') &&
              !title.includes('Template') &&
              title.length < 50 
          )
          .sort(); 
        setCrops(vegetableNames);
      } else {
        const fallbackCrops = ['Томаты', 'Огурцы', 'Морковь', 'Свёкла', 'Лук', 'Чеснок', 'Картофель', 'Капуста', 'Перец', 'Баклажаны', 'Кабачки', 'Тыква', 'Редис', 'Петрушка', 'Укроп', 'Салат', 'Шпинат', 'Брокколи', 'Цветная капуста', 'Брюссельская капуста'];
        setCrops(fallbackCrops);
        showToast('Не удалось загрузить список культур с Wikipedia, используются резервные данные.', 'warning');
      }
    } catch (error) {
      console.error('Ошибка при загрузке культур:', error);
      setCropsError('Не удалось загрузить список культур. Используются резервные данные.');
      const fallbackCrops = ['Томаты', 'Огурцы', 'Морковь', 'Свёкла', 'Лук', 'Чеснок', 'Картофель', 'Капуста', 'Перец', 'Баклажаны', 'Кабачки', 'Тыква', 'Редис', 'Петрушка', 'Укроп', 'Салат', 'Шпинат', 'Брокколи', 'Цветная капуста', 'Брюссельская капуста'];
      setCrops(fallbackCrops);
      showToast(`Ошибка при загрузке культур: ${error.message}`, 'error');
    } finally {
      setLoadingCrops(false);
    }
  };

  useEffect(() => {
    fetchCropsFromAPI();
  }, [showToast]); 

  const savePolygonToDatabase = useCallback(async (polygonData, isUpdate = false) => {
    const { id, name, coordinates, crop } = polygonData;

    if (!name || name.trim() === '') {
      showToast('Ошибка сохранения: название полигона не может быть пустым.', 'error');
      console.error('Ошибка сохранения: название полигона не может быть пустым.');
      return null; 
    }

    const geoJsonGeometry = createGeoJsonGeometryObject(coordinates);

    if (!geoJsonGeometry) {
      showToast('Ошибка: Не удалось создать валидную геометрию полигона.', 'error');
      console.error('Ошибка: Не удалось создать валидную геометрию полигона из координат.');
      return null;
    }

    const payload = {
      name: name.trim(), 
      crop: crop || null, 
      geoJson: JSON.stringify(geoJsonGeometry) 
    };

    const token = localStorage.getItem('token');
    if (!token) {
      showToast('Ошибка: Токен аутентификации отсутствует. Пожалуйста, войдите в систему.', 'error');
      console.error('Ошибка: Токен аутентификации отсутствует.');
      return null; 
    }

    setIsSavingPolygon(true); 
    try {
      const method = isUpdate ? 'PUT' : 'POST'; 
      const url = isUpdate ? `${BASE_API_URL}/api/polygons/${id}` : `${BASE_API_URL}/api/polygons`; 

      const response = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(payload), 
      });

      const responseBody = await parseResponseBody(response); 

      if (!response.ok) {
        let errorMessage = response.statusText;
        if (typeof responseBody === 'object' && responseBody !== null && responseBody.message) {
          errorMessage = responseBody.message;
        } else if (typeof responseBody === 'string' && responseBody.length > 0) {
          errorMessage = responseBody;
        }
        showToast(`Ошибка ${isUpdate ? 'обновления' : 'сохранения'} полигона на сервере: ${errorMessage}`, 'error');
        throw new Error(`Ошибка ${isUpdate ? 'обновления' : 'сохранения'} полигона на сервере: ${response.status} - ${errorMessage}`);
      }

      showToast(`Полигон "${name}" успешно ${isUpdate ? 'обновлен' : 'сохранен'} на сервере!`, 'success');
      console.log(`Полигон успешно ${isUpdate ? 'обновлен' : 'сохранен'} на сервере:`, responseBody);

      return responseBody; 

    } catch (error) {
      showToast(`Не удалось ${isUpdate ? 'обновить' : 'сохранить'} полигон на сервере: ${error.message}`, 'error');
      console.error(`Ошибка при ${isUpdate ? 'обновлении' : 'сохранении'} полигона на сервере:`, error);
      return null; 
    } finally {
      setIsSavingPolygon(false); 
    }
  }, [showToast]);

  const fetchMyPolygons = useCallback(async () => {
    setIsFetchingPolygons(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        showToast("Для просмотра полигонов необходимо войти в систему.", "warning");
        setPolygons([]);
        return;
      }
      const response = await fetch(`${BASE_API_URL}/api/polygons/my`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        if (response.status === 403) {
          showToast("Доступ запрещен. Возможно, ваш токен устарел или недействителен.", "error");
        } else {
          showToast(`Ошибка загрузки полигонов: ${response.statusText}`, "error");
        }
        throw new Error(`Ошибка загрузки полигонов: ${response.statusText}`);
      }
      const data = await response.json();
      const loadedPolygons = data.map(p => {
        let coordinates = parseGeoJson(p.geoJson);
        let name = p.name; 
        let crop = p.crop; 

        return {
          id: String(p.id), 
          name: name,
          crop: crop,
          coordinates: coordinates 
        };
      }).filter(p => p.coordinates !== null && p.coordinates.length > 0 && 
                  (Array.isArray(p.coordinates[0][0]) 
                    ? p.coordinates[0].length >= 3 
                    : p.coordinates.length >= 3 
                  )); 
      
      setPolygons(loadedPolygons);

      if (loadedPolygons.length > 0 && !selectedPolygon && !editingMapPolygon) {
        setSelectedPolygon(loadedPolygons[0]);
        console.log("Мои полигоны загружены с сервера:", loadedPolygons);
        console.log("После загрузки с сервера, автоматически выбран первый полигон:", loadedPolygons[0].id);
      } else if (loadedPolygons.length === 0) {
        setSelectedPolygon(null); 
      }
      
    } catch (error) {
      console.error("Ошибка при получении полигонов:", error);
      showToast(`Ошибка получения полигонов: ${error.message}`, "error");
    } finally {
      setIsFetchingPolygons(false);
    }
  }, [showToast, selectedPolygon, editingMapPolygon]); 

  useEffect(() => {
    fetchMyPolygons();
  }, [fetchMyPolygons]); 

  const startDrawing = () => {
    console.log('startDrawing: Entering drawing mode');
    setIsDrawing(true); 
    setSelectedPolygon(null); 
    setIsEditingMode(false); 
    setEditingMapPolygon(null); 
    editableFGRef.current?.clearLayers(); 
    showToast('Режим рисования активирован. Кликайте для добавления точек.', 'info');
  };

  const stopDrawing = () => {
    console.log('stopDrawing: Exiting drawing mode');
    setIsDrawing(false); 
    if (window.clearCurrentPath) {
      window.clearCurrentPath(); 
    }
    showToast('Режим рисования остановлен.', 'info');
  };

  const onPolygonComplete = useCallback(async (coordinates) => {
    console.log('onPolygonComplete: New polygon completed raw coordinates', coordinates);
    
    const newPolygonData = {
      id: null, 
      coordinates: coordinates, 
      color: `hsl(${Math.random() * 360}, 70%, 50%)`, 
      crop: null, 
      name: `Новый полигон ${new Date().toLocaleString()}` 
    };

    setIsDrawing(false); 
    if (window.clearCurrentPath) {
      window.clearCurrentPath();
    }
    
    showToast('Полигон нарисован. Отправка на сервер...', 'info');

    try {
        const savedPolygonData = await savePolygonToDatabase(newPolygonData);

        if (savedPolygonData && savedPolygonData.id) {
            const updatedPolygonWithRealId = {
                ...newPolygonData,
                id: String(savedPolygonData.id),
                name: savedPolygonData.name || newPolygonData.name,
                crop: savedPolygonData.crop || newPolygonData.crop,
                coordinates: parseGeoJson(savedPolygonData.geoJson) || [] 
            };

            setPolygons(prev => [...prev, updatedPolygonWithRealId]);
            setSelectedPolygon(updatedPolygonWithRealId);

            showToast("Полигон успешно сохранен и выбран!", "success");
        } else {
            showToast('Ошибка: Полигон нарисован, но не удалось получить подтверждение ID с сервера.', 'error');
            setSelectedPolygon(null); 
        }
    } catch (error) {
        showToast(`Ошибка при сохранении полигона: ${error.message}`, "error");
        console.error("Ошибка при сохранении полигона:", error);
        setSelectedPolygon(null);
    }
}, [savePolygonToDatabase, showToast]);

  const deletePolygon = useCallback(async (id) => {
    console.log('deletePolygon: Attempting to delete polygon with ID', id);
    const token = localStorage.getItem('token');
    if (!token) {
      showToast('Ошибка: Токен аутентификации отсутствует. Пожалуйста, войдите в систему.', 'error');
      console.error('Ошибка: Токен аутентификации отсутствует.');
      return;
    }

    if (selectedPolygon && String(selectedPolygon.id) === String(id)) {
        setSelectedPolygon(null); 
    }
    if (editingMapPolygon && String(editingMapPolygon.id) === String(id)) {
        setIsEditingMode(false);
        setEditingMapPolygon(null);
    }
    
    setPolygons((prev) => prev.filter((p) => String(p.id) !== String(id))); 
    showToast('Полигон удален локально. Отправка запроса на сервер...', 'info');

    try {
      const response = await fetch(`${BASE_API_URL}/api/polygons/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const responseBody = await parseResponseBody(response);

      if (!response.ok) {
        let errorMessage = response.statusText;
        if (typeof responseBody === 'object' && responseBody !== null && responseBody.message) {
          errorMessage = responseBody.message;
        } else if (typeof responseBody === 'string' && responseBody.length > 0) {
          errorMessage = responseBody;
        }
        showToast(`Ошибка удаления полигона с сервера: ${errorMessage}`, 'error');
        throw new Error(`Ошибка удаления полигона с сервера: ${response.status} - ${errorMessage}`);
      }

      showToast('Полигон успешно удален с сервера!', 'success');
      console.log(`Polygon with ID ${id} successfully deleted from DB.`);
    } catch (error) {
      showToast(`Не удалось удалить полигон с сервера: ${error.message}`, 'error');
      console.error('Ошибка при удалении полигона из БД:', error);
    }
  }, [editingMapPolygon, showToast, selectedPolygon]);

  const confirmClearAll = useCallback(() => {
    setShowClearAllConfirm(true);
  }, []);

  const cancelClearAll = useCallback(() => {
    setShowClearAllConfirm(false);
    showToast('Очистка всех полигонов отменена.', 'info');
  }, [showToast]);

  const handleClearAllConfirmed = useCallback(async () => {
    setShowClearAllConfirm(false); 
    showToast('Начинаю очистку всех полигонов...', 'info');

    setPolygons([]);
    localStorage.removeItem('savedPolygons'); 

    setSelectedPolygon(null);
    setIsDrawing(false);
    setIsEditingMode(false);
    setEditingMapPolygon(null);
    editableFGRef.current?.clearLayers(); 
    showToast('Все полигоны удалены локально. Отправка запроса на сервер...', 'info');

    const token = localStorage.getItem('token');
    if (!token) {
      showToast('Ошибка: Токен аутентификации отсутствует. Пожалуйста, войдите в систему.', 'error');
      console.error('Ошибка: Токен аутентификации отсутствует.');
      return;
    }

    setIsSavingPolygon(true); 
    try {
        const response = await fetch(`${BASE_API_URL}/api/polygons/clear-all`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const responseBody = await parseResponseBody(response);

        if (!response.ok) {
            let errorMessage = response.statusText;
            if (typeof responseBody === 'object' && responseBody !== null && responseBody.message) {
              errorMessage = responseBody.message;
            } else if (typeof responseBody === 'string' && responseBody.length > 0) {
              errorMessage = responseBody;
            }
            showToast(`Ошибка очистки всех полигонов с сервера: ${errorMessage}`, 'error');
            throw new Error(`Ошибка очистки всех полигонов с сервера: ${response.status} - ${errorMessage}`);
        }

        showToast('Все полигоны успешно удалены с сервера!', 'success');
        console.log('All polygons successfully cleared from DB.');

    } catch (error) {
        showToast(`Не удалось очистить все полигоны с сервера: ${error.message}`, 'error');
        console.error('Ошибка при очистке всех полигонов из БД:', error);
    } finally {
      setIsSavingPolygon(false); 
    }
  }, [showToast]);

  const clearAll = useCallback(() => {
    if (polygons.length === 0) {
      showToast('На карте нет полигонов для удаления.', 'info');
      return;
    }
    confirmClearAll(); 
  }, [polygons.length, confirmClearAll, showToast]);

  const clearAllCrops = useCallback(() => {
    console.log('clearAllCrops: Clearing all assigned crops.');
    setPolygons((prev) => prev.map((p) => ({ ...p, crop: null })));
    showToast('Все культуры удалены с полигонов. Синхронизируйте с сервером вручную, если необходимо.', 'info');
  }, [showToast]);

  const updatePolygonCrop = useCallback(async (polygonId, newCombinedCrop) => {
    const polygonToUpdate = polygons.find(p => String(p.id) === String(polygonId)); 
    if (!polygonToUpdate) {
      showToast("Полигон не найден для обновления культуры.", "error");
      return;
    }

    showToast(`Обновление культуры для полигона ${polygonToUpdate.name}...`, "info");
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        showToast("Токен авторизации отсутствует. Невозможно обновить культуру.", "error");
        return;
      }

      const updatedPolygon = { ...polygonToUpdate, crop: newCombinedCrop };
      const geoJsonGeometry = createGeoJsonGeometryObject(updatedPolygon.coordinates);

      const response = await fetch(`${BASE_API_URL}/api/polygons/${polygonId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          id: updatedPolygon.id,
          name: updatedPolygon.name, 
          crop: updatedPolygon.crop, 
          geoJson: JSON.stringify(geoJsonGeometry) 
        })
      });

      const responseBody = await parseResponseBody(response);

      if (!response.ok) {
        let errorMessage = response.statusText;
        if (typeof responseBody === 'object' && responseBody !== null && responseBody.message) {
          errorMessage = responseBody.message;
        } else if (typeof responseBody === 'string' && responseBody.length > 0) {
          errorMessage = responseBody;
        }
        showToast(`Ошибка обновления культуры полигона: ${errorMessage}`, "error");
        throw new Error(`Ошибка обновления культуры полигона: ${response.status} - ${errorMessage}`);
      }

      setPolygons(prev => prev.map(p => (String(p.id) === String(polygonId) ? updatedPolygon : p))); 
      if (selectedPolygon && String(selectedPolygon.id) === String(polygonId)) {
        setSelectedPolygon(updatedPolygon);
      }
      if (editingMapPolygon && String(editingMapPolygon.id) === String(polygonId)) {
        setEditingMapPolygon(updatedPolygon);
      }
      showToast("Культура успешно обновлена!", "success");
    } catch (error) {
      console.error("Ошибка при обновлении культуры полигона:", error);
      showToast(`Ошибка обновления культуры: ${error.message}`, "error");
    }
  }, [polygons, showToast, selectedPolygon, editingMapPolygon]);

  const updatePolygonName = useCallback(async (polygonId, newName) => {
    const polygonToUpdate = polygons.find(p => String(p.id) === String(polygonId)); 
    if (!polygonToUpdate) {
      showToast("Полигон не найден для обновления имени.", "error");
      return;
    }

    showToast(`Обновление имени для полигона ${polygonToUpdate.name}...`, "info");
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        showToast("Токен авторизации отсутствует. Невозможно обновить имя полигона.", "error");
        return;
      }

      const updatedPolygon = { ...polygonToUpdate, name: newName };
      const geoJsonGeometry = createGeoJsonGeometryObject(updatedPolygon.coordinates);

      const response = await fetch(`${BASE_API_URL}/api/polygons/${polygonId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          id: updatedPolygon.id,
          name: updatedPolygon.name, 
          crop: updatedPolygon.crop, 
          geoJson: JSON.stringify(geoJsonGeometry) 
        })
      });

      const responseBody = await parseResponseBody(response);

      if (!response.ok) {
        let errorMessage = response.statusText;
        if (typeof responseBody === 'object' && responseBody !== null && responseBody.message) {
          errorMessage = responseBody.message;
        } else if (typeof responseBody === 'string' && responseBody.length > 0) {
          errorMessage = responseBody;
        }
        showToast(`Ошибка обновления имени полигона: ${errorMessage}`, "error");
        throw new Error(`Ошибка обновления имени полигона: ${response.status} - ${errorMessage}`);
      }

      setPolygons(prev => prev.map(p => (String(p.id) === String(polygonId) ? updatedPolygon : p))); 
      if (selectedPolygon && String(selectedPolygon.id) === String(polygonId)) {
        setSelectedPolygon(updatedPolygon);
      }
      if (editingMapPolygon && String(editingMapPolygon.id) === String(polygonId)) {
        setEditingMapPolygon(updatedPolygon);
      }
      showToast("Имя полигона успешно обновлено!", "success");
    }
    catch (error) {
      console.error("Ошибка при обновлении имени полигона:", error);
      showToast(`Ошибка обновления имени полигона: ${error.message}`, "error");
    }
  }, [polygons, showToast, selectedPolygon, editingMapPolygon]);

  const handleEditPolygon = useCallback((polygonId) => {
    console.log(`[handleEditPolygon] Attempting to edit polygon with ID: ${polygonId}`);
    setIsSavingPolygon(false);
    setIsFetchingPolygons(false);

    if (isDrawing) {
      console.log('[handleEditPolygon] Exiting drawing mode.');
      setIsDrawing(false);
      if (window.clearCurrentPath) window.clearCurrentPath(); 
    }

    if (editableFGRef.current) {
        editableFGRef.current.clearLayers();
    }

    const polygonToEdit = polygons.find((p) => String(p.id) === String(polygonId)); 
    if (!polygonToEdit) {
      console.error('[handleEditPolygon] Polygon for editing not found in state.');
      showToast('Полигон для редактирования не найден.', 'error');
      return;
    }

    setIsEditingMode(true); 
    setEditingMapPolygon(polygonToEdit); 
    setSelectedPolygon(polygonToEdit); 
    showToast(`Начато редактирование формы полигона "${polygonToEdit.name || polygonToEdit.id}".`, 'info');
    console.log('[handleEditPolygon] isEditingMode set to TRUE. isSavingPolygon and isFetchingPolygons set to FALSE.');
  }, [polygons, isDrawing, showToast]);

  const handleStopAndSaveEdit = useCallback(async () => { 
    console.log('handleStopAndSaveEdit: Attempting to stop and save.');
    if (isDrawing) {
      if (window.clearCurrentPath) window.clearCurrentPath();
      stopDrawing();
      showToast('Рисование остановлено.', 'info');
    }
    else if (isEditingMode && editableFGRef.current) {
      let editedLayer = null;
      editableFGRef.current.eachLayer(layer => {
        if (layer.editing && layer.editing.enabled()) {
          layer.editing.disable();
          editedLayer = layer;
        }
      });

      if (editedLayer && editingMapPolygon) {
          console.log('handleStopAndSaveEdit: Disabling editing for active layer.');

          const geoJson = editedLayer.toGeoJSON();
          let rawUpdatedCoords;

          if (geoJson.geometry && geoJson.geometry.coordinates && Array.isArray(geoJson.geometry.coordinates[0]) && Array.isArray(geoJson.geometry.coordinates[0][0])) {
              rawUpdatedCoords = geoJson.geometry.coordinates.map(ring => 
                  ring.map(coord => [coord[1], coord[0]]) 
              );
          } else if (geoJson.geometry && geoJson.geometry.coordinates && Array.isArray(geoJson.geometry.coordinates[0])) {
              rawUpdatedCoords = geoJson.geometry.coordinates[0].map(coord => [coord[1], coord[0]]); 
          } else {
            console.error("Не удалось получить валидные координаты из отредактированного слоя.");
            showToast("Ошибка: не удалось получить координаты отредактированного полигона.", "error");
            setIsEditingMode(false);
            setEditingMapPolygon(null);
            editableFGRef.current?.clearLayers();
            return;
          }
         
          const currentPolygonInState = polygons.find(p => String(p.id) === String(editingMapPolygon.id)); 
          if (currentPolygonInState) {
              const updatedPoly = {
                  ...currentPolygonInState,
                  coordinates: rawUpdatedCoords, 
              };
              setPolygons(prev => prev.map(p => (String(p.id) === String(updatedPoly.id) ? updatedPoly : p))); 
              setSelectedPolygon(updatedPoly); 
              showToast('Форма полигона обновлена и сохранена локально! Отправка на сервер...', 'info');
              
              try {
                await savePolygonToDatabase(updatedPoly, true);
              } catch (error) {
                console.error("Ошибка сохранения обновленного полигона на сервере:", error);
                showToast(`Ошибка сохранения обновленного полигона: ${error.message}`, "error");
              }
          }
      }
      console.log('handleStopAndSaveEdit: Forcing state reset for editing mode.');
      setIsEditingMode(false);
      setEditingMapPolygon(null);
      editableFGRef.current?.clearLayers(); 
      showToast('Редактирование завершено и сохранено.', 'success');
    } else {
      showToast('Нет активных режимов для сохранения.', 'info');
    }
  }, [isDrawing, stopDrawing, isEditingMode, editingMapPolygon, polygons, savePolygonToDatabase, showToast, setSelectedPolygon]);

  const onPolygonEdited = useCallback(async (e) => {
    console.log('onPolygonEdited: Event received from EditControl. Layers:', e.layers);
    if (isEditingMode) {
      console.warn("onPolygonEdited fired, but isEditingMode is still true. Consider handling this event explicitly or ensuring handleStopAndSaveEdit is sufficient.");
    }
  }, [isEditingMode]);

  const showMyPolygons = useCallback(async () => {
    showToast('Загрузка ваших полигонов с сервера...', 'info');

    const token = localStorage.getItem('token');
    if (!token) {
      showToast('Ошибка: Токен аутентификации отсутствует. Пожалуйста, войдите в систему.', 'error');
      return;
    }

    setIsFetchingPolygons(true); 
    try {
        const response = await fetch(`${BASE_API_URL}/api/polygons/my`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await parseResponseBody(response);

        if (!response.ok) {
            let errorMessage = response.statusText;
            if (typeof data === 'object' && data !== null && data.message) {
              errorMessage = data.message;
            } else if (typeof data === 'string' && data.length > 0) {
              errorMessage = data;
            }
            showToast(`Ошибка загрузки полигонов с сервера: ${errorMessage}`, 'error');
            throw new Error(`Ошибка загрузки полигонов с сервера: ${response.status} - ${errorMessage}`);
        }

        console.log('Мои полигоны загружены с сервера:', data);

        if (data && Array.isArray(data)) {
          const loadedPolygons = data.map(item => {
            let coordinates = [];
            let name = item.name || `Загруженный полигон ${item.id || String(Date.now())}`;
            let crop = item.crop || null;

            try {
              coordinates = parseGeoJson(item.geoJson) || [];
            } catch (e) {
              console.error('Не удалось разобрать geoJson для элемента:', item, e);
            }

            return {
              id: String(item.id), 
              coordinates: coordinates,
              color: `hsl(${Math.random() * 360}, 70%, 50%)`, 
              crop: crop,
              name: name
            };
          }).filter(p => p.coordinates.length >= 3); 

          setPolygons(loadedPolygons); 
          showToast(`Загружено ${loadedPolygons.length} ваших полигонов с сервера.`, 'success');

          setIsDrawing(false);
          setIsEditingMode(false);
          setEditingMapPolygon(null);
          editableFGRef.current?.clearLayers();
          
          if (loadedPolygons.length > 0) {
            setSelectedPolygon(loadedPolygons[0]);
            console.log('После загрузки с сервера, автоматически выбран первый полигон:', loadedPolygons[0].id);
          } else {
            setSelectedPolygon(null); 
          }
        } else {
          showToast('Сервер вернул некорректный формат данных для полигонов.', 'error');
          console.error('Сервер вернул некорректный формат данных:', data);
        }

    } catch (error) {
        showToast(`Не удалось загрузить мои полигоны с сервера: ${error.message}`, 'error');
        console.error('Ошибка при загрузке моих полигонов с сервера:', error);
    } finally {
      setIsFetchingPolygons(false); 
    }
  }, [showToast]);

  useEffect(() => {
    let loadedFromLocalStorage = false;
    try {
      const storedPolygons = localStorage.getItem('savedPolygons');
      if (storedPolygons !== null && storedPolygons !== '[]') { 
        const parsedPolygonsRaw = JSON.parse(storedPolygons);
        console.log('Parsed raw polygons from localStorage:', parsedPolygonsRaw);

        const validatedPolygons = parsedPolygonsRaw.map(p => {
            const parsedCoordinates = parseGeoJson(p.geoJson);

            return {
                ...p,
                id: String(p.id),
                coordinates: parsedCoordinates, 
            };
        }).filter(p => p.coordinates !== null && p.coordinates.length > 0 && 
                    (Array.isArray(p.coordinates[0]) && Array.isArray(p.coordinates[0][0]) 
                      ? p.coordinates[0].length >= 3 
                      : p.coordinates[0].length >= 3 
                    )); 

        if (Array.isArray(validatedPolygons) && validatedPolygons.length > 0) {
          setPolygons(validatedPolygons);
          showToast('Полигоны загружены с локального устройства.', 'success');
          loadedFromLocalStorage = true;
          console.log('Polygons successfully loaded from localStorage into state.');
          if (validatedPolygons.length > 0) {
            setSelectedPolygon(validatedPolygons[0]);
            console.log('После загрузки из localStorage, автоматически выбран первый полигон:', validatedPolygons[0].id);
          }
        } else {
          console.warn('Неверный формат данных полигонов в localStorage или пустой массив после валидации. Очищаю и пытаюсь загрузить с сервера.', parsedPolygonsRaw);
          localStorage.removeItem('savedPolygons'); 
        }
      }
    } catch (error) {
      console.error("Критическая ошибка парсинга полигонов из localStorage. Очищаю и пытаюсь загрузить с сервера:", error);
      showToast('Критическая ошибка загрузки полигонов с локального устройства, пытаюсь загрузить с сервера.', 'error');
      localStorage.removeItem('savedPolygons'); 
    }

    if (!loadedFromLocalStorage) {
      showMyPolygons();
    }
  }, [showToast, showMyPolygons]); 

  const handlePolygonSelect = useCallback((polygon) => {
    console.log('Полигон выбран в PolygonDrawMap:', polygon.id);
    setSelectedPolygon(polygon); 
    if (isDrawing) {
      stopDrawing();
    }
    if (isEditingMode) {
      handleStopAndSaveEdit(); 
    }
  }, [isDrawing, stopDrawing, isEditingMode, handleStopAndSaveEdit]);

  // ✅ НОВАЯ ДЕБАУНСИРОВАННАЯ ФУНКЦИЯ ДЛЯ ОБНОВЛЕНИЯ КООРДИНАТ КУРССОРА В ИНФО-БОКСЕ
  const debouncedSetCursorCoords = useCallback(debounce((lat, lng) => {
    setInfoBoxLat(lat);
    setInfoBoxLng(lng);
  }, 50), [setInfoBoxLat, setInfoBoxLng]); // Очень маленькая задержка для плавного обновления координат

  // ✅ НОВАЯ ДЕБАУНСИРОВАННАЯ ФУНКЦИЯ ДЛЯ ЗАПРОСА NDVI И ОБНОВЛЕНИЯ ИНФО-БОКСА
  const debouncedFetchNdviAndSetInfoBox = useCallback(debounce(async (lat, lng, polygonId) => {
    if (!polygonId) {
      // Если курсор не над полигоном, сбрасываем NDVI
      setInfoBoxNdvi('Нет данных (вне полигона)');
      setInfoBoxLoading(false);
      return;
    }

    setInfoBoxLoading(true);
    setInfoBoxNdvi('Загрузка NDVI...');
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${BASE_API_URL}/api/v1/indices/ndvi`, {
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
  }, 5000), [BASE_API_URL, setInfoBoxNdvi, setInfoBoxLoading]); // Задержка 5 секунд для NDVI

  // ✅ НОВАЯ ФУНКЦИЯ: Обработчик движения мыши по карте (для обновления координат в инфо-боксe)
  const handleMapMouseMove = useCallback((lat, lng) => {
    debouncedSetCursorCoords(lat, lng);
  }, [debouncedSetCursorCoords]);

  // ✅ НОВАЯ ФУНКЦИЯ: Обработчик движения мыши над полигоном (для обновления NDVI)
  const handlePolygonMouseMoveForNdvi = useCallback((lat, lng, polygonId) => {
    debouncedFetchNdviAndSetInfoBox(lat, lng, polygonId);
  }, [debouncedFetchNdviAndSetInfoBox]);


  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%' }}>
      <MapComponent
        polygons={polygons}
        onPolygonComplete={onPolygonComplete}
        onPolygonEdited={onPolygonEdited}
        isDrawing={isDrawing}
        setIsDrawing={setIsDrawing}
        editableFGRef={editableFGRef}
        selectedPolygon={selectedPolygon} 
        isEditingMode={isEditingMode}
        editingMapPolygon={editingMapPolygon}
        baseApiUrl={BASE_API_URL}
        calculateArea={calculateArea} 
        formatArea={formatArea}
        onPolygonSelect={handlePolygonSelect} 
        // ✅ НОВЫЕ ПРОПСЫ: для управления инфо-боксом и NDVI
        onMapMouseMove={handleMapMouseMove} // Обновление координат курсора
        onPolygonMouseMoveForNdvi={handlePolygonMouseMoveForNdvi} // Обновление NDVI на полигоне
        activeBaseLayerId={activeBaseLayerId} 
        setActiveBaseLayerId={setActiveBaseLayerId} 
      />

      <MapSidebar
        polygons={polygons}
        selectedPolygon={selectedPolygon} 
        setSelectedPolygon={setSelectedPolygon} 
        deletePolygon={deletePolygon}
        handleEditPolygon={handleEditPolygon}
        crops={crops}
        loadingCrops={loadingCrops}
        cropsError={cropsError}
        startDrawing={startDrawing}
        stopDrawing={stopDrawing}
        handleStopAndSaveEdit={handleStopAndSaveEdit}
        isDrawing={isDrawing}
        isEditingMode={isEditingMode}
        updatePolygonCrop={updatePolygonCrop}
        updatePolygonName={updatePolygonName}
        clearAll={clearAll}
        clearAllCrops={clearAllCrops}
        showMyPolygons={showMyPolygons}
        isSavingPolygon={isSavingPolygon}
        isFetchingPolygons={isFetchingPolygons}
        handleLogout={handleLogout}
        calculateArea={calculateArea}
        formatArea={formatArea}
      />

      <ToastNotification
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
      />

      {showClearAllConfirm && ( 
        <ConfirmDialog 
          message="Вы уверены, что хотите удалить ВСЕ полигоны? Это действие необратимо." 
          onConfirm={handleClearAllConfirmed} 
          onCancel={cancelClearAll} 
          isProcessing={isSavingPolygon} 
        /> 
      )}

      {/* ✅ ИНФО-БОКС теперь рендерится здесь, в PolygonDrawMap */}
      {infoBoxVisible && ( 
        <div style={{
          position: 'fixed',
          bottom: '16px',
          backgroundColor: 'rgba(0,0,0,0.7)', // Темный фон для лучшей читаемости
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: '9999999',
          pointerEvents: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          borderRadius: '16px', // Закругленные углы
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)', // Более выраженная тень
          backdropFilter: 'blur(5px)', // Менее интенсивное размытие
          border: '1px solid rgba(255,255,255,0.3)', // Тонкая белая рамка
          padding: '12px 20px',
          color: 'white' // Цвет текста белый
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
                Шир: <span className="font-semibold">{infoBoxLat !== null ? infoBoxLat : '---'}</span>, Дол: <span className="font-semibold">{infoBoxLng !== null ? infoBoxLng : '---'}</span>
              </p>
              <p className="text-base font-medium">NDVI:
                {infoBoxLoading ? (
                  <span className="loader-spin ml-2 h-4 w-4 border-2 border-t-2 border-blue-500 rounded-full inline-block"></span>
                ) : (
                  <span className="font-semibold ml-2">{infoBoxNdvi}</span>
                )}
              </p>
            </div>

            {/* Выбор слоя карты остается здесь */}
            <div className="text-white rounded-xl p-3 flex flex-col items-start w-full">
              <label htmlFor="sentinel-layer-select-control" className="text-sm font-medium mb-2 w-full text-center">
                Выбрать слой карты:
              </label>
              {/* Этот select будет управляться MapComponent, но его видимость здесь */}
              {/* MapComponent должен будет передать активный слой и функцию его изменения */}
              {/* Для простоты, пока что этот select не будет напрямую влиять на MapComponent */}
              {/* Это потребует дополнительной логики для синхронизации activeBaseLayerId */}
              {/* Я оставлю его здесь, но его функциональность будет ограничена, пока не будет прямой связи */}
              {/* с activeBaseLayerId в MapComponent */}
              <select
                id="sentinel-layer-select-control"
                value={activeBaseLayerId} // ✅ ИСПРАВЛЕНО: Теперь использует activeBaseLayerId из состояния PolygonDrawMap
                onChange={(e) => setActiveBaseLayerId(e.target.value)} // ✅ ИСПРАВЛЕНО: Теперь использует setActiveBaseLayerId из состояния PolygonDrawMap
                className="bg-white/20 text-white rounded-lg text-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-300 border border-white/30 w-full hover:bg-white/30 transition-colors duration-200"
                style={{ pointerEvents: 'auto' }}
              >
                {/* Опции для выбора слоя карты */}
                {SENTINEL_LAYER_OPTIONS.map(option => ( // ✅ ИСПРАВЛЕНО: Использует SENTINEL_LAYER_OPTIONS
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
    </div>
  );
}
