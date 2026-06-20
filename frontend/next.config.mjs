/* global process */

const isGithubActions = process.env.GITHUB_ACTIONS === 'true';
const repoName = (isGithubActions && process.env.GITHUB_REPOSITORY) ? process.env.GITHUB_REPOSITORY.split('/')[1] : '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: isGithubActions ? `/${repoName}` : '',
  assetPrefix: isGithubActions ? `/${repoName}/` : '',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
