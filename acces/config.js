// Configuration accès soirée — Parfaite & Jean
// 1) Déployez acces/Code.gs dans Google Apps Script
// 2) Collez ici l’URL du déploiement (se termine souvent par /exec)
window.ACCES_CONFIG = {
  WEB_APP_URL: "COLLER_ICI_URL_APPS_SCRIPT",
  SECRET_KEY: "parfaite-jean-2026",
  // URL publique du site (billets / QR)
  SITE_BASE_URL: "https://mon-mariage-f7dv.onrender.com",
  // API invités (Render) — utilisée aussi par l’admin Vercel
  API_BASE_URL: "https://mon-mariage-f7dv.onrender.com",
  // Fin des confirmations RSVP (inclus le 15 août 2026, Kinshasa)
  RSVP_DEADLINE: "2026-08-15T23:59:59+01:00",
  // Tables : langages & frameworks (Parfaite & Jean)
  TABLE_NAMES: [
    "Python",
    "C++",
    "JavaScript",
    "TypeScript",
    "Java",
    "Rust",
    "Go",
    "Swift",
    "Kotlin",
    "Julia",
    "React",
    "Next.js",
    "Node.js",
    "TensorFlow",
    "PyTorch",
    "ROS",
    "Django",
    "Flutter",
  ],
};
