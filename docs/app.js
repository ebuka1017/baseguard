const docs = [
  {
    title: "README",
    file: "README.md",
    tag: "Overview",
    summary: "Project overview, features, installation, and command usage."
  },
  {
    title: "Quick Start",
    file: "QUICK_START.md",
    tag: "Getting Started",
    summary: "Fast setup flow for getting BaseGuard running in a project."
  },
  {
    title: "Deployment Guide",
    file: "DEPLOYMENT.md",
    tag: "Ops",
    summary: "Deployment guidance, release steps, and environment setup notes."
  },
  {
    title: "Deployment Checklist",
    file: "DEPLOYMENT_CHECKLIST.md",
    tag: "Ops",
    summary: "Checklist for validating release readiness and rollout steps."
  },
  {
    title: "Changelog",
    file: "CHANGELOG.md",
    tag: "Release Notes",
    summary: "Version history and notable changes over time."
  },
  {
    title: "Release Notes v1.0.2",
    file: "RELEASE_NOTES_v1.0.2.md",
    tag: "Archive",
    summary: "Detailed notes for the v1.0.2 release cycle."
  },
  {
    title: "Deployment Summary v1.0.2",
    file: "DEPLOYMENT_SUMMARY_v1.0.2.md",
    tag: "Archive",
    summary: "Deployment summary and operational notes for v1.0.2."
  }
];

const repoBase = "https://github.com/ebuka1017/baseguard/blob/main";
const rawBase = "./knowledge";
const grid = document.getElementById("docs-grid");
const search = document.getElementById("search");

function render(filter = "") {
  const q = filter.trim().toLowerCase();
  const visible = docs.filter((doc) =>
    [doc.title, doc.file, doc.tag, doc.summary].join(" ").toLowerCase().includes(q)
  );

  grid.innerHTML = "";

  if (!visible.length) {
    const empty = document.createElement("p");
    empty.textContent = "No matching docs.";
    empty.style.color = "var(--muted)";
    grid.appendChild(empty);
    return;
  }

  for (const doc of visible) {
    const card = document.createElement("article");
    card.className = "doc-card";

    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = doc.tag;

    const h3 = document.createElement("h3");
    h3.textContent = doc.title;

    const p = document.createElement("p");
    p.textContent = doc.summary;

    const links = document.createElement("div");
    links.className = "doc-links";

    const pagesLink = document.createElement("a");
    pagesLink.href = `${rawBase}/${doc.file}`;
    pagesLink.textContent = "Pages copy";
    pagesLink.target = "_blank";
    pagesLink.rel = "noreferrer";

    const githubLink = document.createElement("a");
    githubLink.href = `${repoBase}/${doc.file}`;
    githubLink.textContent = "GitHub source";
    githubLink.target = "_blank";
    githubLink.rel = "noreferrer";

    links.append(pagesLink, githubLink);
    card.append(tag, h3, p, links);
    grid.appendChild(card);
  }
}

search?.addEventListener("input", (e) => {
  render(e.target.value);
});

render();
