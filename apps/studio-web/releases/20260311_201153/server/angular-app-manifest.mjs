
export default {
  bootstrap: () => import('./main.server.mjs').then(m => m.default),
  inlineCriticalCss: true,
  baseHref: '/',
  locale: undefined,
  routes: [
  {
    "renderMode": 0,
    "route": "/"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/login",
    "route": "/login"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-2SHBCDLO.js"
    ],
    "route": "/studio"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-JGC3A2HA.js",
      "chunk-PJIMMZDM.js"
    ],
    "route": "/studio/login"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-DXMTM67A.js",
      "chunk-PJIMMZDM.js"
    ],
    "route": "/studio/sites"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-XBTUHQF7.js",
      "chunk-PJIMMZDM.js"
    ],
    "route": "/studio/projects"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-H2NNMGWZ.js",
      "chunk-PJIMMZDM.js"
    ],
    "route": "/studio/projects/*"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio",
    "route": "/studio/**"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-B7NOYJVJ.js"
    ],
    "route": "/use-cases"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-5CUDGO2E.js"
    ],
    "route": "/use-cases/*"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-F5CLTPVH.js"
    ],
    "route": "/examples"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-TJJMAVHA.js"
    ],
    "route": "/gallery"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-6ED27NOU.js"
    ],
    "route": "/faq"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-ACAARYLK.js"
    ],
    "route": "/contact"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-UR7RES7G.js"
    ],
    "route": "/built-by-tecnoria"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-SGW2E5UR.js"
    ],
    "route": "/es"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-B7NOYJVJ.js"
    ],
    "route": "/es/casos-de-uso"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-5CUDGO2E.js"
    ],
    "route": "/es/casos-de-uso/*"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-F5CLTPVH.js"
    ],
    "route": "/es/ejemplos"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-TJJMAVHA.js"
    ],
    "route": "/es/galeria"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-6ED27NOU.js"
    ],
    "route": "/es/faq"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-ACAARYLK.js"
    ],
    "route": "/es/contacto"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-UR7RES7G.js"
    ],
    "route": "/es/creado-por-tecnoria"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-VGJ4FYUF.js"
    ],
    "route": "/**"
  }
],
  entryPointToBrowserMapping: undefined,
  assets: {
    'index.csr.html': {size: 12774, hash: '984c17b9a898d5cea39cd473ac3b2eb259bd130610cd79bc62f4e21f7aa7969f', text: () => import('./assets-chunks/index_csr_html.mjs').then(m => m.default)},
    'index.server.html': {size: 1650, hash: '6135e40059d89db330aa996d23b74cbcf1a881e861ac860c892dcf2a5625fa3e', text: () => import('./assets-chunks/index_server_html.mjs').then(m => m.default)},
    'styles-4UCYYH5G.css': {size: 37267, hash: '37FE3MdoIrQ', text: () => import('./assets-chunks/styles-4UCYYH5G_css.mjs').then(m => m.default)}
  },
};
