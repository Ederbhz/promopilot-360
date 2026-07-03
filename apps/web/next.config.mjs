const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const isGitHubPages = process.env.GITHUB_ACTIONS === "true";
const isUserSite = repositoryName?.endsWith(".github.io");
const basePath = isGitHubPages && repositoryName && !isUserSite ? `/${repositoryName}` : "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@promopilot/shared"],
  reactStrictMode: true,
  output: "export",
  trailingSlash: true,
  basePath,
  assetPrefix: basePath || undefined,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath
  },
  images: {
    unoptimized: true
  }
};

export default nextConfig;
