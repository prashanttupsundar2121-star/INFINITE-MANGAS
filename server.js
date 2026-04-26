const express = require("express");
const https = require("https");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const COMICK_BASE = "https://api.comick.fun";

app.use(express.static(__dirname));

function makeSvgDataUrl(title, subtitle, w = 900, h = 1300) {
  const safeTitle = String(title || "").slice(0, 64).replace(/[<>&"]/g, "");
  const safeSubtitle = String(subtitle || "").slice(0, 96).replace(/[<>&"]/g, "");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><defs><linearGradient id='g' x1='0' x2='1' y1='0' y2='1'><stop offset='0%' stop-color='#0f1020'/><stop offset='100%' stop-color='#2d1e3f'/></linearGradient></defs><rect width='100%' height='100%' fill='url(#g)'/><rect x='30' y='30' width='${w - 60}' height='${h - 60}' rx='26' fill='none' stroke='rgba(255,255,255,.18)'/><text x='50%' y='42%' text-anchor='middle' fill='#ffffff' font-family='Segoe UI,Arial,sans-serif' font-size='58' font-weight='700'>${safeTitle}</text><text x='50%' y='50%' text-anchor='middle' fill='#ffd166' font-family='Segoe UI,Arial,sans-serif' font-size='34'>${safeSubtitle}</text><text x='50%' y='90%' text-anchor='middle' fill='rgba(255,255,255,.65)' font-family='Segoe UI,Arial,sans-serif' font-size='24'>INFINITE MANGAS READER</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const DEMO_MANGA = [
  { id: "legend-blade", title: "Legend of the Blade", status: "ongoing", rating: 8.7, lang: "ja", tags: ["Action", "Fantasy", "Martial Arts"], author: "K. Arata", artist: "M. Sora", description: "A swordsman rises through cursed kingdoms to protect his clan." },
  { id: "metro-revenant", title: "Metro Revenant", status: "ongoing", rating: 8.4, lang: "ko", tags: ["Sci-Fi", "Mystery", "Psychological"], author: "Y. Han", artist: "R. Min", description: "In a drowned megacity, a courier uncovers memories hidden in train lines." },
  { id: "petals-and-steel", title: "Petals and Steel", status: "completed", rating: 8.9, lang: "ja", tags: ["Romance", "Historical", "Drama"], author: "A. Mizuki", artist: "H. Kaito", description: "A warrior and a poet change a war-torn era together." },
  { id: "void-chef", title: "Void Chef", status: "ongoing", rating: 8.1, lang: "zh", tags: ["Comedy", "Isekai", "Slice of Life"], author: "L. Wei", artist: "N. Chen", description: "A street cook is summoned to a realm where flavor controls magic." },
  { id: "after-school-phoenix", title: "After School Phoenix", status: "ongoing", rating: 8.3, lang: "ja", tags: ["School Life", "Shounen", "Supernatural"], author: "T. Ren", artist: "P. Aoki", description: "Teen guardians awaken ancient fire spirits beneath their school." },
  { id: "district-09", title: "District 09", status: "hiatus", rating: 7.9, lang: "ko", tags: ["Sports", "Seinen", "Action"], author: "D. Park", artist: "I. Seo", description: "Underground racers battle for freedom in a controlled city zone." }
].map((m) => {
  const chapters = Array.from({ length: 4 }, (_, i) => {
    const chapterNo = String(4 - i);
    const chapterId = `${m.id}-ch-${chapterNo}`;
    const pages = Array.from({ length: 8 }, (__, p) =>
      makeSvgDataUrl(m.title, `Chapter ${chapterNo} · Page ${p + 1}`)
    );
    return {
      id: chapterId,
      number: chapterNo,
      title: `${m.title} — Chapter ${chapterNo}`,
      translatedLanguage: "en",
      publishAt: new Date(Date.now() - (i + 2) * 86400000).toISOString(),
      pages,
    };
  });
  return {
    ...m,
    coverUrl: makeSvgDataUrl(m.title, "Cover", 640, 920),
    chapters,
  };
});

const DEMO_BY_ID = new Map(DEMO_MANGA.map((m) => [m.id, m]));
const DEMO_BY_CHAPTER = new Map(
  DEMO_MANGA.flatMap((m) => m.chapters.map((c) => [c.id, { manga: m, chapter: c }]))
);

function toTag(name) {
  return { id: `tag-${name.toLowerCase().replace(/\s+/g, "-")}`, attributes: { name: { en: name } } };
}

function toMangaCard(manga) {
  return {
    id: manga.id,
    attributes: {
      title: { en: manga.title },
      status: manga.status,
      rating: { average: manga.rating, bayesian: manga.rating },
      tags: (manga.tags || []).map((x) => ({ attributes: { name: { en: x } } })),
    },
    relationships: [{ type: "cover_art", attributes: { fileName: manga.coverUrl } }],
    latestChapter: { attributes: { chapter: manga.chapters?.[0]?.number || "?" } },
  };
}

function toMangaDetail(manga) {
  return {
    ...toMangaCard(manga),
    attributes: {
      ...toMangaCard(manga).attributes,
      description: { en: manga.description || "No synopsis available." },
    },
    relationships: [
      { type: "cover_art", attributes: { fileName: manga.coverUrl } },
      { type: "author", attributes: { name: manga.author || "Unknown" } },
      { type: "artist", attributes: { name: manga.artist || "Unknown" } },
    ],
  };
}

function toFeedChapter(ch) {
  return {
    id: ch.id,
    attributes: {
      chapter: ch.number,
      title: ch.title,
      publishAt: ch.publishAt,
      translatedLanguage: ch.translatedLanguage || "en",
    },
  };
}

function requestJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "InfiniteMangas/2.0", Accept: "application/json", ...headers } }, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        try {
          resolve(JSON.parse(body || "{}"));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(12000, () => req.destroy(new Error("Request timed out")));
  });
}

