// components/ForMap/PolygonDrawMap.jsx
import React, { useState, useRef, useCallback, useEffect } from 'react';
import MapComponent from './MapComponent'; // Импортируем компонент карты
// import { db } from '../../firebase'; // ЗАКОММЕНТИРОВАНО согласно вашему запросу
// import { doc, setDoc, deleteDoc, collection, query, where, getDocs, onSnapshot, runTransaction } from 'firebase/firestore'; // ЗАКОММЕНТИРОВАНО
import MapSidebar from './MapSidebar';     // Импортируем компонент боковой панели
import ToastNotification from './ToastNotification'; // Импортируем новый компонент тоста
import ConfirmDialog from './ConfirmDialog'; // Новый компонент диалога подтверждения
import * as L from 'leaflet';              // Импортируем библиотеку Leaflet для работы с геометрией
import './Map.css';                        // CSS-файл для специфичных стилей карты (если нужен)

// >>> ВАЖНО: УСТАНОВИТЕ ВАШ БАЗОВЫЙ URL БЭКЕНДА ЗДЕСЬ! <<<
// Он должен быть ТОЛЬКО корнем вашего домена/приложения, без '/api' или '/polygons'.
// Например: 'http://localhost:8080' для локальной разработки, или
// 'https://newback-production-aa83.up.railway.app' для вашего Railway App.
const BASE_API_URL = 'http://localhost:8080'; // ✅ Определяем BASE_API_URL здесь

// --- Вспомогательная функция для безопасного парсинга тела ответа ---
async function parseResponseBody(response) {
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch (e) {
      console.error("Не удалось разобрать JSON, возврат к тексту:", e); // Используем console.error для реальных ошибок
      return await response.text();
    }
  } else {
    return await response.text();
  }
}

/**
 * Главный компонент для отрисовки карты с полигонами и боковой панели.
 * Управляет состоянием полигонов, режимами рисования/редактирования,
 * а также взаимодействием с бэкендом и локальным хранилищем.
 *
 * @param {Function} handleLogout - Коллбэк для выхода из системы.
 */
