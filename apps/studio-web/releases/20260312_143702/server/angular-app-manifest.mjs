
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
    "redirectTo": "/studio/dashboard",
    "route": "/studio"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-RWS3OBKN.js",
      "chunk-B7NTR3KI.js"
    ],
    "route": "/studio/login"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-PY5EO2KB.js",
      "chunk-5DFRHA7F.js"
    ],
    "route": "/studio/dashboard"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-5SPABLU7.js",
      "chunk-B7NTR3KI.js"
    ],
    "route": "/studio/projects"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-5SPABLU7.js",
      "chunk-B7NTR3KI.js"
    ],
    "route": "/studio/projects/new"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-MKJIADN2.js",
      "chunk-B7NTR3KI.js"
    ],
    "route": "/studio/projects/*"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/editorial/pipeline",
    "route": "/studio/editorial"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-BOAWP5VP.js",
      "chunk-B7NTR3KI.js"
    ],
    "route": "/studio/editorial/pipeline"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-RACNCSU7.js",
      "chunk-B7NTR3KI.js"
    ],
    "route": "/studio/editorial/calendar"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-5SPABLU7.js",
      "chunk-B7NTR3KI.js"
    ],
    "route": "/studio/editorial/briefs"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-MKJIADN2.js",
      "chunk-B7NTR3KI.js"
    ],
    "route": "/studio/editorial/briefs/*"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-5SPABLU7.js",
      "chunk-B7NTR3KI.js"
    ],
    "route": "/studio/editorial/articles"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-MKJIADN2.js",
      "chunk-B7NTR3KI.js"
    ],
    "route": "/studio/editorial/articles/*"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-W2UBLTNB.js",
      "chunk-B7NTR3KI.js"
    ],
    "route": "/studio/editorial/versions"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-AJGF3VVZ.js"
    ],
    "route": "/studio/editorial/versions/*"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-AJGF3VVZ.js"
    ],
    "route": "/studio/editorial/versions/*/compare/*"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-MUJFVVDO.js",
      "chunk-B7NTR3KI.js"
    ],
    "route": "/studio/assets/images"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-UMH4DRI3.js",
      "chunk-B7NTR3KI.js"
    ],
    "route": "/studio/assets/library"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/ai/text-generation",
    "route": "/studio/ai"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-7GLHFLG2.js",
      "chunk-B7NTR3KI.js"
    ],
    "route": "/studio/ai/text-generation"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-MUJFVVDO.js",
      "chunk-B7NTR3KI.js"
    ],
    "route": "/studio/ai/image-generation"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-PEAQIC3W.js",
      "chunk-OEEM7ZE7.js",
      "chunk-5DFRHA7F.js",
      "chunk-B7NTR3KI.js"
    ],
    "route": "/studio/ai/prompts"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/review/qa",
    "route": "/studio/review"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-CCN6OS7Z.js",
      "chunk-B7NTR3KI.js"
    ],
    "route": "/studio/review/qa"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-FBCPYFQY.js",
      "chunk-B7NTR3KI.js"
    ],
    "route": "/studio/review/editor"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/publishing/history",
    "route": "/studio/publishing"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-DRMOBUTW.js",
      "chunk-B7NTR3KI.js"
    ],
    "route": "/studio/publishing/destinations"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-XKGXTY4Q.js",
      "chunk-B7NTR3KI.js"
    ],
    "route": "/studio/publishing/scheduled"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-E7HFCEE6.js"
    ],
    "route": "/studio/publishing/history"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/analytics/content-performance",
    "route": "/studio/analytics"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-UDMQPLGW.js"
    ],
    "route": "/studio/analytics/content-performance"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-UDMQPLGW.js"
    ],
    "route": "/studio/analytics/seo-metrics"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/analytics/content-performance",
    "route": "/studio/analytics/usage"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/analytics/content-performance",
    "route": "/studio/analytics/performance"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/analytics/seo-metrics",
    "route": "/studio/analytics/metrics"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/automation/jobs",
    "route": "/studio/automation"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-OXKAYPEF.js",
      "chunk-B7NTR3KI.js"
    ],
    "route": "/studio/automation/pipelines"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-HYUKWGZ6.js"
    ],
    "route": "/studio/automation/jobs"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/integrations/cms",
    "route": "/studio/integrations"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-O26LSZCY.js",
      "chunk-B7NTR3KI.js"
    ],
    "route": "/studio/integrations/cms"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-O26LSZCY.js",
      "chunk-B7NTR3KI.js"
    ],
    "route": "/studio/integrations/webhooks"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-O26LSZCY.js",
      "chunk-B7NTR3KI.js"
    ],
    "route": "/studio/integrations/apis"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/settings/workspace",
    "route": "/studio/settings"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-DPNZTV64.js",
      "chunk-OEEM7ZE7.js",
      "chunk-5DFRHA7F.js",
      "chunk-B7NTR3KI.js"
    ],
    "route": "/studio/settings/workspace"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-5MD4Q75S.js",
      "chunk-OEEM7ZE7.js",
      "chunk-5DFRHA7F.js",
      "chunk-B7NTR3KI.js"
    ],
    "route": "/studio/settings/users"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-EI4AUN5M.js",
      "chunk-OEEM7ZE7.js",
      "chunk-5DFRHA7F.js",
      "chunk-B7NTR3KI.js"
    ],
    "route": "/studio/settings/roles"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/publishing/destinations",
    "route": "/studio/channels"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/publishing/destinations",
    "route": "/studio/channels/integrations"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/publishing/destinations",
    "route": "/studio/channels/web"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/publishing/destinations",
    "route": "/studio/channels/whatsapp"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/publishing/destinations",
    "route": "/studio/channels/api"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/publishing/history",
    "route": "/studio/deployments"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/automation/jobs",
    "route": "/studio/logs"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/projects",
    "route": "/studio/bots"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/projects/new",
    "route": "/studio/bots/create"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/review/qa",
    "route": "/studio/conversations/live"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/review/qa",
    "route": "/studio/conversations/history"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/review/qa",
    "route": "/studio/conversations/search"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/editorial/briefs",
    "route": "/studio/knowledge/sources"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/editorial/briefs",
    "route": "/studio/knowledge/documents"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/editorial/briefs",
    "route": "/studio/knowledge/embeddings"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/settings/users",
    "route": "/studio/users/workspace"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/settings/roles",
    "route": "/studio/users/roles"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/settings/roles",
    "route": "/studio/users/permissions"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/publishing/destinations",
    "route": "/studio/sites"
  },
  {
    "renderMode": 0,
    "redirectTo": "/studio/dashboard",
    "route": "/studio/**"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-KQX6NJYU.js"
    ],
    "route": "/use-cases"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-5VCZIUN6.js"
    ],
    "route": "/use-cases/*"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-BM2J2JUH.js"
    ],
    "route": "/examples"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-W3LGBA5R.js"
    ],
    "route": "/gallery"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-KWAQBOG7.js"
    ],
    "route": "/faq"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-QXHB2PEH.js"
    ],
    "route": "/contact"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-5MDCRG6G.js"
    ],
    "route": "/built-by-tecnoria"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-2C6VG7HR.js"
    ],
    "route": "/es"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-KQX6NJYU.js"
    ],
    "route": "/es/casos-de-uso"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-5VCZIUN6.js"
    ],
    "route": "/es/casos-de-uso/*"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-BM2J2JUH.js"
    ],
    "route": "/es/ejemplos"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-W3LGBA5R.js"
    ],
    "route": "/es/galeria"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-KWAQBOG7.js"
    ],
    "route": "/es/faq"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-QXHB2PEH.js"
    ],
    "route": "/es/contacto"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-5MDCRG6G.js"
    ],
    "route": "/es/creado-por-tecnoria"
  },
  {
    "renderMode": 0,
    "preload": [
      "chunk-UCKD4XPM.js"
    ],
    "route": "/**"
  }
],
  entryPointToBrowserMapping: undefined,
  assets: {
    'index.csr.html': {size: 12876, hash: '6b22a9b455abad20786069502e998d25c5546ed9eee0addd7f2bf29103cd4fce', text: () => import('./assets-chunks/index_csr_html.mjs').then(m => m.default)},
    'index.server.html': {size: 1752, hash: '23e241e2c6f2148aa4bca5024520ecc6e985dcb133afb398b902801c72d520e1', text: () => import('./assets-chunks/index_server_html.mjs').then(m => m.default)},
    'styles-YWTR4VDZ.css': {size: 67170, hash: 'z6ANQznL0BU', text: () => import('./assets-chunks/styles-YWTR4VDZ_css.mjs').then(m => m.default)}
  },
};