function comickCover(coverObj) {
  const b2 = coverObj?.b2key || coverObj?.url;
  if (!b2) return "";
  if (b2.startsWith("http") || b2.startsWith("data:")) return b2;
  return `https://meo.comick.pictures/${b2}`;
}

function mapComickSearchItem(item) {
  const id = item?.slug || item?.hid || item?.id;
  if (!id) return null;
  const title = item?.title || item?.md_titles?.[0]?.title || "Untitled";
  const cover = comickCover(item?.md_covers?.[0]);
  const rating = Number(item?.rating || item?.bayesian_rating || 0) || 0;
  return {
    id,
    attributes: {
      title: { en: title },
      status: String(item?.status || "ongoing").toLowerCase(),
      rating: { average: rating, bayesian: rating },
      tags: [],
    },
    relationships: [{ type: "cover_art", attributes: { fileName: cover } }],
    latestChapter: { attributes: { chapter: item?.last_chapter || "?" } },
  };
}

async function comickSearch(query, limit) {
  const qs = new URLSearchParams({ q: query || "manga", limit: String(limit || 24), page: "1" });
  const data = await requestJson(`${COMICK_BASE}/v1.0/search?${qs.toString()}`);
  const list = (Array.isArray(data) ? data : []).map(mapComickSearchItem).filter(Boolean);
  return list;
}

async function fetchComickDetail(id) {
  const detail = await requestJson(`${COMICK_BASE}/v1.0/comic/${encodeURIComponent(id)}`);
  const comic = detail?.comic || detail || {};
  const title = comic?.title || comic?.md_titles?.[0]?.title || id;
  const status = String(comic?.status || "ongoing").toLowerCase();
  const rating = Number(comic?.rating || comic?.bayesian_rating || 0) || 0;
  const tags = (comic?.md_comic_md_genres || comic?.genres || [])
    .map((g) => g?.md_genres?.name || g?.name)
    .filter(Boolean);
  const cover = comickCover((comic?.md_covers || [])[0]);
  const description = comic?.desc || comic?.description || "No synopsis available.";
  const author = (comic?.md_comic_md_author || [])[0]?.md_author?.name || "Unknown";
  const artist = (comic?.md_comic_md_artist || [])[0]?.md_artist?.name || author;
  return {
    id,
    hid: comic?.hid || comic?.id || id,
    slug: comic?.slug || id,
    attributes: {
      title: { en: title },
      status,
      rating: { average: rating, bayesian: rating },
      tags: tags.map((t) => ({ attributes: { name: { en: t } } })),
      description: { en: description },
    },
    relationships: [
      { type: "cover_art", attributes: { fileName: cover } },
      { type: "author", attributes: { name: author } },
      { type: "artist", attributes: { name: artist } },
    ],
  };
}

async function fetchComickFeed(mangaId, langs = ["en"], limit = 200) {
  const lang = (langs[0] || "en").toLowerCase();
  const qs = new URLSearchParams({ lang, page: "1", limit: String(limit || 200) });
  const list = await requestJson(`${COMICK_BASE}/v1.0/comic/${encodeURIComponent(mangaId)}/chapters?${qs.toString()}`);
  if (!Array.isArray(list)) return [];
  return list.map((ch) => ({
    id: ch?.hid || ch?.id,
    attributes: {
      chapter: ch?.chap || ch?.chapter || "?",
      title: ch?.title || "",
      publishAt: ch?.created_at || ch?.publish_at || new Date().toISOString(),
      translatedLanguage: ch?.lang || lang || "en",
    },
  })).filter((x) => x.id);
}

