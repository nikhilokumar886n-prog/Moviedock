const express = require('express');
const Watched = require('../models/Watched');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get all watched items
router.get('/', authenticateToken, async (req, res) => {
  try {
    const items = await Watched.find({ userId: req.user.id }).sort({ watchedAt: -1 });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add to watched
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { imdbID, title, year, type, poster, imdbRating } = req.body;
    
    if (!imdbID) {
      return res.status(400).json({ error: 'IMDb ID required' });
    }

    // Check if already exists
    const existing = await Watched.findOne({ userId: req.user.id, imdbID });
    if (existing) {
      return res.status(409).json({ error: 'Already marked as watched' });
    }

    const item = new Watched({
      userId: req.user.id,
      imdbID,
      title,
      year,
      type,
      poster,
      imdbRating
    });

    await item.save();
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remove from watched
router.delete('/:imdbID', authenticateToken, async (req, res) => {
  try {
    const { imdbID } = req.params;
    
    const result = await Watched.findOneAndDelete({ 
      userId: req.user.id, 
      imdbID 
    });

    if (!result) {
      return res.status(404).json({ error: 'Not found in watched' });
    }

    res.json({ message: 'Removed from watched' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Toggle favorite
router.patch('/:imdbID/favorite', authenticateToken, async (req, res) => {
  try {
    const { imdbID } = req.params;
    
    const item = await Watched.findOne({ userId: req.user.id, imdbID });
    if (!item) {
      return res.status(404).json({ error: 'Not found in watched' });
    }

    item.favorite = !item.favorite;
    await item.save();

    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
