import AutoAwesomeRounded from "@mui/icons-material/AutoAwesomeRounded";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import TextSnippetOutlined from "@mui/icons-material/TextSnippetOutlined";
import { Link, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { Link as RouterLink } from "react-router";
import { cx } from "../lib/cx";
import { LevelShiftLogo, MrrmLogo } from "./BrandLogos";
import { POLICY_LINKS } from "./policyLinks";
import { RecordIllustration } from "./RecordIllustration";

const YEAR = new Date().getFullYear();

// `tone` picks the icon colours (.brand-feature[data-tone] in styles).
const FEATURES = [
  {
    icon: DescriptionOutlined,
    title: "Classify",
    text: "Automatically identify document types",
    tone: "classify",
  },
  {
    icon: TextSnippetOutlined,
    title: "Extract",
    text: "Pull key information with precision",
    tone: "extract",
  },
  {
    icon: AutoAwesomeRounded,
    title: "Summarize",
    text: "Get clear, structured summaries",
    tone: "summarize",
  },
];

// Brand panel (left side on desktop); sizes come from the px tokens in styles.css.
function BrandPanel() {
  return (
    <div className="brand-panel">
      <div aria-hidden className="brand-panel__bg">
        <div className="brand-panel__glow" />
        <div className="brand-panel__wash" />
      </div>

      <MrrmLogo />

      <Typography component="h2" className="brand-panel__heading">
        Smarter
        <br />
        Medical Records
        <br />
        <span className="brand-panel__accent">Review</span>
      </Typography>

      <Typography className="brand-panel__lead">
        Turn complex medical documents into structured, searchable insight —
        with every summary linked back to its source.
      </Typography>

      <div className="brand-panel__features">
        {FEATURES.map(({ icon: Icon, title, text, tone }) => (
          <div key={title} className="brand-feature" data-tone={tone}>
            <div className="brand-feature__icon">
              <Icon />
            </div>
            <div>
              <Typography className="brand-feature__title">{title}</Typography>
              <Typography className="brand-feature__text">{text}</Typography>
            </div>
          </div>
        ))}
      </div>

      {/* Anchored to the panel's right edge so it stays beside the sign-in card at every window size; the data chip crosses the edge. */}
      <div className="brand-panel__illustration">
        <RecordIllustration className="brand-panel__record" />
      </div>

      <div className="brand-panel__footer">
        <Typography className="brand-panel__tagline">
          Human in loop AI platform
          <br />
          for Records Review
        </Typography>
        <div className="brand-panel__divider" />
        <LevelShiftLogo className="brand-panel__levelshift" />
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="public-footer">
      <Typography
        component="span"
        color="textSecondary"
        className="public-footer__text"
      >
        © {YEAR} LevelShift
      </Typography>
      <nav aria-label="Policies and support" className="public-footer__nav">
        {POLICY_LINKS.map((link) => (
          <Link
            key={link.to}
            component={RouterLink}
            to={link.to}
            color="textSecondary"
            className="public-footer__text"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}

// Split layout for every signed-out screen: brand panel left (desktop), form right.
export function PublicLayout({
  children,
  below,
  scrolls = false,
  largeText = false,
}: {
  children: ReactNode;
  below?: ReactNode;
  // Long forms (register): on desktop the page is held to the window and only the card's form scrolls (see AuthCard).
  scrolls?: boolean;
  // Enlarges text (--fs: 1.2) on desktop only; phones keep the base sizes (in line with the policy pages).
  largeText?: boolean;
}) {
  return (
    // Desktop: the split layout sits in a centred frame (.public-page), not edge to edge.
    <div className="public-page">
      <div
        className={cx(
          "public-layout",
          scrolls && "public-layout--scrolls",
          largeText && "public-layout--large-text",
        )}
      >
        <BrandPanel />

        {/* Above the brand panel: the illustration's back sheet tucks under the card's edge. */}
        <div className="public-layout__column">
          <div className="public-layout__mobile-logo">
            <MrrmLogo compact />
          </div>

          <main className="public-layout__main">
            {/* Short cards (sign in, password) are centred vertically; long ones (register) fill the column height. The link hangs below the card. */}
            <div className="public-layout__card">
              {children}
              {below && <div className="public-layout__below">{below}</div>}
            </div>
          </main>

          <Footer />
        </div>
      </div>
    </div>
  );
}
