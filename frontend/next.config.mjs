/* global process */

const isGithubActions = process.env.GITHUB_ACTIONS === 'true';
const repoName = (isGithubActions && process.env.GITHUB_REPOSITORY) ? process.env.GITHUB_REPOSITORY.split('/')[1] : '';

/** @type {import('next').NextConfig} */
const basePath = isGithubActions ? `/${repoName}` : '';
const nextConfig = {
  output: 'export',
  basePath: basePath,
  assetPrefix: isGithubActions ? `${basePath}/` : '',
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
