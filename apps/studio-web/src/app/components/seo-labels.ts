import { registerLocaleData } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import localeEs from '@angular/common/locales/es';
import { LOCALE_ID, Provider } from '@angular/core';

registerLocaleData(localeEs);
/** Figures and dates of the SEO screens, in the language of their text. */
export const SEO_LOCALE: Provider[] = [{ provide: LOCALE_ID, useValue: 'es' }];

/** Visible SEO vocabulary, shared by every SEO screen so one thing has one name. */

export const SEO_CAPABILITY_LABELS: Record<string, string> = {
  keyword_metrics: 'Métricas de palabras clave',
  keyword_suggestions: 'Descubrimiento de palabras',
  ranked_keywords: 'Posiciones de un dominio',
  serp_organic: 'Resultados de Google',
  search_volume: 'Volumen de búsqueda (respaldo)',
  youtube_search: 'Resultados de YouTube',
  web_search: 'Búsqueda web (noticias, fuentes y competidores)',
  web_extract: 'Lectura de páginas web',
};

export const SEO_ACTIONS: Record<string, string> = {
  create_content: 'Crear contenido', update_existing: 'Actualizar página', expand_existing: 'Ampliar página', improve_metadata: 'Mejorar título y descripción', improve_internal_linking: 'Mejorar enlaces internos',
  strengthen_cluster: 'Reforzar tema', investigate_cannibalization: 'Investigar canibalización', resolve_technical: 'Resolver problema técnico', monitor: 'Vigilar', defer: 'Esperar', reject: 'Descartar',
};
export const SEO_STATUSES: Record<string, string> = {
  open: 'Abierta', approved: 'Aprobada', planned: 'En el plan', completed: 'Hecha', monitoring: 'En seguimiento', deferred: 'En espera', rejected: 'Rechazada', dismissed: 'Descartada', expired: 'Caducada',
};
export const SEO_DATA_KINDS: Record<string, string> = { observed: 'Observado', provider_reported: 'Según proveedor', estimated: 'Estimado', historical: 'Histórico', unavailable: 'No disponible', unknown: 'Desconocido' };
export const SEO_INTENTS: Record<string, string> = { informational: 'Informativa', commercial: 'Comparativa', transactional: 'Compra', navigational: 'Navegación', local: 'Local' };
export const SEO_OUTCOMES: Record<string, string> = {
  higher: 'Por encima de las páginas comparables.', lower: 'Por debajo de las páginas comparables.', no_clear_change: 'Sin diferencia clara con las páginas comparables.', insufficient_data: 'Datos insuficientes.',
};
export const SEO_BUSINESS: Record<string, string> = {
  publisher: 'Medio o blog', corporate: 'Web corporativa', local_business: 'Negocio local', services: 'Servicios', ecommerce: 'Tienda', new_website: 'Sitio nuevo', established: 'Consolidado', multilingual: 'Varios idiomas', custom: 'Personalizado',
};
export const SEO_FACTORS: Record<string, string> = {
  businessRelevance: 'Relevancia para el negocio', searchDemand: 'Demanda', rankingFeasibility: 'Alcanzable', conversionPotential: 'Potencial de conversión', existingPerformance: 'Rendimiento actual', topicalAuthority: 'Autoridad en el tema',
  competitiveEvidence: 'Competencia', seasonality: 'Estacionalidad', productionEffort: 'Poco esfuerzo', maintenanceCost: 'Poco mantenimiento', cannibalizationRisk: 'Sin canibalización', expectedValue: 'Valor esperado',
};
export const SEARCH_CONSOLE_STATUS: Record<string, string> = {
  not_connected: 'Sin conectar', pending_property: 'Falta elegir la propiedad', active: 'Conectado', revoked: 'Google retiró el acceso: vuelve a conectar', forbidden: 'La cuenta ya no puede leer la propiedad', disconnected: 'Desconectado',
};

