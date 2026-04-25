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
const taskRows = [0, 1];

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
        width: 430,
        height: 350,
        border: "3px solid #1f4fcf",
        borderRadius: 24,
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
              height: 52,
              borderRight: index === columns.length - 1 ? "none" : "2px solid #1f4fcf",
              color: "#12348c",
              fontSize: 18,
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
              gap: 14,
              width: "25%",
              padding: "18px 12px",
              borderRight: columnIndex === columns.length - 1 ? "none" : "2px solid #1f4fcf",
            }}
          >
            {taskRows.map((cardIndex) => (
              <div
                key={`${column}-${cardIndex}`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  justifyContent: "center",
                  height: cardIndex === 0 ? 76 : 64,
                  padding: "0 13px",
                  border: "2px solid #1f4fcf",
                  borderRadius: 14,
                  background:
                    cardIndex === 0
                      ? "linear-gradient(135deg, #ffffff, #eef4ff)"
                      : "rgba(255, 255, 255, 0.9)",
                  boxShadow: "0 12px 20px rgba(31, 79, 207, 0.12)",
                }}
              >
                <div
                  style={{
                    height: 7,
                    width: cardIndex === 0 ? "82%" : "74%",
                    borderRadius: 999,
                    background: "#1f4fcf",
                    opacity: 0.82,
                  }}
                />
                <div
                  style={{
                    height: 7,
                    width: cardIndex === 0 ? "62%" : "54%",
                    borderRadius: 999,
                    background: "#d89020",
                    opacity: 0.78,
                  }}
                />
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
    fontSize: 68,
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
          left: 70,
          top: 54,
          right: 70,
          bottom: 54,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 40,
          padding: "42px 44px",
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
            width: 420,
            height: "100%",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                color: "#1f4fcf",
                fontSize: 21,
                fontWeight: 700,
                letterSpacing: 0,
                textTransform: "uppercase",
              }}
            >
              <div
                style={{
                  width: 50,
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
                maxWidth: 390,
                color: "#263451",
                fontSize: 27,
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
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 6,
              color: "#12348c",
              fontWeight: 700,
            }}
          >
            <span style={{ fontSize: 19 }}>{siteConfig.url.replace(/^https?:\/\//, "")}</span>
            <span style={{ color: "#d89020", fontSize: 21 }}>Plan. Execute. Achieve.</span>
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
