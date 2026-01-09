import React from "react";

export default function YepAnywhereFinal() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        padding: "60px 40px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1
        style={{
          color: "#444",
          fontSize: "12px",
          fontWeight: 400,
          letterSpacing: "3px",
          textTransform: "uppercase",
          marginBottom: "80px",
          textAlign: "center",
        }}
      >
        yepanywhere — refined spacing
      </h1>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "80px",
          maxWidth: "1000px",
          margin: "0 auto",
        }}
      >
        {/* Dark theme - main wordmark */}
        <section>
          <p
            style={{
              color: "#333",
              fontSize: "11px",
              letterSpacing: "2px",
              marginBottom: "24px",
              textTransform: "uppercase",
            }}
          >
            dark — tight spacing
          </p>
          <div
            style={{
              background: "#111",
              padding: "50px",
              borderRadius: "16px",
            }}
          >
            <svg
              viewBox="0 0 400 60"
              style={{
                width: "100%",
                maxWidth: "400px",
                height: "auto",
                display: "block",
                margin: "0 auto",
              }}
            >
              <text
                x="0"
                y="44"
                style={{
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: "42px",
                  fontWeight: 700,
                  fill: "#22c55e",
                  letterSpacing: "-2px",
                }}
              >
                yep
              </text>
              {/* Checkmark tucked closer to yep */}
              <path
                d="M 80 26 L 90 36 L 106 16"
                fill="none"
                stroke="#22c55e"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.55"
              />
              <text
                x="112"
                y="44"
                style={{
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: "42px",
                  fontWeight: 700,
                  fill: "#ffffff",
                  letterSpacing: "-2px",
                }}
              >
                anywhere
              </text>
            </svg>
          </div>
        </section>

        {/* Dark theme - checkmark more visible */}
        <section>
          <p
            style={{
              color: "#333",
              fontSize: "11px",
              letterSpacing: "2px",
              marginBottom: "24px",
              textTransform: "uppercase",
            }}
          >
            dark — bolder checkmark
          </p>
          <div
            style={{
              background: "#111",
              padding: "50px",
              borderRadius: "16px",
            }}
          >
            <svg
              viewBox="0 0 400 60"
              style={{
                width: "100%",
                maxWidth: "400px",
                height: "auto",
                display: "block",
                margin: "0 auto",
              }}
            >
              <text
                x="0"
                y="44"
                style={{
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: "42px",
                  fontWeight: 700,
                  fill: "#22c55e",
                  letterSpacing: "-2px",
                }}
              >
                yep
              </text>
              <path
                d="M 80 26 L 90 36 L 106 16"
                fill="none"
                stroke="#22c55e"
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <text
                x="112"
                y="44"
                style={{
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: "42px",
                  fontWeight: 700,
                  fill: "#ffffff",
                  letterSpacing: "-2px",
                }}
              >
                anywhere
              </text>
            </svg>
          </div>
        </section>

        {/* Dark theme - white checkmark variant */}
        <section>
          <p
            style={{
              color: "#333",
              fontSize: "11px",
              letterSpacing: "2px",
              marginBottom: "24px",
              textTransform: "uppercase",
            }}
          >
            dark — white checkmark
          </p>
          <div
            style={{
              background: "#111",
              padding: "50px",
              borderRadius: "16px",
            }}
          >
            <svg
              viewBox="0 0 400 60"
              style={{
                width: "100%",
                maxWidth: "400px",
                height: "auto",
                display: "block",
                margin: "0 auto",
              }}
            >
              <text
                x="0"
                y="44"
                style={{
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: "42px",
                  fontWeight: 700,
                  fill: "#22c55e",
                  letterSpacing: "-2px",
                }}
              >
                yep
              </text>
              <path
                d="M 80 26 L 90 36 L 106 16"
                fill="none"
                stroke="#ffffff"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.4"
              />
              <text
                x="112"
                y="44"
                style={{
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: "42px",
                  fontWeight: 700,
                  fill: "#ffffff",
                  letterSpacing: "-2px",
                }}
              >
                anywhere
              </text>
            </svg>
          </div>
        </section>

        {/* Light theme */}
        <section>
          <p
            style={{
              color: "#333",
              fontSize: "11px",
              letterSpacing: "2px",
              marginBottom: "24px",
              textTransform: "uppercase",
            }}
          >
            light theme
          </p>
          <div
            style={{
              background: "#fafafa",
              padding: "50px",
              borderRadius: "16px",
            }}
          >
            <svg
              viewBox="0 0 400 60"
              style={{
                width: "100%",
                maxWidth: "400px",
                height: "auto",
                display: "block",
                margin: "0 auto",
              }}
            >
              <text
                x="0"
                y="44"
                style={{
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: "42px",
                  fontWeight: 700,
                  fill: "#16a34a",
                  letterSpacing: "-2px",
                }}
              >
                yep
              </text>
              <path
                d="M 80 26 L 90 36 L 106 16"
                fill="none"
                stroke="#16a34a"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.5"
              />
              <text
                x="112"
                y="44"
                style={{
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: "42px",
                  fontWeight: 700,
                  fill: "#171717",
                  letterSpacing: "-2px",
                }}
              >
                anywhere
              </text>
            </svg>
          </div>
        </section>

        {/* Y-check App Icon */}
        <section>
          <p
            style={{
              color: "#333",
              fontSize: "11px",
              letterSpacing: "2px",
              marginBottom: "24px",
              textTransform: "uppercase",
            }}
          >
            y-check app icon
          </p>
          <div
            style={{
              background: "#111",
              padding: "50px",
              borderRadius: "16px",
              display: "flex",
              gap: "32px",
              justifyContent: "center",
              alignItems: "flex-end",
            }}
          >
            {/* Large */}
            <div style={{ textAlign: "center" }}>
              <svg
                viewBox="0 0 120 120"
                style={{ width: "120px", height: "120px" }}
              >
                <defs>
                  <linearGradient
                    id="iconGrad"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="#22c55e" />
                    <stop offset="100%" stopColor="#16a34a" />
                  </linearGradient>
                </defs>
                <rect
                  x="0"
                  y="0"
                  width="120"
                  height="120"
                  rx="26"
                  fill="url(#iconGrad)"
                />
                <path
                  d="M 28 35 L 50 62 L 92 20"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M 50 62 L 50 95"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="10"
                  strokeLinecap="round"
                />
              </svg>
              <p style={{ color: "#555", fontSize: "11px", marginTop: "12px" }}>
                120px
              </p>
            </div>

            {/* Medium */}
            <div style={{ textAlign: "center" }}>
              <svg
                viewBox="0 0 120 120"
                style={{ width: "64px", height: "64px" }}
              >
                <defs>
                  <linearGradient
                    id="iconGrad2"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="#22c55e" />
                    <stop offset="100%" stopColor="#16a34a" />
                  </linearGradient>
                </defs>
                <rect
                  x="0"
                  y="0"
                  width="120"
                  height="120"
                  rx="26"
                  fill="url(#iconGrad2)"
                />
                <path
                  d="M 28 35 L 50 62 L 92 20"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M 50 62 L 50 95"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="10"
                  strokeLinecap="round"
                />
              </svg>
              <p style={{ color: "#555", fontSize: "11px", marginTop: "12px" }}>
                64px
              </p>
            </div>

            {/* Small */}
            <div style={{ textAlign: "center" }}>
              <svg
                viewBox="0 0 120 120"
                style={{ width: "32px", height: "32px" }}
              >
                <defs>
                  <linearGradient
                    id="iconGrad3"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="#22c55e" />
                    <stop offset="100%" stopColor="#16a34a" />
                  </linearGradient>
                </defs>
                <rect
                  x="0"
                  y="0"
                  width="120"
                  height="120"
                  rx="26"
                  fill="url(#iconGrad3)"
                />
                <path
                  d="M 28 35 L 50 62 L 92 20"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M 50 62 L 50 95"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="12"
                  strokeLinecap="round"
                />
              </svg>
              <p style={{ color: "#555", fontSize: "11px", marginTop: "12px" }}>
                32px
              </p>
            </div>

            {/* Favicon */}
            <div style={{ textAlign: "center" }}>
              <svg
                viewBox="0 0 120 120"
                style={{ width: "16px", height: "16px" }}
              >
                <rect
                  x="0"
                  y="0"
                  width="120"
                  height="120"
                  rx="26"
                  fill="#22c55e"
                />
                <path
                  d="M 28 35 L 50 62 L 92 20"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="16"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M 50 62 L 50 95"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="16"
                  strokeLinecap="round"
                />
              </svg>
              <p style={{ color: "#555", fontSize: "11px", marginTop: "12px" }}>
                16px
              </p>
            </div>
          </div>
        </section>

        {/* Full lockups */}
        <section>
          <p
            style={{
              color: "#333",
              fontSize: "11px",
              letterSpacing: "2px",
              marginBottom: "24px",
              textTransform: "uppercase",
            }}
          >
            lockups
          </p>
          <div
            style={{
              background: "#111",
              padding: "50px",
              borderRadius: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "40px",
            }}
          >
            {/* Large horizontal */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "20px",
                justifyContent: "center",
              }}
            >
              <svg
                viewBox="0 0 120 120"
                style={{ width: "48px", height: "48px", flexShrink: 0 }}
              >
                <defs>
                  <linearGradient
                    id="lockupGrad"
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor="#22c55e" />
                    <stop offset="100%" stopColor="#16a34a" />
                  </linearGradient>
                </defs>
                <rect
                  x="0"
                  y="0"
                  width="120"
                  height="120"
                  rx="26"
                  fill="url(#lockupGrad)"
                />
                <path
                  d="M 28 35 L 50 62 L 92 20"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M 50 62 L 50 95"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="10"
                  strokeLinecap="round"
                />
              </svg>
              <svg
                viewBox="0 0 320 50"
                style={{ width: "260px", height: "42px" }}
              >
                <text
                  x="0"
                  y="38"
                  style={{
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontSize: "36px",
                    fontWeight: 700,
                    fill: "#22c55e",
                    letterSpacing: "-1.5px",
                  }}
                >
                  yep
                </text>
                <path
                  d="M 70 18 L 78 26 L 90 10"
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.55"
                />
                <text
                  x="96"
                  y="38"
                  style={{
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontSize: "36px",
                    fontWeight: 700,
                    fill: "#ffffff",
                    letterSpacing: "-1.5px",
                  }}
                >
                  anywhere
                </text>
              </svg>
            </div>

            {/* Compact nav style */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                justifyContent: "center",
              }}
            >
              <svg
                viewBox="0 0 120 120"
                style={{ width: "28px", height: "28px", flexShrink: 0 }}
              >
                <rect
                  x="0"
                  y="0"
                  width="120"
                  height="120"
                  rx="26"
                  fill="#22c55e"
                />
                <path
                  d="M 28 35 L 50 62 L 92 20"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M 50 62 L 50 95"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="12"
                  strokeLinecap="round"
                />
              </svg>
              <span
                style={{
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: "18px",
                  fontWeight: 700,
                  letterSpacing: "-0.5px",
                }}
              >
                <span style={{ color: "#22c55e" }}>yep</span>
                <span style={{ color: "#ffffff" }}>anywhere</span>
              </span>
            </div>
          </div>
        </section>

        {/* Light lockup */}
        <section>
          <p
            style={{
              color: "#333",
              fontSize: "11px",
              letterSpacing: "2px",
              marginBottom: "24px",
              textTransform: "uppercase",
            }}
          >
            light lockup
          </p>
          <div
            style={{
              background: "#fafafa",
              padding: "50px",
              borderRadius: "16px",
              display: "flex",
              alignItems: "center",
              gap: "16px",
              justifyContent: "center",
            }}
          >
            <svg
              viewBox="0 0 120 120"
              style={{ width: "36px", height: "36px", flexShrink: 0 }}
            >
              <rect
                x="0"
                y="0"
                width="120"
                height="120"
                rx="26"
                fill="#16a34a"
              />
              <path
                d="M 28 35 L 50 62 L 92 20"
                fill="none"
                stroke="#ffffff"
                strokeWidth="10"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M 50 62 L 50 95"
                fill="none"
                stroke="#ffffff"
                strokeWidth="10"
                strokeLinecap="round"
              />
            </svg>
            <span
              style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: "22px",
                fontWeight: 700,
                letterSpacing: "-0.5px",
              }}
            >
              <span style={{ color: "#16a34a" }}>yep</span>
              <span style={{ color: "#171717" }}>anywhere</span>
            </span>
          </div>
        </section>

        {/* Brand colors */}
        <section>
          <p
            style={{
              color: "#333",
              fontSize: "11px",
              letterSpacing: "2px",
              marginBottom: "24px",
              textTransform: "uppercase",
            }}
          >
            brand colors
          </p>
          <div
            style={{
              background: "#111",
              padding: "40px",
              borderRadius: "16px",
              display: "flex",
              gap: "20px",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            {[
              { color: "#22c55e", name: "primary", use: "dark mode yep" },
              {
                color: "#16a34a",
                name: "primary-dark",
                use: "light mode yep, gradient end",
              },
              { color: "#4ade80", name: "accent", use: "highlights" },
              {
                color: "#ffffff",
                name: "text-dark",
                use: "dark mode anywhere",
              },
              {
                color: "#171717",
                name: "text-light",
                use: "light mode anywhere",
              },
            ].map(({ color, name, use }) => (
              <div key={color} style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: "64px",
                    height: "64px",
                    background: color,
                    borderRadius: "12px",
                    marginBottom: "10px",
                    border: color === "#ffffff" ? "1px solid #333" : "none",
                  }}
                />
                <p
                  style={{
                    color: "#888",
                    fontSize: "11px",
                    fontFamily: "monospace",
                  }}
                >
                  {color}
                </p>
                <p
                  style={{ color: "#555", fontSize: "10px", marginTop: "4px" }}
                >
                  {name}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
