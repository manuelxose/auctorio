import assert from "node:assert/strict";
import test from "node:test";
import { extractListingItems, parseImdbTsvLines } from "../src/studio/sources";

const IMDB_HEADER =
  "tconst\ttitleType\tprimaryTitle\toriginalTitle\tisAdult\tstartYear\tendYear\truntimeMinutes\tgenres";

test("parseImdbTsvLines keeps recent movies/tv and skips old, adult and short types", () => {
  const lines = [
    IMDB_HEADER,
    "tt0000001\tshort\tOld Short\tOld Short\t0\t1930\t\\N\t12\tComedy",
    "tt0000002\tmovie\tNew Movie\tNew Movie\t0\t2026\t\\N\t120\tAction,Sci-Fi",
    "tt0000003\tmovie\tOld Movie\tOld Movie\t0\t2019\t\\N\t95\tDrama",
    "tt0000004\ttvSeries\tFresh Series\tFresh Series\t0\t2025\t2026\t45\tMystery",
    "tt0000005\tmovie\tAdult Film\tAdult Film\t1\t2026\t\\N\t88\tThriller",
    "tt0000006\ttvMiniSeries\tMini\tMini\t0\t2026\t2026\t200\tDrama",
  ];

  const items = parseImdbTsvLines(lines, { fromYear: 2025, maxItems: 10 });
  const ids = items.map((item) => item.externalId);
  assert.deepEqual(ids, ["tt0000002", "tt0000004", "tt0000006"]);

  const movie = items[0];
  assert.equal(movie.title, "New Movie");
  assert.equal(movie.canonicalUrl, "https://www.imdb.com/title/tt0000002/");
  assert.ok(movie.description?.includes("Géneros: Action, Sci-Fi"));
  assert.ok(movie.description?.includes("Duración: 120 min"));
  assert.deepEqual(movie.categories, ["Action", "Sci-Fi"]);
  assert.equal(movie.publishedAt, "2026-01-01T00:00:00.000Z");
});

test("parseImdbTsvLines respects type and maxItems filters", () => {
  const lines = [
    IMDB_HEADER,
    "tt0000001\tmovie\tA\tA\t0\t2026\t\\N\t90\tDrama",
    "tt0000002\tmovie\tB\tB\t0\t2026\t\\N\t90\tDrama",
    "tt0000003\tmovie\tC\tC\t0\t2026\t\\N\t90\tDrama",
  ];
  const moviesOnly = parseImdbTsvLines(lines, { types: ["movie"], fromYear: 2026, maxItems: 2 });
  assert.equal(moviesOnly.length, 2);
  assert.deepEqual(moviesOnly.map((item) => item.title), ["A", "B"]);
});

test("extractListingItems parses cards with configurable selectors", () => {
  const html = `
    <html><body>
      <ul class="list">
        <li class="card">
          <h2><a class="title" href="/peliculas/pelicula-1/">Título Uno</a></h2>
          <p class="meta">28 de agosto de 2026 | 1h 45min | Acción, Aventura</p>
          <img src="https://cdn.example.com/poster1.jpg" />
        </li>
        <li class="card">
          <h2><a class="title" href="/peliculas/pelicula-2/">Título Dos</a></h2>
          <p class="meta">30 de agosto de 2026 | 2h 00min | Drama</p>
          <img data-src="https://cdn.example.com/poster2.jpg" />
        </li>
        <li class="card">
          <h2><span>Sin enlace</span></h2>
        </li>
      </ul>
    </body></html>
  `;

  const items = extractListingItems(html, "https://www.sensacine.com/peliculas/estrenos/", {
    itemSelector: "li.card",
    titleSelector: "a.title",
    linkSelector: "a.title",
    imageSelector: "img",
    descriptionSelectors: [".meta"],
    categoriesSelector: ".meta",
  });

  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Título Uno");
  assert.equal(items[0].canonicalUrl, "https://www.sensacine.com/peliculas/pelicula-1/");
  assert.equal(items[0].sourceImageUrls[0], "https://cdn.example.com/poster1.jpg");
  assert.equal(items[1].sourceImageUrls[0], "https://cdn.example.com/poster2.jpg");
  assert.ok(items[0].categories.includes("Acción"));
});

test("extractListingItems resolves relative links against the source url", () => {
  const html = `
    <div class="fa-card">
      <div class="mc-title"><a href="https://www.filmaffinity.com/es/film809297.html">El padrino</a></div>
    </div>
  `;
  const items = extractListingItems(html, "https://www.filmaffinity.com/es/ranking.php?rn=ranking_fa_movies", {
    itemSelector: "div.fa-card",
    titleSelector: ".mc-title a",
    linkSelector: ".mc-title a",
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "El padrino");
  assert.equal(items[0].canonicalUrl, "https://www.filmaffinity.com/es/film809297.html");
});
