// Configuration accès soirée — Parfaite & Jean
// 1) Déployez acces/Code.gs dans Google Apps Script
// 2) Collez ici l’URL du déploiement (se termine souvent par /exec)
window.ACCES_CONFIG = {
  WEB_APP_URL: "COLLER_ICI_URL_APPS_SCRIPT",
  SECRET_KEY: "parfaite-jean-2026",
  // Site + API uniquement sur Vercel
  SITE_BASE_URL: "https://mon-mariage-rho.vercel.app",
  API_BASE_URL: "https://mon-mariage-rho.vercel.app",
  // Confirmations publiques ouvertes jusqu’au 10 septembre
  RSVP_MANUAL_ONLY: false,
  RSVP_DEADLINE: "2026-09-10T23:59:59+01:00",
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
