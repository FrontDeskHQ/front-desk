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
  options: GenerateProps & ImageResponseOptions,
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
      title,
      description,
      icon,
      site,
      primaryTextColor,
      primaryColor,
    }),
    {
      width: 1200,
      height: 630,
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
      ...rest,
    },
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
  primaryColor,
  primaryTextColor,
  ...props
}: GenerateProps): ReactElement {
  const defaultIcon = props.icon || <FrontDeskLogo />;
  const defaultSite = props.site || "FrontDesk";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        color: "#fbfbfb",
        padding: "64px",
        position: "relative",
        backgroundColor: "#0F0F0F",
      }}
    >
      <svg
        width="1200"
        height="630"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
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
          position: "relative",
          zIndex: 1,
          height: "100%",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: "20px",
            color: "#ebebeb",
          }}
        >
          {defaultIcon}
          <p
            style={{
              fontSize: "48px",
              fontWeight: 500,
              margin: 0,
              color: "#ebebeb",
              fontFamily: "Inter",
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
              fontWeight: 800,
              fontSize: "72px",
              margin: 0,
              color: "#fbfbfb",
              lineHeight: "1.1",
              fontFamily: "Inter",
            }}
          >
            {props.title}
          </p>
          {props.description && (
            <p
              style={{
                fontSize: "40px",
                color: "rgba(251, 251, 251, 0.7)",
                margin: 0,
                lineHeight: "1.3",
                fontFamily: "Inter",
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