export default function PolygonDrawMap({ handleLogout }) {
  const [polygons, setPolygons] = useState([]); // Состояние для хранения всех полигонов
  const [isDrawing, setIsDrawing] = useState(false); // Флаг: в режиме рисования?
  const [isEditingMode, setIsEditingMode] = useState(false); // Флаг: в режиме редактирования формы?
  const [selectedPolygon, setSelectedPolygon] = useState(null); // ID выбранного полигона (для боковой панели)
  const [crops, setCrops] = useState([]); // Список культур
  const [loadingCrops, setLoadingCrops] = useState(false); // Флаг загрузки культур
  const [cropsError, setCropsError] = useState(null); // Ошибка загрузки культур
  const [editingMapPolygon, setEditingMapPolygon] = useState(null); // Полигон, который редактируется на карте (для react-leaflet-draw)
  const editableFGRef = useRef(); // Ref для FeatureGroup, чтобы EditControl мог с ним работать

  // Состояние для тост-уведомлений (всплывающих сообщений)
  const [toast, setToast] = useState({ message: '', type: '', visible: false });
  // Состояния для индикаторов загрузки/сохранения на БЭКЕНДЕ
  const [isSavingPolygon, setIsSavingPolygon] = useState(false); // Флаг: сохранение/обновление полигона на сервере
  const [isFetchingPolygons, setIsFetchingPolygons] = useState(false); // Флаг: загрузка полигонов с сервера
  // Состояние для диалога подтверждения очистки всех полигонов
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);

  // СОСТОЯНИЯ ДЛЯ ИНФО-БЛОКА И SENTINEL HUB (передаются в MapComponent)
  const [infoBoxVisible, setInfoBoxVisible] = useState(false); // Изначально не видим
  const [infoBoxLat, setInfoBoxLat] = useState(null);
  const [infoBoxLng, setInfoBoxLng] = useState(null);
  const [infoBoxNdvi, setInfoBoxNdvi] = useState('Загрузка...');
  const [infoBoxLoading, setInfoBoxLoading] = useState(false);
  // Нет необходимости в sentinelLayerId и setSentinelLayerId здесь,
  // так как MapComponent сам управляет activeBaseLayerId и его изменением.
  // Они были в прошлом коде, но теперь их можно убрать из этого компонента,
  // так как MapComponent управляет своим собственным внутренним состоянием для выбора слоя.

  /**
   * Отображает всплывающее тост-уведомление.
   * @param {string} message - Сообщение для отображения.
   * @param {string} type - Тип сообщения ('info', 'success', 'warning', 'error').
   */
  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type, visible: true });
    const timer = setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, 5000); // Сообщение исчезнет через 5 секунд
    return () => clearTimeout(timer); // Очистка таймера
  }, []);

  // --- Функции для расчета и форматирования площади ---
  /**
   * Рассчитывает площадь полигона в квадратных метрах.
   * @param {Array<Array<number>>} coordinates - Массив координат полигона [[lat, lng], ...].
   * @returns {number} Площадь полигона в м².
   */
  const calculateArea = useCallback((coordinates) => {
    if (coordinates.length < 3) return 0;
    const toRadians = (deg) => (deg * Math.PI) / 180;
    const R = 6371000; // Радиус Земли в метрах
    let area = 0;
    const n = coordinates.length;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const lat1 = toRadians(coordinates[i][0]);
      const lat2 = toRadians(coordinates[j][0]);
      const deltaLon = toRadians(coordinates[j][1] - coordinates[i][1]);

      // Формула для расчета площади полигона на сфере (формула Гаусса)
      const x1 = R * Math.cos(lat1) * Math.cos(toRadians(coordinates[i][1]));
      const y1 = R * Math.cos(lat1) * Math.sin(toRadians(coordinates[i][1]));
      const z1 = R * Math.sin(lat1);

      const x2 = R * Math.cos(lat2) * Math.cos(toRadians(coordinates[j][1]));
      const y2 = R * Math.cos(lat2) * Math.sin(toRadians(coordinates[j][1]));
      const z2 = R * Math.sin(lat2);

      area += (x1 * y2 - x2 * y1);
    }
    return Math.abs(area) / 2;
  }, []);

  /**
   * Форматирует площадь в удобочитаемый вид (м², га, км²).
   * @param {number} area - Площадь в м².
   * @returns {string} Отформатированная строка площади.
   */
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
          cmtitle: 'Категория:Овощи', // Категория "Овощи" на Русской Википедии
          cmlimit: '100', // Ограничение на 100 элементов
          cmtype: 'page', // Только страницы (не подкатегории)
          origin: '*', // Для обхода CORS
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
              !title.includes(':') && // Исключаем служебные страницы (например, "Файл:")
              !title.includes('Категория') &&
              !title.includes('Список') &&
              !title.includes('Template') &&
              title.length < 50 // Ограничиваем длину названия
          )
          .sort(); // Сортируем по алфавиту
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

  // Эффект для загрузки культур при монтировании компонента
  useEffect(() => {
    fetchCropsFromAPI();
  }, [showToast]); // Зависимость от showToast, чтобы функция не устаревала

  // --- Функция сохранения/обновления полигона в БД ---
  const savePolygonToDatabase = useCallback(async (polygonData, isUpdate = false) => {
    const { id, name, coordinates, crop } = polygonData;

    if (!name || name.trim() === '') {
      showToast('Ошибка сохранения: название полигона не может быть пустым.', 'error');
      console.error('Ошибка сохранения: название полигона не может быть пустым.');
      return;
    }

    // Создаем объект GeoJSON Geometry.
    // Важно: GeoJSON использует формат [долгота, широта], а Leaflet [широта, долгота].
    // Поэтому здесь координаты преобразуются.
    const geoJsonGeometry = {
        type: "Polygon",
        coordinates: [coordinates.map(coord => [coord[1], coord[0]])] // Leaflet [lat, lng] to GeoJSON [lng, lat]
    };

    // В payload будут отправлены name, crop и geoJson в виде строки.
    const payload = {
      name: name.trim(),
      crop: crop || null,
      geoJson: JSON.stringify(geoJsonGeometry) // Отправляем СТРОКУ GeoJSON Geometry
    };

    const token = localStorage.getItem('token');
    if (!token) {
      showToast('Ошибка: Токен аутентификации отсутствует. Пожалуйста, войдите в систему.', 'error');
      console.error('Ошибка: Токен аутентификации отсутствует.');
      return;
    }

    setIsSavingPolygon(true); // Устанавливаем флаг сохранения
    try {
      const method = isUpdate ? 'PUT' : 'POST'; // Метод HTTP-запроса (PUT для обновления, POST для создания)
      const url = isUpdate ? `${BASE_API_URL}/api/polygons/${id}` : `${BASE_API_URL}/api/polygons`; // URL эндпоинта

      const response = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` // Заголовок авторизации
        },
        body: JSON.stringify(payload), // Преобразуем payload в JSON-строку
      });

      const responseBody = await parseResponseBody(response); // Безопасно парсим тело ответа

      if (!response.ok) {
        // Обработка ошибок сервера
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

      if (!isUpdate) {
        // Если это новый полигон, получаем его реальный ID с сервера
        const actualPolygonId = (typeof responseBody === 'object' && responseBody !== null && responseBody.id)
                                ? responseBody.id
                                : (typeof responseBody === 'string' ? responseBody : id); // Fallback

        // Обновляем локальное состояние полигонов, заменяя временный ID на реальный от сервера.
        // Это вызовет сохранение в localStorage через useEffect.
        setPolygons(prev => prev.map(p => p.id === id ? { ...p, id: String(actualPolygonId) } : p));
      } else {
        // Если это обновление, просто подтверждаем, что polygonData актуальна.
        // Локальное состояние уже должно быть обновлено коллбэками updatePolygonName/updatePolygonCrop/handleStopAndSaveEdit.
        setPolygons(prev => prev.map(p => p.id === id ? { ...polygonData } : p));
      }

    } catch (error) {
      showToast(`Не удалось ${isUpdate ? 'обновить' : 'сохранить'} полигон на сервере: ${error.message}`, 'error');
      console.error(`Ошибка при ${isUpdate ? 'обновлении' : 'сохранении'} полигона на сервере:`, error);
    } finally {
      setIsSavingPolygon(false); // Снимаем флаг сохранения
    }
  }, [showToast]);

  // --- Эффект для сохранения полигонов в localStorage при КАЖДОМ изменении `polygons` ---
  // Этот эффект срабатывает КАЖДЫЙ РАЗ, когда массив `polygons` меняется.
  useEffect(() => {
    try {
      localStorage.setItem('savedPolygons', JSON.stringify(polygons));
      // console.log('Полигоны сохранены локально в localStorage.'); // Для отладки
    } catch (error) {
      console.error("Ошибка при сохранении полигонов в localStorage:", error);
      showToast('Ошибка сохранения полигонов на локальное устройство.', 'error');
    }
  }, [polygons, showToast]); // Зависимость от polygons и showToast

  // --- Коллбэки для управления полигонами ---

  /**
   * Активирует режим рисования нового полигона.
   */
  const startDrawing = () => {
    console.log('startDrawing: Entering drawing mode');
    setIsDrawing(true); // Устанавливаем режим рисования
    setSelectedPolygon(null); // Сбрасываем выбранный полигон
    setIsEditingMode(false); // Отключаем режим редактирования формы
    setEditingMapPolygon(null); // Сбрасываем полигон для редактирования на карте
    editableFGRef.current?.clearLayers(); // Очищаем FeatureGroup, чтобы избежать конфликтов
    showToast('Режим рисования активирован. Кликайте для добавления точек.', 'info');
  };

  /**
   * Останавливает режим рисования (без сохранения незавершенного полигона).
   */
  const stopDrawing = () => {
    console.log('stopDrawing: Exiting drawing mode');
    setIsDrawing(false); // Отключаем режим рисования
    if (window.clearCurrentPath) {
      window.clearCurrentPath(); // Вызываем функцию очистки текущего пути рисования в MapComponent
    }
    showToast('Режим рисования остановлен.', 'info');
  };

  /**
   * Коллбэк, вызываемый из MapComponent при завершении рисования нового полигона.
   * @param {Array<Array<number>>} coordinates - Координаты нового полигона [[lat, lng], ...].
   */
  const onPolygonComplete = useCallback((coordinates) => {
    console.log('onPolygonComplete: New polygon completed', coordinates);
    let finalCoordinates = [...coordinates];
    // Проверяем, замкнут ли контур. Если нет, добавляем первую точку в конец для корректного GeoJSON.
    if (finalCoordinates.length > 0 &&
        (finalCoordinates[0][0] !== finalCoordinates[finalCoordinates.length - 1][0] ||
         finalCoordinates[0][1] !== finalCoordinates[finalCoordinates.length - 1][1])) {
      finalCoordinates.push(finalCoordinates[0]);
      console.log('onPolygonComplete: Polygon ring closed by adding first point to end.');
    }

    // Создаем новый объект полигона с временным ID
    const newPolygon = {
      id: `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, // Временный ID для локального состояния
      coordinates: finalCoordinates, // Используем замкнутые координаты
      color: `hsl(${Math.random() * 360}, 70%, 50%)`, // Случайный цвет
      crop: null, // Культура по умолчанию null
      name: `Новый полигон ${new Date().toLocaleString()}` // Имя по умолчанию
    };

    // Сразу добавляем новый полигон в локальное состояние.
    // Это вызовет эффект useEffect, который сохранит полигоны в localStorage.
    setPolygons((prev) => [...prev, newPolygon]);

    setIsDrawing(false); // Убеждаемся, что режим рисования выключен
    setSelectedPolygon(newPolygon.id); // Выбираем новый полигон в боковой панели
    showToast('Полигон нарисован и сохранен локально! Отправка на сервер...', 'info');

    // Автоматическое сохранение нового полигона в БД с именем по умолчанию
    savePolygonToDatabase(newPolygon);
  }, [savePolygonToDatabase, showToast]);

  /**
   * Удаляет полигон по ID из локального состояния и отправляет запрос на удаление в БД.
   * @param {string} id - ID полигона для удаления.
   */
  const deletePolygon = useCallback(async (id) => {
    console.log('deletePolygon: Attempting to delete polygon with ID', id);
    const token = localStorage.getItem('token');
    if (!token) {
      showToast('Ошибка: Токен аутентификации отсутствует. Пожалуйста, войдите в систему.', 'error');
      console.error('Ошибка: Токен аутентификации отсутствует.');
      return;
    }

    // Удаляем сначала из локального состояния для мгновенного отклика (вызовет сохранение в localStorage)
    setPolygons((prev) => prev.filter((p) => p.id !== id));
    setSelectedPolygon(null); // Сбрасываем выбранный полигон
    // Если удаляемый полигон был в режиме редактирования на карте, сбрасываем эти состояния
    if (editingMapPolygon && editingMapPolygon.id === id) {
      setIsEditingMode(false);
      setEditingMapPolygon(null);
    }
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
      // Если удаление с сервера не удалось, можно рассмотреть возможность вернуть полигон в UI
      // или предложить опцию "повторить синхронизацию"
    }
  }, [editingMapPolygon, showToast]);

  /**
   * Запускает диалог подтверждения перед очисткой всех полигонов.
   */
  const confirmClearAll = useCallback(() => {
    setShowClearAllConfirm(true);
  }, []);

  /**
   * Отменяет операцию очистки всех полигонов.
   */
  const cancelClearAll = useCallback(() => {
    setShowClearAllConfirm(false);
    showToast('Очистка всех полигонов отменена.', 'info');
  }, [showToast]);

  /**
   * Обрабатывает подтверждение очистки всех полигонов.
   * Удаляет полигоны локально и отправляет запрос на бэкенд для массового удаления.
   */
  const handleClearAllConfirmed = useCallback(async () => {
    setShowClearAllConfirm(false); // Скрываем диалог подтверждения
    showToast('Начинаю очистку всех полигонов...', 'info');

    // Очищаем локальное состояние и localStorage для мгновенного отклика
    setPolygons([]);
    localStorage.removeItem('savedPolygons');

    // Сбрасываем все режимы и выбранные полигоны
    setSelectedPolygon(null);
    setIsDrawing(false);
    setIsEditingMode(false);
    setEditingMapPolygon(null);
    editableFGRef.current?.clearLayers(); // Очищаем временный слой редактирования
    showToast('Все полигоны удалены локально. Отправка запроса на сервер...', 'info');

    const token = localStorage.getItem('token');
    if (!token) {
      showToast('Ошибка: Токен аутентификации отсутствует. Пожалуйста, войдите в систему.', 'error');
      console.error('Ошибка: Токен аутентификации отсутствует.');
      return;
    }

    setIsSavingPolygon(true); // Устанавливаем флаг сохранения
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
      setIsSavingPolygon(false); // Снимаем флаг сохранения
    }
  }, [showToast]);

  /**
   * Запускает процесс очистки всех полигонов (вызывает подтверждение).
   */
  const clearAll = useCallback(() => {
    if (polygons.length === 0) {
      showToast('На карте нет полигонов для удаления.', 'info');
      return;
    }
    confirmClearAll(); // Вызываем диалог подтверждения
  }, [polygons.length, confirmClearAll, showToast]);

  /**
   * Очищает все назначенные культуры со всех полигонов (только на фронтенде).
   * Не синхронизируется с бэкендом автоматически.
   */
  const clearAllCrops = useCallback(() => {
    console.log('clearAllCrops: Clearing all assigned crops.');
    // Обновляем локальное состояние (вызовет сохранение в localStorage).
    setPolygons((prev) => prev.map((p) => ({ ...p, crop: null })));
    showToast('Все культуры удалены с полигонов. Синхронизируйте с сервером вручную, если необходимо.', 'info');
    // Если нужно синхронизировать это с БД, потребуется отправить PUT-запросы для каждого полигоны
    // или добавить отдельный эндпоинт на бэкенде для массовой очистки культур.
  }, [showToast]);

  /**
   * Обновляет культуру для конкретного полигона в локальном состоянии.
   * Сохранение в БД будет вызвано по событию onBlur из MapSidebar.
   * @param {string} polygonId - ID полигона.
   * @param {string|null} newCombinedCrop - Новое название культуры.
   */
  const updatePolygonCrop = useCallback((polygonId, newCombinedCrop) => {
    console.log(`updatePolygonCrop: Updating polygon ${polygonId} with crop ${newCombinedCrop}.`);
    // Обновляем локальное состояние (вызовет сохранение в localStorage)
    setPolygons((prev) => {
      const updatedPolys = prev.map((p) => (p.id === polygonId ? { ...p, crop: newCombinedCrop } : p));
      return updatedPolys;
    });
  }, []);

  /**
   * Обновляет имя полигона в локальном состоянии.
   * Сохранение в БД будет вызвано по событию onBlur из MapSidebar.
   * @param {string} polygonId - ID полигона.
   * @param {string} newName - Новое имя полигона.
   */
  const updatePolygonName = useCallback((polygonId, newName) => {
    console.log(`updatePolygonName: Updating polygon ${polygonId} with name ${newName}.`);
    // Обновляем локальное состояние (вызовет сохранение в localStorage)
    setPolygons((prev) => {
      const updatedPolys = prev.map((p) =>
        p.id === polygonId ? { ...p, name: newName } : p
      );
      return updatedPolys;
    });
  }, []);

  // --- Логика редактирования полигона с помощью react-leaflet-draw ---

  /**
   * Запускает режим редактирования формы выбранного полигона на карте.
   * @param {string} polygonId - ID полигона для редактирования.
   */
  const handleEditPolygon = useCallback((polygonId) => {
    console.log(`[handleEditPolygon] Attempting to edit polygon with ID: ${polygonId}`);
    // Сбросить флаги сохранения/загрузки на всякий случай
    setIsSavingPolygon(false);
    setIsFetchingPolygons(false);

    // Очищаем режим рисования, если он активен
    if (isDrawing) {
      console.log('[handleEditPolygon] Exiting drawing mode.');
      setIsDrawing(false);
      if (window.clearCurrentPath) window.clearCurrentPath(); // Очищаем незавершенное рисование
    }

    // Если уже был активен режим редактирования (например, нажали на другой полигон),
    // очищаем предыдущие слои, которыми управлял EditControl.
    if (editableFGRef.current) {
        editableFGRef.current.clearLayers();
    }

    const polygonToEdit = polygons.find((p) => p.id === polygonId);
    if (!polygonToEdit) {
      console.error('[handleEditPolygon] Polygon for editing not found in state.');
      showToast('Полигон для редактирования не найден.', 'error');
      return;
    }

    // Устанавливаем состояния, которые вызовут рендеринг MapComponent
    // и активацию эффекта редактирования в нем
    setIsEditingMode(true); // Активируем режим редактирования формы
    setEditingMapPolygon(polygonToEdit); // Передаем полигон для редактирования в MapComponent
    setSelectedPolygon(polygonToEdit.id); // Выбираем этот полигон в боковой панели
    showToast(`Начато редактирование формы полигона "${polygonToEdit.name || polygonToEdit.id}".`, 'info');
    console.log('[handleEditPolygon] isEditingMode set to TRUE. isSavingPolygon and isFetchingPolygons set to FALSE.');
  }, [polygons, isDrawing, showToast]);

  /**
   * Функция для программной остановки и сохранения редактирования (как формы, так и карты).
   * Вызывается из MapSidebar, когда пользователь завершает редактирование.
   */
  const handleStopAndSaveEdit = useCallback(() => {
    console.log('handleStopAndSaveEdit: Attempting to stop and save.');
    // Если мы в режиме рисования, завершаем рисование (и очищаем DrawingHandler)
    if (isDrawing) {
      if (window.clearCurrentPath) window.clearCurrentPath();
      stopDrawing();
      showToast('Рисование остановлено.', 'info');
    }
    // Если мы в режиме редактирования формы/карты, сохраняем изменения.
    else if (isEditingMode && editableFGRef.current) {
      // Итерируем по слоям в FeatureGroup (ожидаем один полигон)
      editableFGRef.current.eachLayer(layer => {
        if (layer.editing && layer.editing.enabled()) {
          console.log('handleStopAndSaveEdit: Disabling editing for active layer.');
          layer.editing.disable(); // Отключаем режим редактирования Leaflet

          if (editingMapPolygon) {
              const geoJson = layer.toGeoJSON(); // Получаем GeoJSON из отредактированного слоя
              // Преобразуем координаты обратно в формат [lat, lng]
              const updatedCoords = geoJson.geometry.coordinates[0].map(coord => [coord[1], coord[0]]);

              // Находим текущий полигон в состоянии по его ID
              const currentPolygonInState = polygons.find(p => p.id === editingMapPolygon.id);
              if (currentPolygonInState) {
                  // Создаем обновленный объект полигона
                  const updatedPoly = {
                      ...currentPolygonInState,
                      coordinates: updatedCoords, // Обновленные координаты
                  };
                  // Обновляем локальное состояние полигонов.
                  // Это вызовет сохранение в localStorage через useEffect.
                  setPolygons(prev => prev.map(p => p.id === updatedPoly.id ? updatedPoly : p));
                  showToast('Форма полигона обновлена и сохранена локально! Отправка на сервер...', 'info');
                  // Отправляем обновленный полигон на сервер (isUpdate = true)
                  savePolygonToDatabase(updatedPoly, true);
              }
          }
        }
      });
      // Принудительно сбрасываем состояния режима редактирования
      console.log('handleStopAndSaveEdit: Forcing state reset for editing mode.');
      setIsEditingMode(false);
      setEditingMapPolygon(null);
      editableFGRef.current?.clearLayers(); // Очищаем слои в FeatureGroup
      showToast('Редактирование завершено и сохранено.', 'success');
    } else {
      showToast('Нет активных режимов для сохранения.', 'info');
    }
  }, [isDrawing, stopDrawing, isEditingMode, editingMapPolygon, polygons, savePolygonToDatabase, showToast]);


  // Коллбэк, вызываемый EditControl после завершения редактирования формы полигона (редко используется напрямую)
  // Основная логика сохранения измененных координат формы происходит в handleStopAndSaveEdit.
  const onPolygonEdited = useCallback(async (e) => {
    console.log('onPolygonEdited: Event received from EditControl. Layers:', e.layers);
    // В этом проекте, handleStopAndSaveEdit берет на себя основную логику сохранения,
    // но если вы хотите обрабатывать событие прямо здесь, вы можете.
    // Если isEditingMode остается активным после этого события, возможно, есть проблема в логике сброса.
    if (isEditingMode) {
      // Это может быть признаком того, что handleStopAndSaveEdit не был вызван,
      // или произошел какой-то сбой.
      console.warn("onPolygonEdited fired, but isEditingMode is still true. Investigate.");
    }
  }, [isEditingMode]);


  /**
   * Загружает "Мои полигоны" с сервера.
   */
  const showMyPolygons = useCallback(async () => {
    showToast('Загрузка ваших полигонов с сервера...', 'info');

    const token = localStorage.getItem('token');
    if (!token) {
      showToast('Ошибка: Токен аутентификации отсутствует. Пожалуйста, войдите в систему.', 'error');
      console.error('Ошибка: Токен аутентификации отсутствует.');
      return;
    }

    setIsFetchingPolygons(true); // Устанавливаем флаг загрузки
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
              const parsedGeoJson = JSON.parse(item.geoJson);
              let geometryData = parsedGeoJson;

              // Если это FeatureCollection или Feature, извлекаем geometry
              if (parsedGeoJson.type === "FeatureCollection" && parsedGeoJson.features && parsedGeoJson.features[0] && parsedGeoJson.features[0].geometry) {
                geometryData = parsedGeoJson.features[0].geometry;
              } else if (parsedGeoJson.type === "Feature" && parsedGeoJson.geometry) {
                geometryData = parsedGeoJson.geometry;
              }

              // Проверяем, что это полигон и извлекаем координаты
              if (geometryData && geometryData.type === "Polygon" && geometryData.coordinates && geometryData.coordinates[0]) {
                coordinates = geometryData.coordinates[0].map(coord => [coord[1], coord[0]]); // GeoJSON [lng, lat] to Leaflet [lat, lng]
              } else {
                console.warn('Неверная структура GeoJSON Geometry для элемента:', item);
              }
            } catch (e) {
              console.error('Не удалось разобрать geoJson для элемента:', item, e);
            }

            return {
              id: String(item.id), // Убедимся, что ID строка
              coordinates: coordinates,
              color: `hsl(${Math.random() * 360}, 70%, 50%)`, // Генерируем случайный цвет
              crop: crop,
              name: name
            };
          }).filter(p => p.coordinates.length >= 3); // Отфильтровываем неполные полигоны

          setPolygons(loadedPolygons); // Обновляем основное состояние полигонов (вызовет сохранение в localStorage)
          showToast(`Загружено ${loadedPolygons.length} ваших полигонов с сервера.`, 'success');

          // Сбросим все режимы после успешной загрузки
          setIsDrawing(false);
          setIsEditingMode(false);
          setEditingMapPolygon(null);
          editableFGRef.current?.clearLayers();
          setSelectedPolygon(null);
        } else {
          showToast('Сервер вернул некорректный формат данных для полигонов.', 'error');
          console.error('Сервер вернул некорректный формат данных:', data);
        }

    } catch (error) {
        showToast(`Не удалось загрузить мои полигоны с сервера: ${error.message}`, 'error');
        console.error('Ошибка при загрузке моих полигонов с сервера:', error);
    } finally {
      setIsFetchingPolygons(false); // Снимаем флаг загрузки
    }
  }, [showToast]);

  // Эффект для инициализации полигонов: сначала из localStorage, затем (если нет) из API
  useEffect(() => {
    let loadedFromLocalStorage = false;
    try {
      const storedPolygons = localStorage.getItem('savedPolygons');
      if (storedPolygons !== null && storedPolygons !== '[]') { // Проверяем, что не null и не пустой массив
        const parsedPolygons = JSON.parse(storedPolygons);
        console.log('Parsed polygons from localStorage:', parsedPolygons);

        // Дополнительная валидация, чтобы убедиться, что данные выглядят как массив полигонов
        if (Array.isArray(parsedPolygons) && parsedPolygons.every(p => p && p.coordinates && Array.isArray(p.coordinates) && p.coordinates.length >= 3)) {
          setPolygons(parsedPolygons);
          showToast('Полигоны загружены с локального устройства.', 'success');
          loadedFromLocalStorage = true;
          console.log('Polygons successfully loaded from localStorage into state.');
        } else {
          console.warn('Неверный формат данных полигонов в localStorage. Очищаю и пытаюсь загрузить с сервера.', parsedPolygons);
          localStorage.removeItem('savedPolygons'); // Очищаем поврежденные или некорректные данные
        }
      }
    } catch (error) {
      console.error("Критическая ошибка парсинга полигонов из localStorage. Очищаю и пытаюсь загрузить с сервера:", error);
      showToast('Критическая ошибка загрузки полигонов с локального устройства, пытаюсь загрузить с сервера.', 'error');
      localStorage.removeItem('savedPolygons'); // Очищаем данные, вызвавшие ошибку
    }

    // Если не удалось загрузить из localStorage, или localStorage был пуст/некорректен, загружаем с сервера
    if (!loadedFromLocalStorage) {
      showMyPolygons();
    }
  }, [showToast, showMyPolygons]); // showMyPolygons в зависимостях, чтобы гарантировать его актуальность

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%' }}>
      {/* Компонент карты */}
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
        // ✅ ПЕРЕДАЕМ BASE_API_URL В MAPCOMPONENT
        baseApiUrl={BASE_API_URL}
        calculateArea={calculateArea}
        formatArea={formatArea}
        // Передаем состояния и сеттеры для инфо-блока в MapComponent
        infoBoxVisible={infoBoxVisible}
        setInfoBoxVisible={setInfoBoxVisible}
        infoBoxLat={infoBoxLat}
        setInfoBoxLat={setInfoBoxLat}
        infoBoxLng={infoBoxLng}
        setInfoBoxLng={setInfoBoxLng}
        infoBoxNdvi={infoBoxNdvi}
        setInfoBoxNdvi={setInfoBoxNdvi}
        infoBoxLoading={infoBoxLoading}
        setInfoBoxLoading={setInfoBoxLoading}
      />

      {/* Компонент боковой панели */}
      <MapSidebar
        polygons={polygons}
        selectedPolygon={selectedPolygon}
        setSelectedPolygon={setSelectedPolygon}
        deletePolygon={deletePolygon}
        handleEditPolygon={handleEditPolygon}
        crops={crops}
        loadingCrops={loadingCrops}
        // ... (остальные пропсы для MapSidebar)
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

      {/* Компонент тост-уведомлений */}
      <ToastNotification
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
      />

      {/* Диалог подтверждения очистки всех полигонов */} 
      {showClearAllConfirm && ( 
        <ConfirmDialog 
          message="Вы уверены, что хотите удалить ВСЕ полигоны? Это действие необратимо." 
          onConfirm={handleClearAllConfirmed} 
          onCancel={cancelClearAll} 
          isProcessing={isSavingPolygon} // Используем isSavingPolygon как индикатор процесса 
        /> 
      )}
    </div>
  );
}