export const RESEARCH_TRIGGERS: Record<string, string> = {
  onboarding: 'Alta del sitio', insufficient_opportunities: 'Faltan oportunidades', new_topic: 'Tema nuevo', new_market: 'Mercado nuevo', performance_change: 'Cambio de rendimiento', competitor_opportunity: 'Competidor nuevo',
  seasonal_event: 'Temporada', stale_evidence: 'Datos antiguos', pending_decision: 'Plan pendiente', manual: 'A mano',
};
export const RUN_STATUSES: Record<string, string> = { queued: 'En cola', running: 'En curso', paused: 'En pausa', succeeded: 'Completa', partial: 'Parcial', failed: 'Fallida', cancelled: 'Cancelada' };
export const RUN_TASKS: Record<string, string> = {
  inspect_site: 'Revisar el sitio', first_party: 'Datos propios', profile: 'Perfil del sitio', gaps: 'Lagunas y semillas', discover_seed: 'Descubrir palabras', competitor_keywords: 'Palabras de un competidor', own_keywords: 'Palabras del sitio',
  screen: 'Filtrar y valorar', metrics: 'Medir palabras', serp: 'Resultados de búsqueda', inventory: 'Inventario',
};
export const TASK_STATUSES: Record<string, string> = { pending: 'Pendiente', running: 'En curso', succeeded: 'Hecha', skipped: 'No se consultó', failed: 'Falló', cancelled: 'Cancelada' };
export const SEO_STAGES: Record<string, string> = {
  discovered: 'Descubiertas', needs_validation: 'Por validar', qualified: 'De calidad', prioritized: 'Prioritarias', reserved: 'Reservadas', scheduled: 'En el plan', published: 'Publicadas', monitoring: 'En seguimiento', refresh_candidate: 'Para refrescar',
  rejected: 'Rechazadas', superseded: 'Superadas',
};
export const PROFILE_SOURCES: Record<string, string> = { corrected: 'Corregido por tu equipo', configured: 'Configurado', approved: 'Estrategia aprobada', observed: 'Observado', detected: 'Detectado', unknown: 'Desconocido' };
export const RESEARCH_MODES: Record<string, string> = { automatic: 'Automática, si hay motivo', manual: 'Solo cuando la pida alguien', off: 'Desactivada' };
export const RESEARCH_INTENSITIES: Record<string, string> = { light: 'Ligera: lo imprescindible', balanced: 'Equilibrada', intensive: 'Intensa: más temas y competidores por investigación' };

/** Why something was not bought, in the words of whoever asked for it. */
export const SEO_BLOCKS: Record<string, string> = {
  enough_opportunities: 'Ya hay oportunidades de calidad suficientes.', run_limit: 'Superaba el límite de la investigación.', budget_exhausted: 'Asignación agotada.', unknown_price: 'Coste máximo sin confirmar.', not_configured: 'Sin proveedor configurado.',
  external_disabled: 'Datos externos desactivados.', provider_disabled: 'Proveedor desactivado.', not_selected: 'Ningún proveedor elegido.', paid_automation_locked: 'La automatización de ese proveedor está bloqueada.', automatic_routing_locked: 'El enrutado automático está bloqueado.', unsupported_market: 'Mercado no admitido.',
  billing_uncertain: 'Una petición anterior está sin confirmar.', insufficient_balance: 'Sin saldo en el proveedor.', invalid_credentials: 'Credenciales rechazadas.', not_worth_cost: 'No compensa todavía.', timeout: 'El proveedor no respondió.', retry_cooldown: 'En espera tras un fallo.',
  emergency_stop: 'Parada de emergencia de la plataforma.', unexpected_failure: 'Fallo interno de la plataforma.', circuit_open: 'Proveedor en pausa por fallos.', quota_wait: 'Se esperaba turno.', rate_limited: 'El proveedor limitó las consultas.', upstream_error: 'El proveedor falló.', run_stopped: 'La investigación se detuvo.',
  license_prohibited: 'La licencia del proveedor no lo permite.', unsupported_capability: 'No disponible en este proveedor.', spend_limit: 'Superaba el límite autorizado.', acquisition_in_progress: 'Otra consulta igual estaba en curso.',
};

export const ALLOWANCE_STATES: Record<string, { title: string; text: string; tone: 'info' | 'warning' | 'error' }> = {
  available: { title: 'Asignación disponible', text: 'Se puede investigar cuando haga falta.', tone: 'info' },
  low: { title: 'Queda poca asignación', text: 'Lo que falte se consultará cuando se renueve.', tone: 'warning' },
  exhausted: { title: 'Asignación agotada', text: 'Se sigue trabajando con los datos guardados; no se consulta nada nuevo hasta que se renueve.', tone: 'warning' },
  platform_limit: { title: 'Límite general de la plataforma', text: 'Tu asignación no está agotada, pero la plataforma ha llegado a su límite. Se sigue con los datos guardados.', tone: 'warning' },
  stopped: { title: 'Consultas externas paradas', text: 'La plataforma ha detenido todas las consultas externas. Lo guardado sigue disponible.', tone: 'error' },
  disabled: { title: 'Datos externos desactivados', text: 'La plataforma no está consultando proveedores externos. Se usan los datos propios y los guardados.', tone: 'warning' },
  no_provider: { title: 'Sin proveedor para este mercado', text: 'No hay ningún proveedor disponible para el mercado del sitio. Se usan los datos propios y los guardados.', tone: 'warning' },
};

