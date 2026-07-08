(function(){
  "use strict";

  /* ============ STATE & STORAGE ============ */
  const LS_WATCHLIST = "reelledger_watchlist";
  const LS_WATCHED = "reelledger_watched";
  const LS_THEME = "reelledger_theme";
  const LS_LISTS = "reelledger_custom_lists";
  const LS_RECENT = "reelledger_recent_viewed";

  const store = {
    get watchlist(){ try{ return JSON.parse(localStorage.getItem(LS_WATCHLIST)) || []; }catch(e){ return []; } },
    set watchlist(v){ localStorage.setItem(LS_WATCHLIST, JSON.stringify(v)); },
    get watched(){ try{ return JSON.parse(localStorage.getItem(LS_WATCHED)) || []; }catch(e){ return []; } },
    set watched(v){ localStorage.setItem(LS_WATCHED, JSON.stringify(v)); },
    get lists(){ try{ return JSON.parse(localStorage.getItem(LS_LISTS)) || []; }catch(e){ return []; } },
    set lists(v){ localStorage.setItem(LS_LISTS, JSON.stringify(v)); },
    get recent(){ try{ return JSON.parse(localStorage.getItem(LS_RECENT)) || []; }catch(e){ return []; } },
    set recent(v){ localStorage.setItem(LS_RECENT, JSON.stringify(v)); }
  };

  let currentResults = [];
  let wlFavOnly = false, wdFavOnly = false;
  let searchDebounce = null;
  let openListId = null;

  /* ============ ICONS ============ */
  const ICONS = {
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6L9 17l-5-5"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2m-1 0v14a1 1 0 01-1 1H10a1 1 0 01-1-1V6h6z"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 19l-7-7 7-7M4 12h16"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    ratingStar: '<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>',
    sad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M8 15s1.5-2 4-2 4 2 4 2M9 9h.01M15 9h.01"/></svg>',
    trash2: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2m-1 0v14a1 1 0 01-1 1H10a1 1 0 01-1-1V6h6z"/></svg>'
  };

  /* ============ HELPERS ============ */
  function escapeHtml(str){
    if(!str) return "";
    return String(str).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  }
  function safePoster(url){ return (url && url !== "N/A") ? url : ""; }
  function inList(list, id){ return list.some(m => m.imdbID === id); }
  function findIn(list, id){ return list.find(m => m.imdbID === id); }
  function isFavorite(id){ 
    return inList(store.watchlist, id) && findIn(store.watchlist, id).favorite ||
           inList(store.watched, id) && findIn(store.watched, id).favorite;
  }

  /* ============ BACKEND API ============ */
  const APP_ORIGIN = window.location.origin && window.location.origin !== "null" ? window.location.origin : "http://localhost:5000";
  const BACKEND_BASE = `${APP_ORIGIN}/api`;

  async function omdbSearch(query, {type, year, page} = {}){
    try {
      const params = new URLSearchParams({ s: query });
      if(type) params.set("type", type);
      if(year) params.set("y", year);
      if(page) params.set("page", page);
      const res = await fetch(`${BACKEND_BASE}/omdb/search?${params.toString()}`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      return data;
    } catch (error) {
      console.error("Search error:", error);
      return { Response: "False", Error: error.message };
    }
  }

  async function omdbDetails(imdbID){
    try {
      const res = await fetch(`${BACKEND_BASE}/omdb/details/${imdbID}`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      return res.json();
    } catch (error) {
      console.error("Details error:", error);
      return { Response: "False", Error: error.message };
    }
  }

  async function omdbDetails2ByTitle(title){
    try {
      const params = new URLSearchParams({ title });
      const res = await fetch(`${BACKEND_BASE}/omdb/title?${params.toString()}`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      return res.json();
    } catch (error) {
      console.error("Title search error:", error);
      return { Response: "False", Error: error.message };
    }
  }

  function normalizeSearchKey(value){
    return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function editDistance(a, b){
    const left = normalizeSearchKey(a);
    const right = normalizeSearchKey(b);
    const rows = Array.from({ length: left.length + 1 }, (_, i) => [i]);
    for(let j = 1; j <= right.length; j++) rows[0][j] = j;
    for(let i = 1; i <= left.length; i++){
      rows[i] = [i];
      for(let j = 1; j <= right.length; j++){
        const cost = left[i - 1] === right[j - 1] ? 0 : 1;
        rows[i][j] = Math.min(
          rows[i - 1][j] + 1,
          rows[i][j - 1] + 1,
          rows[i - 1][j - 1] + cost
        );
      }
    }
    return rows[left.length][right.length];
  }

  function isGenericMovieQuery(query){
    const normalized = normalizeSearchKey(query);
    if(!normalized) return false;
    if(["movie", "movies", "film", "films", "cinema"].includes(normalized)) return true;
    return editDistance(normalized, "movie") <= 2 || editDistance(normalized, "movies") <= 2;
  }

  function getFallbackMovieTitles(){
    return [
      ...MOVIE_INDUSTRIES.Hollywood,
      ...MOVIE_GENRES.Action.slice(0, 3),
      ...MOVIE_GENRES.Drama.slice(0, 3)
    ];
  }

  /* ============ THEME ============ */
  function initTheme(){
    const saved = localStorage.getItem(LS_THEME) || "dark";
    document.body.setAttribute("data-theme", saved);
  }
  document.getElementById("theme-toggle").addEventListener("click", () => {
    const cur = document.body.getAttribute("data-theme");
    const next = cur === "dark" ? "light" : "dark";
    document.body.setAttribute("data-theme", next);
    localStorage.setItem(LS_THEME, next);
  });

  /* ============ EXPORT / IMPORT ============ */
  document.getElementById("export-btn").addEventListener("click", () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      app: "MovieDock",
      watchlist: store.watchlist,
      watched: store.watched,
      lists: store.lists
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `moviedock-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
  document.getElementById("import-btn").addEventListener("click", () => {
    document.getElementById("import-file").click();
  });
  document.getElementById("import-file").addEventListener("change", e => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const data = JSON.parse(reader.result);
        const incomingWL = Array.isArray(data.watchlist) ? data.watchlist : [];
        const incomingWD = Array.isArray(data.watched) ? data.watched : [];
        const incomingLists = Array.isArray(data.lists) ? data.lists : [];
        const proceed = confirm(`Import ${incomingWL.length} watchlist title(s), ${incomingWD.length} watched title(s) and ${incomingLists.length} list(s)? This merges into your existing data without duplicates.`);
        if(!proceed) return;
        const wl = store.watchlist;
        incomingWL.forEach(m => { if(m.imdbID && !inList(wl, m.imdbID)) wl.push(m); });
        store.watchlist = wl;
        const wd = store.watched;
        incomingWD.forEach(m => { if(m.imdbID && !inList(wd, m.imdbID)) wd.push(m); });
        store.watched = wd;
        const lists = store.lists;
        incomingLists.forEach(l => {
          if(!l.name) return;
          const existing = lists.find(x => x.name.toLowerCase() === l.name.toLowerCase());
          if(existing){
            (l.movies || []).forEach(m => { if(m.imdbID && !existing.movies.some(x => x.imdbID === m.imdbID)) existing.movies.push(m); });
          } else {
            lists.push({ id: "list_" + Date.now() + "_" + Math.random().toString(36).slice(2,6), name: l.name, movies: l.movies || [], createdAt: Date.now() });
          }
        });
        store.lists = lists;
        renderStats();
        refreshCurrentView();
        alert("Import complete.");
      }catch(err){
        alert("Couldn't read that file. Make sure it's a MovieDock JSON export.");
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  });

  /* ============ TABS / NAVIGATION ============ */
  const views = { 
    home: document.getElementById("view-home"), 
    watchlist: document.getElementById("view-watchlist"), 
    watched: document.getElementById("view-watched"), 
    lists: document.getElementById("view-lists")
  };
  
  function switchTab(view){
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    const btn = document.querySelector(`.tab-btn[data-view="${view}"]`);
    if(btn) btn.classList.add("active");
    Object.keys(views).forEach(k => views[k].classList.toggle("active", k === view));
    if(view === "watchlist") renderWatchlist();
    if(view === "watched") renderWatched();
    if(view === "lists") renderListsView();
  }
  
  document.getElementById("tabs").addEventListener("click", e => {
    const btn = e.target.closest(".tab-btn");
    if(!btn) return;
    switchTab(btn.dataset.view);
  });
  
  document.getElementById("brand-home").addEventListener("click", () => {
    switchTab("home");
    setActiveDashboard("home");
    resetYearFilter();
    document.getElementById("search-input").value = "";
    renderTrendingHome();
  });

  /* ============ CURATED CATEGORY DATA ============ */
  const MOVIE_GENRES = {
    "Action": ["The Dark Knight","Mad Max: Fury Road","Die Hard","John Wick","Gladiator","Inception","The Matrix","Mission: Impossible - Fallout"],
    "Comedy": ["Superbad","The Grand Budapest Hotel","Bridesmaids","Step Brothers","Groundhog Day","The Hangover","Knives Out","Deadpool"],
    "Drama": ["The Shawshank Redemption","Forrest Gump","The Godfather","Fight Club","A Beautiful Mind","The Pursuit of Happyness","Good Will Hunting","Whiplash"],
    "Horror": ["The Conjuring","Hereditary","Get Out","A Quiet Place","It","The Exorcist","Sinister","Midsommar"],
    "Sci-Fi": ["Interstellar","Blade Runner 2049","Arrival","The Martian","Dune","Ex Machina","Edge of Tomorrow","Tenet"],
    "Thriller": ["Se7en","Gone Girl","Prisoners","Shutter Island","Zodiac","No Country for Old Men","Nightcrawler","The Girl with the Dragon Tattoo"],
    "Romance": ["The Notebook","La La Land","Pride & Prejudice","Eternal Sunshine of the Spotless Mind","Before Sunrise","Titanic","Crazy Rich Asians","Notting Hill"],
    "Animation": ["Spider-Man: Into the Spider-Verse","Coco","Spirited Away","Inside Out","The Lion King","Toy Story","Up","How to Train Your Dragon"],
    "Fantasy": ["The Lord of the Rings: The Fellowship of the Ring","Harry Potter and the Sorcerer's Stone","Pan's Labyrinth","The Shape of Water","Stardust","The Princess Bride","Doctor Strange","Big Fish"],
    "Crime": ["Pulp Fiction","Goodfellas","The Departed","The Godfather Part II","Casino","Heat","American Gangster","Training Day"],
    "Mystery": ["Knives Out","The Prestige","Rear Window","Murder on the Orient Express","Sherlock Holmes","Shutter Island","Gone Girl","Zodiac"],
    "Documentary": ["Free Solo","13th","Amy","The Social Dilemma","Icarus","Jiro Dreams of Sushi","My Octopus Teacher","Won't You Be My Neighbor?"]
  };
  
  const SERIES_GENRES = {
    "Action": ["24","Arrow","The Boys","Daredevil","Jack Ryan"],
    "Comedy": ["Friends","The Office","Brooklyn Nine-Nine","Parks and Recreation","Community"],
    "Drama": ["Breaking Bad","The Wire","Succession","This Is Us","Mad Men"],
    "Horror": ["The Haunting of Hill House","American Horror Story","Stranger Things","Chilling Adventures of Sabrina","Penny Dreadful"],
    "Sci-Fi": ["Black Mirror","The Expanse","Westworld","Dark","The Mandalorian"],
    "Thriller": ["Mindhunter","True Detective","Ozark","Killing Eve","Sherlock"],
    "Romance": ["Bridgerton","Outlander","Normal People","Modern Love","Emily in Paris"],
    "Animation": ["Rick and Morty","BoJack Horseman","Arcane","Avatar: The Last Airbender","Big Mouth"],
    "Fantasy": ["Game of Thrones","The Witcher","House of the Dragon","Shadow and Bone","Lucifer"],
    "Crime": ["Narcos","Peaky Blinders","Money Heist","Better Call Saul","The Sopranos"],
    "Mystery": ["Only Murders in the Building","Broadchurch","True Detective","Dark","Sherlock"],
    "Documentary": ["Making a Murderer","Tiger King","The Last Dance","Wild Wild Country","Chef's Table"]
  };
  
  const MOVIE_INDUSTRIES = {
    "Bollywood": ["3 Idiots","Dangal","Zindagi Na Milegi Dobara","Queen","Gully Boy","Andhadhun","Kabir Singh","Pink","Barfi!","Taare Zameen Par"],
    "Hollywood": ["The Dark Knight","Inception","Interstellar","The Avengers","Titanic","Forrest Gump","The Shawshank Redemption","Gladiator","Jurassic Park","The Matrix"],
    "South": ["Baahubali: The Beginning","Baahubali 2: The Conclusion","RRR","KGF: Chapter 1","KGF: Chapter 2","Pushpa: The Rise","Vikram","Drishyam","96","Kantara"]
  };
  
  const YEAR_OPTIONS = [
    { label: "All Years", value: "all" },
    { label: "2026", value: "2026" },
    { label: "2025", value: "2025" },
    { label: "2024", value: "2024" },
    { label: "2023", value: "2023" },
    { label: "2022", value: "2022" },
    { label: "2021", value: "2021" },
    { label: "2020", value: "2020" },
    { label: "2015 - 2019", value: "2015-2019" },
    { label: "2010 - 2014", value: "2010-2014" },
    { label: "2000 - 2009", value: "2000-2009" },
    { label: "1990 - 1999", value: "1990-1999" },
    { label: "Before 1990", value: "before-1990" }
  ];
  
  let yearFilterValue = "all";

  /* ============ DASHBOARD / BROWSE ============ */
  function setActiveDashboard(key){
    document.querySelectorAll(".dash-btn").forEach(b => b.classList.remove("active"));
    if(key){
      const btn = document.querySelector(`.dash-btn[data-quick="${key}"], .dash-btn[data-dropdown="${key}"]`);
      if(btn) btn.classList.add("active");
    }
  }
  
  function closeAllDropdowns(){
    document.querySelectorAll(".dash-dropdown").forEach(d => d.classList.remove("show"));
    document.querySelectorAll(".dash-btn").forEach(b => b.classList.remove("open"));
  }
  
  function buildGenreDropdown(genreMap){
    return Object.keys(genreMap).map(g => `<button data-genre="${escapeHtml(g)}">${escapeHtml(g)}</button>`).join("");
  }
  
  function buildMoviesDropdown(){
    const industryBtns = Object.keys(MOVIE_INDUSTRIES).map(k => `<button data-industry="${escapeHtml(k)}">${escapeHtml(k)}</button>`).join("");
    return `<div class="dash-group-label">By Industry</div>${industryBtns}<div class="dash-group-label">By Genre</div>${buildGenreDropdown(MOVIE_GENRES)}`;
  }
  
  function buildYearDropdown(){
    return YEAR_OPTIONS.map(y => `<button data-year="${y.value}" class="${y.value === yearFilterValue ? "active" : ""}">${y.label}</button>`).join("");
  }
  
  document.getElementById("dropdown-movies").innerHTML = buildMoviesDropdown();
  document.getElementById("dropdown-series").innerHTML = buildGenreDropdown(SERIES_GENRES);
  document.getElementById("dropdown-year").innerHTML = buildYearDropdown();

  /* ============ YEAR FILTER LOGIC ============ */
  function parseYearRange(yearStr){
    if(!yearStr) return null;
    const nums = (String(yearStr).match(/\d{4}/g) || []).map(Number);
    if(!nums.length) return null;
    let min = Math.min(...nums), max = Math.max(...nums);
    if(/[\u2013-]\s*$/.test(String(yearStr).trim())) max = 2026;
    return { min, max };
  }
  
  function targetRangeFor(value){
    if(value === "all") return null;
    if(value === "before-1990") return { min: 0, max: 1989 };
    if(value.includes("-")){
      const [a,b] = value.split("-").map(Number);
      return { min: a, max: b };
    }
    const y = Number(value);
    return { min: y, max: y };
  }
  
  function movieMatchesYearFilter(movie){
    if(yearFilterValue === "all") return true;
    const target = targetRangeFor(yearFilterValue);
    const range = parseYearRange(movie.Year);
    if(!target || !range) return true;
    return range.min <= target.max && target.min <= range.max;
  }
  
  function resetYearFilter(){
    yearFilterValue = "all";
    document.getElementById("year-btn-label").textContent = "Year";
    document.getElementById("dropdown-year").innerHTML = buildYearDropdown();
  }

  /* ============ RENDERING ============ */
  function emptyBlock(title, msg, small){
    return `<div class="state-block${small ? " error" : ""}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">${ICONS.sad.match(/<path[^>]*>/g)[0]}</svg><h4>${escapeHtml(title)}</h4><p>${escapeHtml(msg)}</p></div>`;
  }
  
  function spinnerBlock(label){
    return `<div class="spinner-wrap"><div class="spinner"></div><span>${escapeHtml(label)}</span></div>`;
  }

  function renderStats(){
    const stats = [
      { label: "Watchlist", num: store.watchlist.length },
      { label: "Watched", num: store.watched.length },
      { label: "Lists", num: store.lists.length }
    ];
    document.getElementById("wl-count").textContent = store.watchlist.length;
    document.getElementById("wd-count").textContent = store.watched.length;
    document.getElementById("lists-count").textContent = store.lists.length;
    const html = stats.map(s => `<div class="stat-card"><div class="num">${s.num}</div><div class="label">${s.label}</div></div>`).join("");
    document.getElementById("stats-strip").innerHTML = html;
  }

  function searchCard(movie){
    const poster = safePoster(movie.Poster);
    const isFav = isFavorite(movie.imdbID);
    const inWL = inList(store.watchlist, movie.imdbID);
    const inWD = inList(store.watched, movie.imdbID);
    const rating = movie.imdbRating && movie.imdbRating !== "N/A" ? parseFloat(movie.imdbRating) : null;
    
    return `<div class="movie-card">
      <div class="poster-wrap">
        ${poster ? `<img src="${poster}" alt="${escapeHtml(movie.Title)}" loading="lazy">` : `<div class="no-poster">${ICONS.sad}</div>`}
        ${movie.Type === "series" ? '<span class="stamp series">Series</span>' : '<span class="stamp">Movie</span>'}
        <button class="fav-star${isFav ? " active" : ""}" data-id="${movie.imdbID}" title="Toggle favorite">
          ${ICONS.star}
        </button>
        ${rating ? `<div class="rating-chip">${ICONS.ratingStar} ${rating}</div>` : ""}
      </div>
      <div class="card-info">
        <h4>${escapeHtml(movie.Title)}</h4>
        <div class="card-meta">
          <span>${escapeHtml(movie.Year)}</span>
          <span class="dot"></span>
          <span>${escapeHtml(movie.Type === "series" ? "TV" : "Film")}</span>
        </div>
        <div class="card-actions">
          <button class="watchlist-btn${inWL ? " on" : ""}" data-id="${movie.imdbID}" title="Add to watchlist">
            ${ICONS.plus}
          </button>
          <button class="watched-btn${inWD ? " on" : ""}" data-id="${movie.imdbID}" title="Mark as watched">
            ${ICONS.check}
          </button>
          <button class="info-btn" data-id="${movie.imdbID}" title="View details">
            ${ICONS.search}
          </button>
        </div>
      </div>
    </div>`;
  }

  function renderHomeGrid(){
    const filtered = currentResults.filter(movieMatchesYearFilter);
    if(!filtered.length){
      document.getElementById("home-results").innerHTML = emptyBlock("No results", "Try a different search or filter.", true);
      return;
    }
    const html = `<div class="grid">${filtered.map(searchCard).join("")}</div>`;
    document.getElementById("home-results").innerHTML = html;
    document.getElementById("results-tally").textContent = `${filtered.length} result${filtered.length === 1 ? "" : "s"}`;
  }

  async function renderTrendingHome(){
    document.getElementById("results-title").textContent = "Trending";
    document.getElementById("home-results").innerHTML = spinnerBlock("Finding movies...");
    renderStats();
  }

  function renderWatchlist(){
    const list = wlFavOnly ? store.watchlist.filter(m => m.favorite) : store.watchlist;
    const sortBy = document.getElementById("wl-sort").value;
    
    if(sortBy === "alpha") list.sort((a,b) => a.Title.localeCompare(b.Title));
    else if(sortBy === "rating") list.sort((a,b) => (parseFloat(b.imdbRating) || 0) - (parseFloat(a.imdbRating) || 0));
    else list.sort((a,b) => (b.addedAt || 0) - (a.addedAt || 0));
    
    const html = list.length 
      ? `<div class="grid">${list.map(searchCard).join("")}</div>`
      : emptyBlock("Your watchlist is empty", "Search and add movies to get started.", true);
    
    document.getElementById("watchlist-results").innerHTML = html;
  }

  function renderWatched(){
    const list = wdFavOnly ? store.watched.filter(m => m.favorite) : store.watched;
    const sortBy = document.getElementById("wd-sort").value;
    
    if(sortBy === "alpha") list.sort((a,b) => a.Title.localeCompare(b.Title));
    else if(sortBy === "rating") list.sort((a,b) => (parseFloat(b.imdbRating) || 0) - (parseFloat(a.imdbRating) || 0));
    else list.sort((a,b) => (b.watchedAt || 0) - (a.watchedAt || 0));
    
    const html = list.length 
      ? `<div class="grid">${list.map(searchCard).join("")}</div>`
      : emptyBlock("You haven't watched anything yet", "Mark movies as watched to see them here.", true);
    
    document.getElementById("watched-results").innerHTML = html;
  }

  function renderListsView(){
    const lists = store.lists;
    const html = lists.map(l => `<div class="list-folder" data-id="${l.id}">
      <h5>${escapeHtml(l.name)}</h5>
      <div class="lf-count">${l.movies.length} movie${l.movies.length === 1 ? "" : "s"}</div>
      <button class="lf-delete" title="Delete list">
        ${ICONS.trash}
      </button>
    </div>`).join("");
    document.getElementById("list-folders").innerHTML = html || emptyBlock("No lists yet", "Create your first list to organize movies.", true);
  }

  function refreshCurrentView(){
    const activeView = document.querySelector(".tab-btn.active").dataset.view;
    if(activeView === "watchlist") renderWatchlist();
    else if(activeView === "watched") renderWatched();
    else if(activeView === "lists") renderListsView();
  }

  /* ============ EVENT LISTENERS ============ */
  initTheme();
  renderStats();
  renderTrendingHome();

  // Search
  const suggestBox = document.getElementById("suggestions");
  document.getElementById("search-btn").addEventListener("click", async () => {
    const query = document.getElementById("search-input").value.trim();
    if(!query){
      return;
    }
    document.getElementById("home-results").innerHTML = spinnerBlock("Searching...");
    try{
      const res = await omdbSearch(query);
      const results = (res.Search || []).map(m => ({...m, addedAt: Date.now()}));
      if(results.length){
        currentResults = results;
        document.getElementById("results-title").textContent = `Results for "${query}"`;
        renderHomeGrid();
        return;
      }

      if(isGenericMovieQuery(query)){
        await browseCategory(getFallbackMovieTitles(), `Popular movies for "${query}"`);
        return;
      }

      currentResults = [];
      document.getElementById("results-title").textContent = `Results for "${query}"`;
      document.getElementById("home-results").innerHTML = emptyBlock("No results", "Try a different title or use the genre buttons below.", true);
    }catch(e){
      document.getElementById("home-results").innerHTML = emptyBlock("Search failed", "Please try again.", true);
    }
  });

  document.getElementById("search-input").addEventListener("keydown", e => {
    if(e.key === "Enter") document.getElementById("search-btn").click();
  });

  // Card actions
  document.addEventListener("click", async e => {
    const card = e.target.closest(".movie-card");
    if(!card) return;
    
    const imdbID = e.target.closest("[data-id]")?.dataset.id;
    if(!imdbID) return;

    if(e.target.closest(".fav-star")){
      const inWL = findIn(store.watchlist, imdbID);
      const inWD = findIn(store.watched, imdbID);
      if(inWL) inWL.favorite = !inWL.favorite;
      if(inWD) inWD.favorite = !inWD.favorite;
      store.watchlist = store.watchlist;
      store.watched = store.watched;
      refreshCurrentView();
    }
    else if(e.target.closest(".watchlist-btn")){
      if(inList(store.watchlist, imdbID)){
        store.watchlist = store.watchlist.filter(m => m.imdbID !== imdbID);
      } else {
        const movie = currentResults.find(m => m.imdbID === imdbID);
        if(movie) store.watchlist = [...store.watchlist, {...movie, addedAt: Date.now()}];
      }
      renderStats();
      refreshCurrentView();
    }
    else if(e.target.closest(".watched-btn")){
      if(inList(store.watched, imdbID)){
        store.watched = store.watched.filter(m => m.imdbID !== imdbID);
      } else {
        const movie = currentResults.find(m => m.imdbID === imdbID);
        if(movie) store.watched = [...store.watched, {...movie, watchedAt: Date.now()}];
      }
      renderStats();
      refreshCurrentView();
    }
    else if(e.target.closest(".info-btn")){
      const details = await omdbDetails(imdbID);
      showDetailsModal(details);
    }
  });

  function showDetailsModal(details){
    const poster = safePoster(details.Poster);
    const html = `
      <button class="details-close">${ICONS.close}</button>
      ${poster ? `<div class="details-poster"><img src="${poster}" alt="${escapeHtml(details.Title)}"></div>` : ""}
      <div class="details-body">
        <div class="d-eyebrow">${escapeHtml(details.Type)}</div>
        <h2>${escapeHtml(details.Title)}</h2>
        <div class="d-meta-row">
          <b>Released:</b> ${escapeHtml(details.Released || "N/A")}
          <b>Runtime:</b> ${escapeHtml(details.Runtime || "N/A")}
          <b>Rating:</b> ${escapeHtml(details.Rated || "N/A")}
        </div>
        <div class="d-plot">${escapeHtml(details.Plot || "No plot available.")}</div>
        <div class="d-grid">
          <div><b>Director</b> ${escapeHtml(details.Director || "N/A")}</div>
          <div><b>Cast</b> ${escapeHtml(details.Actors || "N/A")}</div>
          <div><b>Genre</b> ${escapeHtml(details.Genre || "N/A")}</div>
          <div><b>IMDb</b> ${details.imdbRating ? details.imdbRating + "/10" : "N/A"}</div>
        </div>
        <div class="d-actions">
          <button class="watchlist-btn${inList(store.watchlist, details.imdbID) ? " on" : ""}" data-id="${details.imdbID}">
            ${ICONS.plus} Watchlist
          </button>
          <button class="watched-btn${inList(store.watched, details.imdbID) ? " on" : ""}" data-id="${details.imdbID}">
            ${ICONS.check} Watched
          </button>
        </div>
      </div>
    `;
    document.getElementById("details-card").innerHTML = html;
    document.getElementById("details-modal").classList.add("show");
    document.querySelector(".details-close").addEventListener("click", () => {
      document.getElementById("details-modal").classList.remove("show");
    });
  }

  document.getElementById("details-modal").addEventListener("click", e => {
    if(e.target === document.getElementById("details-modal")){
      document.getElementById("details-modal").classList.remove("show");
    }
  });

  // Filters
  document.getElementById("wl-fav-toggle").addEventListener("click", function(){
    wlFavOnly = !wlFavOnly;
    this.classList.toggle("active");
    renderWatchlist();
  });

  document.getElementById("wd-fav-toggle").addEventListener("click", function(){
    wdFavOnly = !wdFavOnly;
    this.classList.toggle("active");
    renderWatched();
  });

  document.getElementById("wl-sort").addEventListener("change", renderWatchlist);
  document.getElementById("wd-sort").addEventListener("change", renderWatched);

  // Dashboard dropdowns
  document.addEventListener("click", e => {
    if(e.target.closest(".dash-btn[data-dropdown]")){
      const btn = e.target.closest(".dash-btn");
      const dropdown = document.getElementById("dropdown-" + btn.dataset.dropdown);
      if(dropdown.classList.contains("show")){
        closeAllDropdowns();
      } else {
        closeAllDropdowns();
        dropdown.classList.add("show");
        btn.classList.add("open");
      }
    }
    else if(e.target.closest(".dash-btn[data-quick]")){
      const key = e.target.closest(".dash-btn").dataset.quick;
      setActiveDashboard(key);
      closeAllDropdowns();
      if(key === "home") renderTrendingHome();
    }
    else if(e.target.closest(".dash-dropdown button[data-genre]")){
      const genre = e.target.closest("button").dataset.genre;
      const titles = MOVIE_GENRES[genre] || [];
      browseCategory(titles, `${genre} Movies`);
      closeAllDropdowns();
    }
    else if(e.target.closest(".dash-dropdown button[data-industry]")){
      const industry = e.target.closest("button").dataset.industry;
      const titles = MOVIE_INDUSTRIES[industry] || [];
      browseCategory(titles, `${industry} Films`);
      closeAllDropdowns();
    }
    else if(e.target.closest(".dash-dropdown button[data-year]")){
      const year = e.target.closest("button").dataset.year;
      yearFilterValue = year;
      document.getElementById("year-btn-label").textContent = YEAR_OPTIONS.find(y => y.value === year)?.label || "Year";
      document.getElementById("dropdown-year").innerHTML = buildYearDropdown();
      renderHomeGrid();
      closeAllDropdowns();
    }
    else {
      closeAllDropdowns();
    }
  });

  async function browseCategory(titles, label){
    const resultsEl = document.getElementById("home-results");
    document.getElementById("search-input").value = "";
    suggestBox.classList.remove("show");
    document.getElementById("results-title").textContent = label;
    document.getElementById("results-tally").textContent = "";
    resultsEl.innerHTML = spinnerBlock("Loading...");
    try{
      const settled = await Promise.all(titles.map(async t => {
        try{ const d = await omdbDetails2ByTitle(t); return d && d.Response !== "False" ? d : null; }
        catch(e){ return null; }
      }));
      currentResults = settled.filter(Boolean);
      if(!currentResults.length){
        resultsEl.innerHTML = emptyBlock("No results", "Try a different category.", true);
        return;
      }
      renderHomeGrid();
    }catch(e){
      resultsEl.innerHTML = emptyBlock("Error loading", "Please try again.", true);
    }
  }

  // Lists
  document.getElementById("new-list-btn").addEventListener("click", () => {
    const input = document.getElementById("new-list-input");
    const name = input.value.trim();
    if(!name) return;
    store.lists = [...store.lists, { id: "list_" + Date.now(), name, movies: [], createdAt: Date.now() }];
    input.value = "";
    renderStats();
    renderListsView();
  });

  document.addEventListener("click", e => {
    if(e.target.closest(".list-folder")){
      const folder = e.target.closest(".list-folder");
      const id = folder.dataset.id;
      if(e.target.closest(".lf-delete")){
        if(confirm("Delete this list?")){
          store.lists = store.lists.filter(l => l.id !== id);
          renderStats();
          renderListsView();
        }
      } else {
        openListId = id;
        folder.classList.add("open");
      }
    }
  });

})();
