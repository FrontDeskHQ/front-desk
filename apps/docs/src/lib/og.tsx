/** biome-ignore-all lint/a11y/noSvgWithoutTitle: Not supported */
import type { ImageResponseOptions } from "next/dist/compiled/@vercel/og/types";
import { ImageResponse } from "next/og";
import type { ReactElement, ReactNode } from "react";

interface GenerateProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  primaryColor?: string;
  primaryTextColor?: string;
  site?: ReactNode;
}

async function loadInterFont(): Promise<ArrayBuffer> {
  const url =
    "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2";
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load Inter font: ${response.statusText}`);
  }
  return response.arrayBuffer();
}

export async function generateOGImage(
  options: GenerateProps & ImageResponseOptions
): Promise<ImageResponse> {
  const {
    title,
    description,
    icon,
    site,
    primaryColor,
    primaryTextColor,
    ...rest
  } = options;

  const interFont = await loadInterFont();

  return new ImageResponse(
    generate({
      description,
      icon,
      primaryColor,
      primaryTextColor,
      site,
      title,
    }),
    {
      fonts: [
        {
          name: "Inter",
          data: interFont,
          style: "normal",
          weight: 400,
        },
        {
          name: "Inter",
          data: interFont,
          style: "normal",
          weight: 500,
        },
        {
          name: "Inter",
          data: interFont,
          style: "normal",
          weight: 800,
        },
      ],
      height: 630,
      width: 1200,
      ...rest,
    }
  );
}

const FrontDeskLogo = () => (
  <svg
    width={80}
    height={80}
    viewBox="0 0 368 368"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M288.263 168H78.936L67.65 104h231.898l-11.285 64zM252.998 368H114.201l-11.285-64h161.367l-11.285 64z"
      fill="currentColor"
    />
    <path fill="currentColor" d="M0 204H368V268H0z" />
    <circle cx={184} cy={38} r={38} fill="currentColor" />
  </svg>
);

export function generate({
  primaryColor: _primaryColor,
  primaryTextColor: _primaryTextColor,
  ...props
}: GenerateProps): ReactElement {
  const defaultIcon = props.icon || <FrontDeskLogo />;
  const defaultSite = props.site || "FrontDesk";

  return (
    <div
      style={{
        backgroundColor: "#0F0F0F",
        color: "#fbfbfb",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: "64px",
        position: "relative",
        width: "100%",
      }}
    >
      <svg
        width="1200"
        height="630"
        style={{
          left: 0,
          position: "absolute",
          top: 0,
        }}
      >
        <defs>
          <radialGradient id="bg-gradient" cx="50%" cy="0%" r="100%">
            <stop offset="0%" stopColor="#171618" />
            <stop offset="100%" stopColor="#0F0F0F" />
          </radialGradient>
        </defs>
        <rect width="1200" height="630" fill="url(#bg-gradient)" />
      </svg>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "space-between",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            alignItems: "center",
            color: "#ebebeb",
            display: "flex",
            flexDirection: "row",
            gap: "20px",
          }}
        >
          {defaultIcon}
          <p
            style={{
              color: "#ebebeb",
              fontFamily: "Inter",
              fontSize: "48px",
              fontWeight: 500,
              margin: 0,
            }}
          >
            {defaultSite}
          </p>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: props.description ? "16px" : "0",
          }}
        >
          <p
            style={{
              color: "#fbfbfb",
              fontFamily: "Inter",
              fontSize: "72px",
              fontWeight: 800,
              lineHeight: "1.1",
              margin: 0,
            }}
          >
            {props.title}
          </p>
          {props.description && (
            <p
              style={{
                color: "rgba(251, 251, 251, 0.7)",
                fontFamily: "Inter",
                fontSize: "40px",
                lineHeight: "1.3",
                margin: 0,
              }}
            >
              {props.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
