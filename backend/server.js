const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// OMDB API Key (stored in backend)
const OMDB_API_KEY = process.env.OMDB_API_KEY;
if (!OMDB_API_KEY) {
  throw new Error('OMDB_API_KEY is required in backend/.env');
}
const OMDB_BASE = 'https://www.omdbapi.com/';

// OMDB Search Endpoint
app.get('/api/omdb/search', async (req, res) => {
  try {
    const { query, s, type, year, y, page, apikey } = req.query;
    const searchQuery = query || s;
    const activeKey = apikey || OMDB_API_KEY;
    
    if (!searchQuery) {
      return res.status(400).json({ error: 'Query is required' });
    }

    if (!activeKey) {
      return res.status(500).json({ error: 'OMDB_API_KEY is required' });
    }

    const params = new URLSearchParams({
      apikey: activeKey,
      s: searchQuery,
      ...(type && { type }),
      ...(year && { y: year }),
      ...(y && { y }),
      ...(page && { page })
    });

    const response = await fetch(`${OMDB_BASE}?${params.toString()}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// OMDB Details by ID Endpoint
app.get('/api/omdb/details/:imdbID', async (req, res) => {
  try {
    const { imdbID } = req.params;
    const { apikey } = req.query;
    const activeKey = apikey || OMDB_API_KEY;
    
    if (!imdbID) {
      return res.status(400).json({ error: 'IMDb ID is required' });
    }

    if (!activeKey) {
      return res.status(500).json({ error: 'OMDB_API_KEY is required' });
    }

    const params = new URLSearchParams({
      apikey: activeKey,
      i: imdbID,
      plot: 'full'
    });

    const response = await fetch(`${OMDB_BASE}?${params.toString()}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// OMDB Details by Title Endpoint
app.get('/api/omdb/title', async (req, res) => {
  try {
    const { title, apikey } = req.query;
    const activeKey = apikey || OMDB_API_KEY;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    if (!activeKey) {
      return res.status(500).json({ error: 'OMDB_API_KEY is required' });
    }

    const params = new URLSearchParams({
      apikey: activeKey,
      t: title,
      plot: 'full'
    });

    const response = await fetch(`${OMDB_BASE}?${params.toString()}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'Backend is running' });
});

// Serve the frontend files from the backend so the UI and API share one origin
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`MovieDock Backend running on http://localhost:${PORT}`);
  console.log(`OMDB API Key configured: ${OMDB_API_KEY.substring(0, 3)}...`);
});
