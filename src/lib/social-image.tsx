import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { siteConfig } from "@/lib/site-config";

export const socialImageSize = {
  width: 1200,
  height: 630,
} as const;

export const socialImageContentType = "image/png";

type SocialImageVariant = "openGraph" | "twitter";

const fontDirectory = join(process.cwd(), "node_modules/@fontsource/manrope/files");
const gridLines = Array.from({ length: 25 }, (_, index) => index);
const titleWords = ["Workflow", "Blueprint"];
const columns = ["Ideas", "Next", "Doing", "Done"];
const cards = [
  ["Launch plan", "Brand assets"],
  ["Sprint review", "Customer notes"],
  ["Workflow map", "Priority queue"],
  ["Release notes", "Metrics pass"],
];

async function loadFont(fileName: string, weight: 500 | 700) {
  try {
    const data = await readFile(join(fontDirectory, fileName));

    return {
      data,
      name: "Manrope",
      style: "normal" as const,
      weight,
    };
  } catch {
    return null;
  }
}

type LoadedFont = NonNullable<Awaited<ReturnType<typeof loadFont>>>;

function isLoadedFont(font: Awaited<ReturnType<typeof loadFont>>): font is LoadedFont {
  return font !== null;
}

async function loadFonts() {
  const fonts = await Promise.all([
    loadFont("manrope-latin-500-normal.woff", 500),
    loadFont("manrope-latin-700-normal.woff", 700),
  ]);

  return fonts.filter(isLoadedFont);
}

function GridPaper() {
  return (
    <>
      {gridLines.map((line) => (
        <div
          key={`vertical-${line}`}
          style={{
            position: "absolute",
            left: line * 50,
            top: 0,
            width: 1,
            height: "100%",
            background: "rgba(31, 79, 207, 0.12)",
          }}
        />
      ))}
      {gridLines.map((line) => (
        <div
          key={`horizontal-${line}`}
          style={{
            position: "absolute",
            left: 0,
            top: line * 50,
            width: "100%",
            height: 1,
            background: "rgba(31, 79, 207, 0.12)",
          }}
        />
      ))}
    </>
  );
}

function BoardPreview() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 498,
        height: 392,
        border: "3px solid #1f4fcf",
        borderRadius: 26,
        background: "rgba(255, 255, 255, 0.74)",
        boxShadow: "0 28px 54px rgba(18, 52, 140, 0.18)",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", borderBottom: "3px solid #1f4fcf" }}>
        {columns.map((column, index) => (
          <div
            key={column}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "25%",
              height: 58,
              borderRight: index === columns.length - 1 ? "none" : "2px solid #1f4fcf",
              color: "#12348c",
              fontSize: 21,
              fontWeight: 700,
              letterSpacing: 0,
              textTransform: "uppercase",
            }}
          >
            {column}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flex: 1 }}>
        {columns.map((column, columnIndex) => (
          <div
            key={`${column}-cards`}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 18,
              width: "25%",
              padding: "20px 14px",
              borderRight: columnIndex === columns.length - 1 ? "none" : "2px solid #1f4fcf",
            }}
          >
            {cards[columnIndex].map((card, cardIndex) => (
              <div
                key={card}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  height: cardIndex === 0 ? 92 : 76,
                  padding: "0 13px",
                  border: "2px solid #1f4fcf",
                  borderRadius: 16,
                  background:
                    cardIndex === 0
                      ? "linear-gradient(135deg, #ffffff, #eef4ff)"
                      : "rgba(255, 255, 255, 0.9)",
                  color: "#17213a",
                  fontSize: 17,
                  fontWeight: 700,
                  lineHeight: 1.16,
                  boxShadow: "0 12px 20px rgba(31, 79, 207, 0.12)",
                }}
              >
                {card}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function SocialImage({ variant }: { variant: SocialImageVariant }) {
  const eyebrow = variant === "twitter" ? "Share-ready planning" : "Task planning workspace";
  const titleLineStyle = {
    color: "#12348c",
    fontSize: 77,
    fontWeight: 700,
    letterSpacing: 0,
    lineHeight: 0.95,
    textTransform: "uppercase",
  } as const;

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background:
          "linear-gradient(135deg, #fbfcff 0%, #eef4ff 48%, #f8efe0 100%)",
        color: "#17213a",
        fontFamily: "Manrope",
      }}
    >
      <GridPaper />
      <div
        style={{
          position: "absolute",
          left: 64,
          top: 50,
          right: 64,
          bottom: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 56,
          padding: "46px 50px",
          border: "3px solid #1f4fcf",
          borderRadius: 32,
          background: "rgba(255, 255, 255, 0.62)",
          boxShadow: "0 32px 70px rgba(18, 52, 140, 0.16)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: 474,
            height: "100%",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                color: "#1f4fcf",
                fontSize: 23,
                fontWeight: 700,
                letterSpacing: 0,
                textTransform: "uppercase",
              }}
            >
              <div
                style={{
                  width: 58,
                  height: 12,
                  borderRadius: 999,
                  background: "#d89020",
                }}
              />
              {eyebrow}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {titleWords.map((word) => (
                <div key={word} style={titleLineStyle}>
                  {word}
                </div>
              ))}
            </div>
            <div
              style={{
                maxWidth: 410,
                color: "#263451",
                fontSize: 31,
                fontWeight: 500,
                lineHeight: 1.22,
              }}
            >
              Plan, track, and ship meaningful work from one focused board.
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 18,
              color: "#12348c",
              fontSize: 22,
              fontWeight: 700,
            }}
          >
            <span>{siteConfig.url.replace(/^https?:\/\//, "")}</span>
            <span style={{ color: "#d89020" }}>Plan. Execute. Achieve.</span>
          </div>
        </div>
        <BoardPreview />
      </div>
    </div>
  );
}

export async function createSocialImageResponse(variant: SocialImageVariant) {
  const fonts = await loadFonts();

  return new ImageResponse(<SocialImage variant={variant} />, {
    ...socialImageSize,
    ...(fonts.length > 0 ? { fonts } : {}),
  });
}
