// components/ForMap/MapSidebar.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { Menu, Transition } from '@headlessui/react'; // Используем Menu и Transition для выпадающего меню
import { Fragment } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBars, faPlus, faEdit, faTrash, faCropSimple, faVectorSquare, faSignOutAlt, faSeedling, faLayerGroup, faSave, faTimes, faCloudArrowUp, faCloudArrowDown, faEraser,
  faHome, faRobot, faMountainSun, faListUl // Добавлены иконки для навигации
} from '@fortawesome/free-solid-svg-icons';
import L from 'leaflet';
import './MapSidebar.css'
import { Link } from 'react-router-dom'; // Импортируем Link из react-router-dom

export default function MapSidebar({
  polygons = [],
  selectedPolygon,
  setSelectedPolygon,
  deletePolygon,
  handleEditPolygon,
  crops,
  loadingCrops,
  cropsError,
  fetchCropsFromAPI,
  clearAllCrops,
  calculateArea = (coords) => { console.warn("calculateArea prop is missing or invalid, using default."); return 0; },
  formatArea = (area) => { console.warn("formatArea prop is missing or invalid, using default."); return `${area} м²`; },
  updatePolygonCrop,
  updatePolygonName,
  startDrawing,
  stopDrawing,
  handleStopAndSaveEdit,
  isDrawing,
  isEditingMode,
  clearAll,
  handleLogout,
  showMyPolygons,
  isSavingPolygon,
  isFetchingPolygons,
  showToast,
  showCropsSection,
  savePolygonToDatabase,
  baseApiUrl,
  // sentinelLayerId, // УДАЛЕНО: Теперь управляется MapComponent
  // setSentinelLayerId, // УДАЛЕНО: Теперь управляется MapComponent
}) {
  // Сайдбар по умолчанию свернут (для hover эффекта)
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [editingCrop, setEditingCrop] = useState('');
  const [editingComment, setEditingComment] = useState('');
  const [isNameEditing, setIsNameEditing] = useState(false);
  const [isCropEditing, setIsCropEditing] = useState(false);

  useEffect(() => {
    if (selectedPolygon) {
      const poly = polygons.find(p => p.id === selectedPolygon);
      if (poly) {
        setEditingName(poly.name || '');
        const [cropPart, commentPart] = poly.crop ? poly.crop.split(' - ', 2) : ['', ''];
        setEditingCrop(cropPart);
        setEditingComment(commentPart || '');
      }
    } else {
      setEditingName('');
      setEditingCrop('');
      setEditingComment('');
    }
    setIsNameEditing(false);
    setIsCropEditing(false);
  }, [selectedPolygon, polygons]);


  const combineCropAndComment = useCallback((crop, comment) => {
    if (comment && comment.trim() !== '') {
      return `${crop || ''} - ${comment.trim()}`;
    }
    return crop || '';
  }, []);

  const handleNameBlur = useCallback(() => {
    if (selectedPolygon) {
      setIsNameEditing(false);
      const poly = polygons.find(p => p.id === selectedPolygon);
      if (poly && poly.name !== editingName) {
        if (editingName.trim() === '') {
          showToast('Название полигона не может быть пустым.', 'error');
          setEditingName(poly.name);
          return;
        }
        updatePolygonName(selectedPolygon, editingName);
        savePolygonToDatabase({ ...poly, name: editingName }, true);
      }
    }
  }, [selectedPolygon, polygons, editingName, updatePolygonName, savePolygonToDatabase, showToast]);

  const handleCropAndCommentBlur = useCallback(() => {
    if (selectedPolygon) {
      setIsCropEditing(false);
      const poly = polygons.find(p => p.id === selectedPolygon);
      if (poly) {
        const newCombinedCrop = combineCropAndComment(editingCrop, editingComment);
        if (poly.crop !== newCombinedCrop) {
          updatePolygonCrop(selectedPolygon, newCombinedCrop);
          savePolygonToDatabase({ ...poly, crop: newCombinedCrop }, true);
        }
      }
    }
  }, [selectedPolygon, polygons, editingCrop, editingComment, combineCropAndComment, updatePolygonCrop, savePolygonToDatabase]);

  const handleCropChange = useCallback((e) => {
    const newCrop = e.target.value;
    setEditingCrop(newCrop);
  }, []);

  const handleCommentChange = useCallback((e) => {
    const newComment = e.target.value;
    setEditingComment(newComment);
  }, []);


  const safeCalculateArea = typeof calculateArea === 'function' ? calculateArea : (coords) => { console.warn("Using fallback calculateArea."); return 0; };
  const safeFormatArea = typeof formatArea === 'function' ? formatArea : (area) => { console.warn("Using fallback formatArea."); return `${area} м²`; };


  const totalArea = polygons.reduce((sum, p) => sum + safeCalculateArea(p.coordinates), 0);
  const formattedTotalArea = safeFormatArea(totalArea);


  const cropAreaSummary = polygons.reduce((acc, p) => {
    if (p.crop) {
      const area = safeCalculateArea(p.coordinates);
      acc[p.crop] = (acc[p.crop] || 0) + area;
    }
    return acc;
  }, {});

  // SentinelLayerOptions УДАЛЕНЫ отсюда, так как они перемещены в MapComponent

  return (
    // Главный контейнер сайдбара, реагирующий на наведение
    <div
      className={`sidebar-container ${isSidebarExpanded ? 'expanded' : 'collapsed'}`}
      onMouseEnter={() => setIsSidebarExpanded(true)}
      onMouseLeave={() => setIsSidebarExpanded(false)}
    >
      {/* Кнопка бургер-меню (всегда видна, открывает выпадающее меню) */}
      <div className="absolute top-4 left-0 z-50 burger-menu-wrapper">
        <Menu as="div" className="relative inline-block text-left">
          <div>
            <Menu.Button className="p-2 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 transition-all duration-200">
              <FontAwesomeIcon icon={faBars} className="w-5 h-5" />
            </Menu.Button>
          </div>

          <Transition
            as={Fragment}
            enter="transition ease-out duration-100"
            enterFrom="transform opacity-0 scale-95"
            enterTo="transform opacity-100 scale-100"
            leave="transition ease-in duration-75"
            leaveFrom="transform opacity-100 scale-100"
            leaveTo="transform opacity-0 scale-95"
          >
            <Menu.Items className="absolute left-full ml-2 w-56 origin-top-left map-sidebar-dropdown-menu">
              <div className="py-1">
                <Menu.Item>
                  {({ active }) => (
                    <Link to="/home" className={`${active ? 'bg-gray-800' : 'text-gray-200'} group flex items-center w-full px-4 py-2 text-sm`}>
                      <FontAwesomeIcon icon={faHome} className="mr-3 h-5 w-5 text-gray-400 group-hover:text-white" />
                      Главная
                    </Link>
                  )}
                </Menu.Item>
                <Menu.Item>
                  {({ active }) => (
                    <Link to="/chat" className={`${active ? 'bg-gray-800' : 'text-gray-200'} group flex items-center w-full px-4 py-2 text-sm`}>
                      <FontAwesomeIcon icon={faRobot} className="mr-3 h-5 w-5 text-gray-400 group-hover:text-white" />
                      Чат ИИ
                    </Link>
                  )}
                </Menu.Item>
                <Menu.Item>
                  {({ active }) => (
                    <Link to="/earthdata" className={`${active ? 'bg-gray-800' : 'text-gray-200'} group flex items-center w-full px-4 py-2 text-sm`}>
                      <FontAwesomeIcon icon={faMountainSun} className="mr-3 h-5 w-5 text-gray-400 group-hover:text-white" />
                      Почва
                    </Link>
                  )}
                </Menu.Item>
                {/* Пункт "Мои полигоны" (Карта) не добавляем, так как мы уже на карте */}
                <div className="border-t border-gray-700 my-1"></div>
                <Menu.Item>
                  {({ active }) => (
                    <button
                      onClick={handleLogout}
                      className={`${active ? 'bg-red-700' : 'map-logout'} group flex items-center w-full px-4 py-2 text-sm text-white`}
                    >
                      <FontAwesomeIcon icon={faSignOutAlt} className="mr-3 h-5 w-5 text-white group-hover:text-white" />
                      Выйти
                    </button>
                  )}
                </Menu.Item>
              </div>
            </Menu.Items>
          </Transition>
        </Menu>
      </div>

      {/* Контейнер для основных кнопок действий (иконки + текст при разворачивании) */}
      <div className="main-action-buttons-wrapper">
        <button
          onClick={startDrawing}
          disabled={isDrawing || isEditingMode}
          className={`sidebar-icon-button ${isDrawing ? 'bg-blue-800' : 'bg-blue-600'} text-white hover:bg-blue-700`}
          title="Начать рисование полигона"
        >
          <FontAwesomeIcon icon={faPlus} className="w-5 h-5" />
          <span className="button-text">Начать рисование</span>
        </button>

        <button
          onClick={handleStopAndSaveEdit}
          disabled={!isDrawing && !isEditingMode && !selectedPolygon}
          className={`sidebar-icon-button ${(!isDrawing && !isEditingMode && !selectedPolygon) ? 'bg-gray-700' : 'bg-green-600'} text-white hover:bg-green-700`}
          title="Сохранить/Завершить редактирование"
        >
          <FontAwesomeIcon icon={faSave} className="w-5 h-5" />
          <span className="button-text">Сохранить/Завершить</span>
        </button>

        <button
          onClick={showMyPolygons}
          disabled={isSavingPolygon || isFetchingPolygons || isDrawing || isEditingMode}
          className={`sidebar-icon-button btn-transparent-dark ${isFetchingPolygons ? 'opacity-70 cursor-not-allowed' : ''}`}
          title="Загрузить мои полигоны"
        >
          {isFetchingPolygons ? (
            <span className="loader-spin inline-block h-4 w-4 border-2 border-t-2 border-blue-400 rounded-full"></span>
          ) : (
            <FontAwesomeIcon icon={faCloudArrowDown} className="w-5 h-5" />
          )}
          <span className="button-text">Загрузить полигоны</span>
        </button>

        <button
          onClick={clearAll}
          disabled={polygons.length === 0 || isDrawing || isEditingMode || isSavingPolygon || isFetchingPolygons}
          className={`sidebar-icon-button bg-red-800 text-white hover:bg-red-900 ${polygons.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
          title="Удалить все полигоны"
        >
          <FontAwesomeIcon icon={faEraser} className="w-5 h-5" />
          <span className="button-text">Удалить все</span>
        </button>

        <button
          onClick={clearAllCrops}
          disabled={polygons.length === 0 || isDrawing || isEditingMode || isSavingPolygon || isFetchingPolygons}
          className={`sidebar-icon-button bg-purple-700 text-white hover:bg-purple-800 ${polygons.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
          title="Очистить все культуры"
        >
          <FontAwesomeIcon icon={faSeedling} className="w-5 h-5" />
          <span className="button-text">Очистить культуры</span>
        </button>
      </div>

      {/* Основное содержимое сайдбара, которое появляется при разворачивании */}
      <div className={`collapsible-content ${isSidebarExpanded ? 'expanded' : ''}`}>
        <h2 className="text-xl font-bold text-gray-100 mb-6 main-title">Панель управления картой</h2> {/* Уменьшен размер шрифта */}

        {/* Секция управления слоями Sentinel Hub УДАЛЕНА ИЗ САЙДБАРА */}

        {/* Список полигонов */}
        <div className="section-block flex-grow overflow-y-auto polygon-list-container">
          <h3>Мои полигоны</h3>
          {isFetchingPolygons ? (
            <div className="text-center text-gray-400 py-4">
              <span className="loader-spin inline-block h-6 w-6 border-4 border-t-4 border-blue-500 rounded-full"></span>
              <p className="mt-2">Загрузка полигонов...</p>
            </div>
          ) : polygons.length === 0 ? (
            <p className="text-gray-400 text-sm">Полигоны пока не добавлены.</p>
          ) : (
            <ul className="space-y-3">
              {polygons.map((polygon) => (
                <li
                  key={polygon.id}
                  onClick={() => setSelectedPolygon(polygon.id)}
                  className={`polygon-item ${selectedPolygon === polygon.id ? 'selected' : ''}`}
                >
                  {isNameEditing && selectedPolygon === polygon.id ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={handleNameBlur}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.target.blur();
                      }}
                      className="w-full bg-gray-700 text-white rounded px-2 py-1"
                      autoFocus
                    />
                  ) : (
                    <strong
                      className="text-gray-100 block truncate"
                      onClick={(e) => { e.stopPropagation(); setSelectedPolygon(polygon.id); setIsNameEditing(true); }}
                      title={polygon.name}
                    >
                      {polygon.name || 'Без названия'}
                    </strong>
                  )}

                  <p className="text-gray-400 text-sm mt-1">
                    Площадь: {safeFormatArea(safeCalculateArea(polygon.coordinates))}
                  </p>
                  
                  <p className="text-gray-400 text-sm">
                    Культура:
                    {isCropEditing && selectedPolygon === polygon.id ? (
                      <select
                        value={editingCrop}
                        onChange={handleCropChange}
                        onBlur={handleCropAndCommentBlur}
                        className="w-full bg-gray-700 text-white rounded px-2 py-1 mt-1"
                        autoFocus
                      >
                        <option value="">Не выбрана</option>
                        {crops.map((cropName) => (
                          <option key={cropName} value={cropName}>{cropName}</option>
                        ))}
                      </select>
                    ) : (
                      <span
                        className={`inline-block ml-1 px-2 py-1 rounded-md text-green-400 bg-green-900/20`}
                        onClick={(e) => { e.stopPropagation(); setSelectedPolygon(polygon.id); setIsCropEditing(true); }}
                        title={polygon.crop}
                      >
                        {editingCrop || 'Не указана'}
                      </span>
                    )}
                  </p>
                  <p className="text-gray-400 text-sm mt-1">
                    Комментарий:
                    <input
                      type="text"
                      value={editingComment}
                      onChange={handleCommentChange}
                      onBlur={handleCropAndCommentBlur}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.target.blur();
                      }}
                      className="w-full bg-gray-700 text-white rounded px-2 py-1 mt-1"
                      placeholder="Добавить комментарий..."
                    />
                  </p>


                  <div className="flex justify-end space-x-2 mt-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEditPolygon(polygon.id); }}
                      className="sidebar-button bg-yellow-600 text-white hover:bg-yellow-700 px-2 py-1"
                      title="Редактировать форму полигона"
                      disabled={isDrawing || isEditingMode}
                    >
                      <FontAwesomeIcon icon={faVectorSquare} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deletePolygon(polygon.id); }}
                      className="sidebar-button bg-red-600 text-white hover:bg-red-700 px-2 py-1"
                      title="Удалить полигон"
                      disabled={isDrawing || isEditingMode}
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Секция сводки */}
        <div className="section-block summary-block">
          <h3>Сводка по площадям</h3>
          <p className="text-gray-200 text-sm mb-2">Общая площадь: <span className="font-semibold text-gray-50">{formattedTotalArea}</span></p>
          <h4 className="text-gray-300 text-sm font-semibold mb-1">По культурам:</h4>
          {Object.keys(cropAreaSummary).length === 0 ? (
            <p className="text-gray-400 text-xs">Культуры не назначены.</p>
          ) : (
            <ul className="flex flex-wrap gap-2 text-xs">
              {Object.entries(cropAreaSummary).map(([crop, area]) => (
                <li key={crop} className="px-2 py-1 rounded-md bg-green-900/20 text-green-400 font-medium">
                  {crop}: {safeFormatArea(area)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
