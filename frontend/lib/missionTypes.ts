// Shapes returned by the FastAPI backend (see docs/API_SPEC.md). Keep in sync with backend/app/main.py.
export type Nature = 'static' | 'historical' | 'current' | 'predicted';

export interface LayerProvenance {
  kind: string;
  name: string;
  mission: string;
  instrument: string;
  product: string;
  resolution_m: number;
  acquired: string;
  nature: Nature;
  source_url: string;
  limitation: string;
}

export interface BangladeshInfo {
  name: string;
  diameter_km: number;
  approved: string;
  named_after: string;
  gazetteer: string;
  crater_center?: { lat: number; lon: number };
}

export type Origin = 'nasa' | 'derived' | 'demo' | 'missing';

export interface RasterLayer {
  key: string; label: string; role: string; color: string; z: number;
  default_on: boolean; default_opacity: number; blend: string; origin: Origin;
  mission: string; instrument: string; file: string; res_m: number; size_mb: number; crs: string; overviews: number;
}

export interface RasterMeta {
  layers: RasterLayer[];
  legend: { hazard: { raw: number | string; label: string }[]; note: string };
  frame: { width_m: number; height_m: number; max_zoom: number; tile_size: number; tile_url: string };
  slope_agreement: { mean_diff_deg: number; pct_over_limit: number } | null;
  real_layers: number; total_layers: number;
}

export interface ProbeResult {
  lat: number; lon: number; inside: boolean; summary: string;
  elevation_m: number | null; slope_main_deg: number | null; slope_check_deg: number | null;
  hazard: string | null; trust: string | null;
  layers: { key: string; label: string; value: string; origin: Origin; source: string; res_m: number | null }[];
}

export interface ChatReply { reply: string; source: 'local' | 'llm' }

export interface RegionSummary {
  is_raster?: boolean;
  id: string;
  name: string;
  role: 'primary' | 'bangladesh' | 'demo' | string;
  center: { lat: number; lon: number };
  synthetic?: boolean;
  bangladesh?: BangladeshInfo | null;
  coord_status?: string;
}

export interface RegionMeta extends RegionSummary {
  raster?: RasterMeta;
  synthetic?: boolean;
  science_goal: string;
  coord_status: string;
  grid: { width: number; height: number; cell_m: number; north_lat: number; west_lon: number };
  layers: LayerProvenance[];
  warnings: string[];
  defaults: {
    max_slope_deg: number;
    caution_slope_deg: number;
    walk_speed_ms: number;
    load_factor: number;
    science_stop_min: number;
  };
  layer_urls: Partial<Record<LayerName, string>>;
  suit_assumptions?: { o2_capacity_min: number; o2_reserve_pct: number; o2_slope_factor_per_deg: number; o2_load_weight: number; o2_stop_factor: number };
  crs?: { coordinates: string; body_radius_m: number; grid: string; alignment: string };
  stats: { elev_min_m: number; elev_max_m: number; slope_max_deg: number; nodata_pct: number };
}

export type LayerName = 'imagery' | 'hillshade' | 'slope' | 'hazard' | 'chemical';

export interface PovImage {
  url: string;
  rover: string;
  camera: string;
  sol: string;
  earth_date: string;
  credit: string;
  source_url: string;
}

export interface Site {
  id: string;
  name: string;
  lat: number;
  lon: number;
  goal: string;
  description: string;
  mission: string;
  observed: string;
  source_url: string;
  pov_images: PovImage[];
  geology?: string;
  science_purpose?: string;
  chemistry?: string;
  chem_index?: number | null;
}

export interface GeologyFeature {
  id: string;
  name: string;
  type: string;
  polygon: [number, number][];
  description: string;
  synthetic?: boolean;
}

export interface OxygenBudget {
  capacity_min_baseline: number;
  walk_used_pct: number;
  stop_used_pct: number;
  one_way_used_pct: number;
  remaining_on_arrival_pct: number;
  round_trip_used_pct: number;
  remaining_after_return_pct: number;
  reserve_pct: number;
  one_way_ok: boolean;
  round_trip_ok: boolean;
  assumption: string;
}

export interface RadiationEstimate {
  dose_rate_usv_per_h: number;
  estimated_dose_usv: number;
  planning_limit_usv: number;
  within_limit: boolean;
  synthetic: boolean;
  assumption: string;
}

export interface Insight {
  level: 'ok' | 'info' | 'warning' | 'critical';
  kind: string;
  text: string;
}

export interface RouteExplanation {
  data_used: { kind: string; name: string; mission: string; instrument: string; resolution_m: number; synthetic: boolean; effect: string }[];
  obstacles: {
    near_route: { name: string; type: string; radius_m: number; route_clearance_m: number; reason: string; source_url: string }[];
    blocked_steep_cells: number;
    blocked_pct_of_region: number;
    no_data_cells: number;
    note: string;
  };
  science_destination: {
    id: string; name: string; goal: string; description: string; lat: number; lon: number; elev_m: number | null; slope_deg: number | null;
    mission: string; observed: string; source_url: string; geology?: string; chemical_index: number | null; chemical_status: string;
    rover_photos: number; scientific_purpose: string;
  };
  why_alternatives: { strategy: string; found: boolean; why: string; delta_distance_m?: number; delta_max_slope_deg?: number; delta_mission_min?: number; oxygen_round_trip_ok?: boolean }[];
  evidence: { decision: string; evidence: string[] }[];
  missing_data: string[];
  route_statement: string;
  insights: Insight[];
}

export interface NearbyScience {
  id: string;
  name: string;
  reachable: boolean;
  lat?: number;
  lon?: number;
  extra_distance_m?: number;
  extra_time_min?: number;
  why_interesting: string;
  geology?: string;
  chemical_index?: number | null;
  considerations?: string[];
  note?: string;
  method?: string;
}

export interface SpaceWeather {
  source: string;
  synthetic: boolean;
  dose_rate_usv_per_h: number;
  planning_limit_usv: number;
  solar_activity: { level: string; events: { class: string; begin: string; peak: string; link: string }[] };
  safety_context: string[];
  how_to_go_live?: string;
  live_error?: string;
}

export interface Hazard {
  id: string;
  name: string;
  lat: number;
  lon: number;
  radius_m: number;
  reason: string;
  source_url: string;
}

export interface Obstacle {
  lat: number;
  lon: number;
  radius_m: number;
  name?: string;
}

export interface RoutePoint {
  x: number;
  y: number;
  lat: number;
  lon: number;
  elev_m: number;
  slope_deg: number;
  t_min?: number;
  o2_used_pct?: number;
}

export interface RouteResult {
  strategy: 'balanced' | 'safest' | 'shortest_feasible';
  found: boolean;
  points?: RoutePoint[];
  distance_m?: number;
  max_slope_deg?: number;
  mean_slope_deg?: number;
  elev_gain_m?: number;
  walk_time_min?: number;
  mission_time_min?: number;
  reasons?: string[];
  assumptions?: Record<string, number>;
  safety?: { oxygen: OxygenBudget; radiation: RadiationEstimate };
  explanation?: RouteExplanation;
}

export interface RouteResponse {
  region_id: string;
  routes: RouteResult[];
  nearby_science: NearbyScience[];
  insights: Insight[];
  direct_line?: { cells: number; max_slope_deg: number | null; over_limit: number; over_caution: number; no_data: number; hazard_cells: number };
  warnings: string[];
  disclaimer: string;
}

export interface PlanOptions {
  max_slope_deg: number;
  caution_slope_deg: number;
  walk_speed_ms: number;
  load_factor: number;
  science_stop_min: number;
}
