import { PART_1 } from './flujo-de-trabajo-editorial-1';
import { PART_2 } from './flujo-de-trabajo-editorial-2';
import { FAQ, PART_3 } from './flujo-de-trabajo-editorial-3';
import { PART_4 } from './flujo-de-trabajo-editorial-4';

// Order: foundations (1) → SEO, checks, distribution, refresh (2) → formats, governance, case study (4) → metrics, tools, plan (3).
export const FLUJO_EDITORIAL_HTML = PART_1 + PART_2 + PART_4 + PART_3;
export const FLUJO_EDITORIAL_FAQ = FAQ;