export const NEXT_ACTIONS: Record<string, { title: string; text: string; label: string; path: string; tab?: string }> = {
  read_site: { title: 'Leer el sitio', text: 'Auctorio todavía no conoce las páginas de este sitio.', label: 'Ir a páginas y rastreo', path: '/studio/site-intelligence', tab: 'crawl' },
  connect_search_console: { title: 'Conectar Search Console', text: 'Sin datos propios de Google no se puede saber qué mejorar en las páginas publicadas.', label: 'Conectar', path: '/studio/settings/seo', tab: 'data' },
  research_running: { title: 'Investigación en marcha', text: 'Las oportunidades se actualizarán cuando termine.', label: 'Ver la investigación', path: '/studio/seo-research' },
  plan_approved: { title: 'Llevar al plan lo aprobado', text: 'Hay oportunidades aprobadas que aún no están en el plan editorial.', label: 'Ver aprobadas', path: '/studio/seo-opportunities' },
  review_opportunities: { title: 'Revisar oportunidades', text: 'Hay propuestas esperando tu decisión.', label: 'Revisar', path: '/studio/seo-opportunities' },
  request_research: { title: 'Pedir una investigación', text: 'Faltan oportunidades de calidad para cubrir el objetivo del sitio.', label: 'Preparar investigación', path: '/studio/seo-research' },
  up_to_date: { title: 'Todo al día', text: 'No hay nada pendiente en la inteligencia SEO de este sitio.', label: 'Ver oportunidades', path: '/studio/seo-opportunities' },
};

const ERRORS: Record<string, string> = {
  opportunity_conflicts_with_approved: 'Esa página ya tiene otra acción aprobada. Complétala antes.', opportunity_not_open: 'Esta oportunidad ya no está abierta.', opportunity_already_acted: 'Esta oportunidad ya está planificada o hecha.', opportunity_changed: 'La oportunidad ha cambiado. Revísala de nuevo.',
  opportunity_not_approved: 'Aprueba antes la mejora.', optimization_page_not_managed: 'Esa página no se publicó con Auctorio: haz el cambio en tu web y márcala como hecha.', generation_in_flight: 'Esa página ya se está redactando.',
  search_console_not_configured: 'Falta configurar Google en el servidor.', search_console_syncing: 'Ya se está sincronizando.', external_seo_stopped: 'Un administrador ha parado el SEO externo.', search_console_property_not_allowed: 'Esa propiedad no es de este dominio.',
  site_base_url_required: 'El sitio no tiene dirección web.', search_console_state_expired: 'La autorización caducó. Vuelve a conectar.', search_console_unknown_state: 'Esa autorización no es de esta sesión.', search_console_forbidden: 'Google no concedió el permiso de lectura.', search_console_quota: 'Google ha limitado las consultas. Se reintentará más tarde.',
  research_already_running: 'Ya hay una investigación abierta.', research_run_not_controllable: 'Su estado ha cambiado: ya no admite esa acción.', research_disabled: 'La investigación está desactivada para este sitio.', invalid_corrections: 'Revisa los datos del perfil.', invalid_policy: 'Algún límite está fuera de rango.',
  keyword_not_found: 'Esa palabra ya no está en el sitio.', forbidden: 'No tienes permiso para esta acción.', license_required: 'Hace falta una licencia aprobada que permita guardar y compartir los datos.', second_approver_required: 'Debe aprobarlo otro administrador de la plataforma.',
  not_pending: 'Ese registro ya no está pendiente.', locked: 'Está bloqueado hasta cumplir las condiciones de producción.',
};

/** The server's reason in words; the server's own message only where it has no code of ours. */
export function seoError(error: unknown, fallback = 'No se pudo completar la acción. Inténtalo de nuevo.'): string {
  const body = error instanceof HttpErrorResponse ? error.error : null;
  const code = typeof body?.error === 'string' ? body.error : (body?.error?.code ?? '');
  if (ERRORS[code]) return ERRORS[code];
  if (SEO_BLOCKS[code]) return SEO_BLOCKS[code];
  if (error instanceof HttpErrorResponse && error.status === 403) return ERRORS['forbidden'];
  if (error instanceof HttpErrorResponse && (error.status === 0 || error.status === 503)) return 'El servidor no responde. Inténtalo de nuevo en unos segundos.';
  return ERRORS[body?.message ?? ''] ?? ERRORS[body?.error?.message ?? ''] ?? fallback;
}

export function runBadge(status: string): string {
  return status === 'succeeded' ? 'au-badge--success' : status === 'failed' || status === 'uncertain' ? 'au-badge--danger' : status === 'partial' || status === 'paused' || status === 'skipped' ? 'au-badge--warning' : 'au-badge--neutral';
}

export function urlPath(url: string): string {
  return URL.canParse(url) ? new URL(url).pathname : url;
}
