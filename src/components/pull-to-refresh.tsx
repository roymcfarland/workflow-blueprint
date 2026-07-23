"use client";

import { useEffect, useRef, useState } from "react";

import { SaveIndicator } from "@/components/blueprint/save-indicator";

type StandaloneNavigator = Navigator & {
  standalone?: boolean;
};

const PULL_THRESHOLD = 96;
const NON_REFRESH_TARGETS = "input, textarea, select, [contenteditable='true']";

function isStandaloneTouchApp() {
  const navigatorWithStandalone = window.navigator as StandaloneNavigator;

  return (
    window.navigator.maxTouchPoints > 0 &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      navigatorWithStandalone.standalone === true)
  );
}

function isDocumentScrolledToTop() {
  return (document.scrollingElement ?? document.documentElement).scrollTop <= 0;
}

function canScrollableAncestorMoveUp(target: EventTarget | null) {
  let element = target instanceof Element ? target : null;

  while (element && element !== document.body) {
    const { overflowY } = window.getComputedStyle(element);
    const canScroll = /(auto|scroll)/.test(overflowY) && element.scrollHeight > element.clientHeight;

    if (canScroll && element.scrollTop > 0) {
      return true;
    }

    element = element.parentElement;
  }

  return false;
}

function shouldStartPull(target: EventTarget | null) {
  if (target instanceof Element && target.closest(NON_REFRESH_TARGETS)) {
    return false;
  }

  return isDocumentScrolledToTop() && !canScrollableAncestorMoveUp(target);
}

export default function PullToRefresh() {
  const isTracking = useRef(false);
  const isRefreshing = useRef(false);
  const pullDistance = useRef(0);
  const startY = useRef(0);
  const [isRefreshingState, setIsRefreshingState] = useState(false);

  useEffect(() => {
    if (!isStandaloneTouchApp()) {
      return;
    }

    const reset = () => {
      isTracking.current = false;
      pullDistance.current = 0;
      startY.current = 0;
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (isRefreshing.current || event.touches.length !== 1 || !shouldStartPull(event.target)) {
        reset();
        return;
      }

      isTracking.current = true;
      pullDistance.current = 0;
      startY.current = event.touches[0]?.clientY ?? 0;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!isTracking.current || event.touches.length !== 1) {
        return;
      }

      pullDistance.current = Math.max(0, (event.touches[0]?.clientY ?? 0) - startY.current);

      if (pullDistance.current > 8 && isDocumentScrolledToTop()) {
        event.preventDefault();
      }
    };

    const handleTouchEnd = () => {
      if (isTracking.current && pullDistance.current >= PULL_THRESHOLD) {
        isRefreshing.current = true;
        setIsRefreshingState(true);
        window.location.reload();
        return;
      }

      reset();
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    document.addEventListener("touchcancel", reset, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", reset);
    };
  }, []);

  if (!isRefreshingState) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center">
      <div className="blueprint-surface-flat px-3 py-1.5">
        <SaveIndicator message="Refreshing…" status="saving" />
      </div>
    </div>
  );
}
