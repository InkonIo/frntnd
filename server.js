// server.js
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const CLIENT_ID = '08334a15-ece3-4d02-9bb4-a0e436612327';
const CLIENT_SECRET = 'E2fiZilL0t32ZQB4HrxUc70Ygp74VHm2';

let accessToken = null;
let tokenExpiry = null;

async function getAccessToken() {
  const now = Date.now();
  if (accessToken && tokenExpiry && now < tokenExpiry) return accessToken;

  const response = await axios.post(
    'https://services.sentinel-hub.com/oauth/token',
    new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'client_credentials'
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  accessToken = response.data.access_token;
  tokenExpiry = now + response.data.expires_in * 1000 - 60 * 1000;
  return accessToken;
}

app.post('/ndvi', async (req, res) => {
  const { lat, lon } = req.body;

  if (!lat || !lon) {
    return res.status(400).json({ error: 'lat и lon обязательны' });
  }

  try {
    const token = await getAccessToken();

    const delta = 0.0001;
    const coordinates = [
      [
        [lon - delta, lat - delta],
        [lon + delta, lat - delta],
        [lon + delta, lat + delta],
        [lon - delta, lat + delta],
        [lon - delta, lat - delta]
      ]
    ];

    const response = await axios.post(
      'https://services.sentinel-hub.com/api/v1/statistics',
      {
        input: {
          bounds: {
            geometry: {
              type: 'Polygon',
              coordinates: coordinates
            }
          },
          data: [
            {
              type: 'sentinel-2-l2a',
              dataFilter: {
                timeRange: {
                  from: '2025-06-01T00:00:00Z',
                  to: '2025-06-24T23:59:59Z',
                },
                mosaickingOrder: 'leastCC'
              }
            }
          ]
        },
        aggregation: {
          timeRange: {
            from: '2025-06-01T00:00:00Z',
            to: '2025-06-24T23:59:59Z',
          },
          aggregationInterval: { of: 'P1D' },
          resx: 10,
          resy: 10,
          evalscript: `//VERSION=3
            function setup() {
              return {
                input: [{ bands: ["B04", "B08", "dataMask"] }],
                output: [
                  { id: "ndvi", bands: 1 },
                  { id: "dataMask", bands: 1 }
                ]
              };
            }
            function evaluatePixel(s) {
              let ndvi = (s.B08 - s.B04) / (s.B08 + s.B04);
              return {
                ndvi: [ndvi],
                dataMask: [s.dataMask]
              };
            }
          `
        }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const intervals = response.data.data;
    const latest = [...intervals].reverse().find(i =>
      i.outputs?.ndvi?.bands?.B0?.stats?.mean !== undefined
    );

    const ndvi = latest?.outputs?.ndvi?.bands?.B0?.stats?.mean ?? null;

    res.json({ ndvi });
  } catch (error) {
    console.error('NDVI ошибка:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Не удалось получить NDVI',
      details: error.response?.data || error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`✅ NDVI сервер слушает: http://localhost:${PORT}`);
});
