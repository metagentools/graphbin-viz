import React from "react";
import { Button } from "@fluentui/react-button";
import { WeatherMoonRegular, WeatherSunnyRegular } from "@fluentui/react-icons";

export function ThemeToggle({ theme, onToggle }) {
  const dark = theme === "dark";
  return (
    <Button
      id="theme-toggle"
      className="theme-toggle"
      type="button"
      shape="circular"
      icon={dark ? <WeatherMoonRegular /> : <WeatherSunnyRegular />}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={dark}
      onClick={onToggle}
    />
  );
}
