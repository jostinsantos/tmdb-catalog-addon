/**
 * Addon catálogo TMDB — tipos + géneros por tipo (Películas, Series, Anime, Doramas).
 * Config: api_key / language desde la app (Ajustes → Addons → Configurar).
 */
var DEFAULT_API_KEY = 'a2d9bbed370d9f678e34006f8750a5a5';
var DEFAULT_LANGUAGE = 'es-MX';
var BASE = 'https://api.themoviedb.org/3';
var IMG = 'https://image.tmdb.org/t/p';

function cfgKey(config) {
  if (config) {
    if (config.api_key && String(config.api_key).trim()) return String(config.api_key).trim();
    if (config.apiKey && String(config.apiKey).trim()) return String(config.apiKey).trim();
  }
  return DEFAULT_API_KEY;
}
function cfgLang(config) {
  if (config) {
    if (config.language && String(config.language).trim()) return String(config.language).trim();
    if (config.lang && String(config.lang).trim()) return String(config.lang).trim();
  }
  return DEFAULT_LANGUAGE;
}

async function tmdbGet(path, config, query) {
  var key = cfgKey(config);
  if (!key) {
    throw new Error('Falta API key TMDB (configura el addon o DEFAULT_API_KEY)');
  }
  var q = Object.assign({ api_key: key, language: cfgLang(config) }, query || {});
  var qs = Object.keys(q)
    .map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(q[k]);
    })
    .join('&');
  var url = BASE + path + '?' + qs;
  var res = await fetch(url);
  if (!res.ok) throw new Error('TMDB HTTP ' + res.status);
  return await res.json();
}

function mapItem(r, forceType) {
  var isTv =
    forceType === 'tv' ||
    forceType === 'series' ||
    forceType === 'anime' ||
    forceType === 'dorama' ||
    r.media_type === 'tv' ||
    (r.first_air_date && !r.title);
  var type = isTv ? 'series' : 'movie';
  var id = r.id;
  var title = r.title || r.name || 'Sin título';
  var year = null;
  var d = r.release_date || r.first_air_date || '';
  if (d && d.length >= 4) year = parseInt(d.slice(0, 4), 10);
  var genres = [];
  if (Array.isArray(r.genre_ids)) {
    genres = r.genre_ids.map(String);
  } else if (Array.isArray(r.genres)) {
    genres = r.genres.map(function (g) {
      return g && g.name ? String(g.name) : String(g);
    });
  }
  return {
    id: 'tmdb:' + (isTv ? 'series' : 'movie') + ':' + id,
    title: title,
    type: type,
    poster: r.poster_path ? IMG + '/w342' + r.poster_path : null,
    backdrop: r.backdrop_path ? IMG + '/w780' + r.backdrop_path : null,
    overview: r.overview || '',
    year: year,
    rating: r.vote_average || null,
    genres: genres,
    extra: {
      tmdbId: String(id),
      mediaType: isTv ? 'tv' : 'movie',
      provider: 'tmdb',
    },
  };
}

async function getHome(args, config) {
  var rows = [];
  var popularMovies = await tmdbGet('/movie/popular', config, { page: 1 });
  rows.push({
    id: 'popular-movies',
    title: 'Películas populares',
    items: (popularMovies.results || []).map(function (r) {
      return mapItem(r, 'movie');
    }),
  });
  var topMovies = await tmdbGet('/movie/top_rated', config, { page: 1 });
  rows.push({
    id: 'top-movies',
    title: 'Películas mejor valoradas',
    items: (topMovies.results || []).map(function (r) {
      return mapItem(r, 'movie');
    }),
  });
  var popularTv = await tmdbGet('/tv/popular', config, { page: 1 });
  rows.push({
    id: 'popular-tv',
    title: 'Series populares',
    items: (popularTv.results || []).map(function (r) {
      return mapItem(r, 'tv');
    }),
  });
  var topTv = await tmdbGet('/tv/top_rated', config, { page: 1 });
  rows.push({
    id: 'top-tv',
    title: 'Series mejor valoradas',
    items: (topTv.results || []).map(function (r) {
      return mapItem(r, 'tv');
    }),
  });
  try {
    var anime = await tmdbGet('/discover/tv', config, {
      page: 1,
      sort_by: 'popularity.desc',
      with_genres: '16',
      with_origin_country: 'JP',
    });
    rows.push({
      id: 'anime',
      title: 'Anime',
      items: (anime.results || []).map(function (r) {
        return mapItem(r, 'anime');
      }),
    });
  } catch (e) {}
  try {
    var dorama = await tmdbGet('/discover/tv', config, {
      page: 1,
      sort_by: 'popularity.desc',
      with_origin_country: 'KR',
    });
    rows.push({
      id: 'dorama',
      title: 'Doramas',
      items: (dorama.results || []).map(function (r) {
        return mapItem(r, 'dorama');
      }),
    });
  } catch (e) {}
  return { rows: rows };
}

async function search(args, config) {
  var q = (args && (args.q || args.query)) || '';
  if (!q) return { items: [] };
  var data = await tmdbGet('/search/multi', config, { query: q, page: 1 });
  var items = (data.results || [])
    .filter(function (r) {
      return r.media_type === 'movie' || r.media_type === 'tv';
    })
    .map(function (r) {
      return mapItem(r);
    });
  return { items: items };
}

async function discover(args, config) {
  var cat = String((args && (args.category || args.tipo)) || 'movie').toLowerCase();
  var page = (args && args.page) || 1;
  var genreId =
    (args && (args.genreId != null ? args.genreId : null)) ||
    (args && args.genre) ||
    (args && args.genero) ||
    null;

  var path = '/discover/movie';
  var force = 'movie';
  var query = { sort_by: 'popularity.desc', page: page };

  if (cat === 'tv' || cat === 'series') {
    path = '/discover/tv';
    force = 'series';
  } else if (cat === 'anime') {
    path = '/discover/tv';
    force = 'anime';
    query.with_origin_country = 'JP';
    if (!genreId) query.with_genres = '16';
  } else if (cat === 'dorama') {
    path = '/discover/tv';
    force = 'dorama';
    query.with_origin_country = 'KR';
  } else if (cat === 'movie' || cat === 'peliculas' || cat === 'películas') {
    path = '/discover/movie';
    force = 'movie';
  }

  if (genreId != null && String(genreId).length) {
    query.with_genres = String(genreId);
  }

  var data = await tmdbGet(path, config, query);
  return {
    items: (data.results || []).map(function (r) {
      return mapItem(r, force);
    }),
    page: page,
    totalPages: data.total_pages || 1,
  };
}

async function getMeta(args, config) {
  var id = (args && args.id) || '';
  var parts = String(id).split(':');
  var media = 'movie';
  var tmdbId = id;
  if (parts[0] === 'tmdb' && parts.length >= 3) {
    media = parts[1] === 'series' || parts[1] === 'tv' ? 'tv' : 'movie';
    tmdbId = parts[2];
  }
  var data = await tmdbGet('/' + media + '/' + tmdbId, config, {});
  var item = mapItem(data, media === 'tv' ? 'tv' : 'movie');
  item.overview = data.overview || item.overview;
  if (data.genres) {
    item.genres = data.genres.map(function (g) {
      return g.name;
    });
  }
  return { item: item };
}

module.exports = {
  getHome: getHome,
  search: search,
  discover: discover,
  getMeta: getMeta,
};
