const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// OMDB API Key (stored in backend)
const OMDB_API_KEY = 'a5712ecb';
const OMDB_BASE = 'https://www.omdbapi.com/';

// OMDB Search Endpoint
app.get('/api/omdb/search', async (req, res) => {
  try {
    const { query, type, year, page } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const params = new URLSearchParams({
      apikey: OMDB_API_KEY,
      s: query,
      ...(type && { type }),
      ...(year && { y: year }),
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
    
    if (!imdbID) {
      return res.status(400).json({ error: 'IMDb ID is required' });
    }

    const params = new URLSearchParams({
      apikey: OMDB_API_KEY,
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
    const { title } = req.query;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const params = new URLSearchParams({
      apikey: OMDB_API_KEY,
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`MovieDock Backend running on http://localhost:${PORT}`);
  console.log(`OMDB API Key configured: ${OMDB_API_KEY.substring(0, 3)}...`);
});
