// server.js
const express = require('express');
const cors = require('cors'); // Import cors module
const app = express();
const PORT = 3000;

// IMPORTANT: Replace with your actual Sentinel Hub Instance ID
// This ID is used for the WMS service on the frontend.
// If you want your backend to also interact with Sentinel Hub (e.g., for processing data),
// you'll need your Sentinel Hub OAuth client credentials here and implement that logic.
const SENTINEL_HUB_INSTANCE_ID = 'f15c44d0-bbb8-4c66-b94e-6a8c7ab39349';

// Enable CORS for all origins (for development purposes)
app.use(cors());
app.use(express.json()); // To parse JSON request bodies

// Mock endpoint for NDVI data
app.post('/ndvi', (req, res) => {
  const { lat, lon } = req.body;
  if (typeof lat === 'undefined' || typeof lon === 'undefined') {
    return res.status(400).json({ error: 'Latitude and Longitude are required.' });
  }

  // Simulate fetching NDVI data from Sentinel Hub
  // In a real application, you would make an actual API call to Sentinel Hub here,
  // authenticate, fetch imagery, and calculate NDVI for the given coordinates.
  // For demonstration, we'll return a random NDVI value.
  const mockNdvi = (Math.random() * 2 - 1).toFixed(4); // NDVI ranges from -1 to 1

  console.log(`Received request for NDVI at Lat: ${lat}, Lon: ${lon}. Returning mock NDVI: ${mockNdvi}`);
  res.json({ lat, lon, ndvi: parseFloat(mockNdvi) });
});

// Start the server
app.listen(PORT, () => {
  console.log(`NDVI mock server running on http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop the server.');
});
