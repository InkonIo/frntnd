// InfoOverlay component (no changes needed for its functionality related to the map)
import React from 'react';

export default function InfoOverlay({
  infoBoxVisible,
  infoBoxLat,
  infoBoxLng,
  infoBoxNdvi,
  infoBoxLoading,
  sentinelLayerId,
  setSentinelLayerId,
  sentinelLayerOptions,
}) {
  return (
    <div style={{
      position: 'fixed',
      backgroundColor: '#ffff',
      bottom: '16px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '9999999',
      pointerEvents: 'auto',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    }}>
      {infoBoxVisible && (
        <div className="flex flex-col items-center space-y-3 bg-white/10 rounded-2xl shadow-2xl p-4 backdrop-blur-lg border border-white/20">
          <div
            className="text-white rounded-xl p-3 flex flex-col items-center justify-center space-y-1 w-full"
            style={{ pointerEvents: 'none' }}
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
              Выбрать слой Sentinel:
            </label>
            <select
              id="sentinel-layer-select-control"
              value={sentinelLayerId}
              onChange={(e) => setSentinelLayerId(e.target.value)}
              className="bg-white/20 text-white rounded-lg text-sm py-2 px-3 focus:outline-none focus:ring-2 focus:ring-blue-300 border border-white/30 w-full hover:bg-white/30 transition-colors duration-200"
            >
              {sentinelLayerOptions.map(option => (
                <option key={option.id} value={option.id} className="bg-gray-800 text-white">
                  {option.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}