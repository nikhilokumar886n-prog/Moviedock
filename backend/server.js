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

function normalizeSearchKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildSearchVariants(query) {
  const rawQuery = String(query || '').trim();
  const compactQuery = normalizeSearchKey(rawQuery);
  const variants = [];
  const pushVariant = value => {
    if (value && !variants.includes(value)) {
      variants.push(value);
    }
  };

  pushVariant(rawQuery);

  if (compactQuery && compactQuery !== normalizeSearchKey(rawQuery)) {
    pushVariant(compactQuery);
  }

  if (compactQuery && compactQuery.length <= 6 && /^[a-z0-9]+$/i.test(compactQuery)) {
    pushVariant(compactQuery.split('').join('.'));
    pushVariant(compactQuery.split('').join(' '));
  }

  return variants;
}

function scoreSearchResult(query, movie, variantRank) {
  const normalizedQuery = normalizeSearchKey(query);
  const normalizedTitle = normalizeSearchKey(movie.Title);
  const startsWithQuery = normalizedTitle.startsWith(normalizedQuery);
  const containsQuery = normalizedTitle.includes(normalizedQuery);
  const titleHasVariantPunctuation = /[.\-:]/.test(movie.Title);
  const score = {
    variantRank,
    exactTitle: normalizedTitle === normalizedQuery ? 0 : 1,
    titleMatch: startsWithQuery ? 0 : containsQuery ? 1 : 2,
    typePenalty: movie.Type === 'series' ? 1 : 0,
    punctuationBonus: titleHasVariantPunctuation && normalizedQuery.length <= 6 ? -1 : 0,
    lengthDelta: Math.abs(normalizedTitle.length - normalizedQuery.length),
    titleLength: movie.Title.length
  };

  return score;
}

function compareSearchScores(a, b) {
  return a.variantRank - b.variantRank ||
    a.exactTitle - b.exactTitle ||
    a.titleMatch - b.titleMatch ||
    a.typePenalty - b.typePenalty ||
    a.punctuationBonus - b.punctuationBonus ||
    a.lengthDelta - b.lengthDelta ||
    a.titleLength - b.titleLength ||
    a.movie.Title.localeCompare(b.movie.Title);
}

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

    const variants = buildSearchVariants(searchQuery);
    const collected = [];

    for (let variantRank = 0; variantRank < variants.length; variantRank++) {
      const variant = variants[variantRank];
      const params = new URLSearchParams({
        apikey: activeKey,
        s: variant,
        ...(type && { type }),
        ...(year && { y: year }),
        ...(y && { y }),
        ...(page && { page })
      });

      const response = await fetch(`${OMDB_BASE}?${params.toString()}`);
      const data = await response.json();
      if (data && Array.isArray(data.Search)) {
        data.Search.forEach(movie => {
          if (movie && movie.imdbID) {
            collected.push({ movie, score: scoreSearchResult(searchQuery, movie, variantRank) });
          }
        });
      }
    }

    const merged = new Map();
    for (const entry of collected) {
      const existing = merged.get(entry.movie.imdbID);
      if (!existing || compareSearchScores(entry, existing) < 0) {
        merged.set(entry.movie.imdbID, entry);
      }
    }

    const Search = [...merged.values()]
      .sort(compareSearchScores)
      .map(entry => entry.movie);

    if (!Search.length) {
      return res.json({ Response: 'False', Error: 'Movie not found!' });
    }

    res.json({ Search, totalResults: String(Search.length), Response: 'True' });
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
