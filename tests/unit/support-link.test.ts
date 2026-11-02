import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home from "../../src/app/page";
import AboutPage from "../../src/app/tentang/page";
import { PublicFooter } from "../../src/components/public/public-footer";

const SUPPORT_URL = "https://saweria.co/baweanmenfess";

describe("Saweria support links", () => {
  it("renders a secure external link in all three approved locations", () => {
    const homepage = renderToStaticMarkup(createElement(Home));
    const about = renderToStaticMarkup(createElement(AboutPage));
    const footer = renderToStaticMarkup(createElement(PublicFooter));

    for (const markup of [homepage, about, footer]) {
      expect(markup).toContain(`href="${SUPPORT_URL}"`);
      expect(markup).toContain('target="_blank"');
      expect(markup).toContain('rel="noopener noreferrer"');
      expect(markup).toContain("Dukung Kami");
    }
  });

  it("places homepage support directly after the tracking CTA", () => {
    const homepage = renderToStaticMarkup(createElement(Home));
    const trackingPosition = homepage.indexOf("Lacak Menfess");
    const supportPosition = homepage.indexOf(SUPPORT_URL);

    expect(trackingPosition).toBeGreaterThan(-1);
    expect(supportPosition).toBeGreaterThan(trackingPosition);
  });

  it("states the voluntary donation boundary on the about page", () => {
    const about = renderToStaticMarkup(createElement(AboutPage));

    expect(about).toContain("Dukung Bawean Menfess");
    expect(about).toContain("Donasi sepenuhnya sukarela");
    expect(about).toContain("tidak memengaruhi moderasi, persetujuan, atau prioritas publikasi menfess");
  });
});
