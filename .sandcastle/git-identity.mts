// The agent's git identity, set inside every sandbox by an onSandboxReady
// hook. One shared constant because the build pass, the review pass and the
// CI-fix pass all need it, and commits from the three must carry the same
// author.
const GIT_IDENTITY_NAME = "Ralph (belastingaangifte-check agent)";
const GIT_IDENTITY_EMAIL = "ralph-agent@users.noreply.github.com";

// Written with --global, to /home/agent/.gitconfig in the container's own
// home. A repo-level write would land in the bind-mounted parent git
// directory the host shares, where it competes with host git for
// .git/config.lock.
export const GIT_IDENTITY_COMMAND = [
  `git config --global user.name "${GIT_IDENTITY_NAME}"`,
  `git config --global user.email "${GIT_IDENTITY_EMAIL}"`,
].join(" && ");
