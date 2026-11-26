import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #2b88ff 0%, #1565e6 100%)",
          borderRadius: 42,
        }}
      >
        <svg viewBox="0 0 36 36" width="164" height="164" fill="none">
          <path
            d="M9.5 26.5 18 9l8.5 17"
            stroke="#ffffff"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="18" cy="23.2" r="2.7" fill="#f7dc6f" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