async function fetchComickChapterPages(chapterId) {
  const d = await requestJson(`${COMICK_BASE}/v1.0/chapter/${encodeURIComponent(chapterId)}`);
  const chapter = d?.chapter || d || {};
  const imgObjs = chapter?.md_images || chapter?.images || [];
  const pages = imgObjs
    .map((x) => x?.b2key || x?.url || x)
    .filter(Boolean)
    .map((x) => (String(x).startsWith("http") ? x : `https://meo.comick.pictures/${x}`));
  return pages;
}

function listDemoManga(q) {
  let list = [...DEMO_MANGA];
  const title = (q.title || "").trim().toLowerCase();
  if (title) {
    list = list.filter((m) => m.title.toLowerCase().includes(title));
  }
  if (q.status) {
    list = list.filter((m) => m.status === String(q.status).toLowerCase());
  }
  const originalLanguage = q["originalLanguage[]"] || q.originalLanguage || [];
  const originalLangList = Array.isArray(originalLanguage) ? originalLanguage : [originalLanguage];
  if (originalLangList.filter(Boolean).length) {
    list = list.filter((m) => originalLangList.includes(m.lang));
  }
  const tagFilter = q["includedTags[]"] || [];
  const tags = Array.isArray(tagFilter) ? tagFilter : [tagFilter];
  if (tags.filter(Boolean).length) {
    const byId = new Map(Array.from(new Set(DEMO_MANGA.flatMap((m) => m.tags))).map((t) => [toTag(t).id, t]));
    const selectedNames = tags.map((x) => byId.get(x)).filter(Boolean);
    if (selectedNames.length) {
      list = list.filter((m) => selectedNames.some((t) => m.tags.includes(t)));
    }
  }
  const orderKey = Object.keys(q).find((k) => /^order\[.+\]$/.test(k));
  if (orderKey) {
    const mode = String(q[orderKey] || "desc").toLowerCase();
    if (orderKey.includes("rating") || orderKey.includes("followedCount")) {
      list.sort((a, b) => (mode === "asc" ? a.rating - b.rating : b.rating - a.rating));
    }
  }
  const limit = Math.min(Number(q.limit) || 20, 50);
  return list.slice(0, limit).map(toMangaCard);
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/api/manga/tag", (req, res) => {
  const tags = Array.from(new Set(DEMO_MANGA.flatMap((m) => m.tags))).map(toTag);
  res.json({ data: tags, total: tags.length });
});

app.get("/api/manga", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const title = String(req.query.title || "");
  try {
    const data = await comickSearch(title, limit);
    if (data.length) {
      return res.json({ data, total: data.length, source: "comick" });
    }
  } catch (_err) {}
  const fallback = listDemoManga(req.query);
  res.json({ data: fallback, total: fallback.length, source: "fallback" });
});

app.get("/api/manga/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const data = await fetchComickDetail(id);
    return res.json({ data, source: "comick" });
  } catch (_err) {}
  const m = DEMO_BY_ID.get(id);
  if (!m) return res.status(404).json({ error: "Manga not found" });
  res.json({ data: toMangaDetail(m), source: "fallback" });
});

app.get("/api/manga/:id/feed", async (req, res) => {
  const id = req.params.id;
  const langs = [];
  const q = req.query["translatedLanguage[]"];
  if (Array.isArray(q)) langs.push(...q);
  else if (q) langs.push(q);
  try {
    const data = await fetchComickFeed(id, langs.length ? langs : ["en"], Number(req.query.limit) || 200);
    if (data.length) {
      return res.json({ data, total: data.length, source: "comick" });
    }
  } catch (_err) {}
  const m = DEMO_BY_ID.get(id);
  if (!m) return res.status(404).json({ error: "Feed not found" });
  const data = m.chapters.map(toFeedChapter);
  res.json({ data, total: data.length, source: "fallback" });
});

app.get("/api/at-home/server/:chapterId", async (req, res) => {
  const chapterId = req.params.chapterId;
  try {
    const pages = await fetchComickChapterPages(chapterId);
    if (pages.length) {
      return res.json({ chapter: { pages }, source: "comick" });
    }
  } catch (_err) {}
  const c = DEMO_BY_CHAPTER.get(chapterId);
  if (!c) return res.status(404).json({ error: "Chapter not found" });
  res.json({ chapter: { pages: c.chapter.pages }, source: "fallback" });
});

app.listen(PORT, () => {
  console.log(`INFINITE MANGAS server running on port ${PORT}`);
});
