"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/app/lib/google-maps";
import {
  textSrc,
  boundsFromCenter,
  quadraticBezierSample,
  type PublishedProject,
} from "@/app/lib/box-utils";
import { subscribeLayout } from "@/app/lib/layout-store";

const DEFAULT_CENTER = { lat: 35.0455, lng: 128.9668 };

const HIDE_LABELS: google.maps.MapTypeStyle[] = [
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] },
];

// setMap 을 가진 구글 오버레이 공통 타입
type Overlay = { setMap: (m: google.maps.Map | null) => void };

export default function MapViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<Overlay[]>([]);
  const meMarkerRef = useRef<google.maps.Marker | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const firstFixRef = useRef(true);
  const fittedRef = useRef(false);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [project, setProject] = useState<PublishedProject | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((google) => {
        if (cancelled || !containerRef.current) return;
        const map = new google.maps.Map(containerRef.current, {
          center: DEFAULT_CENTER,
          zoom: 17,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: "greedy", // 모바일 한 손가락 탭/이동이 지도에 바로 전달
          styles: HIDE_LABELS,
        });
        mapRef.current = map;
        setStatus("ready");
      })
      .catch((err) => {
        console.error(err);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsub = subscribeLayout((d) => setProject(d));
    return () => unsub();
  }, []);

  // 게시된 요소 그리기
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google || status !== "ready") return;
    const g = window.google;

    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    const elements = project?.elements ?? [];
    const bounds = new g.maps.LatLngBounds();
    const add = (o: Overlay) => overlaysRef.current.push(o);

    // 부스 클릭 → 부모(참가자 페이지)에게 메시지 전달 (다른 도메인 iframe 간 통신)
    const post = (el: { code?: string; id?: string; name?: string }) => {
      try {
        window.parent.postMessage(
          {
            source: "saegim-view",
            code: el.code || "",
            id: el.id || "",
            name: el.name || "",
          },
          "*",
        );
      } catch {
        /* noop */
      }
    };

    const addLabel = (pos: { lat: number; lng: number }, name?: string, color = "#111827") => {
      if (!name) return;
      const { url, w, h } = textSrc(name, color);
      add(
        new g.maps.Marker({
          position: pos,
          map,
          clickable: false,
          icon: {
            url,
            scaledSize: new g.maps.Size(w, h),
            anchor: new g.maps.Point(w / 2, h / 2),
          },
        }),
      );
    };

    elements.forEach((el) => {
      if (el.visible === false) return;
      const color = el.color || "#2563eb";

      if (el.shape === "rect" && el.center) {
        const rect = new g.maps.Rectangle({
          bounds: boundsFromCenter(g, el.center.lat, el.center.lng, el.width ?? 3, el.height ?? 3),
          map,
          fillColor: color,
          fillOpacity: el.opacity ?? 0.4,
          strokeColor: color,
          strokeWeight: 2,
          clickable: true,
        });
        rect.addListener("click", () => post(el));
        add(rect);
        addLabel(el.center, el.name);
        bounds.extend(el.center);
      } else if ((el.shape === "point" || el.shape === "text") && el.position) {
        if (el.shape === "point") {
          const m = new g.maps.Marker({
            position: el.position,
            map,
            clickable: true,
            icon: {
              path: g.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: color,
              fillOpacity: 1,
              strokeColor: "#fff",
              strokeWeight: 2,
            },
          });
          m.addListener("click", () => post(el));
          add(m);
        }
        addLabel(el.position, el.name, el.shape === "text" ? color : "#111827");
        bounds.extend(el.position);
      } else if (el.shape === "path" && el.points) {
        add(
          new g.maps.Polyline({
            path: el.points,
            map,
            strokeColor: color,
            strokeWeight: el.strokeWidth ?? 4,
            clickable: false,
          }),
        );
        el.points.forEach((p) => bounds.extend(p));
      } else if (el.shape === "curve" && el.points) {
        add(
          new g.maps.Polyline({
            path: quadraticBezierSample(el.points),
            map,
            strokeColor: color,
            strokeWeight: el.strokeWidth ?? 4,
            clickable: false,
          }),
        );
        el.points.forEach((p) => bounds.extend(p));
      } else if (el.shape === "zone" && el.points) {
        const poly = new g.maps.Polygon({
          paths: el.points,
          map,
          fillColor: color,
          fillOpacity: el.opacity ?? 0.28,
          strokeColor: color,
          strokeWeight: el.strokeWidth ?? 2,
          clickable: true,
        });
        poly.addListener("click", () => post(el));
        add(poly);
        el.points.forEach((p) => bounds.extend(p));
      }
    });

    // 처음 한 번만 배치도 전체가 보이도록 맞춤
    if (!fittedRef.current) {
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds);
        fittedRef.current = true;
      } else if (project?.event?.center) {
        map.setCenter(project.event.center);
        fittedRef.current = true;
      }
    }
  }, [project, status]);

  const locate = () => {
    const map = mapRef.current;
    if (!map || !navigator.geolocation) return;
    if (watchIdRef.current !== null) {
      const p = meMarkerRef.current?.getPosition();
      if (p) map.panTo(p);
      return;
    }
    firstFixRef.current = true;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const g = window.google;
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!meMarkerRef.current) {
          meMarkerRef.current = new g.maps.Marker({
            position: p,
            map,
            zIndex: 9999,
            icon: {
              path: g.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: "#2563eb",
              fillOpacity: 1,
              strokeColor: "#fff",
              strokeWeight: 3,
            },
            title: "내 위치",
          });
        } else {
          meMarkerRef.current.setPosition(p);
        }
        if (firstFixRef.current) {
          map.setCenter(p);
          map.setZoom(19);
          firstFixRef.current = false;
        }
      },
      () => alert("위치를 가져올 수 없습니다. 브라우저 위치 권한을 확인해주세요."),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const noLayout = project !== null && (project.elements?.length ?? 0) === 0;

  return (
    <div className="fixed inset-0">
      <div ref={containerRef} className="h-full w-full" />

      <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-white/95 px-4 py-1.5 text-sm font-bold text-slate-800 shadow">
        축제 배치도
      </div>

      <button
        type="button"
        onClick={locate}
        disabled={status !== "ready"}
        className="absolute bottom-6 right-4 z-10 rounded-full bg-blue-600 px-5 py-3 text-base font-bold text-white shadow-lg disabled:opacity-50"
      >
        📍 내 위치
      </button>

      {status === "loading" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-slate-500">
          지도 불러오는 중…
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-red-600">
          지도를 불러오지 못했습니다.
        </div>
      )}
      {status === "ready" && noLayout && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white/95 px-5 py-4 text-center text-sm text-slate-600 shadow">
          아직 게시된 배치도가 없습니다.
        </div>
      )}
    </div>
  );
}
