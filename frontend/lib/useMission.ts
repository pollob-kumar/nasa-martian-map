'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import type { GeologyFeature, SpaceWeather, Hazard, Obstacle, PlanOptions, RegionMeta, RegionSummary, RouteResponse, RouteResult, Site } from './missionTypes';

export type Mission = ReturnType<typeof useMission>;

export function useMission(initialRegionId: string) {
  const [regionId, setRegionId] = useState(initialRegionId);
  const [allRegions, setAllRegions] = useState<RegionSummary[]>([]);
  const [meta, setMeta] = useState<RegionMeta | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [geology, setGeology] = useState<GeologyFeature[]>([]);
  const [spaceWeather, setSpaceWeather] = useState<SpaceWeather | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [start, setStart] = useState<{ lat: number; lon: number } | null>(null);
  const [goalId, setGoalId] = useState<string | null>(null);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [options, setOptions] = useState<PlanOptions | null>(null);

  const [resp, setResp] = useState<RouteResponse | null>(null);
  const [routeIdx, setRouteIdx] = useState(0);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  useEffect(() => {
    api.regions().then(setAllRegions).catch(() => {});
    api.spaceWeather().then(setSpaceWeather).catch(() => {});
  }, []);

  // ---- load region ---------------------------------------------------------
  useEffect(() => {
    let dead = false;
    setMeta(null);
    setLoadError(null);
    setResp(null);
    setObstacles([]);
    Promise.all([api.region(regionId), api.sites(regionId), api.hazards(regionId), api.geology(regionId).catch(() => [] as GeologyFeature[])])
      .then(([m, s, h, geo]) => {
        if (dead) return;
        setMeta(m);
        setSites(s);
        setHazards(h);
        setGeology(geo);
        setOptions(m.defaults);
        setStart(s[0] ? { lat: s[0].lat, lon: s[0].lon } : { lat: m.center.lat, lon: m.center.lon });
        setGoalId(s[1]?.id ?? s[0]?.id ?? null);
      })
      .catch((e) => !dead && setLoadError(String(e.message ?? e)));
    return () => {
      dead = true;
    };
  }, [regionId]);

  // ---- plan route ----------------------------------------------------------
  const plan = useCallback(
    async (override?: { start?: { lat: number; lon: number }; goalId?: string; obstacles?: Obstacle[] }) => {
      const s = override?.start ?? start;
      const g = override?.goalId ?? goalId;
      if (!s || !g || !options) return false;
      setPlanning(true);
      setPlanError(null);
      try {
        const r = await api.route({
          region_id: regionId,
          start: s,
          goal_site_id: g,
          obstacles: override?.obstacles ?? obstacles,
          ...options,
        });
        setResp(r);
        setRouteIdx(0);
        return r.routes.some((x) => x.found);
      } catch (e: any) {
        setResp(null);
        setPlanError(String(e.message ?? e));
        return false;
      } finally {
        setPlanning(false);
      }
    },
    [regionId, start, goalId, obstacles, options],
  );

  // plan once automatically when a region has just loaded
  useEffect(() => {
    if (meta && start && goalId && options && !resp && !planning && !planError) void plan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta]);

  const foundRoutes: RouteResult[] = useMemo(() => (resp?.routes ?? []).filter((r) => r.found), [resp]);
  const route: RouteResult | null = foundRoutes[Math.min(routeIdx, Math.max(foundRoutes.length - 1, 0))] ?? null;
  const goal = sites.find((s) => s.id === goalId) ?? null;

  return {
    regionId, setRegionId, allRegions, meta, sites, hazards, geology, spaceWeather, loadError,
    start, setStart, goalId, setGoalId, goal,
    obstacles, setObstacles, options, setOptions,
    resp, foundRoutes, route, routeIdx, setRouteIdx, planning, planError, plan,
  };
}
