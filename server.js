const express = require("express");
const https = require("https");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Serve index.html for root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Proxy all /proxy/* requests to MangaDex
// e.g. /proxy/manga?limit=10 → https://api.mangadex.org/manga?limit=10
app.get("/proxy/*", (req, res) => {
  // Build the MangaDex URL
  const mdPath = req.path.replace("/proxy", "");
  const query = req.originalUrl.split("?")[1] || "";
  const mdUrl = `https://api.mangadex.org${mdPath}${query ? "?" + query : ""}`;

  const options = {
    headers: {
      "User-Agent": "InfiniteMangas/1.0",
      "Accept": "application/json",
    },
  };

  const proxyReq = https.get(mdUrl, options, (proxyRes) => {
    // Set CORS headers
    res.set({
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
    });
    res.status(proxyRes.statusCode);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    console.error("Proxy error:", err.message);
    res.status(500).json({ error: "Proxy failed: " + err.message });
  });

  proxyReq.setTimeout(15000, () => {
    proxyReq.destroy();
    res.status(504).json({ error: "Request timed out" });
  });
});

app.listen(PORT, () => {
  console.log(`INFINITE MANGAS server running on port ${PORT}`);
});
