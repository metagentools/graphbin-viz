import React from "react";
import { Badge } from "@fluentui/react-badge";

const FEATURES = [
  "Assembly graph visualization",
  "Interactive comparisons",
  "Local execution",
  "No data leaves your machine",
];

const GRAPHBIN_URL = "https://github.com/metagentools/GraphBin";

export function AppHeader({ baseUrl }) {
  return (
    <header className="app-header">
      <h1>GraphBin-Viz</h1>
      <div className="title-subtitle">
        Interactive Visual Analytics for Exploring Graph-based Metagenomic Binning
      </div>
      <div className="intro-row">
        <div className="subtitle intro-copy">
          <div className="intro-card">
            <p className="intro-lede">
              Refine and visualize your metagenomic binning results with{" "}
              <a href={GRAPHBIN_URL} target="_blank" rel="noreferrer">
                GraphBin
              </a>{" "}
              directly in your browser.
            </p>
            <p className="intro-body">
              You can visualise and compare the binning results using the provided
              interactive views. GraphBin runs locally on your device using your uploaded
              assembly graph + contigs + initial binning result, and no data ever leaves
              your device.
            </p>
            <div className="intro-features" role="list">
              <span className="intro-logo-inline" role="listitem">
                <a
                  href={GRAPHBIN_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="logo-link"
                  aria-label="GraphBin on GitHub"
                >
                  <span className="logo-swap" aria-hidden="true">
                    <img
                      src={`${baseUrl}GraphBin_logo_light.png`}
                      alt=""
                      className="graphbin-logo logo-light"
                    />
                    <img
                      src={`${baseUrl}GraphBin_logo_dark.png`}
                      alt=""
                      className="graphbin-logo logo-dark"
                    />
                  </span>
                </a>
              </span>
              {FEATURES.map((text) => (
                <Badge key={text} appearance="outline" color="informative" role="listitem">
                  {text}
                </Badge>
              ))}
            </div>
            <p className="intro-cta">
              You can load your own data (click on the tooltips for more information about
              the files to be uploaded) and click <b>Plot binning results</b>, or click{" "}
              <b>Run example data</b> to see how it works on the provided example data.
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
