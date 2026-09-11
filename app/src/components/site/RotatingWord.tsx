// SPDX-License-Identifier: GPL-3.0
// Copyright (c) 2026 THE3RDWEBLABS (https://github.com/the3rdweblabs)

"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const WORDS = ["Scales", "Settles", "Moves", "Deepens", "Flows", "Meets", "Thrives", "Aggregates"];

export function RotatingWord() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [width, setWidth] = useState(0);
  const wordRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (wordRef.current) setWidth(wordRef.current.offsetWidth);
  }, [index]);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      const swap = setTimeout(() => {
        setIndex((i) => (i + 1) % WORDS.length);
        setVisible(true);
      }, 300);
      return () => clearTimeout(swap);
    }, 1900);
    return () => clearInterval(timer);
  }, []);

  return (
    <span
      className="inline-block whitespace-nowrap align-baseline transition-[width] duration-300 ease-out"
      style={{ width }}
    >
      <span
        ref={wordRef}
        className={`inline-block transition-all duration-300 ${visible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"}`}
      >
        {WORDS[index]}
      </span>
    </span>
  );
}